import { FileSignature } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DeductionsCard } from "@/components/hr/deductions";
import { PayslipButton } from "@/components/hr/payroll";
import { BankButton } from "@/components/hr/staff-forms";
import { localDate } from "@/domain/sop/schedule";
import { formatDay, money } from "@/lib/format";
import { requireCtx } from "@/server/auth/session";
import { myDocuments } from "@/server/modules/hr/contracts-service";
import { listDeductions } from "@/server/modules/hr/deductions-service";
import { myPayslips } from "@/server/modules/hr/payroll-service";
import { getStaff } from "@/server/modules/hr/staff-service";
import { Card, CardHeader } from "@/ui/card";
import { PageHeader } from "@/ui/page-header";
import { Table, TableEmpty, Td, Th, THead, Tr } from "@/ui/table";

export const metadata: Metadata = { title: "My pay & attendance" };

export default async function MePage() {
  const ctx = await requireCtx();
  const month = localDate(new Date()).slice(0, 7);
  const [me, deductions, slips, docs] = await Promise.all([getStaff(ctx, ctx.userId), listDeductions(ctx, { month }), myPayslips(ctx), myDocuments(ctx)]);
  const toSign = docs.filter((d) => d.mustSign).length;
  const p = me.profile;
  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-5">
      <PageHeader title="My pay & attendance" description="Your deductions update as attendance is recorded. Approved excuses, leave and public holidays are never deducted." />
      {toSign > 0 && (
        <Link href="/me/documents" className="flex items-center gap-3 rounded-xl border border-accent/30 bg-accent-soft px-4 py-3 text-[13px] text-accent-ink hover:border-accent/50">
          <FileSignature className="size-4" /> {toSign} document{toSign > 1 ? "s" : ""} waiting for your signature
        </Link>
      )}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <DeductionsCard month={month} rows={deductions.rows} total={deductions.total} final={deductions.final} title="This month's deductions" />
        <div className="grid content-start gap-4">
          <Card>
            <CardHeader title="My details" actions={<Link href="/work/attendance" className="text-[12.5px] text-accent hover:underline">Attendance</Link>} />
            <dl className="grid gap-1.5 text-[13px]">
              <div className="flex justify-between gap-3"><dt className="text-ink-3">Role</dt><dd>{p?.jobTitle ?? me.role.name}</dd></div>
              {p && <div className="flex justify-between gap-3"><dt className="text-ink-3">Hours</dt><dd>{p.resumeTime}–{p.closeTime} · {p.graceMinutes} min grace</dd></div>}
              {p && <div className="flex justify-between gap-3"><dt className="text-ink-3">Started</dt><dd>{formatDay(p.startDate)}</dd></div>}
              {me.pay?.salary != null && <div className="flex justify-between gap-3"><dt className="text-ink-3">Monthly gross</dt><dd className="tabular">{money(me.pay.salary + me.pay.allowances.reduce((n, a) => n + a.amount, 0))}</dd></div>}
            </dl>
          </Card>
          {p && (
            <Card>
              <CardHeader title="Salary account" />
              <p className="mb-3 text-[13px]">{me.bank?.accountMasked ? <>{me.bank.bankName} <span className="font-mono">{me.bank.accountMasked}</span></> : <span className="text-ink-3">Not on file — add it so payroll can pay you.</span>}</p>
              <BankButton userId={ctx.userId} label={me.bank?.accountMasked ? "Change account" : "Add account"} />
            </Card>
          )}
        </div>
      </div>
      <Card padded={false}>
        <CardHeader title="Payslips" className="px-4 pt-3" />
        <Table>
          <THead><tr><Th>Month</Th><Th align="right">Gross</Th><Th align="right">Deductions</Th><Th align="right">Net</Th><Th /></tr></THead>
          <tbody>
            {slips.length === 0 && <TableEmpty colSpan={5}>Payslips appear here once payroll is paid.</TableEmpty>}
            {slips.map((s) => (
              <Tr key={s.id}>
                <Td className="font-medium">{new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${s.month}-15T00:00:00Z`))}</Td>
                <Td align="right">{money(s.gross)}</Td>
                <Td align="right" muted>{money(s.deductions)}</Td>
                <Td align="right" className="font-semibold">{money(s.net)}</Td>
                <Td align="right"><PayslipButton id={s.id} /></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
