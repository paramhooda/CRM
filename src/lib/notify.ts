import type { NotificationType } from "@prisma/client";
import type { Tx } from "./db";

export async function notify(
  tx: Tx,
  userIds: (string | null | undefined)[],
  n: { type: NotificationType; title: string; body?: string; link?: string; exclude?: string },
) {
  const ids = [...new Set(userIds.filter((x): x is string => !!x && x !== n.exclude))];
  if (!ids.length) return;
  await tx.notification.createMany({
    data: ids.map((userId) => ({ userId, type: n.type, title: n.title, body: n.body, link: n.link })),
  });
}
