"use server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { accountScope, opportunityScope } from "@/lib/authz";
import { inr } from "@/lib/format";
import { STAGE_META, type StageKey } from "@/lib/constants";

export type SearchHit = { id: string; type: "opportunity" | "account" | "contact"; title: string; sub: string; href: string };

export async function globalSearch(q: string): Promise<SearchHit[]> {
  const user = await requireUser();
  const term = q.trim().slice(0, 80);
  if (term.length < 2) return [];
  const ci = { contains: term, mode: "insensitive" as const };
  const [opps, accounts, contacts] = await Promise.all([
    db.opportunity.findMany({
      where: { AND: [opportunityScope(user), { OR: [{ name: ci }, { code: ci }, { account: { name: ci } }] }] },
      select: { id: true, name: true, code: true, amount: true, stage: true, account: { select: { name: true } } },
      take: 6,
      orderBy: { updatedAt: "desc" },
    }),
    db.account.findMany({
      where: { AND: [accountScope(user), { OR: [{ name: ci }, { code: ci }, { city: ci }] }] },
      select: { id: true, name: true, code: true, city: true },
      take: 4,
    }),
    db.contact.findMany({
      where: {
        deletedAt: null,
        account: accountScope(user),
        OR: [{ firstName: ci }, { lastName: ci }, { email: ci }],
      },
      select: { id: true, firstName: true, lastName: true, title: true, accountId: true, account: { select: { name: true } } },
      take: 4,
    }),
  ]);
  return [
    ...opps.map((o) => ({
      id: o.id, type: "opportunity" as const, title: o.name,
      sub: `${o.code} · ${o.account.name} · ${inr(o.amount)} · ${STAGE_META[o.stage as StageKey].label}`,
      href: `/opportunities/${o.id}`,
    })),
    ...accounts.map((a) => ({ id: a.id, type: "account" as const, title: a.name, sub: `${a.code} · ${a.city ?? ""}`, href: `/accounts/${a.id}` })),
    ...contacts.map((c) => ({
      id: c.id, type: "contact" as const, title: `${c.firstName} ${c.lastName}`, sub: `${c.title ?? ""} · ${c.account.name}`,
      href: `/accounts/${c.accountId}?tab=contacts`,
    })),
  ];
}
