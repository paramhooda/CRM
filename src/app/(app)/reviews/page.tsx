import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import {
  Plus, ArrowUpRight, ArrowDownRight, Trophy, XCircle, CalendarClock, Skull, Flame, TrendingUp, TrendingDown, Gauge, Moon, ArrowRight,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can, opportunityScope } from "@/lib/authz";
import { db } from "@/lib/db";
import { reviewChanges, describeStage, describeForecast, type OppChange } from "@/server/queries/reviews";
import { getOptions } from "@/server/queries/options";
import { PageHeader, PageBody, EmptyState } from "@/components/crm/page";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { HealthBadge, StageBadge, Avatar } from "@/components/crm/badges";
import { FlagChips } from "@/components/crm/flag-chips";
import { FilterBar } from "@/components/filters/filter-bar";
import { SinceSelect, MarkReviewedButton } from "@/components/reviews/review-controls";
import { inr, fmtDate, fmtDateTime, relativeDays, toNumber } from "@/lib/format";
import { HEALTH_LABEL, type HealthKey } from "@/lib/constants";
import type { SearchParams } from "@/lib/filters";

export const metadata = { title: "Pipeline review" };

export default async function ReviewsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  if (!can.reviewPipeline(user)) redirect("/dashboard");
  const sp = await searchParams;
  const [r, options] = await Promise.all([reviewChanges(user, sp), getOptions()]);
  const s = r.summary;
  const items = r.items;
  // Deals with no movement at all since the baseline: no field change and no activity
  const changedIds = new Set(items.map((i) => i.id));
  const stale = await db.opportunity.findMany({
    where: {
      AND: [opportunityScope(user), { stage: { in: ["IDENTIFIED", "QUALIFIED", "BOQ", "PROPOSAL", "NEGOTIATION"] } }, { OR: [{ lastActivityAt: null }, { lastActivityAt: { lt: r.since } }] }, { createdAt: { lt: r.since } }],
    },
    orderBy: { amount: "desc" },
    take: 12,
    select: { id: true, name: true, amount: true, stage: true, healthLabel: true, healthScore: true, flags: true, lastActivityAt: true, salesOwner: { select: { name: true } }, account: { select: { name: true } } },
  });
  const staleList = stale.filter((o) => !changedIds.has(o.id));

  const groups: { key: string; title: string; icon: React.ReactNode; tone: string; rows: OppChange[]; render: (c: OppChange) => React.ReactNode }[] = [
    { key: "won", title: "Won", icon: <Trophy className="size-4" />, tone: "green", rows: items.filter((i) => i.stageDir === "won"), render: () => "Closed-Won" },
    { key: "lost", title: "Lost or dropped", icon: <XCircle className="size-4" />, tone: "red", rows: items.filter((i) => i.stageDir === "lost"), render: (c) => `${describeStage(c.stageFrom)} → ${describeStage(c.stageTo)}` },
    { key: "dying", title: "Newly dying", icon: <Skull className="size-4" />, tone: "red", rows: items.filter((i) => i.healthFrom && i.healthLabel === "DYING"), render: (c) => `${HEALTH_LABEL[c.healthFrom as HealthKey]} → Dying` },
    { key: "pushed", title: "Close date pushed out", icon: <CalendarClock className="size-4" />, tone: "orange", rows: items.filter((i) => i.closeDir === "pushed"), render: (c) => `${fmtDate(c.closeFrom)} → ${fmtDate(c.closeTo)}` },
    { key: "back", title: "Moved back or put on hold", icon: <ArrowDownRight className="size-4" />, tone: "amber", rows: items.filter((i) => i.stageDir === "down"), render: (c) => `${describeStage(c.stageFrom)} → ${describeStage(c.stageTo)}` },
    { key: "fcdown", title: "Forecast downgraded", icon: <TrendingDown className="size-4" />, tone: "amber", rows: items.filter((i) => i.forecastFrom && rank(i.forecastTo) < rank(i.forecastFrom)), render: (c) => `${describeForecast(c.forecastFrom)} → ${describeForecast(c.forecastTo)}` },
    { key: "valdown", title: "Value reduced", icon: <TrendingDown className="size-4" />, tone: "amber", rows: items.filter((i) => i.amountFrom !== undefined && i.amountTo! < i.amountFrom), render: (c) => `${inr(c.amountFrom)} → ${inr(c.amountTo)}` },
    { key: "adv", title: "Advanced stage", icon: <ArrowUpRight className="size-4" />, tone: "green", rows: items.filter((i) => i.stageDir === "up"), render: (c) => `${describeStage(c.stageFrom)} → ${describeStage(c.stageTo)}` },
    { key: "hot", title: "Newly hot", icon: <Flame className="size-4" />, tone: "orange", rows: items.filter((i) => i.healthFrom && i.healthLabel === "HOT"), render: (c) => `${HEALTH_LABEL[c.healthFrom as HealthKey]} → Hot` },
    { key: "fcup", title: "Forecast upgraded", icon: <TrendingUp className="size-4" />, tone: "green", rows: items.filter((i) => i.forecastFrom && rank(i.forecastTo) > rank(i.forecastFrom)), render: (c) => `${describeForecast(c.forecastFrom)} → ${describeForecast(c.forecastTo)}` },
    { key: "valup", title: "Value increased", icon: <TrendingUp className="size-4" />, tone: "green", rows: items.filter((i) => i.amountFrom !== undefined && i.amountTo! > i.amountFrom), render: (c) => `${inr(c.amountFrom)} → ${inr(c.amountTo)}` },
    { key: "new", title: "New deals", icon: <Plus className="size-4" />, tone: "blue", rows: items.filter((i) => i.isNew), render: (c) => `Created at ${describeStage(c.stage)}` },
  ];

  return (
    <>
      <PageHeader
        title="Pipeline review"
        description={<>What changed since {r.sinceLabel}: <span className="font-medium text-ink">{fmtDateTime(r.since)}</span> ({relativeDays(r.since)})</>}
        actions={
          <>
            <Suspense><SinceSelect reviews={r.reviews.map((x) => ({ id: x.id, label: fmtDate(x.reviewedAt) }))} /></Suspense>
            <MarkReviewedButton count={s.total} />
          </>
        }
      >
        <div className="mt-4">
          <Suspense><FilterBar options={options} showPeriod={false} dims={["bu", "cat", "sales", "oem", "fc", "atype", "rev"]} hideSales={user.role === "SALES"} /></Suspense>
        </div>
      </PageHeader>
      <PageBody className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
          <Tile icon={<Gauge className="size-4" />} label="Deals changed" value={String(s.total)} sub={s.valueDelta ? `${s.valueDelta > 0 ? "+" : ""}${inr(s.valueDelta)} re-estimated` : "No value changes"} tone="blue" />
          <Tile icon={<Trophy className="size-4" />} label="Won" value={String(s.won.count)} sub={inr(s.won.amount)} tone="green" />
          <Tile icon={<XCircle className="size-4" />} label="Lost / dropped" value={String(s.lost.count)} sub={inr(s.lost.amount)} tone="red" />
          <Tile icon={<CalendarClock className="size-4" />} label="Close pushed" value={String(s.pushed.count)} sub={inr(s.pushed.amount)} tone="orange" />
          <Tile icon={<Skull className="size-4" />} label="Newly dying" value={String(s.newlyDying.count)} sub={r.hasSnapshot ? inr(s.newlyDying.amount) : "Needs a review snapshot"} tone="red" />
          <Tile icon={<Moon className="size-4" />} label="No movement" value={String(staleList.length)} sub="No change, no activity" tone="slate" />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {groups.filter((g) => g.rows.length).map((g) => (
            <Card key={g.key}>
              <CardHeader
                title={<span className="flex items-center gap-2"><span className="rounded p-0.5" style={{ background: `var(--t-${g.tone}-bg)`, color: `var(--t-${g.tone})` }}>{g.icon}</span>{g.title}</span>}
                action={<span className="text-xs tabular text-ink-3">{g.rows.length} · {inr(g.rows.reduce((a, x) => a + x.amount, 0))}</span>}
              />
              <CardContent className="px-0 pb-0">
                {g.rows.map((c) => (
                  <Link key={c.id} href={`/opportunities/${c.id}?tab=history`} className="flex items-center gap-3 border-t border-border px-4 py-2 hover:bg-surface-hover">
                    <Avatar name={c.owner} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">{c.name}</p>
                      <p className="truncate text-xs text-ink-3">{c.account} · {c.owner}</p>
                    </div>
                    <span className="hidden text-xs text-ink-2 sm:block">{g.render(c)}</span>
                    <span className="w-20 text-right text-[13px] font-medium tabular">{inr(c.amount)}</span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
        {items.length === 0 && <Card><EmptyState icon={Gauge} title="No changes in this window" description="Try a longer comparison window." /></Card>}

        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><Moon className="size-4 text-ink-3" />No movement since {fmtDate(r.since)}</span>} description="Open deals with no field change and no logged activity in this window. Ask the owner what is happening." />
          <CardContent className="px-0 pb-0">
            {staleList.length === 0 && <EmptyState title="Every open deal has moved. Great discipline." />}
            {staleList.map((o) => (
              <Link key={o.id} href={`/opportunities/${o.id}`} className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-2 hover:bg-surface-hover">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{o.name}</p>
                  <p className="text-xs text-ink-3">{o.account.name} · {o.salesOwner.name} · last touch {relativeDays(o.lastActivityAt)}</p>
                </div>
                <FlagChips flags={o.flags} max={2} />
                <StageBadge stage={o.stage} />
                <HealthBadge label={o.healthLabel} score={o.healthScore} compact />
                <span className="w-20 text-right text-[13px] font-medium tabular">{inr(toNumber(o.amount))}</span>
              </Link>
            ))}
          </CardContent>
        </Card>

        {r.reviews.length > 0 && (
          <Card>
            <CardHeader title="Review log" description="Your recent pipeline reviews" />
            <CardContent className="flex flex-col gap-2">
              {r.reviews.slice(0, 6).map((x) => (
                <div key={x.id} className="flex items-start gap-3 text-[13px]">
                  <span className="w-28 shrink-0 text-xs text-ink-3">{fmtDate(x.reviewedAt)}</span>
                  <span className="flex-1 text-ink-2">{x.notes ?? "—"}</span>
                  <Link href={`/reviews?since=${x.id}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">Changes since <ArrowRight className="size-3" /></Link>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </PageBody>
    </>
  );
}

const RANK: Record<string, number> = { OMITTED: 0, PIPELINE: 1, UPSIDE: 2, COMMIT: 3 };
function rank(x?: string) {
  return RANK[x ?? ""] ?? 0;
}

function Tile({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: string; sub: string; tone: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3">
      <p className="flex items-center gap-1.5 text-xs text-ink-3"><span style={{ color: `var(--t-${tone})` }}>{icon}</span>{label}</p>
      <p className="mt-1 text-[22px] font-semibold tabular">{value}</p>
      <p className="text-xs text-ink-3 tabular">{sub}</p>
    </div>
  );
}
