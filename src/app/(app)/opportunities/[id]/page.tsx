import Link from "next/link";
import {
  Pencil, Building2, CalendarClock, User, CheckCircle2, Circle, Clock, AlertCircle, FileText, ExternalLink, ArrowRight,
  History as HistoryIcon,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getOpportunityDetail, type OppDetail } from "@/server/queries/opportunity-detail";
import { getOptions } from "@/server/queries/options";
import { PageHeader, PageBody, DescList } from "@/components/crm/page";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StageBadge, HealthBadge, ForecastBadge, PersonCell, healthColor } from "@/components/crm/badges";
import { SeverityIcon } from "@/components/crm/flag-chips";
import { StagePath } from "@/components/opportunities/stage-path";
import { BoqEditor } from "@/components/opportunities/boq-editor";
import { ContactsEditor } from "@/components/opportunities/contacts-editor";
import { ActivityComposer, ActivityTimeline } from "@/components/crm/activity";
import {
  PullPresalesButton, StartPresalesButton, SubmitBoqButton, RequestPricingButton, StartPricingButton, CompletePricingButton,
  CreateQuoteButton, SyncAmountButton,
} from "@/components/opportunities/workflow-dialogs";
import { inr, pct, fmtDate, fmtDateTime, relativeDays } from "@/lib/format";
import {
  STAGE_META, ACCOUNT_TYPE_LABEL, REVENUE_MODEL_LABEL, DEAL_TYPE_LABEL, PROCUREMENT_LABEL, DEAL_REG_LABEL,
  PRESALES_STATUS_LABEL, PRICING_STATUS_LABEL, FORECAST_LABEL, type StageKey,
} from "@/lib/constants";
import { FLAG_META, sortFlags } from "@/lib/rules/flags";
import { cn } from "@/lib/utils";

export async function generateMetadata() {
  return { title: "Opportunity" };
}

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "boq", label: "BOQ & pricing" },
  { key: "activity", label: "Activity" },
  { key: "contacts", label: "Contacts" },
  { key: "quotes", label: "Quotes" },
  { key: "history", label: "History" },
] as const;

