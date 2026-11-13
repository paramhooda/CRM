import type { NotificationType } from "@prisma/client";
import type { Tx } from "./db";

/** In-app notification to each person once. People who left (inactive) and the person acting are skipped. */
export async function notify(
  tx: Tx,
  userIds: (string | null | undefined)[],
  n: { type: NotificationType; title: string; body?: string; link?: string; exclude?: string | string[] },
) {
  const skip = new Set(Array.isArray(n.exclude) ? n.exclude : n.exclude ? [n.exclude] : []);
  const wanted = [...new Set(userIds.filter((x): x is string => !!x && !skip.has(x)))];
  if (!wanted.length) return;
  const active = await tx.user.findMany({ where: { id: { in: wanted }, active: true }, select: { id: true } });
  if (!active.length) return;
  await tx.notification.createMany({
    data: active.map(({ id: userId }) => ({ userId, type: n.type, title: n.title, body: n.body, link: n.link })),
  });
}
