// The BOQ, generated from the deal's line items: what is being supplied, in what quantity and on what billing. It is
// never uploaded, so it is always current. No prices or costs: presales, purchase and sales can all share it.
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { opportunityScope } from "@/lib/authz";
import { db } from "@/lib/db";
import { fmtDate, toNumber } from "@/lib/format";
import { BILLING_FREQUENCY_LABEL } from "@/lib/constants";
import { Logo } from "@/components/crm/logo";
import { PrintButton } from "../quotes/[qid]/print-button";

export const metadata = { title: "Bill of quantities" };

export default async function BoqPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const opp = await db.opportunity.findFirst({
    where: { AND: [{ id }, opportunityScope(user), { deletedAt: null }] },
    include: {
      account: { select: { name: true } },
      lineItems: { orderBy: { lineNo: "asc" }, include: { oem: { select: { name: true } }, businessUnit: { select: { name: true } } } },
      presalesRequests: { where: { status: "BOQ_SUBMITTED" }, orderBy: { revision: "desc" }, take: 1, select: { revision: true, submittedAt: true } },
    },
  });
  if (!opp) notFound();
  const ps = opp.presalesRequests[0];
  // The sales estimate only stands in until there is a real line; components sit under the line they are priced with
  const real = opp.lineItems.some((l) => !l.isEstimate) ? opp.lineItems.filter((l) => !l.isEstimate) : opp.lineItems;
  const lineNoOf = new Map(real.map((l) => [l.id, l.lineNo]));
  const items = real.filter((l) => !l.bundleLeadId || !lineNoOf.has(l.bundleLeadId)).flatMap((l) => [l, ...real.filter((x) => x.bundleLeadId === l.id)]);
  return (
    <div className="mx-auto max-w-[900px] rounded-lg border border-border bg-white p-10 text-[13px] text-neutral-900 shadow-sm print:border-0 print:p-0 print:shadow-none">
      <div className="mb-2 flex justify-end no-print"><PrintButton /></div>
      <header className="flex items-start justify-between border-b border-neutral-200 pb-6">
        <Logo height={32} forceLight />
        <div className="text-right">
          <p className="text-xl font-semibold tracking-tight">Bill of quantities</p>
          <p className="font-mono text-xs">{opp.code}{ps ? ` · revision ${ps.revision}` : ""}</p>
          <p className="text-xs text-neutral-500">{opp.account.name} · {opp.name}</p>
          <p className="text-xs text-neutral-500">Generated {fmtDate(new Date())} from the line items{ps?.submittedAt ? ` · BOQ submitted ${fmtDate(ps.submittedAt)}` : ""}</p>
        </div>
      </header>
      <table className="mt-6 w-full text-[12.5px]">
        <thead>
          <tr className="border-b border-neutral-300 text-left text-[11px] uppercase tracking-wide text-neutral-500">
            <th className="py-2 pr-2">#</th><th className="py-2 pr-2">Item</th><th className="py-2 pr-2">OEM</th>
            <th className="py-2 pr-2 text-right">Qty</th><th className="py-2 pr-2">Billing</th><th className="py-2">HSN/SAC</th>
          </tr>
        </thead>
        <tbody>
          {items.map((l) => (
            <tr key={l.id} className="border-b border-neutral-100 align-top">
              <td className="py-2 pr-2 tabular text-neutral-500">{l.lineNo}</td>
              <td className={l.bundleLeadId ? "py-2 pl-4 pr-2" : "py-2 pr-2"}>
                <p className="font-medium">{l.description}</p>
                <p className="text-[11px] text-neutral-500">{[l.bundleLeadId && lineNoOf.has(l.bundleLeadId) && `↳ priced with line ${lineNoOf.get(l.bundleLeadId)}`, l.partNumber, l.businessUnit.name, l.isEstimate && "estimate"].filter(Boolean).join(" · ")}</p>
              </td>
              <td className="py-2 pr-2">{l.oem.name}</td>
              <td className="py-2 pr-2 text-right tabular">{toNumber(l.quantity).toLocaleString("en-IN")} {l.unit}</td>
              <td className="py-2 pr-2">{l.billingFrequency === "ONE_TIME" ? "One-time" : `${BILLING_FREQUENCY_LABEL[l.billingFrequency]} · ${l.termMonths ?? 12} months`}</td>
              <td className="py-2 font-mono text-xs">{l.hsnSac ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {opp.lineItems.length === 0 && <p className="py-10 text-center text-neutral-500">No line items yet.</p>}
    </div>
  );
}