export default async function OpportunityPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { tab: tabParam } = await searchParams;
  const tab = TABS.some((t) => t.key === tabParam) ? tabParam! : "overview";
  const [d, options] = await Promise.all([getOpportunityDetail(user, id), getOptions()]);
  const o = d.opp;
  const stage = o.stage as StageKey;
  const closed = ["WON", "LOST", "DROPPED"].includes(stage);
  const openPresales = o.presalesRequests.find((r) => r.status === "REQUESTED" || r.status === "IN_PROGRESS");
  const counts: Record<string, number> = {
    boq: d.lines.length,
    activity: o.activities.filter((a) => a.type !== "TASK" || a.completedAt).length,
    contacts: o.contacts.length,
    quotes: o.quotes.length,
  };

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/opportunities", label: "Opportunities" }, { href: `/accounts/${o.account.id}`, label: o.account.name }]}
        title={o.name}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono text-xs text-ink-3">{o.code}</span>
            <span className="text-ink-3">·</span>
            <Link href={`/accounts/${o.account.id}`} className="inline-flex items-center gap-1 hover:text-primary"><Building2 className="size-3.5" />{o.account.name}</Link>
            <span className="text-ink-3">·</span>
            <span>{o.businessUnit.name} / {o.category.name}</span>
            {o.oem && <><span className="text-ink-3">·</span><span>{o.oem.name}</span></>}
          </span>
        }
        actions={
          <>
            {d.perms.requestPresales && !openPresales && !o.presalesOwner && !closed && (
              <PullPresalesButton oppId={o.id} presales={options.presales} stageBeforeBoq={STAGE_META[stage].order < STAGE_META.BOQ.order} />
            )}
            {d.perms.edit && (
              <Button asChild>
                <Link href={`/opportunities/${o.id}/edit`}><Pencil /> Edit</Link>
              </Button>
            )}
          </>
        }
      >
        <div className="mt-4">
          <StagePath id={o.id} stage={stage} canEdit={d.perms.edit} lossReasons={options.lossReasons} poNumber={o.poNumber} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
          <Metric label="Deal value (TCV)" value={<span className="text-lg font-semibold">{inr(o.amount)}</span>} sub={o.revenueModel === "ARR" && o.arrAmount ? `${inr(o.arrAmount)} ARR · ${o.contractTermMonths} mo` : REVENUE_MODEL_LABEL[o.revenueModel]} />
          <Metric label="Weighted" value={inr((o.amount * o.probability) / 100)} sub={`${o.probability}% probability`} />
          <Metric
            label="Expected close"
            value={<span style={{ color: !closed && o.expectedCloseDate < new Date() ? "var(--t-red)" : undefined }}>{fmtDate(o.expectedCloseDate)}</span>}
            sub={closed ? `Closed ${fmtDate(o.closedAt)}` : `${relativeDays(o.expectedCloseDate)}${o.closeDateSlipCount ? ` · slipped ${o.closeDateSlipCount}×` : ""}`}
          />
          <Metric label="Forecast" value={<ForecastBadge value={o.forecastCategory} />} sub={`${STAGE_META[stage].label} for ${Math.max(0, Math.round((Date.now() - o.stageEnteredAt.getTime()) / 86_400_000))}d`} />
          <Metric label="Health" value={<HealthBadge label={o.healthLabel} score={o.healthScore} />} sub={`Last activity ${relativeDays(o.lastActivityAt)}`} />
          <Metric label="Margin" value={d.perms.viewCost ? (d.totals.marginPct !== null ? pct(d.totals.marginPct, 1) : o.expectedMarginPct !== null ? `${pct(o.expectedMarginPct, 1)} est.` : "—") : "Restricted"} sub={d.totals.marginPct !== null ? "From priced BOQ" : "Expected"} />
        </div>
        <nav className="-mb-4 mt-5 flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/opportunities/${o.id}${t.key === "overview" ? "" : `?tab=${t.key}`}`}
              scroll={false}
              className={cn(
                "whitespace-nowrap border-b-2 px-3 pb-2.5 text-[13px] transition-colors",
                tab === t.key ? "border-ink font-medium text-ink" : "border-transparent text-ink-3 hover:text-ink",
              )}
            >
              {t.label}
              {counts[t.key] !== undefined && <span className="ml-1.5 rounded-full bg-surface-2 px-1.5 text-[11px] tabular">{counts[t.key]}</span>}
            </Link>
          ))}
        </nav>
      </PageHeader>
      <PageBody>
        {tab === "overview" && <Overview d={d} options={options} />}
        {tab === "boq" && (
          <div className="flex flex-col gap-4">
            <Workflow d={d} options={options} compact />
            <BoqEditor
              oppId={o.id}
              initial={d.lines}
              perms={d.perms}
              oems={options.oems}
              distributors={options.distributors}
              defaultTerm={o.contractTermMonths}
              defaultOemId={o.oem?.id ?? null}
              buId={o.businessUnit.id}
              categoryId={o.category.id}
            />
          </div>
        )}
        {tab === "activity" && (
          <div className="grid gap-4 lg:grid-cols-5">
            <div className="lg:col-span-2"><ActivityComposer opportunityId={o.id} contacts={o.contacts.map((c) => c.contact)} /></div>
            <div className="lg:col-span-3"><ActivityTimeline items={o.activities} /></div>
          </div>
        )}
        {tab === "contacts" && (
          <div className="max-w-3xl">
            <ContactsEditor oppId={o.id} current={o.contacts} accountContacts={d.accountContacts} primaryId={o.primaryContact?.id ?? null} canEdit={d.perms.edit} />
          </div>
        )}
        {tab === "quotes" && <Quotes d={d} />}
        {tab === "history" && <HistoryTab d={d} />}
      </PageBody>
    </>
  );
}

