import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/actor";

/** Admin screens are for administrators; the targets grid also admits sales heads (checked on its page). */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  if (actor.role !== "ADMIN" && actor.role !== "SALES_HEAD") redirect("/");
  return children;
}
