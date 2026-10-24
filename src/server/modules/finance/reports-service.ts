import "server-only";
import { z } from "zod";
import { ageing, round2 } from "@/domain/finance/money";
import { addDays, localDate } from "@/domain/sop/schedule";
import { audit } from "@/server/audit/audit";
import { can, requireScope, type Ctx } from "@/server/authz/context";
import { ForbiddenError } from "@/server/authz/errors";
import { requireRecentAuth } from "@/server/auth/session";
import { db } from "@/server/db";

/** Units whose finance summary the caller may see (unit managers: their own units). */
async function reportUnits(ctx: Ctx, unitId: string | null) {
  const scope = requireScope(ctx, "finance.reports", "VIEW");
  const units = await db.businessUnit.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true } });
  const allowed = scope === "ALL" ? units : units.filter((u) => ctx.unitIds.includes(u.id));
  return unitId ? allowed.filter((u) => u.id === unitId) : allowed;
}

const monthKey = (d: Date) => localDate(d).slice(0, 7);

/** Money in vs out per unit per month (cash in; costs booked), with profit. */
export async function moneyInOut(ctx: Ctx, raw: unknown) {
  const { months, unitId } = z.object({ months: z.number().int().min(1).max(24).default(6), unitId: z.string().cuid().nullable().optional() }).parse(raw ?? {});
  const units = await reportUnits(ctx, unitId ?? null);
  const ids = units.map((u) => u.id);
  const today = localDate(new Date());
  const startMonth = (() => {
    const [y, m] = today.split("-").map(Number) as [number, number];
    const d = new Date(Date.UTC(y, m - months, 1));
    return d.toISOString().slice(0, 10);
  })();
  const from = new Date(startMonth);
  const [payments, expenses, bills] = await Promise.all([
    db.payment.findMany({ where: { unitId: { in: ids }, status: "CONFIRMED", receivedAt: { gte: from } }, select: { unitId: true, amountNgn: true, receivedAt: true } }),
    db.expense.findMany({ where: { unitId: { in: ids }, status: { in: ["APPROVED", "PAID"] }, incurredOn: { gte: from } }, select: { unitId: true, amountNgn: true, incurredOn: true } }),
    db.bill.findMany({ where: { unitId: { in: ids }, status: { not: "VOID" }, issueDate: { gte: from } }, select: { unitId: true, total: true, currency: true, fxRate: true, issueDate: true } }),
  ]);
  const keys: string[] = [];
  for (let i = 0; i < months; i++) {
    const [y, m] = startMonth.split("-").map(Number) as [number, number];
    keys.push(new Date(Date.UTC(y, m - 1 + i, 1)).toISOString().slice(0, 7));
  }
  const rows = keys.map((month) => {
    const byUnit = Object.fromEntries(
      units.map((u) => {
        const inn = payments.filter((p) => p.unitId === u.id && monthKey(p.receivedAt) === month).reduce((n, p) => n + Number(p.amountNgn), 0);
        const out =
          expenses.filter((e) => e.unitId === u.id && monthKey(e.incurredOn) === month).reduce((n, e) => n + Number(e.amountNgn), 0) +
          bills.filter((b) => b.unitId === u.id && monthKey(b.issueDate) === month).reduce((n, b) => n + Number(b.total) * (b.currency === "NGN" ? 1 : Number(b.fxRate ?? 0)), 0);
        return [u.code, { in: round2(inn), out: round2(out), profit: round2(inn - out) }];
      }),
    );
    const totalIn = Object.values(byUnit).reduce((n, v) => n + v.in, 0);
    const totalOut = Object.values(byUnit).reduce((n, v) => n + v.out, 0);
    return { month, byUnit, total: { in: round2(totalIn), out: round2(totalOut), profit: round2(totalIn - totalOut) } };
  });
  return { units, rows };
}

export async function ageingReport(ctx: Ctx, unitId: string | null) {
  const units = await reportUnits(ctx, unitId);
  const ids = units.map((u) => u.id);
  const now = new Date();
  const [inv, bills] = await Promise.all([
    db.invoice.findMany({ where: { unitId: { in: ids }, kind: "INVOICE", status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] } }, select: { dueDate: true, total: true, amountPaid: true, currency: true, fxRate: true } }),
    db.bill.findMany({ where: { unitId: { in: ids }, status: { in: ["APPROVED", "PARTIALLY_PAID", "DRAFT"] } }, select: { dueDate: true, total: true, amountPaid: true, currency: true, fxRate: true } }),
  ]);
  const ngn = (x: { total: unknown; amountPaid: unknown; currency: string; fxRate: unknown }) => (Number(x.total) - Number(x.amountPaid)) * (x.currency === "NGN" ? 1 : Number(x.fxRate ?? 0));
  return {
    receivables: ageing(inv.map((i) => ({ dueDate: i.dueDate, outstanding: ngn(i) })), now),
    payables: ageing(bills.map((b) => ({ dueDate: b.dueDate, outstanding: ngn(b) })), now),
  };
}

