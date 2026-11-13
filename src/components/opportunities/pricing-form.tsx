"use client";
// The pricing step: once purchase has priced the BOQ, the deal owner sets the sales price of each line against its
// purchase price (or internal cost for rate card and presales lines) and sees the GM as they type. A sales manager
// reviews the same table and sends the quote. Rate-to-rate lines (0% GM) are allowed.
import { useEffect, useMemo, useState } from "react";
import { Send, UserCheck } from "lucide-react";
import { DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Field } from "@/components/ui/input";
import { MoreOptions } from "@/components/ui/more-options";
import { useAction } from "@/components/crm/use-action";
import { createQuote, savePrices } from "@/server/actions/workflow";
import { gmSummary, priceAtMargin, type BillingFrequencyKey } from "@/lib/boq";
import { COST_SOURCE_META, costHeading, type CostSourceKey } from "@/lib/costing";
import { BILLING_FREQUENCY_LABEL } from "@/lib/constants";
import { fmtDate, inr, isoDate, pct } from "@/lib/format";
import { cn } from "@/lib/utils";

export type PriceLine = {
  id: string;
  n: number;
  description: string;
  partNumber: string | null;
  buName: string;
  quantity: number;
  unit: string;
  billingFrequency: BillingFrequencyKey;
  termMonths: number | null;
  /** Quantity × billing periods */
  mult: number;
  /** Purchase price or internal cost, per unit and billing period */
  cost: number;
  costSource: string;
  price: number | null;
  listPrice: number | null;
};

export type PricingAction = {
  kind: "quote";
  oppId: string;
  /** Quote version this will create */
  version: number;
  /** BOQ version the page was loaded at: a save is refused if the lines changed since */
  boqVersion: number;
  /** The viewer is a sales manager: reviews the prices and sends the quote */
  send: boolean;
  /** Who the deal owner hands the prices to */
  managerName: string | null;
  lines: PriceLine[];
  maxValidTill?: Date | null;
};

const plusDays = (n: number) => isoDate(new Date(Date.now() + n * 86_400_000));
const asPrice = (s: string | undefined) => (s === undefined || s.trim() === "" || !Number.isFinite(Number(s)) ? null : Number(s));

