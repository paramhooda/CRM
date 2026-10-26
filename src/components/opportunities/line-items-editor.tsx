"use client";
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Save, Percent, Undo2, Lock, Tag, Wand2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tooltip } from "@/components/ui/tooltip";
import { useAction } from "@/components/crm/use-action";
import { ProductPicker } from "@/components/opportunities/product-picker";
import { saveBoq } from "@/server/actions/workflow";
import type { OppDetail } from "@/server/queries/opportunity-detail";
import type { ProductOption } from "@/server/queries/options";
import { inr, pct, fmtDate } from "@/lib/format";
import { billingPeriods, type BillingFrequencyKey } from "@/lib/boq";
import { BILLING_FREQUENCY_LABEL, LINE_BILLING_STATUS_LABEL } from "@/lib/constants";
import { cn } from "@/lib/utils";

type Line = OppDetail["lines"][number] & { _key: string; _custom?: boolean };
type Perms = { spec: boolean; cost: boolean; price: boolean; viewCost: boolean };
type Opt = { id: string; name: string };

const UNITS = ["Nos", "Lot", "Users", "Cores", "Devices", "VMs", "TB", "Racks", "Resources", "Days", "Month", "Year", "Pool", "Drill"];
const MIX_COLORS = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s7)", "var(--ink-3)"];
let keySeq = 0;
const k = () => `new-${++keySeq}`;

const mult = (l: Pick<Line, "quantity" | "billingFrequency" | "termMonths">) =>
  (Number(l.quantity) || 0) * billingPeriods({ billingFrequency: l.billingFrequency as BillingFrequencyKey, termMonths: l.termMonths });

