import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/actor";
import { listReviews } from "@/server/services/reviews";
import { can } from "@/domain/permissions";
import { PageHeader } from "@/components/crm/page-header";
import { EmptyState } from "@/components/crm/states";
import { NeutralPill } from "@/components/crm/pills";
import { fmtDate, fmtDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Past reviews" };

const SCOPE: Record<string, string> = { REP: "One person", TEAM: "Team", EVERYONE: "Everyone" };

export default async function ReviewHistoryPage() {
  const actor = await requireActor();
  if (!can(actor.role, "reviews.view")) redirect("/");
  const { rows } = await listReviews(actor);
  return (
    <>
      <PageHeader title="Past reviews" crumbs={[{ href: "/reviews", label: "Pipeline review" }]} description="Each recorded review, who it covered and the notes taken." />
      {rows.length === 0 ? (
        <EmptyState title="No reviews recorded yet" description="Mark a review on the pipeline review page to start the trail." />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {rows.map((r) => (
            <li key={r.id} className="px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{fmtDateTime(r.reviewedAt)}</span>
                <NeutralPill>{SCOPE[r.scope] ?? r.scope}</NeutralPill>
                <span className="text-xs text-muted-foreground">by {r.reviewedBy.fullName} · window from {fmtDate(r.sinceDate)} · {r.subjects.length} {r.subjects.length === 1 ? "person" : "people"}</span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{r.subjects.join(", ")}</div>
              {r.notes && <p className="mt-2 whitespace-pre-line">{r.notes}</p>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
