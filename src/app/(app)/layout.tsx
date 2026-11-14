import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getActor } from "@/server/auth/actor";
import { allLookups } from "@/server/services/lookups";
import { myApprovals } from "@/server/services/approvals";
import { can } from "@/domain/permissions";
import { AppDataProvider } from "@/components/crm/providers";
import { AppShell } from "@/components/crm/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  const [lookups, jar, approvals] = await Promise.all([allLookups(), cookies(), can(actor.role, "approvals.decide") ? myApprovals(actor, "PENDING") : Promise.resolve({ rows: [] })]);
  const sidebarOpen = jar.get("sidebar_state")?.value !== "false";
  return (
    <AppDataProvider lookups={lookups} actor={actor}>
      <AppShell sidebarOpen={sidebarOpen} pendingApprovals={approvals.rows.length}>{children}</AppShell>
    </AppDataProvider>
  );
}
