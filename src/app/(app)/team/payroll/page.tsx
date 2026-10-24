import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NewRunButton } from "@/components/hr/payroll";
import { localDate } from "@/domain/sop/schedule";
import { money } from "@/lib/format";
import { can } from "@/server/authz/context";
import { requireCtx, requireRecentAuthPage } from "@/server/auth/session";
import { listRuns } from "@/server/modules/hr/payroll-service";
import { Badge } from "@/ui/badge";
import { Card } from "@/ui/card";
import { PageHeader } from "@/ui/page-header";
import { StatusBadge } from "@/ui/status";
import { Table, TableEmpty, Td, Th, THead, Tr } from "@/ui/table";

export const metadata: Metadata = { title: "Payroll" };

export default async function PayrollPage() {
  const ctx = await requireCtx();
  if (!can(ctx, "payroll", "VIEW")) notFound();
  await requireRecentAuthPage(ctx); // payroll figures are behind a fresh password
  const runs = await listRuns(ctx);
  const label = (m: string) => new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-15T00:00:00Z`));
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Payroll" description="Draft, review, approve, sign off and pay. Attendance deductions are applied automatically." actions={can(ctx, "payroll", "CREATE") ? <NewRunButton defaultMonth={localDate(new Date()).slice(0, 7)} /> : undefined} />
      <Card padded={false}>
        <Table>
          <THead><tr><Th>Month</Th><Th align="right">Staff</Th><Th align="right">Gross</Th><Th align="right">Net</Th><Th>Prepared / approved</Th><Th>Status</Th></tr></THead>
          <tbody>
            {runs.length === 0 && <TableEmpty colSpan={6}>No payroll runs yet.</TableEmpty>}
            {runs.map((r) => (
              <Tr key={r.id} href={`/team/payroll/${r.id}`}>
                <Td><Link href={`/team/payroll/${r.id}`} className="font-medium hover:text-accent">{label(r.periodMonth)}</Link></Td>
                <Td align="right" muted>{r.staffCount}</Td>
                <Td align="right">{money(r.gross)}</Td>
                <Td align="right" className="font-medium">{money(r.net)}</Td>
                <Td muted className="text-[12.5px]">{r.preparedBy}{r.approvedBy && ` → ${r.approvedBy}`}{r.signedOffBy && ` → ${r.signedOffBy}`}</Td>
                <Td><span className="flex items-center gap-1.5"><StatusBadge status={r.status} />{r.needsSignoff && r.status === "APPROVED" && <Badge tone="warning">Needs sign-off</Badge>}</span></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
