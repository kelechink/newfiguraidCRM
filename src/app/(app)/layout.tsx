import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { requireCtx } from "@/server/auth/session";
import { navFor } from "@/server/nav";
import { currentUnit, listUnits } from "@/server/modules/shell/service";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await requireCtx();
  const [units, unit] = await Promise.all([listUnits(), currentUnit()]);
  return (
    <AppShell
      user={{ id: ctx.userId, name: ctx.name, roleName: ctx.roleName }}
      groups={navFor(ctx)}
      units={units.map((u) => ({ code: u.code, name: u.name }))}
      currentUnit={unit?.code ?? null}
    >
      {children}
    </AppShell>
  );
}
