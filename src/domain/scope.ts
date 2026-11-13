// Who sees whose records. A sales person sees their own, a manager their team's (everyone reporting to them,
// directly or indirectly), an admin everything. Presales and purchase see only deals assigned to them.

export type Role = "ADMIN" | "SALES_HEAD" | "SALES" | "PRESALES" | "PURCHASE";
export type UserRef = { id: string; role: Role; managerId: string | null; isActive?: boolean };
export type Actor = { id: string; role: Role };

export const isManagerRole = (r: Role) => r === "ADMIN" || r === "SALES_HEAD";
export const isSalesRole = (r: Role) => r === "ADMIN" || r === "SALES_HEAD" || r === "SALES";
export const isSupportRole = (r: Role) => r === "PRESALES" || r === "PURCHASE";

/** Everyone who reports to `managerId`, directly or through other managers. Never includes the manager. */
export function teamUserIds(users: UserRef[], managerId: string): string[] {
  const byManager = new Map<string, string[]>();
  for (const u of users) if (u.managerId) byManager.set(u.managerId, [...(byManager.get(u.managerId) ?? []), u.id]);
  const out: string[] = [];
  const seen = new Set<string>([managerId]);
  const queue = [managerId];
  while (queue.length) {
    const m = queue.shift()!;
    for (const id of byManager.get(m) ?? []) {
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
      queue.push(id);
    }
  }
  return out;
}

/**
 * The user ids whose records the actor may see, or null for everything (admin). A Sales Head with no reports sees
 * every sales person. Presales and purchase see no one's records by ownership; their access is by assignment.
 */
export function visibleUserIds(actor: Actor, users: UserRef[]): string[] | null {
  if (actor.role === "ADMIN") return null;
  if (actor.role === "SALES_HEAD") {
    const team = teamUserIds(users, actor.id);
    if (team.length) return [actor.id, ...team];
    return [actor.id, ...users.filter((u) => u.id !== actor.id && (u.role === "SALES" || u.role === "SALES_HEAD")).map((u) => u.id)];
  }
  if (actor.role === "SALES") return [actor.id];
  return [];
}

/** Fields presales and purchase never receive. */
export const STRIPPED_DEAL_FIELDS = ["dealValue", "oneTimeValue", "annualRecurringValue", "expectedGmPct", "forecastCategory", "priceFingerprint", "approvals", "approvalState", "totalCost"] as const;
export const STRIPPED_LINE_FIELDS = ["unitSalesPrice", "annualValue", "lineValue", "expectedGmPct", "salesMethodId", "salesMethod"] as const;

export function stripFields<T extends object>(obj: T, fields: readonly string[]): T {
  const copy = { ...obj } as Record<string, unknown>;
  for (const f of fields) delete copy[f];
  return copy as T;
}
