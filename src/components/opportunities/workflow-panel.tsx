// Deal workflow panel: one clear state, who it is waiting on, what blocks the next step, the actions the viewer
// can take now, and the full request history (revisions, questions, send-backs, cancellations).
import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Circle, Clock, AlertCircle, PauseCircle } from "lucide-react";
import type { OppDetail } from "@/server/queries/opportunity-detail";
import type { Options } from "@/server/queries/options";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  PullPresalesButton, StartPresalesButton, SubmitBoqButton, RequestPricingButton, StartPricingButton, CompletePricingButton,
  CreateQuoteButton, AskSalesButton, AnswerPresalesButton, ReturnToPresalesButton, ReassignRequestButton, CancelRequestButton,
  QuoteResponseButton,
} from "@/components/opportunities/workflow-dialogs";
import { OPEN_PRESALES, OPEN_PRICING } from "@/lib/workflow";
import { PRESALES_STATUS_LABEL, PRICING_STATUS_LABEL, STAGE_META, type StageKey, type Tone } from "@/lib/constants";
import { fmtDate, inr, relativeDays } from "@/lib/format";
import { cn } from "@/lib/utils";

type Step = { title: string; state: "done" | "active" | "late" | "paused" | "todo"; detail: React.ReactNode };

const PRESALES_TONE: Record<string, Tone> = { REQUESTED: "blue", IN_PROGRESS: "violet", NEEDS_INFO: "amber", BOQ_SUBMITTED: "green", CANCELLED: "slate" };
const PRICING_TONE: Record<string, Tone> = { REQUESTED: "blue", IN_PROGRESS: "aqua", QUOTED: "green", RETURNED: "amber", CANCELLED: "slate" };
export const QUOTE_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft", SUBMITTED: "With customer", CHANGES_REQUESTED: "Changes requested", ACCEPTED: "Accepted", REJECTED: "Rejected", SUPERSEDED: "Superseded",
};
const PRICING_KIND: Record<string, string> = { FULL: "Pricing", REPRICE: "Re-pricing", REVALIDATE: "Re-validation" };
const SOURCE_LABEL: Record<string, string> = { SALES: "", PURCHASE: "sent back by purchase", CUSTOMER: "customer change" };

