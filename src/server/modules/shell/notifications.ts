import "server-only";
import type { Ctx } from "@/server/authz/context";
import { db } from "@/server/db";

export async function listNotifications(ctx: Ctx) {
  const [items, unread] = await Promise.all([
    db.notification.findMany({ where: { userId: ctx.userId }, orderBy: { createdAt: "desc" }, take: 25 }),
    db.notification.count({ where: { userId: ctx.userId, readAt: null } }),
  ]);
  return {
    unread,
    items: items.map((n) => ({ id: n.id, title: n.title, body: n.body, link: n.link, type: n.type, readAt: n.readAt?.toISOString() ?? null, createdAt: n.createdAt.toISOString() })),
  };
}

export async function markNotificationsRead(ctx: Ctx, ids?: string[]) {
  await db.notification.updateMany({ where: { userId: ctx.userId, readAt: null, ...(ids?.length ? { id: { in: ids } } : {}) }, data: { readAt: new Date() } });
}
