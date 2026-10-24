import type { Metadata } from "next";
import { Suspense } from "react";
import { Messenger } from "@/components/messaging/messenger";
import { requireCtx } from "@/server/auth/session";
import { canAssignFromChat, directory, pendingAnnouncements } from "@/server/modules/messaging/service";
import { listUnits } from "@/server/modules/shell/service";
import { listAssignableUsers } from "@/server/modules/users/service";
import { scopeOf } from "@/server/authz/context";

export const metadata: Metadata = { title: "Messages" };

export default async function MessagesPage() {
  const ctx = await requireCtx();
  const canTask = canAssignFromChat(ctx);
  const [people, assignable, units, pendingAcks] = await Promise.all([directory(ctx), canTask ? listAssignableUsers(ctx, "tasks") : [], listUnits(), pendingAnnouncements(ctx)]);
  const scope = scopeOf(ctx, "tasks", "CREATE");
  return (
    <Suspense>
      <Messenger
        me={ctx.userId}
        people={people}
        canTask={canTask}
        assignable={assignable}
        units={units.filter((u) => scope === "ALL" || ctx.unitIds.includes(u.id)).map((u) => ({ id: u.id, name: u.name }))}
        pendingAcks={pendingAcks}
      />
    </Suspense>
  );
}