export function WorkflowPanel({ d, options, variant }: { d: OppDetail; options: Options; variant: "full" | "summary" }) {
  const o = d.opp;
  const w = d.workflow;
  const now = new Date();
  const closed = ["WON", "LOST", "DROPPED"].includes(o.stage);
  const mgr = d.viewer.role === "ADMIN" || d.viewer.role === "SALES_HEAD";
  const openPs = o.presalesRequests.find((r) => (OPEN_PRESALES as readonly string[]).includes(r.status));
  const openPq = o.pricingRequests.find((r) => (OPEN_PRICING as readonly string[]).includes(r.status));
  const lastPs = o.presalesRequests[0];
  const lastPq = o.pricingRequests[0];
  const quote = o.quotes[0];
  const realLines = d.lines.filter((l) => !l.isEstimate);
  const missingCost = realLines.filter((l) => l.unitCost === null).length;
  const isPresales = !!openPs && (openPs.assignedTo.id === d.viewer.id || mgr);
  const isPurchase = !!openPq && (openPq.assignedTo.id === d.viewer.id || mgr);
  const isSales = d.perms.requestPresales;
  const firstPricing = !o.pricingRequests.some((r) => r.status !== "CANCELLED");
  const stageBeforeBoq = STAGE_META[o.stage as StageKey].order < STAGE_META.BOQ.order;
  const revision = lastPs && {
    number: Math.max(...o.presalesRequests.map((r) => r.revision)) + 1,
    assigneeId: o.presalesOwner?.id ?? lastPs.assignedTo.id,
    scope: lastPs.scope,
    pricingOpen: !!openPq,
    customerAsked: quote?.status === "CHANGES_REQUESTED" ? quote.responseNote : null,
  };

  // ── Actions for this viewer, most important first ──
  const actions: React.ReactNode[] = [];
  const secondary: React.ReactNode[] = [];
  if (!closed) {
    if (openPs) {
      if (isPresales) {
        if (openPs.status === "REQUESTED") actions.push(<StartPresalesButton key="start" requestId={openPs.id} />);
        actions.push(<SubmitBoqButton key="submit" requestId={openPs.id} purchase={options.purchase} lineCount={d.lines.length} toPrice={w.needsCost} />);
        if (openPs.status !== "NEEDS_INFO") secondary.push(<AskSalesButton key="ask" requestId={openPs.id} />);
      }
      if (openPs.status === "NEEDS_INFO" && isSales)
        actions.unshift(<AnswerPresalesButton key="answer" requestId={openPs.id} question={openPs.infoQuestion ?? ""} askedBy={openPs.assignedTo.name} />);
      if (isPresales || isSales) secondary.push(<ReassignRequestButton key="re-ps" kind="presales" requestId={openPs.id} people={options.presales} currentId={openPs.assignedTo.id} />);
      if (isSales) secondary.push(<CancelRequestButton key="x-ps" kind="presales" requestId={openPs.id} />);
    } else if (openPq) {
      if (isPurchase) {
        if (openPq.status === "REQUESTED") actions.push(<StartPricingButton key="start" requestId={openPq.id} />);
        actions.push(<CompletePricingButton key="done" requestId={openPq.id} missing={missingCost} />);
        secondary.push(<ReturnToPresalesButton key="back" requestId={openPq.id} presalesName={o.presalesOwner?.name ?? null} />);
      }
      if (isSales && revision) secondary.push(<PullPresalesButton key="rev" oppId={o.id} presales={options.presales} stageBeforeBoq={false} size="sm" revision={revision} />);
      if (isPurchase || isSales) secondary.push(<ReassignRequestButton key="re-pq" kind="pricing" requestId={openPq.id} people={options.purchase} currentId={openPq.assignedTo.id} />);
      if (isSales) secondary.push(<CancelRequestButton key="x-pq" kind="pricing" requestId={openPq.id} />);
    } else {
      if (isSales && !lastPs && (w.state === "ESTIMATE" || w.state === "NEEDS_PRICING"))
        actions.push(<PullPresalesButton key="pull" oppId={o.id} presales={options.presales} stageBeforeBoq={stageBeforeBoq} size="sm" />);
      if (d.perms.spec && w.state === "NEEDS_PRICING")
        actions.push(<RequestPricingButton key="price" oppId={o.id} purchase={options.purchase} toPrice={w.needsCost} first={firstPricing} variant={lastPs ? "primary" : "secondary"} />);
      if (d.perms.quote && (w.state === "READY_TO_QUOTE" || w.state === "CHANGES_REQUESTED"))
        actions.push(<CreateQuoteButton key="quote" oppId={o.id} disabledReason={w.blockers[0]} label={quote ? `Issue quote v${quote.version + 1}` : undefined} />);
      if (d.perms.quote && w.state === "QUOTE_SENT" && quote) {
        actions.push(<QuoteResponseButton key="resp" quoteId={quote.id} version={quote.version} />);
        secondary.push(<CreateQuoteButton key="reissue" oppId={o.id} disabledReason={w.needsCost ? "Lines need a current cost" : undefined} label={`Issue v${quote.version + 1}`} variant="secondary" />);
      }
      const expired = w.blockers.some((b) => b.startsWith("Supplier pricing expired"));
      if (d.perms.spec && realLines.length && w.needsCost === 0 && (expired || w.state === "CHANGES_REQUESTED" || w.state === "QUOTE_SENT"))
        secondary.push(<RequestPricingButton key="reval" oppId={o.id} purchase={options.purchase} toPrice={0} first={false} variant={expired ? "primary" : "secondary"} />);
      if (isSales && revision && w.state !== "ESTIMATE")
        secondary.push(<PullPresalesButton key="rev" oppId={o.id} presales={options.presales} stageBeforeBoq={false} size="sm" revision={revision} />);
    }
  }

  const waitingLabel = w.waitingOn === "CUSTOMER" ? "the customer" : w.waitingOn === "SALES" ? o.salesOwner.name : w.owner;

  const header = (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Badge tone={w.tone} dot className="text-xs">{w.label}</Badge>
        {waitingLabel && <span className="text-[13px] text-ink-2">Waiting on <span className="font-medium text-ink">{waitingLabel}</span></span>}
        {w.due && (
          <span className={cn("text-xs", w.overdue ? "font-medium text-[var(--t-red)]" : "text-ink-3")}>
            {w.overdue ? "Overdue · " : "Due "}{fmtDate(w.due)} ({relativeDays(w.due)})
          </span>
        )}
      </div>
      {w.blockers.length > 0 && (
        <ul className="flex flex-col gap-1">
          {w.blockers.map((b) => (
            <li key={b} className="flex items-start gap-2 text-[13px] text-ink-2">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[var(--t-amber)]" /> {b}
            </li>
          ))}
        </ul>
      )}
      {(actions.length > 0 || secondary.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {actions}
          {secondary}
        </div>
      )}
      {w.state === "ACCEPTED" && !closed && <p className="text-xs text-ink-3">Mark the deal Won with the PO number when it arrives.</p>}
    </div>
  );

  if (variant === "summary") {
    return (
      <Card>
        <CardHeader title="Workflow" description="Sales → Presales → Purchase → Quote" />
        <CardContent className="flex flex-col gap-3">
          {header}
          <Link href={`/opportunities/${o.id}?tab=boq`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
            Line items and request history <ArrowRight className="size-3" />
          </Link>
        </CardContent>
      </Card>
    );
  }

  // ── Steps ──
  const steps: Step[] = [
    {
      title: lastPs && lastPs.revision > 1 ? `BOQ · revision ${lastPs.revision}` : "BOQ",
      state: openPs ? (openPs.status === "NEEDS_INFO" ? "paused" : openPs.dueDate < now ? "late" : "active") : realLines.length ? "done" : "todo",
      detail: openPs
        ? <>{openPs.assignedTo.name} · {PRESALES_STATUS_LABEL[openPs.status]}{openPs.status !== "NEEDS_INFO" && <> · due {fmtDate(openPs.dueDate, "short")}</>}</>
        : lastPs?.status === "BOQ_SUBMITTED"
          ? <>{realLines.length} lines · submitted {fmtDate(lastPs.submittedAt, "short")}</>
          : realLines.length ? `${realLines.length} lines` : d.lines.length ? "Estimates only" : "Not started",
    },
    {
      title: lastPq && lastPq.kind !== "FULL" && lastPq.status !== "CANCELLED" ? PRICING_KIND[lastPq.kind]! : "Pricing",
      state: openPq
        ? openPq.dueDate < now ? "late" : "active"
        : !realLines.length ? "todo" : w.needsCost ? "todo" : lastPq?.quoteValidTill && lastPq.quoteValidTill < now && lastPq.status === "QUOTED" ? "late" : "done",
      detail: openPq
        ? <>{openPq.assignedTo.name} · {PRICING_STATUS_LABEL[openPq.status]} · due {fmtDate(openPq.dueDate, "short")}</>
        : !realLines.length ? "After the BOQ"
          : w.needsCost ? `${w.needsCost} line${w.needsCost > 1 ? "s need" : " needs"} a cost`
            : lastPq?.status === "QUOTED" && lastPq.quoteValidTill ? <>Costs valid till {fmtDate(lastPq.quoteValidTill, "short")}</> : "All lines costed",
    },
    {
      title: quote ? `Quote v${quote.version}` : "Quote",
      state: !quote ? (w.state === "READY_TO_QUOTE" ? "active" : "todo") : w.state === "READY_TO_QUOTE" || w.state === "CHANGES_REQUESTED" ? "active" : "done",
      detail: quote ? <>{inr(quote.totalPrice)} · {fmtDate(quote.submittedAt ?? quote.createdAt, "short")}{w.state === "READY_TO_QUOTE" ? " · BOQ changed since" : ""}</> : w.state === "READY_TO_QUOTE" ? "Ready to issue" : "After pricing",
    },
    {
      title: "Customer",
      state: o.stage === "WON" || quote?.status === "ACCEPTED" ? "done" : quote?.status === "SUBMITTED" ? (quote.validTill < now ? "late" : "active") : quote?.status === "CHANGES_REQUESTED" || quote?.status === "REJECTED" ? "late" : "todo",
      detail: o.stage === "WON" ? <>PO {o.poNumber}</> : quote && quote.status !== "SUPERSEDED" ? <>{QUOTE_STATUS_LABEL[quote.status]}{quote.status === "SUBMITTED" && <> · valid till {fmtDate(quote.validTill, "short")}</>}</> : "Waiting for a quote",
    },
  ];

  const history = [
    ...o.presalesRequests.map((r) => ({ at: r.createdAt, key: r.id, node: <PresalesItem r={r} /> })),
    ...o.pricingRequests.map((r) => ({ at: r.createdAt, key: r.id, node: <PricingItem r={r} /> })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <Card>
      <CardHeader title="Workflow" description="Sales → Presales → Purchase → Quote. Every revision, question and hand-off is kept below." />
      <CardContent className="flex flex-col gap-4">
        {header}
        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s) => (
            <li key={s.title} className="flex gap-2.5 rounded-md border border-border p-2.5">
              <StepIcon state={s.state} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium">{s.title}</p>
                <p className="text-xs text-ink-3">{s.detail}</p>
              </div>
            </li>
          ))}
        </ol>
        {history.length > 0 && (
          <details className="group rounded-md border border-border" open={history.length <= 3}>
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-[13px] font-medium">
              Request history <span className="text-xs font-normal text-ink-3">{history.length}</span>
              <ArrowRight className="ml-auto size-3.5 text-ink-3 transition-transform group-open:rotate-90" />
            </summary>
            <ol>{history.map((h) => <li key={h.key} className="border-t border-border px-3 py-2.5">{h.node}</li>)}</ol>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

function StepIcon({ state }: { state: Step["state"] }) {
  if (state === "done") return <CheckCircle2 className="size-4 shrink-0" style={{ color: "var(--good)" }} />;
  if (state === "late") return <AlertCircle className="size-4 shrink-0" style={{ color: "var(--critical)" }} />;
  if (state === "paused") return <PauseCircle className="size-4 shrink-0 text-[var(--t-amber)]" />;
  if (state === "active") return <Clock className="size-4 shrink-0 text-primary" />;
  return <Circle className="size-4 shrink-0 text-ink-3" />;
}

type Ps = OppDetail["opp"]["presalesRequests"][number];
type Pq = OppDetail["opp"]["pricingRequests"][number];

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
      {r.infoQuestion && <Line label={`Question from ${r.assignedTo.name}`}>{r.infoQuestion}</Line>}
      {r.infoAnswer && <Line label="Answer">{r.infoAnswer}</Line>}
      {r.solutionSummary && <Line label="Solution">{r.solutionSummary}</Line>}
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
