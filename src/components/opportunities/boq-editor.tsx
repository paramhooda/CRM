"use client";
import { useMemo, useState } from "react";
import { Plus, Trash2, Save, Percent, Undo2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useAction } from "@/components/crm/use-action";
import { saveBoq } from "@/server/actions/workflow";
import { inr, pct } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { OppDetail } from "@/server/queries/opportunity-detail";

type Line = OppDetail["lines"][number] & { _key: string };
type Perms = { spec: boolean; cost: boolean; price: boolean; viewCost: boolean };

const UNITS = ["Nos", "Lot", "Users", "Cores", "Devices", "VMs", "TB", "Racks", "Resources", "Days", "Month", "Pool", "Drill"];
let keySeq = 0;
const k = () => `new-${++keySeq}`;

function mult(l: Pick<Line, "quantity" | "recurring" | "termMonths">) {
  return (Number(l.quantity) || 0) * (l.recurring ? Math.max(1, l.termMonths ?? 12) : 1);
}

export function BoqEditor({
  oppId, initial, perms, oems, distributors, defaultTerm, defaultOemId, buId, categoryId,
}: {
  oppId: string;
  initial: OppDetail["lines"];
  perms: Perms;
  oems: { id: string; name: string }[];
  distributors: string[];
  defaultTerm: number | null;
  defaultOemId: string | null;
  buId: string;
  categoryId: string;
}) {
  const start = () => initial.map((l) => ({ ...l, _key: l.id }));
  const [lines, setLines] = useState<Line[]>(start);
  const [dirty, setDirty] = useState(false);
  const [targetMargin, setTargetMargin] = useState("15");
  const { pending, run } = useAction();
  const editable = perms.spec || perms.cost || perms.price;

  const set = (key: string, patch: Partial<Line>) => {
    setLines((ls) => ls.map((l) => (l._key === key ? { ...l, ...patch } : l)));
    setDirty(true);
  };
  const add = () => {
    setLines((ls) => [
      ...ls,
      {
        _key: k(), id: "", lineNo: ls.length + 1, businessUnitId: buId, categoryId, oemId: defaultOemId, oemName: null, partNumber: "",
        description: "", quantity: 1, unit: "Nos", recurring: false, termMonths: defaultTerm, unitCost: null, distributor: null,
        oemQuoteRef: null, leadTimeDays: null, pricingStatus: "PENDING", unitPrice: null, notes: null,
      },
    ]);
    setDirty(true);
  };
  const remove = (key: string) => {
    setLines((ls) => ls.filter((l) => l._key !== key));
    setDirty(true);
  };
  const applyMargin = () => {
    const m = Number(targetMargin) / 100;
    if (!(m > -1 && m < 0.95)) return;
    setLines((ls) => ls.map((l) => (l.unitCost !== null ? { ...l, unitPrice: Math.round(l.unitCost / (1 - m)) } : l)));
    setDirty(true);
  };

  const totals = useMemo(() => {
    let sell = 0, cost = 0, sellCosted = 0, costPriced = 0, priced = 0, costed = 0;
    for (const l of lines) {
      const m = mult(l);
      if (l.unitPrice !== null) { sell += m * l.unitPrice; priced++; }
      if (l.unitCost !== null) { cost += m * l.unitCost; costed++; }
      if (l.unitPrice !== null && l.unitCost !== null) { sellCosted += m * l.unitPrice; costPriced += m * l.unitCost; }
    }
    return { sell, cost, margin: sellCosted ? ((sellCosted - costPriced) / sellCosted) * 100 : null, priced, costed };
  }, [lines]);

  const save = () =>
    run(
      () =>
        saveBoq(
          oppId,
          lines.map((l) => ({
            id: l.id || undefined, businessUnitId: l.businessUnitId, categoryId: l.categoryId, oemId: l.oemId, partNumber: l.partNumber,
            description: l.description, quantity: l.quantity, unit: l.unit, recurring: l.recurring, termMonths: l.termMonths,
            unitCost: l.unitCost, distributor: l.distributor, oemQuoteRef: l.oemQuoteRef, leadTimeDays: l.leadTimeDays,
            unitPrice: l.unitPrice, notes: l.notes,
          })),
        ),
      { success: "BOQ saved", onOk: () => setDirty(false) },
    );

  const numIn = (v: number | null, onChange: (n: number | null) => void, disabled: boolean, w = "w-24", label?: string) =>
    disabled ? (
      <span className="block text-right tabular">{v === null ? <span className="text-ink-3">—</span> : v.toLocaleString("en-IN")}</span>
    ) : (
      <Input
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        value={v ?? ""}
        aria-label={label}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className={cn("h-7 w-full text-right tabular", w && "")}
      />
    );
  const txtIn = (v: string | null, onChange: (s: string) => void, disabled: boolean, cls = "", placeholder?: string, label?: string) =>
    disabled ? (
      <span className={cn("block truncate", !v && "text-ink-3")}>{v || "—"}</span>
    ) : (
      <Input value={v ?? ""} onChange={(e) => onChange(e.target.value)} className={cn("h-7", cls)} placeholder={placeholder} aria-label={label} />
    );

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <p className="text-[13px] font-semibold">Bill of quantities</p>
        <span className="text-xs text-ink-3">{lines.length} lines</span>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {perms.spec && <Badge tone="violet">You edit specification</Badge>}
          {perms.cost && <Badge tone="amber">You edit cost</Badge>}
          {perms.price && <Badge tone="green">You edit sell price</Badge>}
          {!editable && <Badge tone="slate"><Lock className="size-3" /> Read only</Badge>}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {perms.price && perms.viewCost && (
            <div className="flex items-center gap-1 rounded-md border border-border px-1.5">
              <Percent className="size-3.5 text-ink-3" />
              <input value={targetMargin} onChange={(e) => setTargetMargin(e.target.value)} className="h-7 w-10 bg-transparent text-right text-xs tabular outline-none" aria-label="Target margin %" />
              <Button size="sm" variant="ghost" onClick={applyMargin} title="Set sell price on every costed line to achieve this gross margin">Price at margin</Button>
            </div>
          )}
          {perms.spec && <Button size="sm" onClick={add}><Plus /> Add line</Button>}
          {dirty && <Button size="sm" variant="ghost" onClick={() => { setLines(start()); setDirty(false); }}><Undo2 /> Discard</Button>}
          {editable && <Button size="sm" variant="primary" disabled={!dirty || pending} onClick={save}><Save /> Save BOQ</Button>}
        </div>
      </div>
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[1320px] table-fixed text-[13px]">
          <thead>
            <tr className="border-b border-border bg-surface-2 text-left text-[11px] uppercase tracking-wide text-ink-3">
              <th className="w-9 px-2 py-2 font-medium">#</th>
              <th className="w-[120px] px-2 py-2 font-medium">OEM</th>
              <th className="w-[130px] px-2 py-2 font-medium">Part no.</th>
              <th className="w-[300px] px-2 py-2 font-medium">Description</th>
              <th className="w-[76px] px-2 py-2 text-right font-medium">Qty</th>
              <th className="w-[92px] px-2 py-2 font-medium">Unit</th>
              <th className="w-[150px] px-2 py-2 font-medium">Billing</th>
              {perms.viewCost && <th className="w-[116px] px-2 py-2 text-right font-medium" style={{ color: "var(--t-amber)" }}>Unit cost</th>}
              {perms.viewCost && <th className="w-[124px] px-2 py-2 font-medium" style={{ color: "var(--t-amber)" }}>Distributor</th>}
              {perms.viewCost && <th className="w-[70px] px-2 py-2 text-right font-medium" style={{ color: "var(--t-amber)" }}>Lead (d)</th>}
              <th className="w-[116px] px-2 py-2 text-right font-medium" style={{ color: "var(--t-green)" }}>Unit price</th>
              <th className="w-[104px] px-2 py-2 text-right font-medium">Extended</th>
              {perms.viewCost && <th className="w-[64px] px-2 py-2 text-right font-medium">GM %</th>}
              {perms.spec && <th className="w-9" />}
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const ext = l.unitPrice === null ? null : mult(l) * l.unitPrice;
              const gm = l.unitPrice && l.unitCost !== null ? ((l.unitPrice - l.unitCost) / l.unitPrice) * 100 : null;
              return (
                <tr key={l._key} className="border-b border-border align-middle last:border-0">
                  <td className="px-2 py-1.5 text-xs text-ink-3 tabular">{i + 1}</td>
                  <td className="px-2 py-1.5">
                    {perms.spec ? (
                      <select value={l.oemId ?? ""} onChange={(e) => set(l._key, { oemId: e.target.value || null })} className="h-7 w-full rounded-md border border-border bg-surface px-1.5 text-xs">
                        <option value="">—</option>
                        {oems.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                      </select>
                    ) : (
                      <span className="text-xs">{oems.find((o) => o.id === l.oemId)?.name ?? "—"}</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">{txtIn(l.partNumber, (s) => set(l._key, { partNumber: s }), !perms.spec, "font-mono text-xs", undefined, `Line ${i + 1} part number`)}</td>
                  <td className="px-2 py-1.5">{txtIn(l.description, (s) => set(l._key, { description: s }), !perms.spec, "", "What is being supplied", `Line ${i + 1} description`)}</td>
                  <td className="px-2 py-1.5">{numIn(l.quantity, (n) => set(l._key, { quantity: n ?? 0 }), !perms.spec, "w-20", `Line ${i + 1} quantity`)}</td>
                  <td className="px-2 py-1.5">
                    {perms.spec ? (
                      <select value={l.unit} onChange={(e) => set(l._key, { unit: e.target.value })} className="h-7 w-full rounded-md border border-border bg-surface px-1.5 text-xs">
                        {[...new Set([l.unit, ...UNITS])].map((u) => <option key={u}>{u}</option>)}
                      </select>
                    ) : (
                      <span className="text-xs">{l.unit}</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    {perms.spec ? (
                      <div className="flex items-center gap-1">
                        <select
                          value={l.recurring ? "R" : "O"}
                          onChange={(e) => set(l._key, { recurring: e.target.value === "R", termMonths: l.termMonths ?? defaultTerm ?? 12 })}
                          className="h-7 rounded-md border border-border bg-surface px-1 text-xs"
                        >
                          <option value="O">One-time</option>
                          <option value="R">Monthly</option>
                        </select>
                        {l.recurring && (
                          <input type="number" min={1} value={l.termMonths ?? 12} onChange={(e) => set(l._key, { termMonths: Number(e.target.value) || 12 })} className="h-7 w-11 rounded-md border border-border bg-surface px-1 text-right text-xs tabular" title="Term in months" />
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-ink-2">{l.recurring ? `Monthly × ${l.termMonths ?? 12}` : "One-time"}</span>
                    )}
                  </td>
                  {perms.viewCost && <td className="px-2 py-1.5">{numIn(l.unitCost, (n) => set(l._key, { unitCost: n }), !perms.cost, "w-28", `Line ${i + 1} unit cost`)}</td>}
                  {perms.viewCost && (
                    <td className="px-2 py-1.5">
                      {perms.cost ? (
                        <select value={l.distributor ?? ""} onChange={(e) => set(l._key, { distributor: e.target.value || null })} className="h-7 w-full rounded-md border border-border bg-surface px-1.5 text-xs">
                          <option value="">—</option>
                          {distributors.map((d) => <option key={d}>{d}</option>)}
                        </select>
                      ) : (
                        <span className="text-xs">{l.distributor ?? "—"}</span>
                      )}
                    </td>
                  )}
                  {perms.viewCost && <td className="px-2 py-1.5">{numIn(l.leadTimeDays, (n) => set(l._key, { leadTimeDays: n }), !perms.cost, "w-16", `Line ${i + 1} lead time`)}</td>}
                  <td className="px-2 py-1.5">{numIn(l.unitPrice, (n) => set(l._key, { unitPrice: n }), !perms.price, "w-28", `Line ${i + 1} unit price`)}</td>
                  <td className="px-2 py-1.5 text-right font-medium tabular">{ext === null ? <span className="text-ink-3">—</span> : inr(ext)}</td>
                  {perms.viewCost && (
                    <td className="px-2 py-1.5 text-right tabular" style={{ color: gm !== null && gm < 8 ? "var(--t-red)" : undefined }}>
                      {gm === null ? <span className="text-ink-3">—</span> : pct(gm, 1)}
                    </td>
                  )}
                  {perms.spec && (
                    <td className="px-1 py-1.5">
                      <button onClick={() => remove(l._key)} className="rounded p-1 text-ink-3 hover:bg-surface-hover hover:text-[var(--t-red)] cursor-pointer" aria-label="Remove line">
                        <Trash2 className="size-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
            {lines.length === 0 && (
              <tr>
                <td colSpan={14} className="px-3 py-10 text-center text-sm text-ink-3">
                  No BOQ yet. {perms.spec ? "Add the first line to start." : "Presales will prepare the BOQ."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-2 gap-4 border-t border-border bg-surface-2/60 px-4 py-3 sm:grid-cols-4">
        <Total label="Total sell value" value={inr(totals.sell)} sub={`${totals.priced}/${lines.length} lines priced`} />
        {perms.viewCost && <Total label="Total cost" value={inr(totals.cost)} sub={`${totals.costed}/${lines.length} lines costed`} />}
        {perms.viewCost && (
          <Total
            label="Gross margin"
            value={totals.margin === null ? "—" : pct(totals.margin, 1)}
            sub={totals.margin !== null ? inr(totals.sell - totals.cost) : undefined}
            danger={totals.margin !== null && totals.margin < 8}
          />
        )}
        <Total label="Recurring lines" value={String(lines.filter((l) => l.recurring).length)} sub="billed monthly over term" />
      </div>
    </div>
  );
}

function Total({ label, value, sub, danger }: { label: string; value: string; sub?: string; danger?: boolean }) {
  return (
    <div>
      <p className="text-xs text-ink-3">{label}</p>
      <p className="text-[15px] font-semibold tabular" style={{ color: danger ? "var(--t-red)" : undefined }}>{value}</p>
      {sub && <p className="text-[11px] text-ink-3 tabular">{sub}</p>}
    </div>
  );
}
