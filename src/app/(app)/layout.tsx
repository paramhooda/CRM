import { requireUser } from "@/lib/auth";
import { shellCounts } from "@/server/queries/shell";
import { cookies } from "next/headers";
import { AppShell } from "@/components/shell/app-shell";
import { SIDEBAR_COOKIE } from "@/lib/ui-prefs";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [counts, jar] = await Promise.all([shellCounts(user), cookies()]);
  const saved = jar.get(SIDEBAR_COOKIE)?.value;
  return (
    <AppShell user={user} counts={counts} sidebar={saved === "rail" || saved === "full" ? saved : null}>
      {children}
    </AppShell>
  );
}
