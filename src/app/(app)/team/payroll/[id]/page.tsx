import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdjustButton, PayslipButton, RunActions } from "@/components/hr/payroll";
import { money } from "@/lib/format";
import { can } from "@/server/authz/context";
import { NotFoundError } from "@/server/authz/errors";
import { requireCtx, requireRecentAuthPage } from "@/server/auth/session";
import { getRun } from "@/server/modules/hr/payroll-service";
import { Card } from "@/ui/card";
import { cn } from "@/ui/cn";
import { StatCard } from "@/ui/stat";
import { StatusBadge } from "@/ui/status";
import { Table, TableEmpty, Td, Th, THead, Tr } from "@/ui/table";
import { UNIT_STYLE } from "@/ui/units";

export const metadata: Metadata = { title: "Payroll run" };

export default async function PayrollRunPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  if (!can(ctx, "payroll", "VIEW")) notFound();
  await requireRecentAuthPage(ctx);
  const run = await getRun(ctx, (await params).id).catch((e) => (e instanceof NotFoundError ? null : Promise.reject(e)));
  if (!run) notFound();
  const label = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${run.periodMonth}-15T00:00:00Z`));
  const draft = run.status === "DRAFT";
  return (
    <div className="flex flex-col gap-5">
      <Link href="/team/payroll" className="inline-flex w-fit items-center gap-1.5 text-[12.5px] text-ink-3 hover:text-ink"><ArrowLeft className="size-3.5" /> Payroll</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[22px] font-semibold tracking-tight">{label} <StatusBadge status={run.status} /></h1>
          <p className="text-[13px] text-ink-3">Prepared by {run.preparedBy.name}{run.approvedBy && ` · approved by ${run.approvedBy}`}{run.signedOffBy && ` · signed off by ${run.signedOffBy}`}{run.needsSignoff && !run.signedOffBy && ` · net is above the ${money(run.limit, "NGN", { compact: true })} sign-off limit`}</p>
        </div>
        <RunActions run={{ id: run.id, status: run.status, needsSignoff: run.needsSignoff, preparedById: run.preparedBy.id }} can={{ edit: can(ctx, "payroll", "EDIT"), approve: can(ctx, "payroll", "APPROVE"), signoff: can(ctx, "payroll.signoff", "APPROVE") && run.preparedBy.id !== ctx.userId, export: can(ctx, "payroll", "EXPORT") && can(ctx, "exports", "CREATE") && can(ctx, "hr.bank_details", "VIEW"), isPreparer: run.preparedBy.id === ctx.userId }} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Staff" value={String(run.rows.length)} />
        <StatCard label="Gross" value={money(run.totals.gross, "NGN", { compact: true })} />
        <StatCard label="Attendance deductions" value={money(run.totals.attendance, "NGN", { compact: true })} sub="After waivers and caps" />
        <StatCard label="Net pay" value={money(run.totals.net, "NGN", { compact: true })} tone={run.needsSignoff && !run.signedOffBy ? "warning" : undefined} />
      </div>
      <Card padded={false}>
        <Table>
          <THead><tr><Th>Staff</Th><Th align="right">Gross</Th><Th align="right">Statutory</Th><Th align="right">Deductions</Th><Th align="right">Net</Th><Th /></tr></THead>
          <tbody>
            {run.rows.length === 0 && <TableEmpty colSpan={6}>Nobody has pay set for this month.</TableEmpty>}
            {run.rows.map((r) => {
              const statutory = r.breakdown.statutory.reduce((n, s) => n + s.amount, 0);
              const other = r.breakdown.deductions.reduce((n, s) => n + s.amount, 0);
              return (
                <Tr key={r.id}>
                  <Td>
                    <p className="flex items-center gap-1.5 font-medium">{r.unit && <span className={cn("size-1.5 rounded-full", UNIT_STYLE[r.unit]?.dot)} />}{r.name}</p>
                    <p className="text-2xs text-ink-3">{r.employeeNo} · {r.jobTitle}{r.breakdown.proRata < 1 && ` · ${Math.round(r.breakdown.proRata * 100)}% of month`}</p>
                  </Td>
                  <Td align="right">{money(r.breakdown.gross)}</Td>
                  <Td align="right" muted title={r.breakdown.statutory.map((s) => `${s.name}: ${s.amount}`).join("\n")}>{money(statutory)}</Td>
                  <Td align="right" className={cn(other > 0 && "text-warning")} title={[...r.breakdown.deductions.map((d) => `${d.name}: ${d.amount}`), ...r.deductionLines.map((l) => l.reason)].join("\n")}>{money(other)}</Td>
                  <Td align="right" className="font-semibold">{money(r.breakdown.net)}</Td>
                  <Td align="right" className="whitespace-nowrap">
                    {draft && can(ctx, "payroll", "EDIT") && r.userId !== ctx.userId && <AdjustButton payslipId={r.id} name={r.name} adjustments={r.adjustments} />}
                    <PayslipButton id={r.id} />
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
