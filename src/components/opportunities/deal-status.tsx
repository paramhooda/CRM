// "Where is this deal and what happens next": one line under the stage path on every tab of a deal.
// It names who holds the deal, the due date, the one thing blocking it, and the viewer's own next action.
import Link from "next/link";
import { AlertTriangle, CircleDot, CheckCircle2, PauseCircle, XCircle, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DELIVERABLE_LABEL, DOC_DELIVERABLES as DOC_DELIVERABLE_KINDS } from "@/lib/deal-setup";
import type { OppDetail } from "@/server/queries/opportunity-detail";
import type { Options } from "@/server/queries/options";
import { DealActions, type DealAction } from "@/components/opportunities/deal-actions";
import { Badge } from "@/components/ui/badge";
import { OPEN_PRESALES, OPEN_PRICING } from "@/lib/workflow";
import { PRESALES_STATUS_LABEL, PRICING_STATUS_LABEL, STAGE_META, type StageKey, type Tone } from "@/lib/constants";
import { nextStage, type Needs } from "@/lib/stage-rules";
import { fmtDate, relativeDays } from "@/lib/format";
import { lineMultiplier, type BillingFrequencyKey } from "@/lib/boq";
import { priceFingerprint } from "@/lib/approvals";
import { snapshotLines } from "@/lib/quote";
import { linesNeedingQuote } from "@/lib/quote-coverage";
import { cn } from "@/lib/utils";

/**
 * The latest price approval, when it is about the deal's current prices (an approval of older prices no longer
 * counts), and whether the viewer approves its current step.
 */
export function approvalState(d: OppDetail) {
  const ap = d.approval;
  if (!ap || ap.status === "CANCELLED") return null;
  const fp = priceFingerprint(d.lines.filter((l) => !l.isEstimate).map((l) => ({ id: l.id, quantity: l.quantity, unitPrice: l.unitPrice, unitCost: l.unitCost, billingFrequency: l.billingFrequency, termMonths: l.termMonths })));
  if (ap.fingerprint !== fp) return null;
  const step = ap.status === "PENDING" ? ap.steps[ap.currentStep] ?? null : null;
  const mine = !!step && ap.requestedById !== d.viewer.id && (step.approverIds.includes(d.viewer.id) || d.viewer.role === "ADMIN");
  return { ...ap, step, mine, of: ap.steps.length };
}

/** What changed on a line since the last quote, so the owner re-checks its price after a revision */
function sinceQuote(d: OppDetail) {
  const quote = d.opp.quotes[0];
  if (!quote) return () => null;
  const quoted = snapshotLines(quote.snapshot);
  return (l: OppDetail["lines"][number]) => {
    const q = quoted.find((x) => x.lineNo === l.lineNo && x.description === l.description) ?? quoted.find((x) => x.description === l.description);
    if (!q) return `New since quote v${quote.version}`;
    const bits = [q.quantity !== l.quantity ? `qty was ${q.quantity.toLocaleString("en-IN")}` : null, q.unitPrice !== null ? `quoted at ${q.unitPrice.toLocaleString("en-IN")}` : null].filter(Boolean);
    return q.quantity !== l.quantity ? `Changed since quote v${quote.version}: ${bits.join(", ")}` : `On quote v${quote.version}: ${bits.join(", ")}`;
  };
}