export function PricingForm({ a, close }: { a: PricingAction; close: () => void }) {
  const [prices, setPrices] = useState<Record<string, string>>(() => Object.fromEntries(a.lines.map((l) => [l.id, l.price === null ? "" : String(l.price)])));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { pending, run } = useAction();
  const phone = usePhone();
  const setPrice = (id: string, v: number | string) => {
    setPrices((p) => ({ ...p, [id]: String(v) }));
    setErrors((e) => (e.prices ? { ...e, prices: "" } : e));
  };

  const groups = useMemo(() => {
    const m = new Map<string, PriceLine[]>();
    for (const l of a.lines) m.set(l.buName, [...(m.get(l.buName) ?? []), l]);
    return [...m.entries()];
  }, [a.lines]);
  const priced = a.lines.map((l) => ({ ...l, unitCost: l.cost, unitPrice: asPrice(prices[l.id]) }));
  const unpriced = priced.filter((l) => l.unitPrice === null).length;
  const negative = priced.filter((l) => l.unitPrice !== null && l.unitPrice < 0).map((l) => l.n);
  const gm = gmSummary(priced);
  const input = () => priced.map((l) => ({ id: l.id, unitPrice: l.unitPrice ?? 0 }));

  const title = a.send ? (a.version > 1 ? `Send revised quote (v${a.version})` : "Create & send quote") : "Set sales prices";
  const description = a.send
    ? "Check the sales prices and GM, then send. The quote opens as a printable page to save as PDF, and the deal moves to Proposal Submitted."
    : `Set the sales price of each line. ${a.managerName ?? "A sales manager"} reviews it and sends the quote.`;

  return (
    <DialogContent title={title} description={description} wide className="max-w-5xl">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (unpriced) return setErrors({ prices: `Set a sales price on ${unpriced} more line${unpriced > 1 ? "s" : ""}.` });
          if (negative.length) return setErrors({ prices: `A sales price can't be negative (line ${negative.join(", ")}).` });
          const f = Object.fromEntries(new FormData(e.currentTarget).entries());
          if (a.send)
            run(() => createQuote(a.oppId, { validTill: f.validTill, terms: f.terms, prices: input(), version: a.boqVersion }), {
              success: "Quote created",
              onOk: (r) => {
                close();
                const id = (r.data as { id: string } | undefined)?.id;
                if (id) window.open(`/opportunities/${a.oppId}/quotes/${id}`, "_blank");
              },
              onError: (r) => setErrors(r.fieldErrors ?? {}),
            });
          else
            run(() => savePrices(a.oppId, { prices: input(), version: a.boqVersion }), {
              success: `Prices saved. ${a.managerName ?? "A sales manager"} has been asked to send the quote.`,
              onOk: close,
              onError: (r) => setErrors(r.fieldErrors ?? {}),
            });
        }}
      >
        {phone ? (
          <div className="-mx-5 flex flex-col border-y border-border" aria-label="Sales prices">
            {groups.map(([bu, ls]) => (
              <div key={bu}>
                <div className="flex flex-wrap items-center justify-between gap-2 bg-surface-2/60 px-5 py-1.5 text-xs font-medium text-ink-2">
                  <span>{bu} <span className="font-normal text-ink-3">· {ls.length} line{ls.length > 1 ? "s" : ""}</span></span>
                  {(groups.length > 1 || ls.length > 1) && <BuMargin bu={bu} onMargin={(m) => ls.forEach((l) => setPrice(l.id, priceAtMargin(l.cost, m)))} />}
                </div>
                {ls.map((l) => {
                  const price = asPrice(prices[l.id]);
                  const lineGm = price === null ? null : l.mult * (price - l.cost);
                  const meta = COST_SOURCE_META[l.costSource as CostSourceKey];
                  return (
                    <div key={l.id} className="border-t border-border px-5 py-3">
                      <p className="text-[13px] font-medium">{l.n}. {l.description}</p>
                      <p className="text-xs text-ink-3">
                        {l.quantity.toLocaleString("en-IN")} {l.unit} · {l.billingFrequency === "ONE_TIME" ? "One-time" : `${BILLING_FREQUENCY_LABEL[l.billingFrequency]} · ${l.termMonths ?? 12} mo`}
                      </p>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <div className="text-xs text-ink-3">{meta?.costLabel ?? "Cost"}{l.costSource !== "PURCHASE" ? ` · ${meta?.label.toLowerCase()}` : ""}<p className="text-[13px] tabular text-ink-2">{l.cost.toLocaleString("en-IN")}</p></div>
                        <div className="text-right text-xs text-ink-3">GM<p className={cn("text-[13px] tabular text-ink-2", lineGm !== null && lineGm < 0 && "text-[var(--t-red)]")}>{lineGm === null ? "—" : inr(lineGm)}</p></div>
                        <label className="text-xs text-ink-3">Sales price
                          <Input
                            type="number" inputMode="decimal" min={0} step="any" value={prices[l.id] ?? ""} aria-label={`Line ${l.n} sales price`} aria-invalid={price !== null && price < 0}
                            placeholder={l.listPrice !== null ? l.listPrice.toLocaleString("en-IN") : undefined} onChange={(e) => setPrice(l.id, e.target.value)} className="mt-0.5 h-9 text-right tabular"
                          />
                        </label>
                        <label className="text-xs text-ink-3">GM %
                          <div className="mt-0.5"><MarginInput cost={l.cost} price={price} onPrice={(p) => setPrice(l.id, p)} label={`Line ${l.n} GM %`} /></div>
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ) : (
        <div className="-mx-5 overflow-x-auto border-y border-border scrollbar-thin">
          <table className="w-full min-w-[820px] text-[13px]" aria-label="Sales prices">
            <thead>
              <tr className="border-b border-border text-left text-[11px] font-medium uppercase tracking-wide text-ink-3">
                <th scope="col" className="px-5 py-2 font-medium">Item</th>
                <th scope="col" className="w-24 px-2 py-2 text-right font-medium">Qty</th>
                <th scope="col" className="w-40 px-2 py-2 text-right font-medium">{costHeading(a.lines.map((l) => l.costSource))}</th>
                <th scope="col" className="w-32 px-2 py-2 text-right font-medium">Sales price</th>
                <th scope="col" className="w-24 px-2 py-2 text-right font-medium">GM %</th>
                <th scope="col" className="w-28 px-5 py-2 text-right font-medium">GM</th>
              </tr>
            </thead>
            <tbody>
              {groups.map(([bu, ls]) => [
                <BuRow key={`bu-${bu}`} bu={bu} count={ls.length} show={groups.length > 1 || ls.length > 1} onMargin={(m) => ls.forEach((l) => setPrice(l.id, priceAtMargin(l.cost, m)))} />,
                ...ls.map((l) => {
                  const price = asPrice(prices[l.id]);
                  const lineGm = price === null ? null : l.mult * (price - l.cost);
                  const recurring = l.billingFrequency !== "ONE_TIME";
                  return (
                    <tr key={l.id} className="border-t border-border align-top">
                      <td className="px-5 py-2.5">
                        <div className="flex gap-2">
                          <span className="w-5 shrink-0 text-xs tabular text-ink-3">{l.n}</span>
                          <div className="min-w-0">
                            <p className="font-medium">{l.description}</p>
                            <p className="text-xs text-ink-3">
                              {[l.partNumber, recurring ? `${BILLING_FREQUENCY_LABEL[l.billingFrequency]} · ${l.termMonths ?? 12} mo` : "One-time"].filter(Boolean).join(" · ")}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-right tabular">{l.quantity.toLocaleString("en-IN")} <span className="text-xs text-ink-3">{l.unit}</span></td>
                      <td className="px-2 py-2.5 text-right">
                        <span className="tabular text-ink-2">{l.cost.toLocaleString("en-IN")}</span>
                        <span className="block whitespace-nowrap text-[11px] text-ink-3">{COST_SOURCE_META[l.costSource as CostSourceKey]?.costLabel ?? "Cost"}{l.costSource !== "PURCHASE" ? ` · ${COST_SOURCE_META[l.costSource as CostSourceKey]?.label.toLowerCase()}` : ""}</span>
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          type="number" inputMode="decimal" min={0} step="any" value={prices[l.id] ?? ""} aria-label={`Line ${l.n} sales price`}
                          placeholder={l.listPrice !== null ? l.listPrice.toLocaleString("en-IN") : undefined} title={l.listPrice !== null ? "List price" : undefined}
                          onChange={(e) => setPrice(l.id, e.target.value)} className="h-8 text-right tabular" aria-invalid={price !== null && price < 0}
                        />
                      </td>
                      <td className="px-2 py-2"><MarginInput cost={l.cost} price={price} onPrice={(p) => setPrice(l.id, p)} label={`Line ${l.n} GM %`} /></td>
                      <td className={cn("px-5 py-2.5 text-right tabular", lineGm !== null && lineGm < 0 && "text-[var(--t-red)]")}>{lineGm === null ? <span className="text-ink-3">—</span> : inr(lineGm)}</td>
                    </tr>
                  );
                }),
              ])}
            </tbody>
          </table>
        </div>
        )}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px] sm:grid-cols-4" aria-label="GM summary">
          <Fact label="Contract value" value={inr(gm.contract.value)} />
          <Fact label="Cost" value={inr(gm.contract.cost)} />
          <Fact label="Contract GM" value={inr(gm.contract.gm)} sub={gm.contract.gmPct === null ? undefined : pct(gm.contract.gmPct, 1)} danger={gm.contract.gm < 0} />
          {gm.monthly && <Fact label="Monthly GM (recurring)" value={inr(gm.monthly.gm)} sub={`${pct(gm.monthly.gmPct ?? 0, 1)} of ${inr(gm.monthly.value)} a month`} danger={gm.monthly.gm < 0} />}
        </dl>
        {(errors.prices || unpriced > 0) && <p role="status" className={cn("text-xs", errors.prices ? "text-[var(--t-red)]" : "text-[var(--t-amber)]")}>{errors.prices || `${unpriced} line${unpriced > 1 ? "s" : ""} still need${unpriced > 1 ? "" : "s"} a sales price.`}</p>}

        {a.send && (
          <>
            <Field label="Valid till" required error={errors.validTill} hint={a.maxValidTill ? `Supplier prices hold until ${fmtDate(a.maxValidTill)}; the quote can't promise longer.` : undefined}>
              <Input
                name="validTill" type="date" min={isoDate(new Date())} max={a.maxValidTill ? isoDate(a.maxValidTill) : undefined} className="w-44"
                defaultValue={a.maxValidTill && a.maxValidTill < new Date(Date.now() + 30 * 86_400_000) ? isoDate(a.maxValidTill) : plusDays(30)}
              />
            </Field>
            <MoreOptions label="Terms" hint="standard terms">
              <Textarea name="terms" aria-label="Terms" className="min-h-20" defaultValue={"Prices in INR, exclusive of GST.\nPayment: 30 days from invoice.\nDelivery: 3–4 weeks from PO, subject to OEM stock.\nWarranty and support as per OEM terms."} />
            </MoreOptions>
          </>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" onClick={close}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {a.send ? <Send /> : <UserCheck />}
            {a.send ? (a.version > 1 ? "Send revised quote" : "Create & send quote") : `Save and send to ${a.managerName ?? "manager"}`}
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}

/** Business unit heading, with one margin applied to all its lines (products and services usually differ) */
function BuRow({ bu, count, show, onMargin }: { bu: string; count: number; show: boolean; onMargin: (m: number) => void }) {
  if (!show) return null;
  return (
    <tr className="border-t border-border bg-surface-2/60">
      <td colSpan={3} className="px-5 py-1.5 text-xs font-medium text-ink-2">{bu} <span className="font-normal text-ink-3">· {count} line{count > 1 ? "s" : ""}</span></td>
      <td colSpan={3} className="px-5 py-1.5"><BuMargin bu={bu} onMargin={onMargin} /></td>
    </tr>
  );
}

/** One GM for every line of a business unit */
function BuMargin({ bu, onMargin }: { bu: string; onMargin: (m: number) => void }) {
  const [m, setM] = useState("");
  const apply = () => {
    const v = Number(m);
    if (m.trim() !== "" && Number.isFinite(v) && v < 100) onMargin(v);
  };
  return (
    <div className="flex items-center justify-end gap-1.5 text-xs text-ink-3">
      GM
      <input
        value={m} onChange={(e) => setM(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); apply(); } }}
        inputMode="decimal" aria-label={`${bu} GM %`} placeholder="%" className="h-7 w-14 rounded-md border border-border bg-surface px-1.5 text-right tabular text-ink"
      />
      <Button type="button" size="sm" variant="ghost" onClick={apply}>Apply to {bu}</Button>
    </div>
  );
}

/** Narrow screens get one card per line instead of the wide table */
function usePhone() {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(max-width: 639px)");
    const on = () => setPhone(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return phone;
}

/** GM % of a line: shows the margin of its price, and typing a margin sets the price from the cost */
function MarginInput({ cost, price, onPrice, label }: { cost: number; price: number | null; onPrice: (p: number) => void; label: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (price !== null && price > 0 ? (((price - cost) / price) * 100).toFixed(1) : "");
  return (
    <Input
      inputMode="decimal" value={shown} aria-label={label}
      onFocus={() => setDraft(shown)} onBlur={() => setDraft(null)}
      onChange={(e) => {
        setDraft(e.target.value);
        const v = Number(e.target.value);
        if (e.target.value.trim() !== "" && Number.isFinite(v) && v < 100) onPrice(priceAtMargin(cost, v));
      }}
      className={cn("h-8 text-right tabular", price !== null && price < cost && "text-[var(--t-red)]")}
    />
  );
}

function Fact({ label, value, sub, danger }: { label: string; value: string; sub?: string; danger?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="font-semibold tabular" style={{ color: danger ? "var(--t-red)" : undefined }}>{value}</dd>
      {sub && <dd className="text-[11px] text-ink-3 tabular">{sub}</dd>}
    </div>
  );
}
