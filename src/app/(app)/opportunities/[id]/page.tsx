import Link from "next/link";
import { DEAL_TYPE_LABEL } from "@/lib/constants";
import { Pencil, Building2, User, FileText, ExternalLink, History as HistoryIcon } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getOpportunityDetail, type OppDetail } from "@/server/queries/opportunity-detail";
import { getOptions } from "@/server/queries/options";
import { PageHeader, PageBody } from "@/components/crm/page";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StageBadge } from "@/components/crm/badges";
import { SeverityIcon } from "@/components/crm/flag-chips";
import { StagePath } from "@/components/opportunities/stage-path";
import { LineItemsEditor } from "@/components/opportunities/line-items-editor";
import { ContactsEditor } from "@/components/opportunities/contacts-editor";
import { ActivityComposer, ActivityTimeline } from "@/components/crm/activity";
import { DealStatus, RequestHistory, QUOTE_STATUS_LABEL, dealActions } from "@/components/opportunities/deal-status";
import { DocumentsPanel } from "@/components/opportunities/documents-panel";
import { inr, pct, fmtDate, fmtDateTime, relativeDays } from "@/lib/format";
import {
  STAGE_META, PROCUREMENT_LABEL, DEAL_REG_LABEL, FORECAST_LABEL, type StageKey,
} from "@/lib/constants";
import { FLAG_META, sortFlags } from "@/lib/rules/flags";

export async function generateMetadata() {
  return { title: "Opportunity" };
}

/** Four tabs for sales. Activity, contacts and history are one click away from Overview (and still open by URL). */
const TABS = [
  { key: "overview", label: "Overview" },
  { key: "boq", label: "Line items" },
  { key: "quotes", label: "Quotes" },
  { key: "documents", label: "Documents" },
];
const LINKED_TABS = ["activity", "contacts", "history"];
/** Presales and purchase see their part of the deal: the BOQ, documents and their requests (presales: the customer's contacts too) */
const SUPPORT_TABS = (role: string) => [
  { key: "boq", label: "Line items" },
  { key: "documents", label: "Documents" },
  { key: "requests", label: "Requests" },
  ...(role === "PRESALES" ? [{ key: "contacts", label: "Contacts" }] : []),
];