export function LineItemsEditor({
  oppId, initial, perms, products, bus, categories, oems, distributors, defaultTerm, locked, version: initialVersion, lockReason, oemTbd,
}: {
  oppId: string;
  initial: OppDetail["lines"];
  perms: Perms;
  products: ProductOption[];
  bus: Opt[];
  categories: (Opt & { buId: string })[];
  oems: Opt[];
  distributors: string[];
  defaultTerm: number | null;
  locked: boolean;
  /** BOQ version the page was loaded at: saves are rejected if someone saved in between */
  version: number;
  /** Why the specification cannot be edited right now (open presales or pricing request) */
  lockReason: string | null;
  oemTbd: Opt | null;
}) {
  const [version, setVersion] = useState(initialVersion);
  const start = () => initial.map((l) => ({ ...l, _key: l.id, _custom: !l.productId }));
  const [lines, setLines] = useState<Line[]>(start);
  const [dirty, setDirty] = useState(false);
  const [targetMargin, setTargetMargin] = useState("15");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { pending, run } = useAction();
  // After a save (or anyone's change) the server is the truth: re-pricing flags, statuses and the BOQ version.
  // Unsaved edits are never overwritten.
  useEffect(() => {
    if (dirty) return;
    setLines(initial.map((l) => ({ ...l, _key: l.id, _custom: !l.productId })));
    setVersion(initialVersion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, initialVersion]);
  const can = { spec: perms.spec && !locked && !lockReason, cost: perms.cost && !locked, price: perms.price && !locked };
  const editable = can.spec || can.cost || can.price;

  const set = (key: string, patch: Partial<Line>) => {
    setLines((ls) => ls.map((l) => (l._key === key ? { ...l, ...patch } : l)));
    setDirty(true);
  };
  const pickProduct = (key: string, p: ProductOption | null) => {
    if (!p) return set(key, { productId: null, _custom: true });
    set(key, {
      productId: p.id, _custom: false, isEstimate: false, businessUnitId: p.businessUnitId, categoryId: p.categoryId, oemId: p.oemId, oemName: p.oemName,
      buName: p.buName, categoryName: p.categoryName, partNumber: p.code, description: p.name, unit: p.unit,
      billingFrequency: p.billingFrequency, termMonths: p.billingFrequency === "ONE_TIME" ? null : defaultTerm ?? p.defaultTermMonths ?? 12,
      hsnSac: p.hsnSac, gstRatePct: p.gstRatePct, listPrice: p.listPrice, standardCost: p.standardCost,
    });
  };
  const add = () => {
    setLines((ls) => [
      ...ls,
      {
        _key: k(), _custom: false, isEstimate: false, id: "", lineNo: ls.length + 1, productId: null, businessUnitId: "", categoryId: "", oemId: "",
        oemName: "", buName: "", categoryName: "", partNumber: "", description: "", quantity: 1, unit: "Nos", billingFrequency: "ONE_TIME",
        termMonths: null, hsnSac: null, gstRatePct: 18, unitCost: null, distributor: null, oemQuoteRef: null, leadTimeDays: null,
        pricingStatus: "PENDING", costStale: false, unitPrice: null, listPrice: null, standardCost: null, billingStatus: "NOT_READY", lockedAt: null, notes: null,
      },
    ]);
    setDirty(true);
  };
  const remove = (key: string) => {
    setLines((ls) => ls.filter((l) => l._key !== key));
    setDirty(true);
  };
  const fill = (field: "unitPrice" | "unitCost", from: "listPrice" | "standardCost") => {
    setLines((ls) => ls.map((l) => (l[field] === null && l[from] !== null ? { ...l, [field]: l[from] } : l)));
    setDirty(true);
  };
  const applyMargin = () => {
    const m = Number(targetMargin) / 100;
    if (!(m > -1 && m < 0.95)) return;
    setLines((ls) => ls.map((l) => (l.unitCost !== null ? { ...l, unitPrice: Math.round(l.unitCost / (1 - m)) } : l)));
    setDirty(true);
  };

  const totals = useMemo(() => {
    let sell = 0, cost = 0, sellCosted = 0, costPriced = 0, priced = 0, costed = 0, recurring = 0;
    const byOem = new Map<string, number>();
    const byBu = new Map<string, number>();
    for (const l of lines) {
      const m = mult(l);
      const unit = l.unitPrice ?? l.listPrice ?? 0;
      const value = m * unit;
      if (l.oemName) byOem.set(l.oemName, (byOem.get(l.oemName) ?? 0) + value);
      if (l.buName) byBu.set(l.buName, (byBu.get(l.buName) ?? 0) + value);
      if (l.unitPrice !== null) { sell += m * l.unitPrice; priced++; if (l.billingFrequency !== "ONE_TIME") recurring += m * l.unitPrice; }
      if (l.unitCost !== null) { cost += m * l.unitCost; costed++; }
      if (l.unitPrice !== null && l.unitCost !== null) { sellCosted += m * l.unitPrice; costPriced += m * l.unitCost; }
    }
    const toMix = (m: Map<string, number>) => {
      const all = [...m.entries()].sort((a, b) => b[1] - a[1]);
      const head = all.slice(0, 4);
      const rest = all.slice(4).reduce((a, [, v]) => a + v, 0);
      return rest > 0 ? [...head, ["Other", rest] as [string, number]] : head;
    };
    return { sell, cost, margin: sellCosted ? ((sellCosted - costPriced) / sellCosted) * 100 : null, priced, costed, recurring, oemMix: toMix(byOem), buMix: toMix(byBu) };
  }, [lines]);

  const save = () =>
    run(
      () =>
        saveBoq(
          oppId,
          lines.map((l) => ({
            id: l.id || undefined, productId: l.productId, businessUnitId: l.businessUnitId || null, categoryId: l.categoryId || null,
            oemId: l.oemId || null, partNumber: l.partNumber, description: l.description, isEstimate: l.isEstimate, quantity: l.quantity, unit: l.unit,
            billingFrequency: l.billingFrequency, termMonths: l.termMonths, hsnSac: l.hsnSac, gstRatePct: l.gstRatePct,
            unitCost: l.unitCost, distributor: l.distributor, oemQuoteRef: l.oemQuoteRef, leadTimeDays: l.leadTimeDays,
            unitPrice: l.unitPrice, notes: l.notes,
          })),
          version,
        ),
      {
        success: "Line items saved",
        onOk: (r) => { setDirty(false); setErrors({}); if (r.data) setVersion(r.data.version); },
        onError: (r) => setErrors(r.fieldErrors ?? {}),
      },
    );

  const numIn = (v: number | null, onChange: (n: number | null) => void, disabled: boolean, label: string, placeholder?: number | null) =>
    disabled ? (
      <span className="block text-right tabular">{v === null ? <span className="text-ink-3">—</span> : v.toLocaleString("en-IN")}</span>
    ) : (
      <Input
        type="number" inputMode="decimal" min={0} step="any" value={v ?? ""} aria-label={label}
        placeholder={placeholder !== null && placeholder !== undefined ? placeholder.toLocaleString("en-IN") : undefined}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className="h-8 w-full text-right tabular"
      />
    );
  const sel = (value: string, onChange: (v: string) => void, opts: Opt[], label: string, placeholder: string) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className="h-7 min-w-0 flex-1 rounded-md border border-border bg-surface px-1.5 text-xs">
      <option value="">{placeholder}</option>
      {opts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  );
  const lockedAt = initial.find((l) => l.lockedAt)?.lockedAt;

  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
        <p className="text-sm font-semibold">Line items</p>
        <span className="text-xs text-ink-3">{lines.length} lines</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {locked && <Badge tone="green"><Lock className="size-3" /> Locked for billing{lockedAt ? ` · ${fmtDate(lockedAt)}` : ""}</Badge>}
          {!locked && can.spec && <Badge tone="violet">You edit products and quantities</Badge>}
          {!locked && perms.spec && lockReason && <Badge tone="slate"><Lock className="size-3" /> Products and quantities locked</Badge>}
          {!locked && can.cost && <Badge tone="amber">You edit cost</Badge>}
          {!locked && can.price && <Badge tone="green">You edit sell price</Badge>}
          {!locked && !editable && <Badge tone="slate"><Lock className="size-3" /> Read only</Badge>}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {can.cost && <Button size="sm" variant="ghost" onClick={() => fill("unitCost", "standardCost")} title="Fill empty costs with catalogue standard cost"><Wand2 /> Standard costs</Button>}
          {can.price && <Button size="sm" variant="ghost" onClick={() => fill("unitPrice", "listPrice")} title="Fill empty sell prices with catalogue list price"><Tag /> List prices</Button>}
          {can.price && perms.viewCost && (
            <div className="flex items-center gap-1 rounded-md border border-border pl-2">
              <Percent className="size-3.5 text-ink-3" />
              <input value={targetMargin} onChange={(e) => setTargetMargin(e.target.value)} className="h-7 w-9 bg-transparent text-right text-xs tabular outline-none" aria-label="Target margin %" />
              <Button size="sm" variant="ghost" onClick={applyMargin} title="Set sell price on every costed line to achieve this gross margin">Price at margin</Button>
            </div>
          )}
          {can.spec && <Button size="sm" onClick={add}><Plus /> Add line</Button>}
          {dirty && <Button size="sm" variant="ghost" onClick={() => { setLines(start()); setDirty(false); setErrors({}); }}><Undo2 /> Discard</Button>}
          {editable && <Button size="sm" variant="primary" disabled={!dirty || pending} onClick={save}><Save /> Save</Button>}
        </div>
      </div>
      {!locked && perms.spec && lockReason && (
        <p className="flex items-start gap-2 border-b border-border px-5 py-2 text-xs" style={{ background: "var(--t-amber-bg)", color: "var(--t-amber)" }}>
          <Lock className="mt-px size-3.5 shrink-0" /> {lockReason}
        </p>
      )}
      {Object.keys(errors).length > 0 && (
        <p className="border-b border-border px-5 py-2 text-xs" style={{ background: "var(--t-red-bg)", color: "var(--t-red)" }}>
          {Object.entries(errors).map(([path, msg]) => `Line ${Number(path.split(".")[0]) + 1}: ${msg}`).join(" · ")}
        </p>
      )}
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[1120px] table-fixed text-[13px]">
          <thead>
            <tr className="border-b border-border text-left text-[11px] font-medium uppercase tracking-wide text-ink-3">
              <th scope="col" className="w-9 px-3 py-2.5 font-medium">#</th>
              <th scope="col" className="w-[300px] px-2 py-2.5 font-medium">Product</th>
              <th scope="col" className="w-[148px] px-2 py-2.5 font-medium">Quantity</th>
              <th scope="col" className="w-[140px] px-2 py-2.5 font-medium">Billing</th>
              <th scope="col" className="w-[84px] px-2 py-2.5 font-medium">HSN/SAC</th>
              {perms.viewCost && <th scope="col" className="w-[104px] px-2 py-2.5 text-right font-medium" style={{ color: "var(--t-amber)" }}>Unit cost</th>}
              {perms.viewCost && <th scope="col" className="w-[112px] px-2 py-2.5 font-medium" style={{ color: "var(--t-amber)" }}>Distributor</th>}
              <th scope="col" className="w-[104px] px-2 py-2.5 text-right font-medium" style={{ color: "var(--t-green)" }}>Unit price</th>
              <th scope="col" className="w-[100px] px-2 py-2.5 text-right font-medium">Value</th>
              {perms.viewCost && <th scope="col" className="w-[56px] px-2 py-2.5 text-right font-medium">GM %</th>}
              {can.spec && <th scope="col" className="w-9" />}
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const unit = l.unitPrice ?? l.listPrice;
              const value = unit === null ? null : mult(l) * unit;
              const gm = l.unitPrice && l.unitCost !== null ? ((l.unitPrice - l.unitCost) / l.unitPrice) * 100 : null;
              const cats = categories.filter((c) => c.buId === l.businessUnitId);
              const recurring = l.billingFrequency !== "ONE_TIME";
              return (
                <tr key={l._key} className="border-b border-border align-top last:border-0">
                  <td className="px-3 py-2.5 text-xs text-ink-3 tabular">{i + 1}</td>
                  <td className="px-2 py-2">
                    <div className="flex flex-col gap-1.5">
                      {can.spec ? (
                        <ProductPicker products={products} value={l.productId ?? (l._custom ? "custom" : null)} onChange={(p) => pickProduct(l._key, p)} />
                      ) : null}
                      {l.costStale && perms.viewCost && (
                        <span className="inline-flex w-fit items-center gap-1 rounded-md bg-[var(--t-amber-bg)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--t-amber)]" title="The product, quantity or term changed after purchase priced it">
                          <RefreshCw className="size-3" /> Changed · needs re-pricing
                        </span>
                      )}
                      {l.isEstimate && (
                        <span className="inline-flex w-fit items-center gap-1 rounded-md bg-[var(--t-amber-bg)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--t-amber)]">
                          Estimate{can.spec ? " · pick a product above to replace it" : " · presales will replace it with products"}
                        </span>
                      )}
                      {can.spec && (l._custom || !l.productId) ? (
                        <Input value={l.description} onChange={(e) => set(l._key, { description: e.target.value })} className="h-7 text-xs" placeholder="Description" aria-label={`Line ${i + 1} description`} />
                      ) : !can.spec ? (
                        <span className="text-[13px]">{l.description}</span>
                      ) : null}
                      {can.spec && l._custom ? (
                        <div className="flex gap-1">
                          {sel(l.businessUnitId, (v) => set(l._key, { businessUnitId: v, categoryId: "", buName: bus.find((b) => b.id === v)?.name ?? "" }), bus, `Line ${i + 1} business unit`, "BU")}
                          {sel(l.categoryId, (v) => set(l._key, { categoryId: v, categoryName: cats.find((c) => c.id === v)?.name ?? "" }), cats, `Line ${i + 1} category`, "Category")}
                          {sel(l.oemId, (v) => set(l._key, { oemId: v, oemName: [...oems, ...(oemTbd ? [oemTbd] : [])].find((o) => o.id === v)?.name ?? "" }), l.isEstimate && oemTbd ? [oemTbd, ...oems] : oems, `Line ${i + 1} OEM`, "OEM")}
                        </div>
                      ) : (
                        <span className="text-[11px] text-ink-3">
                          {l.partNumber && <span className="font-mono">{l.partNumber} · </span>}
                          {[l.oemName, l.buName && `${l.buName} / ${l.categoryName}`].filter(Boolean).join(" · ") || "Pick a product"}
                          {locked && <> · {LINE_BILLING_STATUS_LABEL[l.billingStatus]}</>}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    {can.spec ? (
                      <div className="flex items-center gap-1">
                        <div className="w-[64px] shrink-0">{numIn(l.quantity, (n) => set(l._key, { quantity: n ?? 0 }), false, `Line ${i + 1} quantity`)}</div>
                        <select value={l.unit} onChange={(e) => set(l._key, { unit: e.target.value })} aria-label={`Line ${i + 1} unit`} className="h-8 min-w-0 flex-1 rounded-md border border-border bg-surface px-1 text-xs">
                          {[...new Set([l.unit, ...UNITS])].map((u) => <option key={u}>{u}</option>)}
                        </select>
                      </div>
                    ) : (
                      <span className="tabular">{l.quantity.toLocaleString("en-IN")} <span className="text-xs text-ink-3">{l.unit}</span></span>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    {can.spec ? (
                      <div className="flex items-center gap-1">
                        <select
                          value={l.billingFrequency}
                          onChange={(e) => {
                            const f = e.target.value as BillingFrequencyKey;
                            set(l._key, { billingFrequency: f, termMonths: f === "ONE_TIME" ? null : l.termMonths ?? defaultTerm ?? 12 });
                          }}
                          aria-label={`Line ${i + 1} billing`}
                          className="h-8 min-w-0 flex-1 rounded-md border border-border bg-surface px-1 text-xs"
                        >
                          {Object.entries(BILLING_FREQUENCY_LABEL).map(([v, lab]) => <option key={v} value={v}>{lab}</option>)}
                        </select>
                        {recurring && (
                          <Tooltip content="Term in months">
                            <input type="number" min={1} value={l.termMonths ?? 12} onChange={(e) => set(l._key, { termMonths: Number(e.target.value) || 12 })} aria-label={`Line ${i + 1} term months`} className="h-8 w-11 rounded-md border border-border bg-surface px-1 text-right text-xs tabular" />
                          </Tooltip>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-ink-2">{BILLING_FREQUENCY_LABEL[l.billingFrequency]}{recurring && ` × ${billingPeriods({ billingFrequency: l.billingFrequency, termMonths: l.termMonths })}`}</span>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    {can.spec && l._custom ? (
                      <Input value={l.hsnSac ?? ""} onChange={(e) => set(l._key, { hsnSac: e.target.value || null })} className="h-8 font-mono text-xs" placeholder="e.g. 998313" aria-label={`Line ${i + 1} HSN/SAC`} />
                    ) : (
                      <span className={cn("font-mono text-xs", !l.hsnSac && "text-ink-3")}>{l.hsnSac ?? "—"}</span>
                    )}
                  </td>
                  {perms.viewCost && <td className="px-2 py-2">{numIn(l.unitCost, (n) => set(l._key, { unitCost: n }), !can.cost, `Line ${i + 1} unit cost`, l.standardCost)}</td>}
                  {perms.viewCost && (
                    <td className="px-2 py-2">
                      {can.cost ? (
                        <select value={l.distributor ?? ""} onChange={(e) => set(l._key, { distributor: e.target.value || null })} aria-label={`Line ${i + 1} distributor`} className="h-8 w-full rounded-md border border-border bg-surface px-1.5 text-xs">
                          <option value="">—</option>
                          {distributors.map((d) => <option key={d}>{d}</option>)}
                        </select>
                      ) : <span className="text-xs">{l.distributor ?? "—"}</span>}
                    </td>
                  )}
                  <td className="px-2 py-2">{numIn(l.unitPrice, (n) => set(l._key, { unitPrice: n }), !can.price, `Line ${i + 1} unit price`, l.listPrice)}</td>
                  <td className="px-2 py-2.5 text-right tabular">
                    {value === null ? <span className="text-ink-3">—</span> : (
                      <span className={cn("font-medium", l.unitPrice === null && "text-ink-3")} title={l.unitPrice === null ? "Estimated at list price" : undefined}>{inr(value)}</span>
                    )}
                  </td>
                  {perms.viewCost && (
                    <td className="px-2 py-2.5 text-right tabular" style={{ color: gm !== null && gm < 8 ? "var(--t-red)" : undefined }}>
                      {gm === null ? <span className="text-ink-3">—</span> : pct(gm, 1)}
                    </td>
                  )}
                  {can.spec && (
                    <td className="px-1 py-2">
                      <button onClick={() => remove(l._key)} disabled={lines.length === 1} title={lines.length === 1 ? "A deal needs at least one line item" : undefined} className="rounded p-1.5 disabled:pointer-events-none disabled:opacity-30 text-ink-3 hover:bg-surface-hover hover:text-[var(--t-red)] cursor-pointer" aria-label="Remove line">
                        <Trash2 className="size-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
            {lines.length === 0 && (
              <tr>
                <td colSpan={12} className="px-3 py-12 text-center text-sm text-ink-3">
                  No line items yet. {can.spec ? "Add products from the catalogue to build the solution." : "Presales will prepare the bill of quantities."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="grid gap-6 border-t border-border px-5 py-4 md:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,2fr)]">
        <Total label="Sell value" value={inr(totals.sell)} sub={`${totals.priced}/${lines.length} lines priced`} />
        {perms.viewCost && <Total label="Cost" value={inr(totals.cost)} sub={`${totals.costed}/${lines.length} lines costed`} />}
        {perms.viewCost && <Total label="Gross margin" value={totals.margin === null ? "—" : pct(totals.margin, 1)} sub={totals.margin !== null ? inr(totals.sell - totals.cost) : undefined} danger={totals.margin !== null && totals.margin < 8} />}
        <Total label="Recurring value" value={inr(totals.recurring)} sub="over the contract term" />
        <div className="flex flex-col gap-3">
          <MixBar label="By OEM" mix={totals.oemMix} />
          <MixBar label="By business unit" mix={totals.buMix} />
        </div>
      </div>
    </div>
  );
}

function Total({ label, value, sub, danger }: { label: string; value: string; sub?: string; danger?: boolean }) {
  return (
    <div>
      <p className="text-xs text-ink-3">{label}</p>
      <p className="mt-0.5 text-base font-semibold tabular" style={{ color: danger ? "var(--t-red)" : undefined }}>{value}</p>
      {sub && <p className="text-[11px] text-ink-3 tabular">{sub}</p>}
    </div>
  );
}

function MixBar({ label, mix }: { label: string; mix: [string, number][] }) {
  const total = mix.reduce((a, [, v]) => a + v, 0);
  if (!total) return null;
  return (
    <div>
      <p className="mb-1 text-xs text-ink-3">{label}</p>
      <div className="flex h-2 w-full gap-[2px] overflow-hidden rounded-full">
        {mix.map(([k, v], i) => (
          <div key={k} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(v / total) * 100}%`, background: MIX_COLORS[i] }} />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-ink-2">
        {mix.map(([k, v], i) => (
          <span key={k} className="inline-flex items-center gap-1">
            <span className="size-2 rounded-sm" style={{ background: MIX_COLORS[i] }} />
            {k} <span className="tabular text-ink-3">{Math.round((v / total) * 100)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}
