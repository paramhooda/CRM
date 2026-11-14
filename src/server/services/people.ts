import "server-only";
import { db } from "../db";
import type { Actor } from "../auth/actor";
import { visibleOwnerIds } from "../authz/scope";

/** Sales people the actor may filter or assign by (own team), for pickers. */
export async function salesPeopleFor(actor: Actor) {
  const ids = await visibleOwnerIds(actor);
  return db.user.findMany({ where: { isActive: true, role: { in: ["SALES", "SALES_HEAD", "ADMIN"] }, ...(ids ? { id: { in: ids } } : {}) }, select: { id: true, fullName: true, role: true }, orderBy: { fullName: "asc" } });
}

export async function peopleWithRole(role: "PRESALES" | "PURCHASE" | "SALES_HEAD" | "ADMIN") {
  return db.user.findMany({ where: { isActive: true, role }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } });
}
