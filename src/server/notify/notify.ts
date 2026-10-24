import "server-only";
import { db } from "@/server/db";
import { appUrl, sendEmail } from "@/server/email/send";
import { publish } from "@/server/realtime/bus";

export interface NotifyInput {
  userIds: string[];
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  /** Also email it (missed-message style alerts, security alerts). */
  email?: boolean;
}

/** In-app notification + live push, optionally email. Never fails the caller's action. */
export async function notify(n: NotifyInput): Promise<void> {
  const ids = [...new Set(n.userIds)].filter(Boolean);
  if (!ids.length) return;
  try {
    for (const userId of ids) {
      const row = await db.notification.create({ data: { userId, type: n.type, title: n.title, body: n.body ?? null, link: n.link ?? null } });
      publish([userId], { type: "notification", id: row.id, title: n.title, body: n.body, link: n.link });
    }
    if (n.email) {
      const users = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true } });
      for (const u of users) {
        await sendEmail({ to: u.email, subject: n.title, text: n.body ?? n.title, template: n.type, cta: n.link ? { label: "Open Figuraid OS", url: appUrl(n.link) } : undefined });
      }
      await db.notification.updateMany({ where: { userId: { in: ids }, type: n.type, emailedAt: null, title: n.title }, data: { emailedAt: new Date() } });
    }
  } catch (err) {
    console.error("[notify] failed", err);
  }
}
