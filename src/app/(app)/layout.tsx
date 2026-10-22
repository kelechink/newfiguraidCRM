import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import type { NavGroup } from "@/components/shell/sidebar";
import { can } from "@/server/authz/context";
import { requireCtx } from "@/server/auth/session";
import { db } from "@/server/db";
import { currentUnit, listUnits } from "@/server/modules/shell/service";
import { ToastProvider } from "@/ui/toast";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await requireCtx();
  const [units, unit, role] = await Promise.all([
    listUnits(),
    currentUnit(),
    db.role.findFirst({ where: { key: ctx.roleKey }, select: { name: true } }),
  ]);

  // Items appear only with permission; unbuilt modules show greyed out until their step lands.
  const groups: NavGroup[] = [
    {
      label: "Work",
      items: [
        { href: "/today", label: "Today", icon: "today", enabled: false },
        ...(can(ctx, "tasks", "VIEW") ? [{ href: "/work/tasks", label: "Tasks", icon: "tasks" as const, enabled: true }] : []),
        ...(can(ctx, "sops", "VIEW") ? [{ href: "/work/sops", label: "SOP templates", icon: "sops" as const, enabled: true }] : []),
        { href: "/work/messages", label: "Messages", icon: "messages", enabled: false },
        { href: "/work/attendance", label: "Attendance", icon: "attendance", enabled: false },
      ],
    },
    {
      label: "Customers",
      items: [
        { href: "/customers/inbox", label: "Inbox", icon: "inbox", enabled: false },
        { href: "/customers/contacts", label: "Contacts & pipelines", icon: "contacts", enabled: false },
      ],
    },
    {
      label: "Money",
      items: [
        { href: "/money/finance", label: "Finance", icon: "finance", enabled: false },
        { href: "/money/telecom", label: "Telecom", icon: "telecom", enabled: false },
        { href: "/money/invoices", label: "Invoices", icon: "invoices", enabled: false },
      ],
    },
    {
      label: "Team",
      items: [
        { href: "/team/staff", label: "Staff", icon: "staff", enabled: false },
        { href: "/team/payroll", label: "Payroll", icon: "payroll", enabled: false },
        { href: "/team/documents", label: "Documents", icon: "documents", enabled: false },
      ],
    },
  ];

  return (
    <ToastProvider>
      <AppShell
        user={{ id: ctx.userId, name: ctx.name, roleName: role?.name ?? "" }}
        groups={groups}
        units={units.map((u) => ({ code: u.code, name: u.name }))}
        currentUnit={unit?.code ?? null}
      >
        {children}
      </AppShell>
    </ToastProvider>
  );
}
