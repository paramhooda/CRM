import Link from "next/link";
import { Pencil, Building2, CalendarClock, User, FileText, ExternalLink, ArrowRight, History as HistoryIcon } from "lucide-react";
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
import { LineItemsEditor } from "@/components/opportunities/line-items-editor";
import { ContactsEditor } from "@/components/opportunities/contacts-editor";
import { ActivityComposer, ActivityTimeline } from "@/components/crm/activity";
import { DealStatus, RequestHistory, QUOTE_STATUS_LABEL } from "@/components/opportunities/deal-status";
import { inr, pct, fmtDate, fmtDateTime, relativeDays } from "@/lib/format";
import {
  STAGE_META, ACCOUNT_TYPE_LABEL, REVENUE_MODEL_LABEL, DEAL_TYPE_LABEL, PROCUREMENT_LABEL, DEAL_REG_LABEL, FORECAST_LABEL, type StageKey,
} from "@/lib/constants";
import { FLAG_META, sortFlags } from "@/lib/rules/flags";

export async function generateMetadata() {
  return { title: "Opportunity" };
}

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "boq", label: "Line items" },
  { key: "quotes", label: "Quotes" },
  { key: "activity", label: "Activity" },
  { key: "contacts", label: "Contacts" },
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
        tabs={TABS.map((t) => ({ href: `/opportunities/${o.id}${t.key === "overview" ? "" : `?tab=${t.key}`}`, label: t.label, active: tab === t.key, count: counts[t.key] }))}
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
          d.perms.edit && (!closed || user.role === "ADMIN" || user.role === "SALES_HEAD") && (
            <Button asChild>
              <Link href={`/opportunities/${o.id}/edit`}><Pencil /> Edit</Link>
            </Button>
          )
        }
      >
        <div className="mt-5">
          <StagePath id={o.id} stage={stage} moves={d.moves} lossReasons={options.lossReasons} poNumber={o.poNumber} holdReason={o.holdReason} />
        </div>
        <div className="mt-3">
          <DealStatus d={d} options={options} />
        </div>
        <div className="mt-5 grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
          <Metric
            label="Deal value"
            value={<span className="text-lg font-semibold">{inr(o.amount)}</span>}
            sub={o.revenueModel === "ARR" && o.arrAmount ? `${inr(o.arrAmount)} ARR · ${o.contractTermMonths} mo` : `${inr((o.amount * o.probability) / 100)} weighted at ${o.probability}%`}
          />
          <Metric
            label="Expected close"
            value={<span style={{ color: !closed && o.expectedCloseDate < new Date() ? "var(--t-red)" : undefined }}>{fmtDate(o.expectedCloseDate)}</span>}
            sub={closed ? `Closed ${fmtDate(o.closedAt)}` : `${relativeDays(o.expectedCloseDate)}${o.closeDateSlipCount ? ` · slipped ${o.closeDateSlipCount}×` : ""}`}
          />
          <Metric label="Forecast" value={<ForecastBadge value={o.forecastCategory} />} sub={`${STAGE_META[stage].label} for ${Math.max(0, Math.round((Date.now() - o.stageEnteredAt.getTime()) / 86_400_000))}d`} />
          <Metric label="Health" value={<HealthBadge label={o.healthLabel} score={o.healthScore} />} sub={`Last activity ${relativeDays(o.lastActivityAt)}`} />
          <Metric label="Margin" value={d.perms.viewCost ? (d.totals.marginPct !== null ? pct(d.totals.marginPct, 1) : o.expectedMarginPct !== null ? `${pct(o.expectedMarginPct, 1)} est.` : "—") : "Restricted"} sub={d.totals.marginPct !== null ? "From priced lines" : "Expected"} />
        </div>
      </PageHeader>
      <PageBody>
        {tab === "overview" && <Overview d={d} />}
        {tab === "boq" && (
          <LineItemsEditor
            oppId={o.id}
            initial={d.lines}
            perms={d.perms}
            products={options.products}
            bus={options.bus}
            categories={options.categories}
            oems={options.oems}
            distributors={options.distributors}
            defaultTerm={o.contractTermMonths}
            locked={stage === "WON"}
            version={o.boqVersion}
            lockReason={d.lockReason}
            oemTbd={options.oemTbd}
          />
        )}
        {tab === "activity" && (
          <div className="grid gap-6 lg:grid-cols-5">
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

/** The essentials only: why the deal is healthy or not, the facts that matter, next step and who is involved. */
function Overview({ d }: { d: OppDetail }) {
  const o = d.opp;
  const flags = sortFlags(o.flags);
  const tasks = o.activities.filter((a) => a.type === "TASK" && !a.completedAt);
  const details = [
    { label: "Account type", value: ACCOUNT_TYPE_LABEL[o.accountType] },
    { label: "Deal type", value: DEAL_TYPE_LABEL[o.dealType] },
    { label: "Revenue", value: REVENUE_MODEL_LABEL[o.revenueModel] + (o.contractTermMonths ? ` · ${o.contractTermMonths} months` : "") },
    { label: "Procurement", value: PROCUREMENT_LABEL[o.procurementMode] + (o.submissionDueDate ? ` · bid due ${fmtDate(o.submissionDueDate)}` : "") },
    { label: "Path", value: o.presalesRequired ? "Solution · needs presales" : "Resale · no presales" },
    ...(o.dealRegStatus !== "NOT_REQUIRED"
      ? [{ label: "OEM deal registration", value: DEAL_REG_LABEL[o.dealRegStatus] + (o.dealRegNumber ? ` · ${o.dealRegNumber}` : "") + (o.dealRegExpiry ? ` · expires ${fmtDate(o.dealRegExpiry)}` : "") }]
      : []),
    { label: "Competition", value: o.competitors || "—" },
    { label: "Lead source", value: o.leadSource || "—" },
    { label: "Created", value: `${fmtDate(o.createdAt)} (${relativeDays(o.createdAt)})` },
    ...(o.contractStartDate ? [{ label: "Contract period", value: `${fmtDate(o.contractStartDate)} – ${fmtDate(o.contractEndDate)}` }] : []),
    ...(o.stage === "WON" ? [{ label: "Customer PO", value: `${o.poNumber} · ${fmtDate(o.poDate)}` }] : []),
    ...(o.lossReason ? [{ label: "Loss reason", value: o.lossReason }] : []),
  ];
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="flex flex-col gap-6 lg:col-span-2">
        {o.healthLabel !== "CLOSED" && (
          <Card>
            <CardContent className="flex flex-col gap-3 pt-5">
              <div className="flex items-center gap-4">
                <div className="relative size-14 shrink-0">
                  <svg viewBox="0 0 36 36" className="size-14 -rotate-90">
                    <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--surface-2)" strokeWidth="3.5" />
                    <circle cx="18" cy="18" r="15.5" fill="none" stroke={healthColor(o.healthLabel)} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${(o.healthScore / 100) * 97.4} 97.4`} />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold tabular">{o.healthScore}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">Health <HealthBadge label={o.healthLabel} /></p>
                  <p className="mt-0.5 text-xs text-ink-2">
                    {(d.evaluation?.reasons.length ? d.evaluation.reasons : ["On track: recent activity and within expected stage duration"]).join(" · ")}
                  </p>
                </div>
              </div>
              {flags.length > 0 && (
                <ul className="flex flex-col gap-1.5 border-t border-border pt-3">
                  {flags.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-[13px]">
                      <SeverityIcon severity={FLAG_META[f].severity} className="mt-0.5" />
                      <span><span className="font-medium">{FLAG_META[f].label}.</span> <span className="text-ink-2">{FLAG_META[f].hint}</span></span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader title="Details" />
          <CardContent className="flex flex-col gap-4">
            <DescList cols={3} items={details} />
            {(o.description || o.lossNotes) && (
              <div className="whitespace-pre-line border-t border-border pt-4 text-[13px] text-ink-2">
                {o.description}
                {o.lossNotes && <p className="mt-2"><span className="font-medium text-ink">Loss notes: </span>{o.lossNotes}</p>}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <div className="flex flex-col gap-6">
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
              <p className="text-xs text-ink-3">No next step recorded.</p>
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
        <Card>
          <CardHeader title="People" />
          <CardContent className="flex flex-col gap-2.5">
            <TeamRow role="Sales" name={o.salesOwner.name} />
            <TeamRow role="Presales" name={o.presalesOwner?.name} />
            <TeamRow role="Purchase" name={o.purchaseOwner?.name} />
            <div className="border-t border-border pt-2.5">
              <p className="text-xs text-ink-3">Customer contact</p>
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
                <Badge tone={q.status === "ACCEPTED" ? "green" : q.status === "REJECTED" ? "red" : q.status === "SUBMITTED" ? "blue" : q.status === "CHANGES_REQUESTED" ? "amber" : "slate"}>{QUOTE_STATUS_LABEL[q.status]}</Badge>
                {q.responseNote && <p className="mt-1 max-w-64 text-xs text-ink-3">{q.responseNote}</p>}
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
    BOQ_REVISION_REQUESTED: "Requested a BOQ revision", PRESALES_QUESTION: "Asked sales a question", PRESALES_ANSWERED: "Answered presales",
    PRICING_RETURNED: "Sent the BOQ back", REQUEST_REASSIGNED: "Reassigned a request", REQUEST_CANCELLED: "Cancelled a request",
    QUOTE_RESPONSE: "Recorded the customer response",
  };
  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="flex flex-col gap-6 lg:col-span-2">
        <Card>
          <CardHeader title="Stage journey" description="Days spent in each stage" />
          <CardContent>
            <ol className="flex flex-col gap-2">
              {d.opp.stageHistory.map((s, i) => {
                const next = d.opp.stageHistory[i + 1];
                const days = Math.round(((next?.changedAt ?? new Date()).getTime() - s.changedAt.getTime()) / 86_400_000);
                return (
                  <li key={s.id} className="flex items-center gap-3">
                    <StageBadge stage={s.toStage} />
                    <span className="min-w-0 flex-1 text-xs text-ink-3">
                      {fmtDate(s.changedAt)} · {s.changedBy.name}
                      {s.note && <span className="block truncate text-ink-2" title={s.note}>{s.note}</span>}
                    </span>
                    {!["WON", "LOST", "DROPPED"].includes(s.toStage) && <span className="text-xs tabular text-ink-2">{days}d{!next && " so far"}</span>}
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="BOQ and pricing requests" description="Every request, revision, question and send-back" />
          <CardContent className="px-0 pb-0"><RequestHistory d={d} /></CardContent>
        </Card>
      </div>
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

