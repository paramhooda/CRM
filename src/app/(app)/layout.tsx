import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getActor } from "@/server/auth/actor";
import { allLookups } from "@/server/services/lookups";
import { AppDataProvider } from "@/components/crm/providers";
import { AppShell } from "@/components/crm/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  const [lookups, jar] = await Promise.all([allLookups(), cookies()]);
  const sidebarOpen = jar.get("sidebar_state")?.value !== "false";
  return (
    <AppDataProvider lookups={lookups} actor={actor}>
      <AppShell sidebarOpen={sidebarOpen}>{children}</AppShell>
    </AppDataProvider>
  );
}