export default async function OpportunityPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; edit?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { tab: tabParam, edit } = await searchParams;
  const [d, options] = await Promise.all([getOpportunityDetail(user, id), getOptions()]);
  const sales = d.perms.sales;
  const tabs = sales ? TABS : SUPPORT_TABS(user.role);
  const tab = tabs.some((t) => t.key === tabParam) || (sales && LINKED_TABS.includes(tabParam ?? "")) ? tabParam! : sales ? "overview" : "boq";
  const o = d.opp;
  const stage = o.stage as StageKey;
  const closed = ["WON", "LOST", "DROPPED"].includes(stage);
  const counts: Record<string, number> = {
    boq: d.lines.length,
    documents: d.documents.length,
    requests: o.presalesRequests.length + o.pricingRequests.length,
    activity: o.activities.filter((a) => a.type !== "TASK" || a.completedAt).length,
    contacts: o.contacts.length,
    quotes: o.quotes.length,
  };
  const { advance } = dealActions(d, options);

  return (
    <>
      <PageHeader
        crumbs={
          sales
            ? [{ href: "/opportunities", label: "Opportunities" }, { href: `/accounts/${o.account.id}`, label: o.account.name }]
            : [{ href: "/requests", label: user.role === "PRESALES" ? "BOQ requests" : "Pricing requests" }]
        }
        tabs={tabs.map((t) => ({
          href: `/opportunities/${o.id}${t.key === (sales ? "overview" : "boq") ? "" : `?tab=${t.key}`}`, label: t.label,
          // The linked views (activity, contacts, history) belong to Overview
          active: tab === t.key || (t.key === "overview" && LINKED_TABS.includes(tab)), count: t.key === "overview" ? undefined : counts[t.key] || undefined,
        }))}
        title={o.name}
        description={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            {/* The deal ID people quote in mails and calls */}
            <span aria-label="Deal ID" title="Deal ID" className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-ink-2 select-all">{o.code}</span>
            {sales ? (
              <Link href={`/accounts/${o.account.id}`} className="inline-flex items-center gap-1 hover:text-primary"><Building2 className="size-3.5" />{o.account.name}</Link>
            ) : (
              <span className="inline-flex items-center gap-1"><Building2 className="size-3.5" />{o.account.name}</span>
            )}
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
          <StagePath
            id={o.id} stage={stage} path={d.path} moves={sales ? d.moves : []}
            // Presales and purchase only see an advance that is theirs to take (e.g. Submit BOQ)
            advance={sales || advance?.kind === "action" ? advance : null} canSkip={sales && d.canSkip}
            lossReasons={options.lossReasons} poNumber={o.poNumber} holdReason={o.holdReason}
            closeDatePast={d.facts.closeDatePast}
            poDocs={d.documents.filter((x) => x.kind === "CUSTOMER_PO").map((x) => ({ id: x.id, fileName: x.fileName, kind: x.kind }))}
          />
        </div>
        <div className="mt-3">
          <DealStatus d={d} options={options} />
        </div>
        {!sales && <SupportFacts d={d} role={user.role} />}
        {sales && (
          // Three facts: what it's worth, when it closes, what happens next
          <div className="mt-5 grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
            <Metric
              label="Value"
              value={
                o.amount > 0 || closed ? <span className="text-lg font-semibold">{inr(o.amount)}</span>
                : <span className="text-[13px] font-normal text-ink-3" title="The value comes from the sales prices, set once purchase has priced the lines">Set at pricing</span>
              }
              sub={o.revenueModel === "ARR" && o.arrAmount ? `${inr(o.arrAmount)} a year` : undefined}
            />
            <Metric
              label={closed ? "Closed" : "Expected close"}
              value={closed ? fmtDate(o.closedAt) : <span style={{ color: o.expectedCloseDate < new Date() ? "var(--t-red)" : undefined }}>{fmtDate(o.expectedCloseDate)}</span>}
              sub={closed ? undefined : relativeDays(o.expectedCloseDate)}
            />
            {!closed && (
              <Metric
                label="Next step"
                value={o.nextStep ? <span className="block truncate text-[14px]" title={o.nextStep}>{o.nextStep}</span> : d.perms.edit ? <Link href={`/opportunities/${o.id}/edit`} className="text-[13px] font-normal text-primary hover:underline">Set next step</Link> : "—"}
                sub={o.nextStepDate ? <span style={{ color: o.nextStepDate < new Date() ? "var(--t-red)" : undefined }}>{fmtDate(o.nextStepDate)} · {relativeDays(o.nextStepDate)}</span> : undefined}
              />
            )}
          </div>
        )}
      </PageHeader>
      <PageBody>
        {tab === "overview" && sales && <Overview d={d} />}
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
            startEditing={edit === "1"}
          />
        )}
        {tab === "documents" && <DocumentsPanel oppId={o.id} documents={d.documents} kinds={d.documentKinds} canAdd={d.perms.addDocument} viewerId={user.id} isManager={d.viewer.isManager} closed={closed} />}
        {tab === "requests" && (
          <Card className="max-w-4xl">
            <CardHeader title="BOQ and pricing requests" description="What was asked, revisions, questions and send-backs" />
            <CardContent className="px-0 pb-0"><RequestHistory d={d} /></CardContent>
          </Card>
        )}
        {sales && LINKED_TABS.includes(tab) && <BackToOverview id={o.id} title={tab === "activity" ? "Activity & notes" : tab === "contacts" ? "Buying group" : "History"} />}
        {tab === "activity" && sales && (
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
        {tab === "quotes" && sales && <Quotes d={d} />}
        {tab === "history" && sales && <HistoryTab d={d} />}
      </PageBody>
    </>
  );
}

