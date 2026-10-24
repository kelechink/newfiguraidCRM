import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDay } from "@/lib/format";
import { can } from "@/server/authz/context";
import { requireCtx } from "@/server/auth/session";
import { listExits } from "@/server/modules/hr/exit-service";
import { listStaff } from "@/server/modules/hr/staff-service";
import { Avatar } from "@/ui/avatar";
import { Badge } from "@/ui/badge";
import { Card, CardHeader } from "@/ui/card";
import { cn } from "@/ui/cn";
import { PageHeader } from "@/ui/page-header";
import { humanize, StatusBadge } from "@/ui/status";
import { Table, TableEmpty, Td, Th, THead, Tr } from "@/ui/table";
import { LinkTabs } from "@/ui/tabs";
import { UNIT_STYLE } from "@/ui/units";

export const metadata: Metadata = { title: "Staff" };

const VIEWS = { active: "Active", onboarding: "Onboarding", exited: "Exited" } as const;

export default async function StaffPage({ searchParams }: { searchParams: Promise<{ view?: string; q?: string }> }) {
  const ctx = await requireCtx();
  if (!can(ctx, "hr.staff", "VIEW")) notFound();
  const sp = await searchParams;
  const view = (sp.view && sp.view in VIEWS ? sp.view : "active") as keyof typeof VIEWS;
  const status = view === "onboarding" ? undefined : view === "exited" ? "EXITED" : "ACTIVE";
  let rows = await listStaff(ctx, { q: sp.q, status });
  if (view === "onboarding") rows = rows.filter((r) => r.status === "ONBOARDING" || r.status === "INVITED");
  const exits = view === "active" ? (await listExits(ctx)).filter((e) => e.status !== "closed") : [];
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Staff" description="Records, onboarding packs, schedules and exits." />
      <div className="flex flex-wrap items-center gap-3">
        <LinkTabs tabs={Object.entries(VIEWS).map(([k, label]) => ({ key: k, label, href: `/team/staff?view=${k}` }))} active={view} />
        <form action="/team/staff" className="ml-auto"><input type="hidden" name="view" value={view} /><input name="q" defaultValue={sp.q} placeholder="Name, email or role" className="h-8 w-56 rounded-md border border-line bg-surface px-2.5 text-[13px] placeholder:text-ink-3 focus:border-accent focus:outline-none" /></form>
      </div>
      {exits.length > 0 && (
        <Card padded={false}>
          <CardHeader title="Exits in progress" className="px-4 pt-3" />
          <ul className="divide-y divide-line">
            {exits.map((e) => (
              <li key={e.id}><Link href={`/team/staff/${e.user.id}?tab=exit`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px] hover:bg-surface-2/60"><span className="font-medium">{e.user.name} <span className="font-normal text-ink-3">· {humanize(e.type)} · last day {formatDay(e.lastWorkingDay)}</span></span><span className="text-ink-3">{e.done}/{e.total} done{!e.accessRevokedAt && " · access live"}</span></Link></li>
            ))}
          </ul>
        </Card>
      )}
      <Card padded={false}>
        <Table>
          <THead><tr><Th>Name</Th><Th>Role</Th><Th>Unit</Th><Th>Started</Th><Th>Contracts</Th><Th>Status</Th></tr></THead>
          <tbody>
            {rows.length === 0 && <TableEmpty colSpan={6}>Nobody here.</TableEmpty>}
            {rows.map((s) => (
              <Tr key={s.id} href={`/team/staff/${s.id}`}>
                <Td>
                  <Link href={`/team/staff/${s.id}`} className="flex items-center gap-2.5">
                    <Avatar id={s.id} name={s.name} size={26} />
                    <span><span className="block font-medium hover:text-accent">{s.name}</span><span className="block text-2xs text-ink-3">{s.jobTitle ?? s.email}{s.employeeNo && ` · ${s.employeeNo}`}</span></span>
                  </Link>
                </Td>
                <Td muted>{s.role}</Td>
                <Td>{s.unit ? <span className="inline-flex items-center gap-1.5"><span className={cn("size-1.5 rounded-full", UNIT_STYLE[s.unit]?.dot)} />{s.unitName}</span> : "—"}</Td>
                <Td muted className="whitespace-nowrap">{s.startDate ? formatDay(s.startDate) : "—"}{s.onProbation && <Badge className="ml-1.5">Probation</Badge>}</Td>
                <Td>{s.pack ? <StatusBadge status={s.pack} /> : <span className="text-2xs text-ink-3">No pack</span>}</Td>
                <Td><StatusBadge status={s.status} /></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
