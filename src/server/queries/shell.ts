import "server-only";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";

export async function shellCounts(user: CurrentUser) {
  const [unread, presalesOpen, pricingOpen] = await Promise.all([
    db.notification.count({ where: { userId: user.id, readAt: null } }),
    user.role === "PRESALES" || user.role === "ADMIN"
      ? db.presalesRequest.count({
          where: { status: { in: ["REQUESTED", "IN_PROGRESS"] }, ...(user.role === "PRESALES" ? { assignedToId: user.id } : {}) },
        })
      : Promise.resolve(0),
    user.role === "PURCHASE" || user.role === "ADMIN"
      ? db.pricingRequest.count({
          where: { status: { in: ["REQUESTED", "IN_PROGRESS"] }, ...(user.role === "PURCHASE" ? { assignedToId: user.id } : {}) },
        })
      : Promise.resolve(0),
  ]);
  return { unread, requests: presalesOpen + pricingOpen };
}