export async function cashInSummary(ctx: Ctx, unitId: string | null) {
  const units = await reportUnits(ctx, unitId);
  const ids = units.map((u) => u.id);
  const today = localDate(new Date());
  const sum = async (from: string) =>
    Number((await db.payment.aggregate({ _sum: { amountNgn: true }, where: { unitId: { in: ids }, status: "CONFIRMED", receivedAt: { gte: new Date(from) } } }))._sum.amountNgn ?? 0);
  return { today: await sum(today), week: await sum(addDays(today, -6)), month: await sum(`${today.slice(0, 7)}-01`) };
}

const ExportInput = z.object({ kind: z.enum(["payments", "expenses", "invoices"]), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

/** CSV for the accountant. Exporters only, step-up auth, watermarked and audited (Security #9). */
export async function exportFinanceCsv(ctx: Ctx, raw: unknown): Promise<{ filename: string; csv: string }> {
  const input = ExportInput.parse(raw);
  if (!can(ctx, "exports", "CREATE")) throw new ForbiddenError("exports:CREATE");
  const units = await reportUnits(ctx, null);
  await requireRecentAuth(ctx);
  const ids = units.map((u) => u.id);
  const code = new Map(units.map((u) => [u.id, u.code]));
  const range = { gte: new Date(input.from), lte: new Date(`${input.to}T23:59:59Z`) };
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\r\n]|^[=+\-@\t\r]/.test(s) ? `"${s.replace(/"/g, '""').replace(/^[=+\-@\t\r]/, "'$&")}"` : s;
  };
  let header: string[] = [];
  let rows: unknown[][] = [];
  if (input.kind === "payments") {
    header = ["Date", "Unit", "Method", "Reference", "Amount", "Currency", "FX rate", "Amount NGN", "Invoice", "Description"];
    const ps = await db.payment.findMany({ where: { unitId: { in: ids }, receivedAt: range, status: "CONFIRMED" }, include: { invoice: { select: { number: true } } }, orderBy: { receivedAt: "asc" } });
    rows = ps.map((p) => [localDate(p.receivedAt), code.get(p.unitId), p.method, p.providerRef, Number(p.amount), p.currency, p.fxRate ?? "", Number(p.amountNgn), p.invoice?.number ?? "", p.description]);
  } else if (input.kind === "expenses") {
    header = ["Date", "Unit", "Category", "Description", "Vendor", "Amount", "Currency", "FX rate", "Amount NGN", "Status"];
    const es = await db.expense.findMany({ where: { unitId: { in: ids }, incurredOn: range }, include: { category: { select: { name: true } } }, orderBy: { incurredOn: "asc" } });
    rows = es.map((e) => [localDate(e.incurredOn), code.get(e.unitId), e.category.name, e.description, e.vendor, Number(e.amount), e.currency, e.fxRate ?? "", Number(e.amountNgn), e.status]);
  } else {
    header = ["Number", "Issued", "Due", "Unit", "Customer", "Currency", "Subtotal", "VAT", "Total", "Paid", "Status"];
    const is = await db.invoice.findMany({ where: { unitId: { in: ids }, issueDate: range, kind: "INVOICE" }, include: { contact: { select: { displayName: true } }, carrierAccount: { select: { carrier: { select: { name: true } } } } }, orderBy: { issueDate: "asc" } });
    rows = is.map((i) => [i.number, localDate(i.issueDate), localDate(i.dueDate), code.get(i.unitId), i.contact?.displayName ?? i.carrierAccount?.carrier.name ?? "", i.currency, Number(i.subtotal), Number(i.vatAmount), Number(i.total), Number(i.amountPaid), i.status]);
  }
  const watermark = `# Figuraid Ltd — ${input.kind} ${input.from} to ${input.to}. Exported by ${ctx.name} (${ctx.email}) on ${new Date().toISOString()}. Confidential.`;
  await db.$transaction((tx) => audit(tx, { actorId: ctx.userId, action: `export.${input.kind}`, after: { from: input.from, to: input.to, rows: rows.length } }));
  return { filename: `figuraid-${input.kind}-${input.from}-to-${input.to}.csv`, csv: [watermark, header.join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n") + "\n" };
}
