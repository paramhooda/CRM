import { requireUser } from "@/lib/auth";
import { shellCounts } from "@/server/queries/shell";
import { AppShell } from "@/components/shell/app-shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const counts = await shellCounts(user);
  return (
    <AppShell user={user} counts={counts}>
      {children}
    </AppShell>
  );
}
