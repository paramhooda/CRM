import "server-only";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";
import { accountScope, isManager } from "@/lib/authz";

/** Accounts a user can create deals against: their own book, or all for managers. */
export async function accountOptions(user: CurrentUser) {
  const rows = await db.account.findMany({
    where: isManager(user) ? { deletedAt: null } : accountScope(user),
    orderBy: { name: "asc" },
    select: {
      id: true, name: true, accountType: true,
      contacts: { where: { deletedAt: null }, orderBy: [{ isPrimary: "desc" }, { firstName: "asc" }], select: { id: true, firstName: true, lastName: true, title: true } },
    },
  });
  return rows.map((a) => ({
    id: a.id, name: a.name, accountType: a.accountType,
    contacts: a.contacts.map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}`, title: c.title })),
  }));
}
