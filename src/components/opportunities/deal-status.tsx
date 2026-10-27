// "Where is this deal and what happens next": one line under the stage path on every tab of a deal.
// It names who holds the deal, the due date, the one thing blocking it, and the viewer's own next action.
import Link from "next/link";
import { AlertTriangle, CircleDot, CheckCircle2, PauseCircle, XCircle, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DELIVERABLE_LABEL } from "@/lib/deal-setup";
import type { OppDetail } from "@/server/queries/opportunity-detail";
import type { Options } from "@/server/queries/options";
import { DealActions, type DealAction } from "@/components/opportunities/deal-actions";
import { Badge } from "@/components/ui/badge";
import { OPEN_PRESALES, OPEN_PRICING } from "@/lib/workflow";
import { PRESALES_STATUS_LABEL, PRICING_STATUS_LABEL, STAGE_META, type StageKey, type Tone } from "@/lib/constants";
import { nextStage, type Needs } from "@/lib/stage-rules";
import { fmtDate, relativeDays } from "@/lib/format";
import { lineMultiplier } from "@/lib/boq";
import { cn } from "@/lib/utils";

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
      detail = o.stage === "IDENTIFIED" ? "Next: qualify the deal (customer contact and a current close date), then advance it to Qualified."
        : solution ? "Next: request a BOQ from presales." : "Next: pick the catalogue products on Line items, then request pricing.";
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
      detail = `${openPq?.assignedTo.name} is getting OEM and distributor costs for ${w.needsCost || realLines.length} line${(w.needsCost || realLines.length) > 1 ? "s" : ""}.`;
      who = { name: openPq!.assignedTo.name, role: "Purchase" };
      break;
    case "READY_TO_QUOTE":
      headline = quote ? "BOQ changed · send a revised quote" : "Priced · ready to quote";
      detail = "Next: add margin and send the quote.";
      who = { name: sales, role: "Sales" };
      break;
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
  const solution = o.presalesRequired;
  const needsBoq = solution && !o.presalesRequests.some((r) => r.status === "BOQ_SUBMITTED");
  const closed = ["WON", "LOST", "DROPPED"].includes(o.stage);

  const actions: DealAction[] = [];
  const isSales = d.perms.requestPresales;
  const isPresales = !!openPs && (openPs.assignedTo.id === d.viewer.id || admin);
  const isPurchase = !!openPq && (openPq.assignedTo.id === d.viewer.id || admin);
  const revision = lastPs
    ? {
        number: Math.max(...o.presalesRequests.map((r) => r.revision)) + 1,
        assigneeId: o.presalesOwner?.id ?? lastPs.assignedTo.id,
        scope: lastPs.scope,
        note: quote?.status === "CHANGES_REQUESTED" ? quote.responseNote : null,
      }
    : undefined;
  const boqChange = (): DealAction => ({ id: "rev", kind: "pullPresales", label: "Request BOQ change", oppId: o.id, presales: options.presales, revision });
  const pricing = (label: string, toPrice: number, primary = false): DealAction => ({
    id: `price-${toPrice}`, kind: "requestPricing", label, primary, oppId: o.id, purchase: options.purchase, toPrice,
    first: !o.pricingRequests.some((r) => r.status !== "CANCELLED"),
  });
  const quoteAction = (primary: boolean): DealAction => ({
    id: "quote", kind: "quote", primary, oppId: o.id, version: (quote?.version ?? 0) + 1,
    label: quote ? "Send revised quote" : "Create & send quote",
    disabledReason: w.blockers.find((b) => !b.startsWith("Quote v")),
    lines: realLines.map((l) => ({ cost: l.unitCost ?? 0, price: l.unitPrice, mult: lineMultiplier(l) })),
  });

  if (!closed) {
    if (openPs) {
      if (openPs.status === "NEEDS_INFO" && isSales)
        actions.push({ id: "answer", kind: "answer", label: "Answer presales", primary: true, requestId: openPs.id, question: openPs.infoQuestion ?? "", askedBy: openPs.assignedTo.name });
      if (isPresales) {
        actions.push({
          id: "submit", kind: "submitBoq", label: "Submit BOQ", primary: openPs.status !== "NEEDS_INFO" || !isSales, requestId: openPs.id, purchase: options.purchase,
          lineCount: d.lines.length, toPrice: w.needsCost, asked: openPs.deliverables.map((k) => DELIVERABLE_LABEL[k] ?? k),
        });
        if (openPs.status !== "NEEDS_INFO") actions.push({ id: "ask", kind: "askSales", label: "Ask sales a question", requestId: openPs.id });
      }
      if (isPresales || isSales) actions.push({ id: "re-ps", kind: "reassign", label: "Reassign presales", reqKind: "presales", requestId: openPs.id, people: options.presales, currentId: openPs.assignedTo.id });
      if (isSales) actions.push({ id: "x-ps", kind: "cancel", label: "Cancel BOQ request", reqKind: "presales", requestId: openPs.id });
    } else if (openPq) {
      if (isPurchase) {
        const missing = realLines.filter((l) => l.unitCost === null).length;
        actions.push({ id: "done", kind: "completePricing", label: "Pricing complete", primary: true, requestId: openPq.id, disabledReason: missing ? `Enter a unit cost on ${missing} more line${missing > 1 ? "s" : ""} in Line items` : undefined });
        actions.push({ id: "back", kind: "sendBack", label: o.presalesOwner ? "Send back to presales" : "Send back to sales", requestId: openPq.id, presalesName: o.presalesOwner?.name ?? null });
      }
      if (isSales && revision) actions.push(boqChange());
      if (isPurchase || isSales) actions.push({ id: "re-pq", kind: "reassign", label: "Reassign purchase", reqKind: "pricing", requestId: openPq.id, people: options.purchase, currentId: openPq.assignedTo.id });
      if (isSales) actions.push({ id: "x-pq", kind: "cancel", label: "Cancel pricing request", reqKind: "pricing", requestId: openPq.id });
    } else if (isSales || d.perms.spec) {
      const expired = w.blockers.some((b) => b.startsWith("Supplier pricing expired"));
      const qualified = o.stage !== "IDENTIFIED" && o.stage !== "HOLD";
      if ((w.state === "ESTIMATE" || w.state === "NEEDS_PRICING") && !lastPs && qualified)
        actions.push({ id: "pull", kind: "pullPresales", label: "Request BOQ from presales", primary: solution, oppId: o.id, presales: options.presales });
      if (w.state === "NEEDS_PRICING" && !needsBoq && qualified) actions.push(pricing(o.pricingRequests.length ? "Request re-pricing" : "Request pricing", w.needsCost, true));
      if (d.perms.quote && (w.state === "READY_TO_QUOTE" || w.state === "CHANGES_REQUESTED")) actions.push(quoteAction(!expired));
      if (d.perms.quote && w.state === "QUOTE_SENT" && quote) {
        actions.push({ id: "resp", kind: "response", label: "Record customer response", primary: true, quoteId: quote.id, version: quote.version });
        actions.push(quoteAction(false));
      }
      if (realLines.length && w.needsCost === 0 && ["READY_TO_QUOTE", "CHANGES_REQUESTED", "QUOTE_SENT"].includes(w.state))
        actions.push(pricing("Re-validate costs", 0, expired));
      if (isSales && revision && w.state !== "ESTIMATE") actions.push(boqChange());
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
    const m = d.moves.find((x) => x.kind === "resume");
    if (m) advance = m.allowed ? { kind: "move", to: m.to, label: `Resume to ${STAGE_META[m.to].label}` } : { kind: "blocked", label: "Resume", reason: m.reason ?? "" };
  } else if (!closed && !next) {
    const m = byTo.get("WON");
    if (m) advance = m.allowed ? { kind: "move", to: "WON", label: "Close as won", needs: "po" } : { kind: "blocked", label: "Close as won", reason: m.reason ?? "" };
  } else if (!closed && next) {
    const viaWorkflow = next === "BOQ" || next === "PRICING" || next === "PROPOSAL";
    if (!viaWorkflow) {
      const m = byTo.get(next);
      if (m) advance = m.allowed ? { kind: "move", to: next, label: to(next) } : { kind: "blocked", label: to(next), reason: m.reason ?? "" };
    } else {
      const action = next === "BOQ" ? find("pull") : next === "PRICING" ? (stage === "BOQ" ? find("submit") : find("price")) : find("quote");
      if (action && !action.disabledReason) advance = { kind: "action", label: to(next), action };
      else {
        const reason =
          action?.disabledReason ??
          (stage === "IDENTIFIED" ? "Qualify the deal first."
            : openPs ? `Waiting for ${openPs.assignedTo.name} (presales) to submit the BOQ.`
            : openPq ? `Waiting for ${openPq.assignedTo.name} (purchase) to finish pricing.`
            : next === "BOQ" ? "The deal owner requests the BOQ from presales."
            : next === "PRICING" && stage === "BOQ" ? "Request a BOQ from presales first."
            : next === "PRICING" && !realLines.length ? "Replace the estimate with catalogue products on Line items first."
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
