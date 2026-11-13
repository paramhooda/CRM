import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { opportunityScope, SALES_ROLES } from "@/lib/authz";
import { db } from "@/lib/db";
import { inr, fmtDate, toNumber } from "@/lib/format";
import { Logo } from "@/components/crm/logo";
import { PrintButton } from "./print-button";

export const metadata = { title: "Quotation" };

type SnapLine = { lineNo: number; oem: string | null; partNumber: string | null; description: string; quantity: number; unit: string; billingFrequency?: "ONE_TIME" | "MONTHLY" | "QUARTERLY" | "ANNUAL"; recurring?: boolean; termMonths: number | null; hsnSac?: string | null; gstRatePct?: number | null; unitPrice: number; extended: number; bundledInto?: number | null };
const PER: Record<string, string> = { MONTHLY: "/mo", QUARTERLY: "/qtr", ANNUAL: "/yr" };
const freqOf = (l: SnapLine) => l.billingFrequency ?? (l.recurring ? "MONTHLY" : "ONE_TIME");

export default async function QuotePage({ params }: { params: Promise<{ id: string; qid: string }> }) {
  const user = await requireRole(...SALES_ROLES);
  const { id, qid } = await params;
  const opp = await db.opportunity.findFirst({
    where: { AND: [{ id }, opportunityScope(user)] },
    include: { account: true, primaryContact: true, salesOwner: true },
  });
  if (!opp) notFound();
  const q = await db.quote.findFirst({ where: { id: qid, opportunityId: id } });
  if (!q) notFound();
  const all = (q.snapshot as SnapLine[]) ?? [];
  // Components priced with a main item (a server's extra RAM and disks) are listed under it as included
  const lines = all.filter((l) => !l.bundledInto).flatMap((l) => [l, ...all.filter((x) => x.bundledInto === l.lineNo)]);
  // Each line carries its own GST rate (5–28%); quotes issued before that was recorded assume 18%
  const subtotal = lines.length ? lines.reduce((sum, l) => sum + toNumber(l.extended), 0) : toNumber(q.totalPrice);
  const rateOf = (l: SnapLine) => (l.gstRatePct === null || l.gstRatePct === undefined ? 18 : Number(l.gstRatePct));
  const gst = lines.reduce((sum, l) => sum + (toNumber(l.extended) * rateOf(l)) / 100, 0);
  const rates = [...new Set(lines.map(rateOf))];
  const gstLabel = rates.length === 1 ? `GST @ ${rates[0]}%` : "GST (per line rates)";
  const a = opp.account;
  return (
    <div className="mx-auto max-w-[820px] rounded-lg border border-border bg-white p-10 text-[13px] text-neutral-900 shadow-sm print:border-0 print:p-0 print:shadow-none">
      <div className="mb-2 flex justify-end no-print"><PrintButton /></div>
      <header className="flex items-start justify-between border-b border-neutral-200 pb-6">
        <div className="flex flex-col gap-2">
          <Logo height={32} forceLight />
          <p className="text-xs text-neutral-500">Systems Integration · Cloud · Managed Services · Cybersecurity</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-semibold tracking-tight">Quotation</p>
          <p className="font-mono text-xs">{q.code} · v{q.version}</p>
          <p className="text-xs text-neutral-500">Date {fmtDate(q.submittedAt ?? q.createdAt)} · Valid till {fmtDate(q.validTill)}</p>
        </div>
      </header>
      <section className="grid grid-cols-2 gap-6 border-b border-neutral-200 py-5">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Bill to</p>
          <p className="mt-1 font-medium">{a.name}</p>
          <p className="text-neutral-600">{a.addressLine}</p>
          <p className="text-neutral-600">{a.city}, {a.state} {a.pincode}</p>
          {a.gstin && <p className="text-neutral-600">GSTIN {a.gstin}</p>}
          {opp.primaryContact && <p className="mt-1 text-neutral-600">Attn: {opp.primaryContact.firstName} {opp.primaryContact.lastName}, {opp.primaryContact.title}</p>}
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Reference</p>
          <p className="mt-1 font-medium">{opp.name}</p>
          <p className="text-neutral-600">Opportunity {opp.code}</p>
          <p className="text-neutral-600">Account manager: {opp.salesOwner.name}</p>
          <p className="text-neutral-600">{opp.salesOwner.email}</p>
        </div>
      </section>
      <table className="mt-5 w-full">
        <thead>
          <tr className="border-b border-neutral-300 text-left text-[11px] uppercase tracking-wide text-neutral-500">
            <th className="py-2 pr-2">#</th><th className="py-2 pr-2">Description</th><th className="py-2 pr-2">HSN/SAC</th><th className="py-2 pr-2 text-right">Qty</th>
            <th className="py-2 pr-2 text-right">Unit price</th><th className="py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.lineNo} className="border-b border-neutral-100 align-top">
              <td className="py-2 pr-2 text-neutral-500">{l.lineNo}</td>
              <td className={l.bundledInto ? "py-1.5 pl-4 pr-2" : "py-2 pr-2"}>
                <p>{l.description}</p>
                <p className="text-xs text-neutral-500">
                  {[l.oem, l.partNumber].filter(Boolean).join(" · ")}
                  {freqOf(l) !== "ONE_TIME" && ` · billed ${freqOf(l).toLowerCase()} for ${l.termMonths} months`}
                </p>
              </td>
              <td className="py-2 pr-2 font-mono text-xs">{l.hsnSac ?? "—"}</td>
              <td className="py-2 pr-2 text-right tabular">{l.quantity.toLocaleString("en-IN")} {l.unit}</td>
              {l.bundledInto ? (
                <td colSpan={2} className="py-2 text-right text-xs text-neutral-500">Included</td>
              ) : (
                <>
                  <td className="py-2 pr-2 text-right tabular">{inr(l.unitPrice, { precise: true })}{PER[freqOf(l)] && <span className="text-xs text-neutral-500">{PER[freqOf(l)]}</span>}</td>
                  <td className="py-2 text-right tabular">{inr(l.extended, { precise: true })}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 ml-auto w-72 text-sm">
        <div className="flex justify-between py-1"><span className="text-neutral-500">Subtotal</span><span className="tabular">{inr(subtotal, { precise: true })}</span></div>
        <div className="flex justify-between py-1"><span className="text-neutral-500">{gstLabel}</span><span className="tabular">{inr(gst, { precise: true })}</span></div>
        <div className="flex justify-between border-t border-neutral-300 py-2 font-semibold"><span>Total</span><span className="tabular">{inr(subtotal + gst, { precise: true })}</span></div>
      </div>
      {q.terms && (
        <section className="mt-6 border-t border-neutral-200 pt-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Terms and conditions</p>
          <p className="mt-1 whitespace-pre-line text-xs text-neutral-700">{q.terms}</p>
        </section>
      )}
      <footer className="mt-10 flex justify-between text-xs text-neutral-500">
        <span>This is a system-generated quotation.</span>
        <span>For Progression · Authorised signatory</span>
      </footer>
    </div>
  );
}