export function DealStatus({ d, options }: { d: OppDetail; options: Options }) {
  const o = d.opp;
  const w = d.workflow;
  const openPs = o.presalesRequests.find((r) => (OPEN_PRESALES as readonly string[]).includes(r.status));
  const openPq = o.pricingRequests.find((r) => (OPEN_PRICING as readonly string[]).includes(r.status));
  const lastPs = o.presalesRequests[0];
  const lastPq = o.pricingRequests[0];
  const quote = o.quotes[0];
  const sales = o.salesOwner.name;
  const realLines = d.lines.filter((l) => !l.isEstimate);
  const purchaseLines = realLines.filter((l) => l.costSource === "PURCHASE");
  // Solution deals get their BOQ from presales; resale deals are built by sales from the catalogue
  const solution = o.presalesRequired;
  const boqSubmitted = o.presalesRequests.some((r) => r.status === "BOQ_SUBMITTED");
  const needsBoq = solution && !boqSubmitted;

  // ── What to say ──
  let headline = w.label;
  let detail: React.ReactNode = null;
  let who: { name: string; role: string } | null = null;
  switch (w.state) {
    case "ESTIMATE":
      headline = solution ? "Estimate only · needs presales" : "Estimate only · resale";
      detail = solution ? "Next: request a BOQ from presales." : "Next: pick the catalogue products on Line items, then request pricing.";
      who = { name: sales, role: "Sales" };
      break;
    case "WITH_PRESALES":
      headline = lastPs && lastPs.revision > 1 ? `BOQ revision ${lastPs.revision} with presales` : "BOQ with presales";
      detail = openPs?.reason && openPs.revision > 1 ? <>Change: {openPs.reason}</> : `${openPs?.assignedTo.name} is preparing the BOQ.`;
      who = { name: openPs!.assignedTo.name, role: "Presales" };
      break;
    case "WAITING_ON_SALES":
      headline = "Presales is waiting for an answer";
      detail = <>{openPs?.assignedTo.name} asked: “{openPs?.infoQuestion}”</>;
      who = { name: sales, role: "Sales" };
      break;
    case "NEEDS_PRICING":
      headline = needsBoq ? "Needs a BOQ from presales" : "Pricing not requested";
      detail = lastPq?.status === "RETURNED" ? <>Purchase sent it back: {lastPq.returnReason}</>
        : needsBoq ? "This is a solution deal, so presales prepares the BOQ before purchase prices it."
        : `${w.needsCost} line${w.needsCost > 1 ? "s need" : " needs"} a cost from purchase.`;
      who = { name: sales, role: "Sales" };
      break;
    case "WITH_PURCHASE":
      headline = openPq && openPq.kind !== "FULL" ? (openPq.kind === "REPRICE" ? "Re-pricing with purchase" : "Re-validation with purchase") : "Pricing with purchase";
      {
        const n = w.needsCost || purchaseLines.length;
        detail = n ? `${openPq?.assignedTo.name} is getting supplier costs for ${n} line${n > 1 ? "s" : ""}.` : `${openPq?.assignedTo.name} is re-confirming the supplier prices.`;
      }
      who = { name: openPq!.assignedTo.name, role: "Purchase" };
      break;
    case "NEEDS_COSTING":
      headline = "Own-brand lines need a cost";
      detail = o.presalesOwner
        ? `${o.presalesOwner.name} (presales) enters the cost on Line items, or changes it to Source via purchase.`
        : "No presales on this deal. Involve presales to cost them, or switch the lines to Source via purchase.";
      who = o.presalesOwner ? { name: o.presalesOwner.name, role: "Presales" } : { name: sales, role: "Sales" };
      break;
    case "READY_TO_QUOTE": {
      const ap = approvalState(d);
      if (ap?.status === "PENDING") {
        headline = "Waiting for price approval";
        detail = <>{ap.of > 1 ? `Step ${ap.currentStep + 1} of ${ap.of}. ` : ""}{ap.reasons.join(" · ")}</>;
        who = { name: ap.step?.label ?? "Approver", role: "Approver" };
      } else if (ap?.status === "APPROVED") {
        headline = "Prices approved · send the quote";
        detail = "Next: send the quote at the approved prices.";
        who = { name: sales, role: "Sales" };
      } else if (ap?.status === "REJECTED") {
        headline = "Prices not approved";
        detail = <>{ap.note ? `“${ap.note}”. ` : ""}Revise the sales prices and ask again.</>;
        who = { name: sales, role: "Sales" };
      } else if (quote?.status === "REJECTED") {
        // The customer said no: the deal stays open in case they come back
        headline = `Customer rejected quote v${quote.version}`;
        detail = <>{quote.responseNote ? `“${quote.responseNote}”. ` : ""}Close the deal as lost (stage menu), or revise the prices if they come back.</>;
        who = { name: sales, role: "Sales" };
      } else {
        // After a revision (BOQ change or re-pricing) the owner re-checks the prices against the new costs
        headline = quote ? "Revised pricing ready · re-check the sales prices" : "Priced · set the sales prices";
        detail = quote ? "Purchase and presales finished the revision. Review each line's sales price, then send the revised quote." : "Next: set the sales price of each line and send the quote.";
        who = { name: sales, role: "Sales" };
      }
      break;
    }
    case "QUOTE_SENT":
      headline = `Quote v${quote!.version} with customer`;
      detail = `Sent ${fmtDate(quote!.submittedAt ?? quote!.createdAt)} · valid till ${fmtDate(quote!.validTill)}. Next: record the customer's response.`;
      who = { name: "Customer", role: "" };
      break;
    case "CHANGES_REQUESTED":
      headline = "Customer wants changes";
      detail = <>{quote?.responseNote}</>;
      who = { name: sales, role: "Sales" };
      break;
    case "ACCEPTED":
      headline = o.stage === "WON" ? `Won${o.poNumber ? ` · PO ${o.poNumber}` : ""}` : `Quote v${quote?.version} accepted`;
      detail = o.stage === "WON" ? `Closed ${fmtDate(o.closedAt)}. Line items are locked for billing.` : "Next: mark the deal Won when the PO arrives.";
      break;
    case "CLOSED":
      headline = o.stage === "LOST" ? "Lost" : "Dropped";
      detail = o.lossReason;
      break;
  }
  const blocker = w.blockers.find((b) => !b.includes("asked:") && !b.startsWith("Purchase sent"));
  const closed = ["WON", "LOST", "DROPPED"].includes(o.stage);

  const { actions: all, advance } = dealActions(d, options);
  // The step that moves the deal to its next stage sits on the stage bar; the rest stay here
  const actions = all.filter((a) => advance?.kind !== "action" || a.id !== advance.action.id);

  const tone: Tone = w.overdue ? "red" : w.tone;
  const Icon = w.state === "ACCEPTED" ? CheckCircle2 : w.state === "CLOSED" ? XCircle : w.state === "WAITING_ON_SALES" ? PauseCircle : CircleDot;

  return (
    <section aria-label="Deal status" className="flex flex-col gap-3 rounded-xl border border-border bg-surface px-4 py-3 sm:flex-row sm:items-center">
      <Icon className="hidden size-5 shrink-0 sm:block" style={{ color: `var(--t-${tone})` }} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
          {headline}
          {who && (
            <span className="text-[13px] font-normal text-ink-3">
              <span className="hidden sm:inline">· </span>{who.role ? <>with <span className="text-ink-2">{who.name}</span> ({who.role})</> : "with the customer"}
            </span>
          )}
          {w.due && (
            <Badge tone={w.overdue ? "red" : "slate"}>{w.overdue ? "Overdue · " : "Due "}{fmtDate(w.due, "short")} ({relativeDays(w.due)})</Badge>
          )}
        </p>
        {detail && <p className="mt-0.5 text-[13px] text-ink-2">{detail}</p>}
        {blocker && (
          <p className="mt-1 flex items-start gap-1.5 text-xs text-[var(--t-amber)]">
            <AlertTriangle className="mt-px size-3.5 shrink-0" /> {blocker}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {!closed && w.state === "ESTIMATE" && !solution && d.perms.spec && (
          <Button asChild size="sm" variant="primary"><Link href={`/opportunities/${o.id}?tab=boq&edit=1`}><Package /> Add products</Link></Button>
        )}
        {!closed && w.state === "NEEDS_COSTING" && d.perms.internalCost && (
          <Button asChild size="sm" variant="primary"><Link href={`/opportunities/${o.id}?tab=boq&edit=1`}><Package /> Enter costs</Link></Button>
        )}
        <DealActions actions={actions} />
      </div>
    </section>
  );
}

export type Advance =
  | { kind: "move"; to: StageKey; label: string; needs?: Needs }
  | { kind: "action"; label: string; action: DealAction }
  | { kind: "blocked"; label: string; reason: string };

const SHORT: Partial<Record<StageKey, string>> = { PROPOSAL: "Proposal" };
/** Presales deliverables that arrive as a document of the same kind */
const DOC_DELIVERABLES: string[] = DOC_DELIVERABLE_KINDS;

/**
 * Every action this viewer can take on the deal, and the one "advance" step that moves it to its next stage (the
 * Salesforce Path button). Advancing into BOQ, Pricing or Proposal Submitted is the hand-over itself (request the BOQ,
 * submit the BOQ, send the quote); the other stages advance directly. When the step belongs to someone else, the
 * advance is shown disabled with the reason.
 */
export function dealActions(d: OppDetail, options: Options): { actions: DealAction[]; advance: Advance | null } {
  const o = d.opp;
  const w = d.workflow;
  const admin = d.viewer.role === "ADMIN";
  const openPs = o.presalesRequests.find((r) => (OPEN_PRESALES as readonly string[]).includes(r.status));
  const openPq = o.pricingRequests.find((r) => (OPEN_PRICING as readonly string[]).includes(r.status));
  const lastPs = o.presalesRequests[0];
  const quote = o.quotes[0];
  const realLines = d.lines.filter((l) => !l.isEstimate);
  const purchaseLines = realLines.filter((l) => l.costSource === "PURCHASE");
  const solution = o.presalesRequired;
  const needsBoq = solution && !o.presalesRequests.some((r) => r.status === "BOQ_SUBMITTED");
  const closed = ["WON", "LOST", "DROPPED"].includes(o.stage);

  const actions: DealAction[] = [];
  const isSales = d.perms.requestPresales;
  const isPresales = !!openPs && (openPs.assignedTo.id === d.viewer.id || admin);
  const isPurchase = !!openPq && (openPq.assignedTo.id === d.viewer.id || admin);
  const onHold = o.stage === "HOLD";
  const boqSubmitted = o.presalesRequests.some((r) => r.status === "BOQ_SUBMITTED");
  // Revisions follow a submitted BOQ; a BOQ request cancelled before any BOQ is simply asked for again
  const revision = lastPs && boqSubmitted
    ? {
        number: Math.max(...o.presalesRequests.map((r) => r.revision)) + 1,
        assigneeId: o.presalesOwner?.id ?? lastPs.assignedTo.id,
        scope: lastPs.scope,
        note: quote?.status === "CHANGES_REQUESTED" ? quote.responseNote : null,
      }
    : undefined;
  // Documents already on the deal, by kind, so dialogs show them instead of asking for them again
  const docs = (kinds: string[]) => d.documents.filter((x) => kinds.includes(x.kind)).map((x) => ({ id: x.id, fileName: x.fileName, kind: x.kind }));
  const customerDocs = docs(["CUSTOMER_RFP", "SOW"]);
  const tender = o.procurementMode === "RFP" || o.procurementMode === "TENDER";
  const rfpHint = tender && !customerDocs.some((x) => x.kind === "CUSTOMER_RFP") ? "This is an RFP/tender deal and no RFP is on file. Attach it so presales designs to it." : null;
  const canAdd = d.perms.addDocument ? (d.documentKinds as string[]) : [];
  const presalesAsk = { oppId: o.id, presales: options.presales, docs: customerDocs, docHint: rfpHint, canAdd };
  const boqChange = (): DealAction => ({ id: "rev", kind: "pullPresales", label: "Request BOQ change", ...presalesAsk, revision });
  // A resale deal can bring presales in at any point before it closes; the dialog says what that changes
  const qualified = o.stage !== "IDENTIFIED" && !onHold;
  const liveQuote = quote && ["SUBMITTED", "CHANGES_REQUESTED", "ACCEPTED"].includes(quote.status) ? quote : null;
  const involve = (): DealAction => ({
    id: "involve", kind: "pullPresales", label: "Involve presales", ...presalesAsk,
    revision: lastPs ? { number: Math.max(...o.presalesRequests.map((r) => r.revision)) + 1, assigneeId: o.presalesOwner?.id ?? lastPs.assignedTo.id, scope: lastPs.scope, note: null } : undefined,
    involve: [
      "It becomes a solution deal: presales owns the BOQ from here, and BOQ is added to the stage path.",
      ...(realLines.length ? [`Presales starts from your ${realLines.length} line item${realLines.length > 1 ? "s" : ""}. Only the lines they change go back to purchase.`] : []),
      ...(openPq ? [`${openPq.assignedTo.name}'s pricing request is stopped. Pricing is requested again when presales submits the BOQ.`] : []),
      ...(o.stage === "QUALIFIED" ? ["The deal moves to the BOQ stage."] : ["PRICING", "PROPOSAL", "NEGOTIATION"].includes(o.stage) ? ["The deal moves back to the BOQ stage, and follows the usual path to a revised quote."] : []),
      ...(liveQuote ? [`Quote v${liveQuote.version} stays with the customer until the revised quote replaces it.`] : []),
    ],
  });
  const pricing = (label: string, toPrice: number, primary = false): DealAction => ({
    id: `price-${toPrice}`, kind: "requestPricing", label, primary, oppId: o.id, purchase: options.purchase, toPrice,
    first: !o.pricingRequests.some((r) => r.status !== "CANCELLED"), expired: w.expiredCost, docs: docs(["BOQ_SHEET", "OEM_QUOTE"]), canAdd,
  });
  // A quote can't promise prices for longer than the earliest supplier validity behind it
  const supplierUntil = purchaseLines.map((l) => (l.costValidTill ? new Date(l.costValidTill) : null)).filter((x): x is Date => !!x);
  const maxValidTill = supplierUntil.length ? new Date(Math.min(...supplierUntil.map((x) => x.getTime()))) : null;
  // Pricing step: the deal owner sets the sales prices once the lines are costed and sends the quote, after any
  // approval the prices need
  const ap = approvalState(d);
  const changed = sinceQuote(d);
  const quoteAction = (primary: boolean): DealAction => ({
    id: "quote", kind: "quote", oppId: o.id, version: (quote?.version ?? 0) + 1, boqVersion: o.boqVersion,
    primary: primary && ap?.status !== "PENDING",
    label: ap?.status === "PENDING" ? "Review prices" : quote ? "Send revised quote" : "Create & send quote",
    disabledReason: w.blockers.find((b) => !b.startsWith("Quote v") && !b.startsWith("The lines changed") && !b.startsWith("The deal is on hold")),
    lines: realLines.map((l) => ({
      id: l.id, n: l.lineNo, description: l.description, partNumber: l.partNumber, buName: l.buName || "Unclassified", quantity: l.quantity, unit: l.unit,
      billingFrequency: l.billingFrequency as BillingFrequencyKey, termMonths: l.termMonths, mult: lineMultiplier(l), cost: l.unitCost ?? 0,
      costSource: l.costSource, price: l.unitPrice, listPrice: l.listPrice, businessUnitId: l.businessUnitId,
      sinceQuote: quote && (w.state === "READY_TO_QUOTE" || w.state === "CHANGES_REQUESTED") ? changed(l) : null,
    })),
    maxValidTill,
    rules: d.approvalRules,
    approval: d.approval && { id: d.approval.id, status: d.approval.status, fingerprint: d.approval.fingerprint, reasons: d.approval.reasons, steps: d.approval.steps, currentStep: d.approval.currentStep, note: d.approval.note },
  });
  // Documents count when linked to the request or added to the deal while it was open, whoever added them
  const addedFor = (r: { id: string; createdAt: Date }, link: "presalesRequest" | "pricingRequest", kinds: string[]) =>
    d.documents.filter((doc) => kinds.includes(doc.kind) && (doc[link]?.id === r.id || doc.createdAt >= r.createdAt));
  const now = new Date();
  const dueChange = (kind: "presales" | "pricing", r: { id: string; dueDate: Date; requestedBy: { id: string }; assignedTo: { id: string } }): DealAction | null =>
    isSales || r.assignedTo.id === d.viewer.id || r.requestedBy.id === d.viewer.id || d.viewer.isManager
      ? { id: `due-${kind}`, kind: "dueDate", label: "Change due date", reqKind: kind, requestId: r.id, due: r.dueDate }
      : null;

  if (!closed) {
    // Price approval: the approver of the current step reviews the owner's prices
    if (ap?.mine && !onHold) {
      const q = quoteAction(false);
      actions.push({
        id: "approve", kind: "approve", label: "Review & approve prices", primary: true, approvalId: ap.id, reasons: ap.reasons, steps: ap.steps,
        currentStep: ap.currentStep, requestedBy: d.approvalRequester ?? "The deal owner", lines: q.kind === "quote" ? q.lines : [],
      });
    }
    if (openPs) {
      if (openPs.status === "NEEDS_INFO" && isSales)
        actions.push({ id: "answer", kind: "answer", label: "Answer presales", primary: true, requestId: openPs.id, question: openPs.infoQuestion ?? "", askedBy: openPs.assignedTo.name });
      if (isPresales) {
        const have = addedFor(openPs, "presalesRequest", DOC_DELIVERABLES).map((x) => x.kind as string);
        actions.push({
          id: "submit", kind: "submitBoq", label: "Submit BOQ", primary: openPs.status !== "NEEDS_INFO" || !isSales, requestId: openPs.id, purchase: options.purchase,
          oppId: o.id, docs: docs(["SOLUTION_DOC", "BOQ_SHEET", "PRESENTATION", "SITE_SURVEY"]), canAdd,
          lineCount: d.lines.length, toPrice: w.needsCost, asked: openPs.deliverables.map((k) => DELIVERABLE_LABEL[k] ?? k),
          // Deliverables that are documents, asked for on this request and not attached yet
          missingDocs: openPs.deliverables.filter((k) => DOC_DELIVERABLES.includes(k) && !have.includes(k)).map((k) => DELIVERABLE_LABEL[k] ?? k),
          disabledReason: w.needsInternalCost
            ? `Enter the cost of ${w.needsInternalCost} own-brand line${w.needsInternalCost > 1 ? "s" : ""} in Line items, or mark ${w.needsInternalCost > 1 ? "them" : "it"} Source via purchase`
            : undefined,
        });
        if (openPs.status !== "NEEDS_INFO") actions.push({ id: "ask", kind: "askSales", label: "Ask sales a question", requestId: openPs.id });
      }
      if (isPresales || isSales)
        actions.push({ id: "re-ps", kind: "reassign", label: "Reassign presales", reqKind: "presales", requestId: openPs.id, people: options.presales, currentId: openPs.assignedTo.id, due: openPs.dueDate, overdue: openPs.dueDate < now });
      const due = dueChange("presales", openPs);
      if (due) actions.push(due);
      if (isSales) actions.push({ id: "x-ps", kind: "cancel", label: "Cancel BOQ request", reqKind: "presales", requestId: openPs.id });
    } else if (openPq) {
      if (isPurchase) {
        const missing = purchaseLines.filter((l) => l.unitCost === null).length;
        const stale = purchaseLines.filter((l) => l.costStale).length;
        const quotesAttached = addedFor(openPq, "pricingRequest", ["SUPPLIER_QUOTE", "OEM_QUOTE"]).length;
        actions.push({
          id: "done", kind: "completePricing", label: "Pricing complete", primary: true, requestId: openPq.id, oppId: o.id, quotesAttached, canAdd,
          // Lines priced in this request need a supplier quote each (one quote can cover several)
          quoteLines: linesNeedingQuote(d.lines.map((l) => ({ ...l, costSetAt: l.costSetAt ? new Date(l.costSetAt) : null, costValidTill: l.costValidTill ? new Date(l.costValidTill) : null })), openPq.createdAt, now)
            .map((l) => ({ id: l.id, lineNo: l.lineNo, description: l.description })),
          requestQuotes: addedFor(openPq, "pricingRequest", ["SUPPLIER_QUOTE", "OEM_QUOTE"]).map((x) => ({ id: x.id, fileName: x.fileName, lineIds: x.lines.map((y) => y.lineItemId) })),
          disabledReason: missing ? `Enter a unit cost on ${missing} more line${missing > 1 ? "s" : ""} in Line items`
            : stale ? `${stale} line${stale > 1 ? "s" : ""} changed after costing: enter the new cost or tick "Price unchanged" in Line items` : undefined,
        });
        actions.push({ id: "back", kind: "sendBack", label: o.presalesOwner ? "Send back to presales" : "Send back to sales", requestId: openPq.id, presalesName: o.presalesOwner?.name ?? null });
      }
      if (isSales && solution && revision) actions.push(boqChange());
      if (isSales && !solution && qualified) actions.push(involve());
      if (isPurchase || isSales)
        actions.push({ id: "re-pq", kind: "reassign", label: "Reassign purchase", reqKind: "pricing", requestId: openPq.id, people: options.purchase, currentId: openPq.assignedTo.id, due: openPq.dueDate, overdue: openPq.dueDate < now });
      const due = dueChange("pricing", openPq);
      if (due) actions.push(due);
      if (isSales) actions.push({ id: "x-pq", kind: "cancel", label: "Cancel pricing request", reqKind: "pricing", requestId: openPq.id });
    } else if (isSales || d.perms.spec) {
      const expired = w.expiredCost > 0;
      // First BOQ request, or again after the last one was cancelled before presales submitted anything
      if (solution && !boqSubmitted && qualified && (!lastPs || lastPs.status === "CANCELLED"))
        actions.push({ id: "pull", kind: "pullPresales", label: "Request BOQ from presales", primary: true, ...presalesAsk });
      // Lines needing a supplier price: whatever the quote state (a customer change on a resale deal included)
      if (w.needsCost > 0 && !needsBoq && qualified && w.state !== "ESTIMATE")
        actions.push(pricing(o.pricingRequests.length ? "Request re-pricing" : "Request pricing", w.needsCost, true));
      if (d.perms.quote && !needsBoq && !onHold && (w.state === "READY_TO_QUOTE" || w.state === "CHANGES_REQUESTED")) actions.push(quoteAction(!expired));
      if (d.perms.quote && !onHold && w.state === "QUOTE_SENT" && quote) {
        actions.push({ id: "resp", kind: "response", label: "Record customer response", primary: quote.validTill >= now, quoteId: quote.id, version: quote.version });
        actions.push(quoteAction(false));
      }
      // Same quote, later date: only while the deal still matches it
      if (d.perms.quote && quote && (w.state === "QUOTE_SENT" || w.state === "ACCEPTED") && ["SUBMITTED", "ACCEPTED"].includes(quote.status))
        actions.push({ id: "extend", kind: "extend", label: "Extend quote validity", primary: quote.validTill < now, quoteId: quote.id, version: quote.version, validTill: quote.validTill, maxValidTill });
      if (purchaseLines.length && w.needsCost === 0 && qualified && ["READY_TO_QUOTE", "CHANGES_REQUESTED", "QUOTE_SENT"].includes(w.state))
        actions.push(pricing("Re-validate costs", 0, expired));
      if (isSales && solution && revision && w.state !== "ESTIMATE" && qualified) actions.push(boqChange());
      if (isSales && !solution && qualified) actions.push(involve());
    }
  }

  // ── The advance step ──
  const stage = o.stage as StageKey;
  const byTo = new Map(d.moves.map((m) => [m.to, m]));
  const find = (id: string) => actions.find((a) => a.id === id || (id === "price" && a.id.startsWith("price-") && a.kind === "requestPricing" && a.label !== "Re-validate costs"));
  let advance: Advance | null = null;
  const next = nextStage({ stage, presalesRequired: solution });
  const to = (s: StageKey) => `Advance to ${SHORT[s] ?? STAGE_META[s].label}`;
  if (stage === "HOLD") {
    // The allowed resume is the stage it was held from (the other stages report "resume first")
    const m = d.moves.find((x) => x.kind === "resume" && x.allowed) ?? d.moves.find((x) => x.kind === "resume");
    if (m) advance = m.allowed ? { kind: "move", to: m.to, label: `Resume to ${STAGE_META[m.to].label}` } : { kind: "blocked", label: "Resume", reason: m.reason ?? "" };
  } else if (!closed && (!next || (w.state === "ACCEPTED" && byTo.get("WON")?.allowed))) {
    // Last stage before closing, or the customer already accepted the quote: the next step is the PO
    const m = byTo.get("WON");
    if (m) advance = m.allowed ? { kind: "move", to: "WON", label: "Close as won", needs: "po" } : { kind: "blocked", label: "Close as won", reason: m.reason ?? "" };
  } else if (!closed && next) {
    const viaWorkflow = next === "BOQ" || next === "PRICING" || next === "PROPOSAL";
    if (!viaWorkflow) {
      const m = byTo.get(next);
      if (m) advance = m.allowed ? { kind: "move", to: next, label: to(next) } : { kind: "blocked", label: to(next), reason: m.reason ?? "" };
    } else {
      // Into Pricing: presales submits the BOQ on a solution deal; on a resale deal (even one sitting in BOQ) sales
      // requests pricing for the catalogue lines
      // Nothing for purchase to price (own-brand lines on the rate card): the next real step is the quote
      const skipPricing = next === "PRICING" && !needsBoq && realLines.length > 0 && w.state === "READY_TO_QUOTE";
      const action = next === "BOQ" ? find("pull") : skipPricing ? find("quote") : next === "PRICING" ? (stage === "BOQ" && solution ? find("submit") : find("price")) : find("quote");
      if (action?.id === "quote" && ap?.status === "PENDING")
        advance = { kind: "blocked", label: to("PROPOSAL"), reason: `Waiting for price approval from ${ap.step?.label ?? "the approver"}.` };
      else if (action && !action.disabledReason) advance = { kind: "action", label: to(skipPricing ? "PROPOSAL" : next), action };
      else {
        const reason =
          action?.disabledReason ??
          (stage === "IDENTIFIED" ? "Qualify the deal first."
            : openPs ? `Waiting for ${openPs.assignedTo.name} (presales) to submit the BOQ.`
            : openPq ? `Waiting for ${openPq.assignedTo.name} (purchase) to finish pricing.`
            : next === "BOQ" ? "The deal owner requests the BOQ from presales."
            : next === "PRICING" && stage === "BOQ" && solution ? (boqSubmitted ? "Lines need a current cost from purchase first." : "Request a BOQ from presales first.")
            : next === "PRICING" && !realLines.length ? "No presales on this deal: pick the catalogue products on Line items, then request pricing."
            : w.state === "NEEDS_COSTING" ? "Own-brand lines need a cost from presales first."
            : next === "PRICING" ? "The deal owner requests pricing from purchase."
            : w.needsCost ? "Lines need a current cost from purchase first."
            : "The deal owner sends the quote.");
        advance = { kind: "blocked", label: to(next), reason };
      }
    }
  }
  return { actions, advance };
}

// ───────────── Request history (History tab) ─────────────

const PRESALES_TONE: Record<string, Tone> = { REQUESTED: "blue", IN_PROGRESS: "violet", NEEDS_INFO: "amber", BOQ_SUBMITTED: "green", CANCELLED: "slate" };
const PRICING_TONE: Record<string, Tone> = { REQUESTED: "blue", IN_PROGRESS: "aqua", QUOTED: "green", RETURNED: "amber", CANCELLED: "slate" };
const PRICING_KIND: Record<string, string> = { FULL: "Pricing", REPRICE: "Re-pricing", REVALIDATE: "Re-validation" };
const SOURCE_LABEL: Record<string, string> = { SALES: "", PURCHASE: "sent back by purchase", CUSTOMER: "customer change" };
export const QUOTE_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft", SUBMITTED: "With customer", CHANGES_REQUESTED: "Changes requested", ACCEPTED: "Accepted", REJECTED: "Rejected", SUPERSEDED: "Superseded",
};

type Ps = OppDetail["opp"]["presalesRequests"][number];
type Pq = OppDetail["opp"]["pricingRequests"][number];

export function RequestHistory({ d }: { d: OppDetail }) {
  const items = [
    ...d.opp.presalesRequests.map((r) => ({ at: r.createdAt, key: r.id, node: <PresalesItem r={r} /> })),
    ...d.opp.pricingRequests.map((r) => ({ at: r.createdAt, key: r.id, node: <PricingItem r={r} /> })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  if (!items.length) return <p className="px-4 py-6 text-center text-xs text-ink-3">No BOQ or pricing requests yet.</p>;
  return <ol>{items.map((h, i) => <li key={h.key} className={cn("px-4 py-2.5", i > 0 && "border-t border-border")}>{h.node}</li>)}</ol>;
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return <p className="text-xs text-ink-2"><span className="text-ink-3">{label}: </span>{children}</p>;
}

function PresalesItem({ r }: { r: Ps }) {
  const source = SOURCE_LABEL[r.source];
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-medium">{r.revision > 1 ? `BOQ revision ${r.revision}` : "BOQ request"}</span>
        <Badge tone={PRESALES_TONE[r.status]}>{PRESALES_STATUS_LABEL[r.status]}</Badge>
        {source && <span className="text-xs text-ink-3">{source}</span>}
        <span className="ml-auto text-xs text-ink-3">{fmtDate(r.createdAt, "short")}</span>
      </div>
      <p className="text-xs text-ink-3">{r.requestedBy.name} → {r.assignedTo.name} · due {fmtDate(r.dueDate, "short")}{r.submittedAt && <> · submitted {fmtDate(r.submittedAt, "short")}</>}</p>
      {r.reason && <Line label="Change">{r.reason}</Line>}
      {r.deliverables.length > 0 && <Line label="Asked for">{r.deliverables.map((k) => DELIVERABLE_LABEL[k] ?? k).join(", ")}</Line>}
      {r.siteDetails && <Line label="Sites">{r.siteDetails}</Line>}
      {r.infoQuestion && <Line label="Question">{r.infoQuestion}</Line>}
      {r.infoAnswer && <Line label="Answer">{r.infoAnswer}</Line>}
      {r.solutionSummary && <Line label="Solution">{r.solutionSummary}</Line>}
      {r.assumptions && <Line label="Assumptions and exclusions">{r.assumptions}</Line>}
      {r.cancelReason && <Line label="Cancelled">{r.cancelReason}</Line>}
    </div>
  );
}

function PricingItem({ r }: { r: Pq }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-medium">{PRICING_KIND[r.kind] ?? "Pricing"} request</span>
        <Badge tone={PRICING_TONE[r.status]}>{PRICING_STATUS_LABEL[r.status]}</Badge>
        <span className="ml-auto text-xs text-ink-3">{fmtDate(r.createdAt, "short")}</span>
      </div>
      <p className="text-xs text-ink-3">
        {r.requestedBy.name} → {r.assignedTo.name} · due {fmtDate(r.dueDate, "short")}
        {r.quotedAt && <> · priced {fmtDate(r.quotedAt, "short")}</>}
        {r.quoteValidTill && <> · valid till {fmtDate(r.quoteValidTill, "short")}</>}
      </p>
      {r.reason && <Line label="Why">{r.reason}</Line>}
      {r.returnReason && <Line label="Sent back">{r.returnReason}</Line>}
      {r.responseNotes && <Line label="Purchase notes">{r.responseNotes}</Line>}
      {r.cancelReason && <Line label="Cancelled">{r.cancelReason}</Line>}
    </div>
  );
}