/** The facts presales and purchase need: their request and its due date, who to ask, and the deal's deadlines */
function SupportFacts({ d, role }: { d: OppDetail; role: string }) {
  const o = d.opp;
  const mine = role === "PRESALES" ? o.presalesRequests.find((r) => r.assignedTo.id === d.viewer.id) : o.pricingRequests.find((r) => r.assignedTo.id === d.viewer.id);
  const open = mine && ["REQUESTED", "IN_PROGRESS", "NEEDS_INFO"].includes(mine.status);
  return (
    <div className="mt-5 grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
      <Metric
        label="Your request"
        value={mine ? (open ? <span style={{ color: mine.dueDate < new Date() ? "var(--t-red)" : undefined }}>Due {fmtDate(mine.dueDate)}</span> : "Done") : "—"}
        sub={mine ? `Requested by ${mine.requestedBy.name} · ${relativeDays(mine.createdAt)}` : undefined}
      />
      <Metric label="Sales owner" value={o.salesOwner.name} sub={o.salesOwner.email} />
      <Metric label={role === "PRESALES" ? "Purchase" : "Presales"} value={(role === "PRESALES" ? o.purchaseOwner?.name : o.presalesOwner?.name) ?? "—"} />
      <Metric
        label={o.submissionDueDate ? "Bid due" : "Expected close"}
        value={fmtDate(o.submissionDueDate ?? o.expectedCloseDate)}
        sub={relativeDays(o.submissionDueDate ?? o.expectedCloseDate)}
      />
    </div>
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

/** Only what matters: a row appears when it has something to say. */
function Overview({ d }: { d: OppDetail }) {
  const o = d.opp;
  const flags = sortFlags(o.flags);
  const tasks = o.activities.filter((a) => a.type === "TASK" && !a.completedAt);
  const team = [
    ["Sales", o.salesOwner.name],
    ["Presales", o.presalesOwner?.name],
    ["Purchase", o.purchaseOwner?.name],
  ].filter((x): x is [string, string] => !!x[1]);
  const c = o.primaryContact;
  const rows: [string, React.ReactNode][] = [];
  if (o.nextStep || tasks.length)
    rows.push(["Next step", (
      <span key="ns">
        {o.nextStep ?? <span className="text-ink-3">None set</span>}
        {o.nextStepDate && <span className="text-ink-3"> · {fmtDate(o.nextStepDate)}</span>}
        {tasks.length > 0 && <Link href={`/opportunities/${o.id}?tab=activity`} className="ml-2 text-xs text-primary hover:underline">{tasks.length} open task{tasks.length > 1 ? "s" : ""}</Link>}
      </span>
    )]);
  rows.push(["Customer", c ? (
    <span key="c">
      {c.firstName} {c.lastName}{c.title && <span className="text-ink-3">, {c.title}</span>}
      {(c.phone || c.email) && <span className="block text-xs text-ink-3">{[c.phone, c.email].filter(Boolean).join(" · ")}</span>}
    </span>
  ) : <span className="text-ink-3">No contact yet</span>]);
  rows.push(["Deal type", DEAL_TYPE_LABEL[o.dealType as keyof typeof DEAL_TYPE_LABEL] ?? o.dealType]);
  rows.push(["Team", team.map(([role, name]) => `${name} (${role.toLowerCase()})`).join(" · ")]);
  if (flags.length) rows.push(["Needs attention", (
    <ul key="flags" className="flex flex-col gap-1">
      {flags.map((f) => <li key={f} className="flex items-center gap-1.5"><SeverityIcon severity={FLAG_META[f].severity} />{FLAG_META[f].label}</li>)}
    </ul>
  )]);
  if (o.submissionDueDate) rows.push(["Bid due", `${fmtDate(o.submissionDueDate)} · ${PROCUREMENT_LABEL[o.procurementMode]}`]);
  if (o.dealRegStatus !== "NOT_REQUIRED") rows.push(["Deal registration", [DEAL_REG_LABEL[o.dealRegStatus], o.dealRegNumber, o.dealRegExpiry && `expires ${fmtDate(o.dealRegExpiry)}`].filter(Boolean).join(" · ")]);
  if (o.competitors) rows.push(["Competition", o.competitors]);
  if (o.stage === "WON" && o.poNumber) rows.push(["Customer PO", `${o.poNumber}${o.poDate ? ` · ${fmtDate(o.poDate)}` : ""}`]);
  if (o.lossReason) rows.push([o.stage === "DROPPED" ? "Dropped" : "Lost", <span key="l">{o.lossReason}{o.lossNotes && <span className="block text-xs text-ink-3">{o.lossNotes}</span>}</span>]);
  if (o.description) rows.push(["Notes", <span key="n" className="whitespace-pre-line">{o.description}</span>]);
  return (
    <Card className="max-w-3xl">
      <dl className="divide-y divide-border">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-1 gap-1 px-5 py-3 sm:grid-cols-[150px_1fr] sm:gap-4">
            <dt className="text-xs text-ink-3 sm:pt-0.5">{label}</dt>
            <dd className="min-w-0 text-[13px]">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border px-5 py-3 text-xs">
        <Link href={`/opportunities/${o.id}?tab=activity`} className="text-primary hover:underline">Activity & notes</Link>
        <Link href={`/opportunities/${o.id}?tab=contacts`} className="text-primary hover:underline">Buying group ({o.contacts.length})</Link>
        <Link href={`/opportunities/${o.id}?tab=history`} className="text-primary hover:underline">History</Link>
      </div>
    </Card>
  );
}

/** Activity, contacts and history open from Overview; this takes the person back */
function BackToOverview({ id, title }: { id: string; title: string }) {
  return (
    <div className="mb-4 flex items-center gap-2 text-[13px]">
      <Link href={`/opportunities/${id}`} className="text-primary hover:underline">Overview</Link>
      <span className="text-ink-3">/</span>
      <span className="font-medium">{title}</span>
    </div>
  );
}

function Quotes({ d }: { d: OppDetail }) {
  const qs = d.opp.quotes;
  if (!qs.length) {
    return <Card className="p-8 text-center text-sm text-ink-3">No quotes yet. Once the line items are costed, send one from the deal status above.</Card>;
  }
  return (
    <Card className="overflow-x-auto scrollbar-thin">
      <table className="w-full min-w-[560px] text-[13px]">
        <thead>
          <tr className="border-b border-border bg-surface-2 text-left text-[11px] uppercase tracking-wide text-ink-3">
            <th className="px-4 py-2 font-medium">Quote</th><th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 text-right font-medium">Value</th>
            {d.perms.viewCost && <th className="px-4 py-2 text-right font-medium">Margin</th>}
            <th className="px-4 py-2 font-medium">Valid till</th><th />
          </tr>
        </thead>
        <tbody>
          {qs.map((q) => (
            <tr key={q.id} className="border-b border-border last:border-0">
              <td className="px-4 py-2.5">
                <span className="font-medium">v{q.version}</span> <span className="font-mono text-xs text-ink-3">{q.code}</span>
                <span className="block text-xs text-ink-3">Sent {fmtDate(q.submittedAt ?? q.createdAt)}</span>
              </td>
              <td className="px-4 py-2.5">
                <Badge tone={q.status === "ACCEPTED" ? "green" : q.status === "REJECTED" ? "red" : q.status === "SUBMITTED" ? "blue" : q.status === "CHANGES_REQUESTED" ? "amber" : "slate"}>{QUOTE_STATUS_LABEL[q.status]}</Badge>
                {q.responseNote && <p className="mt-1 max-w-64 text-xs text-ink-3">{q.responseNote}</p>}
              </td>
              <td className="px-4 py-2.5 text-right font-medium tabular">{inr(q.totalPrice)}</td>
              {d.perms.viewCost && <td className="px-4 py-2.5 text-right tabular">{q.marginPct !== null ? pct(q.marginPct, 1) : "—"}</td>}
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
  presalesRequired: "Path",
};

function fmtVal(field: string | null, v: string | null) {
  if (v === null || v === "") return "—";
  if (!field) return v;
  if (field === "stage") return STAGE_META[v as StageKey]?.label ?? v;
  if (field === "presalesRequired") return v === "true" ? "Solution · needs presales" : "Resale · no presales";
  if (field === "forecastCategory") return FORECAST_LABEL[v as keyof typeof FORECAST_LABEL] ?? v;
  if (field === "amount" || field === "arrAmount") return inr(Number(v));
  if (field.endsWith("Date") || field.endsWith("Expiry")) return fmtDate(v);
  if (field.endsWith("Id")) return "changed";
  return v.length > 60 ? v.slice(0, 60) + "…" : v;
}

function HistoryTab({ d }: { d: OppDetail }) {
  const actionLabel: Record<string, string> = {
    CREATE: "Created the opportunity", PRESALES_REQUESTED: "Pulled in presales", BOQ_SUBMITTED: "Submitted the BOQ",
    PRICING_REQUESTED: "Requested pricing", PRICING_COMPLETED: "Completed pricing", QUOTE_ISSUED: "Issued a quote", PRICES_SET: "Set the sales prices",
    BOQ_UPDATED: "Updated the BOQ", CONTACTS: "Updated the buying group", DELETE: "Deleted",
    BOQ_REVISION_REQUESTED: "Requested a BOQ revision", PRESALES_QUESTION: "Asked sales a question", PRESALES_ANSWERED: "Answered presales",
    PRICING_RETURNED: "Sent the BOQ back", REQUEST_REASSIGNED: "Reassigned a request", REQUEST_CANCELLED: "Cancelled a request",
    QUOTE_RESPONSE: "Recorded the customer response", DOCUMENT_ADDED: "Added a document", DOCUMENT_REMOVED: "Removed a document",
  };
  return (
    <div className="grid gap-6 [overflow-wrap:anywhere] lg:grid-cols-5">
      <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
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
      <Card className="min-w-0 lg:col-span-3">
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

