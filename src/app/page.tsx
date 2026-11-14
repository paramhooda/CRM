import { redirect } from "next/navigation";
import { getActor } from "@/server/auth/actor";

export default async function IndexPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");
  redirect(actor.role === "PRESALES" || actor.role === "PURCHASE" ? "/my-work" : "/home");
}
