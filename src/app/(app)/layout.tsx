import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getActor } from "@/server/auth/actor";
import { allLookups } from "@/server/services/lookups";
import { myApprovals } from "@/server/services/approvals";
import { myActions } from "@/server/services/metrics";
import { can } from "@/domain/permissions";
import { AppDataProvider } from "@/components/crm/providers";
import { AppShell } from "@/components/crm/app-shell";
import { aiEnabled } from "@/server/ai";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  const [lookups, jar, approvals, ai, actions] = await Promise.all([allLookups(), cookies(), can(actor.role, "approvals.decide") ? myApprovals(actor, "PENDING") : Promise.resolve({ rows: [] }), aiEnabled(), myActions(actor)]);
  const sidebarOpen = jar.get("sidebar_state")?.value !== "false";
  return (
    <AppDataProvider lookups={lookups} actor={actor} aiEnabled={ai}>
      <AppShell sidebarOpen={sidebarOpen} pendingApprovals={approvals.rows.length} needsYou={actions.count}>{children}</AppShell>
    </AppDataProvider>
  );
}
