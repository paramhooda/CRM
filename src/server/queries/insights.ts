import "server-only";
// Insight engine: turns pipeline data into short, ranked, plain-language findings.
import { THRESHOLDS, STAGE_META, type StageKey } from "@/lib/constants";
import { inr } from "@/lib/format";

type Opp = {
  id: string; amount: number; stage: string; forecastCategory: string; expectedCloseDate: Date; closedAt: Date | null;
  createdAt: Date; presalesOwnerId: string | null; closeDateSlipCount: number; accountType: string;
  account: { id: string; name: string }; stageEnteredAt: Date;
};

export type Insight = { id: string; text: string; detail?: string; tone: "blue" | "green" | "amber" | "red" | "violet" | "aqua"; icon: string; href?: string; score: number };

const share = (part: number, whole: number) => (whole > 0 ? part / whole : 0);
const pctTxt = (x: number) => `${Math.round(x * 100)}%`;

export function buildInsights(ctx: {
  now: Date;
  open: Opp[];
  won12: Opp[];
  lost12: Opp[];
  won: Opp[];
  opps: Opp[];
  pipelineByBu: { key: string; amount: number }[];
  bookingsByBu: { key: string; amount: number }[];
  renewals: { arr: number }[];
}): Insight[] {
  const out: Insight[] = [];
  const pipeTotal = ctx.pipelineByBu.reduce((a, x) => a + x.amount, 0);
  const bookTotal = ctx.bookingsByBu.reduce((a, x) => a + x.amount, 0);

  // 1. BU mix mismatch: lots of pipeline, little conversion (or the reverse)
  if (pipeTotal > 0 && bookTotal > 0) {
    let best: { bu: string; p: number; b: number; gap: number } | null = null;
    for (const bu of ctx.pipelineByBu) {
      const p = share(bu.amount, pipeTotal);
      const b = share(ctx.bookingsByBu.find((x) => x.key === bu.key)?.amount ?? 0, bookTotal);
      const gap = Math.abs(p - b);
      if (!best || gap > best.gap) best = { bu: bu.key, p, b, gap };
    }
    if (best && best.gap >= 0.12) {
      out.push({
        id: "bu-mix",
        icon: "split",
        tone: best.p > best.b ? "amber" : "green",
        text: `${best.bu} is ${pctTxt(best.p)} of open pipeline but ${pctTxt(best.b)} of bookings`,
        detail: best.p > best.b ? "Pipeline here is not converting at the same rate. Check deal quality and stage gates." : "This BU converts well above its share of pipeline. Feed it more pipeline.",
        href: "/dashboard/insights",
        score: best.gap * 100,
      });
    }
  }

  // 2. Presales effect on win rate
  const closed = [...ctx.won12, ...ctx.lost12];
  const withP = closed.filter((o) => o.presalesOwnerId);
  const withoutP = closed.filter((o) => !o.presalesOwnerId);
  if (withP.length >= 3 && withoutP.length >= 2) {
    const rw = share(withP.filter((o) => o.stage === "WON").length, withP.length);
    const ro = share(withoutP.filter((o) => o.stage === "WON").length, withoutP.length);
    if (Math.abs(rw - ro) >= 0.1) {
      out.push({
        id: "presales-effect",
        icon: "users",
        tone: rw > ro ? "violet" : "amber",
        text: `Deals with presales engaged win ${pctTxt(rw)} of the time, vs ${pctTxt(ro)} without`,
        detail: rw > ro ? "Pull presales in earlier on qualified deals." : "Presales involvement is not lifting win rates. Review solution fit.",
        href: "/reports",
        score: Math.abs(rw - ro) * 90,
      });
    }
  }

  // 3. Commit with a past close date
  const staleCommit = ctx.open.filter((o) => o.forecastCategory === "COMMIT" && o.expectedCloseDate < ctx.now);
  if (staleCommit.length) {
    const v = staleCommit.reduce((a, o) => a + o.amount, 0);
    out.push({
      id: "stale-commit",
      icon: "alert",
      tone: "red",
      text: `${inr(v)} of commit has a close date that has already passed`,
      detail: `${staleCommit.length} deal${staleCommit.length > 1 ? "s" : ""}. Your forecast is overstated until these are re-dated or closed.`,
      href: "/opportunities?fc=COMMIT&flag=CLOSE_DATE_OVERDUE",
      score: 60 + Math.min(30, v / 1e6),
    });
  }

  // 4. Slip behaviour on won vs lost
  if (ctx.won12.length >= 3 && ctx.lost12.length >= 2) {
    const avg = (xs: Opp[]) => xs.reduce((a, o) => a + o.closeDateSlipCount, 0) / xs.length;
    const sw = avg(ctx.won12);
    const sl = avg(ctx.lost12);
    if (sl - sw >= 0.4) {
      out.push({
        id: "slips",
        icon: "calendar",
        tone: "amber",
        text: `Lost deals slipped ${sl.toFixed(1)}× on average, won deals ${sw.toFixed(1)}×`,
        detail: "A second slip is an early warning. Watch deals flagged 'Close date slipped'.",
        href: "/opportunities?flag=CLOSE_DATE_SLIPPED",
        score: (sl - sw) * 25,
      });
    }
  }

  // 5. New logo vs existing
  const rate = (t: string) => {
    const w = ctx.won12.filter((o) => o.accountType === t).length;
    const l = ctx.lost12.filter((o) => o.accountType === t).length;
    return w + l >= 2 ? w / (w + l) : null;
  };
  const rn = rate("NEW_LOGO");
  const re = rate("EXISTING");
  if (rn !== null && re !== null && Math.abs(re - rn) >= 0.15) {
    out.push({
      id: "logo",
      icon: "building",
      tone: "blue",
      text: `Existing customers convert at ${pctTxt(re)}, new logos at ${pctTxt(rn)}`,
      detail: re > rn ? "Cross-sell into the installed base is your most efficient growth." : "New-logo hunting is outperforming account mining.",
      href: "/reports",
      score: Math.abs(re - rn) * 70,
    });
  }

  // 6. Customer concentration
  if (pipeTotal > 0) {
    const byAcc = new Map<string, { name: string; v: number }>();
    for (const o of ctx.open) byAcc.set(o.account.id, { name: o.account.name, v: (byAcc.get(o.account.id)?.v ?? 0) + o.amount });
    const top = [...byAcc.values()].sort((a, b) => b.v - a.v)[0];
    const sh = top ? share(top.v, ctx.open.reduce((a, o) => a + o.amount, 0)) : 0;
    if (top && sh >= 0.18) {
      out.push({
        id: "concentration",
        icon: "target",
        tone: "violet",
        text: `${top.name} holds ${pctTxt(sh)} of open pipeline`,
        detail: "High concentration. A single slip here moves the quarter.",
        score: sh * 120,
      });
    }
  }

  // 7. Slowest stage vs its threshold
  let slow: { stage: StageKey; days: number; over: number } | null = null;
  for (const o of ctx.open) {
    const st = o.stage as StageKey;
    const t = STAGE_META[st]?.staleAfterDays;
    if (!t) continue;
    const days = (ctx.now.getTime() - o.stageEnteredAt.getTime()) / 86_400_000;
    if (!slow || days / t > slow.over) slow = { stage: st, days, over: days / t };
  }
  const stuck = ctx.open.filter((o) => {
    const t = STAGE_META[o.stage as StageKey]?.staleAfterDays;
    return t && (ctx.now.getTime() - o.stageEnteredAt.getTime()) / 86_400_000 > t;
  });
  if (stuck.length >= 2) {
    const v = stuck.reduce((a, o) => a + o.amount, 0);
    out.push({
      id: "stuck",
      icon: "hourglass",
      tone: "amber",
      text: `${stuck.length} deals worth ${inr(v)} have overstayed their stage`,
      detail: slow ? `Longest: ${Math.round(slow.days)} days in ${STAGE_META[slow.stage].label}.` : undefined,
      href: "/opportunities?flag=STALE_STAGE",
      score: 30 + Math.min(30, stuck.length * 3),
    });
  }

  // 8. Renewals
  if (ctx.renewals.length) {
    const arr = ctx.renewals.reduce((a, r) => a + r.arr, 0);
    out.push({
      id: "renewals",
      icon: "refresh",
      tone: "aqua",
      text: `${inr(arr)} of annual recurring revenue renews in the next ${THRESHOLDS.renewalWindowDays} days`,
      detail: `${ctx.renewals.length} contract${ctx.renewals.length > 1 ? "s" : ""}. Open renewal opportunities now.`,
      href: "/dashboard/insights",
      score: 35 + Math.min(25, arr / 1e6),
    });
  }

  return out.sort((a, b) => b.score - a.score);
}