function Metric({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-ink-3">{label}</p>
      <div className="mt-0.5 text-[15px] font-medium tabular">{value}</div>
      {sub && <p className="truncate text-xs text-ink-3">{sub}</p>}
    </div>
  );
}

type Opts = Awaited<ReturnType<typeof getOptions>>;

function Overview({ d, options }: { d: OppDetail; options: Opts }) {
  const o = d.opp;
  const flags = sortFlags(o.flags);
  const tasks = o.activities.filter((a) => a.type === "TASK" && !a.completedAt);
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="flex flex-col gap-4 lg:col-span-2">
        {o.healthLabel !== "CLOSED" && (
          <Card>
            <CardHeader title="Why this health score" description="Calculated from stage, engagement recency, forecast, stage age and close-date hygiene" />
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="relative size-16 shrink-0">
                  <svg viewBox="0 0 36 36" className="size-16 -rotate-90">
                    <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--surface-2)" strokeWidth="3.5" />
                    <circle cx="18" cy="18" r="15.5" fill="none" stroke={healthColor(o.healthLabel)} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${(o.healthScore / 100) * 97.4} 97.4`} />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-base font-semibold tabular">{o.healthScore}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <HealthBadge label={o.healthLabel} />
                  <ul className="mt-1.5 flex flex-col gap-0.5 text-xs text-ink-2">
                    {(d.evaluation?.reasons.length
                      ? d.evaluation.reasons
                      : flags.length
                        ? ["Engagement and timing are fine. The concerns below are holding the score down."]
                        : ["On track: recent activity and within expected stage duration"]
                    ).map((r) => (
                      <li key={r}>• {r}</li>
                    ))}
                  </ul>
                </div>
              </div>
              {flags.length > 0 && (
                <div className="mt-4 flex flex-col gap-1.5 border-t border-border pt-3">
                  {flags.map((f) => (
                    <div key={f} className="flex items-start gap-2 text-[13px]">
                      <SeverityIcon severity={FLAG_META[f].severity} className="mt-0.5" />
                      <div>
                        <span className="font-medium">{FLAG_META[f].label}.</span> <span className="text-ink-2">{FLAG_META[f].hint}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader title="Deal details" />
          <CardContent className="flex flex-col gap-5">
            <DescList
              cols={3}
              items={[
                { label: "Account type", value: ACCOUNT_TYPE_LABEL[o.accountType] },
                { label: "Deal type", value: DEAL_TYPE_LABEL[o.dealType] },
                { label: "Revenue model", value: REVENUE_MODEL_LABEL[o.revenueModel] },
                { label: "Business unit", value: o.businessUnit.name },
                { label: "Category", value: o.category.name },
                { label: "OEM", value: o.oem?.name },
                { label: "Lead source", value: o.leadSource },
                { label: "Competition", value: o.competitors },
                { label: "Procurement", value: PROCUREMENT_LABEL[o.procurementMode] + (o.submissionDueDate ? ` · due ${fmtDate(o.submissionDueDate)}` : "") },
              ]}
            />
            <div className="border-t border-border pt-4">
              <DescList
                cols={3}
                items={[
                  { label: "Contract value (TCV)", value: inr(o.amount, { precise: true }) },
                  { label: "Annual recurring value", value: o.arrAmount ? inr(o.arrAmount, { precise: true }) : "—" },
                  { label: "Contract term", value: o.contractTermMonths ? `${o.contractTermMonths} months` : "—" },
                  { label: "Contract period", value: o.contractStartDate ? `${fmtDate(o.contractStartDate)} – ${fmtDate(o.contractEndDate)}` : "—" },
                  { label: "OEM deal registration", value: <span>{DEAL_REG_LABEL[o.dealRegStatus]}{o.dealRegNumber && <span className="text-ink-3"> · {o.dealRegNumber}</span>}</span> },
                  { label: "Deal reg expiry", value: o.dealRegExpiry ? fmtDate(o.dealRegExpiry) : "—" },
                  { label: "Original close date", value: fmtDate(o.originalCloseDate) },
                  { label: "Created", value: `${fmtDate(o.createdAt)} (${relativeDays(o.createdAt)})` },
                  ...(o.stage === "WON" ? [{ label: "Customer PO", value: `${o.poNumber} · ${fmtDate(o.poDate)}` }] : []),
                  ...(o.lossReason ? [{ label: "Loss reason", value: o.lossReason }] : []),
                ]}
              />
            </div>
            {(o.description || o.lossNotes) && (
              <div className="border-t border-border pt-4 text-[13px] text-ink-2 whitespace-pre-line">
                {o.description}
                {o.lossNotes && <p className="mt-2"><span className="font-medium text-ink">Loss notes: </span>{o.lossNotes}</p>}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader title="Next step" />
          <CardContent>
            {o.nextStep ? (
              <div>
                <p className="text-[13px] font-medium">{o.nextStep}</p>
                <p className="mt-0.5 text-xs" style={{ color: o.nextStepDate && o.nextStepDate < new Date() ? "var(--t-red)" : "var(--ink-3)" }}>
                  <CalendarClock className="mr-1 inline size-3.5" />
                  {o.nextStepDate ? `${fmtDate(o.nextStepDate)} (${relativeDays(o.nextStepDate)})` : "No date set"}
                </p>
              </div>
            ) : (
              <p className="text-xs text-ink-3">No next step recorded. Deals without a next step are flagged.</p>
            )}
            {tasks.length > 0 && (
              <div className="mt-3 border-t border-border pt-3">
                <p className="mb-1 text-xs text-ink-3">{tasks.length} open task{tasks.length > 1 ? "s" : ""}</p>
                {tasks.slice(0, 3).map((t) => <p key={t.id} className="truncate text-xs">• {t.subject}</p>)}
                <Link href={`/opportunities/${o.id}?tab=activity`} className="mt-1 inline-block text-xs text-primary hover:underline">Manage tasks</Link>
              </div>
            )}
          </CardContent>
        </Card>
        <Workflow d={d} options={options} />
        <Card>
          <CardHeader title="Deal team" />
          <CardContent className="flex flex-col gap-2.5">
            <TeamRow role="Sales" name={o.salesOwner.name} />
            <TeamRow role="Presales" name={o.presalesOwner?.name} />
            <TeamRow role="Purchase" name={o.purchaseOwner?.name} />
            <div className="border-t border-border pt-2.5">
              <p className="text-xs text-ink-3">Primary customer contact</p>
              {o.primaryContact ? (
                <div className="mt-1">
                  <PersonCell name={`${o.primaryContact.firstName} ${o.primaryContact.lastName}`} sub={o.primaryContact.title} />
                  <p className="mt-1 text-xs text-ink-3">{o.primaryContact.email} · {o.primaryContact.phone}</p>
                </div>
              ) : (
                <p className="text-xs text-ink-3">None</p>
              )}
              <Link href={`/opportunities/${o.id}?tab=contacts`} className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                Buying group ({o.contacts.length}) <ArrowRight className="size-3" />
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TeamRow({ role, name }: { role: string; name?: string | null }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-ink-3">{role}</span>
      {name ? <PersonCell name={name} /> : <span className="text-xs text-ink-3">Not assigned</span>}
    </div>
  );
}

function StepIcon({ state }: { state: "done" | "active" | "late" | "todo" }) {
  if (state === "done") return <CheckCircle2 className="size-4" style={{ color: "var(--good)" }} />;
  if (state === "late") return <AlertCircle className="size-4" style={{ color: "var(--critical)" }} />;
  if (state === "active") return <Clock className="size-4 text-primary" />;
  return <Circle className="size-4 text-ink-3" />;
}

function Workflow({ d, options, compact }: { d: OppDetail; options: Opts; compact?: boolean }) {
  const o = d.opp;
  const now = new Date();
  const closed = ["WON", "LOST", "DROPPED"].includes(o.stage);
  const pr = o.presalesRequests[0];
  const pq = o.pricingRequests[0];
  const quote = o.quotes[0];
  const meIsPresales = !!pr && (pr.assignedTo.id === d.viewer.id || d.viewer.role === "ADMIN");
  const meIsPurchase = !!pq && (pq.assignedTo.id === d.viewer.id || d.viewer.role === "ADMIN");
  const missingCost = d.lines.filter((l) => l.unitCost === null).length;

  const steps: { title: string; state: "done" | "active" | "late" | "todo"; detail: React.ReactNode; action?: React.ReactNode }[] = [
    {
      title: "Presales pulled in",
      state: pr ? "done" : "todo",
      detail: pr ? <>{pr.assignedTo.name} by {pr.requestedBy.name} · {fmtDate(pr.createdAt)}</> : "Sales requests a BOQ from presales",
      action: !pr && d.perms.requestPresales && !closed ? <PullPresalesButton oppId={o.id} presales={options.presales} stageBeforeBoq={STAGE_META[o.stage as StageKey].order < STAGE_META.BOQ.order} size="sm" /> : undefined,
    },
    {
      title: "BOQ prepared",
      state: !pr ? "todo" : pr.status === "BOQ_SUBMITTED" ? "done" : pr.status === "CANCELLED" ? "todo" : pr.dueDate < now ? "late" : "active",
      detail: !pr ? `${d.lines.length} lines` : pr.status === "BOQ_SUBMITTED" ? <>{d.lines.length} lines submitted {fmtDate(pr.submittedAt)}</> : <>{PRESALES_STATUS_LABEL[pr.status]} · due {fmtDate(pr.dueDate)} ({relativeDays(pr.dueDate)})</>,
      action:
        pr && (pr.status === "REQUESTED" || pr.status === "IN_PROGRESS") && meIsPresales ? (
          <div className="flex flex-wrap gap-1.5">
            {pr.status === "REQUESTED" && <StartPresalesButton requestId={pr.id} />}
            <SubmitBoqButton requestId={pr.id} purchase={options.purchase} lineCount={d.lines.length} />
          </div>
        ) : undefined,
    },
    {
      title: "Pricing from purchase",
      state: !pq ? (d.totals.fullyCosted ? "done" : "todo") : pq.status === "QUOTED" ? "done" : pq.status === "CANCELLED" ? "todo" : pq.dueDate < now ? "late" : "active",
      detail: !pq ? (d.totals.fullyCosted ? "Costs available" : "Requested when BOQ is submitted") : pq.status === "QUOTED" ? <>Priced by {pq.assignedTo.name} · {fmtDate(pq.quotedAt)}{pq.quoteValidTill && <> · valid till {fmtDate(pq.quoteValidTill)}</>}</> : <>{pq.assignedTo.name} · {PRICING_STATUS_LABEL[pq.status]} · due {fmtDate(pq.dueDate)} ({relativeDays(pq.dueDate)})</>,
      action:
        pq && (pq.status === "REQUESTED" || pq.status === "IN_PROGRESS") && meIsPurchase ? (
          <div className="flex flex-wrap gap-1.5">
            {pq.status === "REQUESTED" && <StartPricingButton requestId={pq.id} />}
            <CompletePricingButton requestId={pq.id} missing={missingCost} />
          </div>
        ) : (!pq || pq.status === "QUOTED" || pq.status === "CANCELLED") && d.lines.length > 0 && !closed && d.perms.spec && !d.totals.fullyCosted ? (
          <RequestPricingButton oppId={o.id} purchase={options.purchase} />
        ) : undefined,
    },
    {
      title: "Customer quote",
      state: quote ? "done" : d.totals.fullyPriced && d.totals.fullyCosted ? "active" : "todo",
      detail: quote ? <>{quote.code} v{quote.version} · {inr(quote.totalPrice)} · {quote.status.toLowerCase()}</> : d.totals.fullyCosted ? `${d.totals.priced}/${d.totals.lines} lines have a sell price` : "Sales sets sell price once costs are in",
      action:
        d.perms.quote && !closed && d.lines.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            <CreateQuoteButton oppId={o.id} disabledReason={!d.totals.fullyCosted ? "Waiting for costs from purchase" : !d.totals.fullyPriced ? "Set a sell price on every line" : undefined} />
            {d.totals.fullyPriced && Math.round(d.totals.totalPrice) !== Math.round(o.amount) && <SyncAmountButton oppId={o.id} />}
          </div>
        ) : undefined,
    },
  ];

  return (
    <Card>
      <CardHeader title="Sales → Presales → Purchase" description={compact ? undefined : "Solution and pricing workflow"} />
      <CardContent>
        <ol className={cn(compact ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-4" : "flex flex-col gap-3")}>
          {steps.map((s) => (
            <li key={s.title} className={cn("flex gap-2.5", compact && "rounded-md border border-border p-2.5")}>
              <StepIcon state={s.state} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium">{s.title}</p>
                <p className="text-xs text-ink-3">{s.detail}</p>
                {s.action && <div className="mt-1.5">{s.action}</div>}
              </div>
            </li>
          ))}
        </ol>
        {pr?.solutionSummary && !compact && (
          <div className="mt-3 rounded-md bg-surface-2 px-3 py-2 text-xs text-ink-2">
            <span className="font-medium text-ink">Solution: </span>{pr.solutionSummary}
          </div>
        )}
        {pr && !compact && <p className="mt-2 text-xs text-ink-3"><span className="font-medium">Scope:</span> {pr.scope}</p>}
      </CardContent>
    </Card>
  );
}

function Quotes({ d }: { d: OppDetail }) {
  const qs = d.opp.quotes;
  if (!qs.length) {
    return <Card className="p-8 text-center text-sm text-ink-3">No quotes yet. Quotes are generated from a fully priced BOQ on the BOQ tab.</Card>;
  }
  return (
    <Card>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-border bg-surface-2 text-left text-[11px] uppercase tracking-wide text-ink-3">
            <th className="px-4 py-2 font-medium">Quote</th><th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 text-right font-medium">Value</th>
            {d.perms.viewCost && <th className="px-4 py-2 text-right font-medium">Margin</th>}
            <th className="px-4 py-2 font-medium">Issued</th><th className="px-4 py-2 font-medium">Valid till</th><th />
          </tr>
        </thead>
        <tbody>
          {qs.map((q) => (
            <tr key={q.id} className="border-b border-border last:border-0">
              <td className="px-4 py-2.5"><span className="font-mono text-xs">{q.code}</span> <span className="text-ink-3">v{q.version}</span></td>
              <td className="px-4 py-2.5">
                <Badge tone={q.status === "ACCEPTED" ? "green" : q.status === "REJECTED" ? "red" : q.status === "SUBMITTED" ? "blue" : "slate"}>{q.status.charAt(0) + q.status.slice(1).toLowerCase()}</Badge>
              </td>
              <td className="px-4 py-2.5 text-right font-medium tabular">{inr(q.totalPrice)}</td>
              {d.perms.viewCost && <td className="px-4 py-2.5 text-right tabular">{q.marginPct !== null ? pct(q.marginPct, 1) : "—"}</td>}
              <td className="px-4 py-2.5 text-xs">{fmtDate(q.submittedAt ?? q.createdAt)}</td>
              <td className="px-4 py-2.5 text-xs">{fmtDate(q.validTill)}</td>
              <td className="px-4 py-2.5 text-right">
                <Link href={`/opportunities/${d.opp.id}/quotes/${q.id}`} target="_blank" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  <FileText className="size-3.5" /> View <ExternalLink className="size-3" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

const FIELD_LABEL: Record<string, string> = {
  stage: "Stage", amount: "Amount", expectedCloseDate: "Close date", forecastCategory: "Forecast", probability: "Probability",
  salesOwnerId: "Sales owner", presalesOwnerId: "Presales owner", nextStep: "Next step", nextStepDate: "Next step date",
  name: "Name", expectedMarginPct: "Expected margin", dealRegStatus: "Deal reg status", primaryContactId: "Primary contact",
  arrAmount: "ARR", contractTermMonths: "Contract term", lossReason: "Loss reason", poNumber: "PO number",
};

function fmtVal(field: string | null, v: string | null) {
  if (v === null || v === "") return "—";
  if (!field) return v;
  if (field === "stage") return STAGE_META[v as StageKey]?.label ?? v;
  if (field === "forecastCategory") return FORECAST_LABEL[v as keyof typeof FORECAST_LABEL] ?? v;
  if (field === "amount" || field === "arrAmount") return inr(Number(v));
  if (field.endsWith("Date") || field.endsWith("Expiry")) return fmtDate(v);
  if (field.endsWith("Id")) return "changed";
  return v.length > 60 ? v.slice(0, 60) + "…" : v;
}

function HistoryTab({ d }: { d: OppDetail }) {
  const actionLabel: Record<string, string> = {
    CREATE: "Created the opportunity", PRESALES_REQUESTED: "Pulled in presales", BOQ_SUBMITTED: "Submitted the BOQ",
    PRICING_REQUESTED: "Requested pricing", PRICING_COMPLETED: "Completed pricing", QUOTE_ISSUED: "Issued a quote",
    BOQ_UPDATED: "Updated the BOQ", CONTACTS: "Updated the buying group", DELETE: "Deleted",
  };
  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="lg:col-span-2">
        <CardHeader title="Stage journey" description="Days spent in each stage" />
        <CardContent>
          <ol className="flex flex-col gap-2">
            {d.opp.stageHistory.map((s, i) => {
              const next = d.opp.stageHistory[i + 1];
              const days = Math.round(((next?.changedAt ?? new Date()).getTime() - s.changedAt.getTime()) / 86_400_000);
              return (
                <li key={s.id} className="flex items-center gap-3">
                  <StageBadge stage={s.toStage} />
                  <span className="flex-1 text-xs text-ink-3">{fmtDate(s.changedAt)} · {s.changedBy.name}</span>
                  {!["WON", "LOST", "DROPPED"].includes(s.toStage) && <span className="text-xs tabular text-ink-2">{days}d{!next && " so far"}</span>}
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>
      <Card className="lg:col-span-3">
        <CardHeader title={<span className="flex items-center gap-2"><HistoryIcon className="size-4" />Audit trail</span>} description="Every field change, who made it and when" />
        <CardContent className="px-0">
          <ul>
            {d.audit.map((a) => (
              <li key={a.id} className="flex items-start gap-3 border-t border-border px-4 py-2 text-[13px]">
                <User className="mt-0.5 size-3.5 shrink-0 text-ink-3" />
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{a.changedBy?.name ?? "System"}</span>{" "}
                  {a.action === "UPDATE" && a.field ? (
                    <span className="text-ink-2">
                      changed <span className="font-medium text-ink">{FIELD_LABEL[a.field] ?? a.field}</span> from{" "}
                      <span className="text-ink-3 line-through">{fmtVal(a.field, a.oldValue)}</span> to <span className="font-medium text-ink">{fmtVal(a.field, a.newValue)}</span>
                    </span>
                  ) : (
                    <span className="text-ink-2">{actionLabel[a.action] ?? a.action.toLowerCase()}{a.newValue && a.action !== "CREATE" ? ` (${a.newValue})` : ""}</span>
                  )}
                </div>
                <span className="shrink-0 text-xs text-ink-3">{fmtDateTime(a.changedAt)}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

