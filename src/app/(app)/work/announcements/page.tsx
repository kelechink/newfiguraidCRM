import type { Metadata } from "next";
import { Announcements } from "@/components/messaging/announcements";
import { scopeOf } from "@/server/authz/context";
import { requireCtx } from "@/server/auth/session";
import { listAnnouncements } from "@/server/modules/messaging/service";
import { listUnits } from "@/server/modules/shell/service";

export const metadata: Metadata = { title: "Announcements" };

export default async function AnnouncementsPage() {
  const ctx = await requireCtx();
  const scope = scopeOf(ctx, "announcements", "CREATE");
  const [items, units] = await Promise.all([listAnnouncements(ctx), listUnits()]);
  return (
    <Announcements
      items={items}
      canPublish={!!scope}
      companyWide={scope === "ALL"}
      units={units.filter((u) => scope === "ALL" || ctx.unitIds.includes(u.id)).map((u) => ({ id: u.id, name: u.name }))}
    />
  );
}
