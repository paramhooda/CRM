import "server-only";
import { cache } from "react";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "../db";
import type { Actor } from "../auth/actor";
import { Forbidden, NotFound } from "../errors";
import { can, type Permission } from "@/domain/permissions";
import { isManagerRole, visibleUserIds as pureVisibleUserIds, type UserRef } from "@/domain/scope";

/** Every user's id, role and manager: small, and read once per request. */
export const usersLite = cache(async (): Promise<UserRef[]> => db.user.findMany({ select: { id: true, role: true, managerId: true, isActive: true } }));

/** The owners whose records the actor may see, or null for everyone. */
export async function visibleOwnerIds(actor: Actor): Promise<string[] | null> {
  return pureVisibleUserIds(actor, await usersLite());
}

export function assertPermission(actor: Actor, permission: Permission) {
  if (!can(actor.role, permission)) throw new Forbidden();
}

/** A manager may act for owners in their scope; a rep only for themselves; an admin for anyone. */
export async function assertOwnerInScope(actor: Actor, ownerId: string) {
  const ids = await visibleOwnerIds(actor);
  if (ids !== null && !ids.includes(ownerId)) throw new Forbidden("That person is not in your team.");
}

export async function ownerInScope(actor: Actor, ownerId: string): Promise<boolean> {
  const ids = await visibleOwnerIds(actor);
  return ids === null || ids.includes(ownerId);
}

type ScopeOpts = { includeDeleted?: boolean };
const alive = (actor: Actor, o?: ScopeOpts) => (o?.includeDeleted && actor.role === "ADMIN" ? {} : { deletedAt: null });

export async function dealWhere(actor: Actor, o?: ScopeOpts): Promise<Prisma.DealWhereInput> {
  const base = alive(actor, o);
  switch (actor.role) {
    case "ADMIN":
      return base;
    case "SALES_HEAD":
    case "SALES":
      return { ...base, ownerId: { in: (await visibleOwnerIds(actor)) ?? [] } };
    case "PRESALES":
      return { ...base, OR: [{ presalesOwnerId: actor.id }, { presalesRequests: { some: { assignedToId: actor.id } } }] };
    case "PURCHASE":
      return { ...base, pricingRequests: { some: { assignedToId: actor.id } } };
  }
}

export async function accountWhere(actor: Actor, o?: ScopeOpts): Promise<Prisma.AccountWhereInput> {
  const base = alive(actor, o);
  if (actor.role === "ADMIN") return base;
  if (actor.role === "SALES_HEAD" || actor.role === "SALES") {
    const ids = (await visibleOwnerIds(actor)) ?? [];
    return { ...base, OR: [{ ownerId: { in: ids } }, { deals: { some: { ownerId: { in: ids }, deletedAt: null } } }] };
  }
  return { ...base, deals: { some: await dealWhere(actor) } };
}

export async function contactWhere(actor: Actor, o?: ScopeOpts): Promise<Prisma.ContactWhereInput> {
  return { ...alive(actor, o), account: await accountWhere(actor) };
}

export async function leadWhere(actor: Actor, o?: ScopeOpts): Promise<Prisma.LeadWhereInput> {
  const base = alive(actor, o);
  if (actor.role === "ADMIN") return base;
  if (actor.role === "PRESALES" || actor.role === "PURCHASE") return { ...base, id: { in: [] } };
  return { ...base, ownerId: { in: (await visibleOwnerIds(actor)) ?? [] } };
}

/** Throws the 404 used for anything outside the actor's scope, so nothing leaks about records they can't see. */
export function notVisible(what = "That record"): never {
  throw new NotFound(`${what} doesn't exist or isn't yours to see.`);
}

/** May the actor change the deal's header, lines (sales side), stage and prices? */
export async function canEditDeal(actor: Actor, deal: { ownerId: string }): Promise<boolean> {
  if (actor.role === "ADMIN") return true;
  if (actor.role === "SALES") return deal.ownerId === actor.id;
  if (actor.role === "SALES_HEAD") return ownerInScope(actor, deal.ownerId);
  return false;
}

export async function assertCanEditDeal(actor: Actor, deal: { ownerId: string }) {
  if (!(await canEditDeal(actor, deal))) throw new Forbidden("Only the deal owner or their manager can change this deal.");
}

export const isManager = (actor: Actor) => isManagerRole(actor.role);
