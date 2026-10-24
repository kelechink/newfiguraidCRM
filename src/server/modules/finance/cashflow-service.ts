import "server-only";
import type { Recurrence } from "@prisma/client";
import { z } from "zod";
import { projectCash, round2, type Flow, type Scenario } from "@/domain/finance/money";
import { addDays, localDate } from "@/domain/sop/schedule";
import { requireScope, type Ctx } from "@/server/authz/context";
import { decryptJson, decryptOptional } from "@/server/crypto/field";
import { db } from "@/server/db";
import { getSetting } from "@/server/modules/settings/service";

const STEP_DAYS: Record<Recurrence, number> = { WEEKLY: 7, MONTHLY: 30, QUARTERLY: 91, ANNUAL: 365 };

function addMonthsKeepDay(date: string, months: number) {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d, last))).toISOString().slice(0, 10);
}

/** Everything that moves cash in the next `days`, as dated flows in NGN. */
export async function buildFlows(today: string, days: number): Promise<{ opening: number; flows: Flow[] }> {
  const usd = Number(await getSetting("finance.usd_ngn_rate"));
  const ngn = (amount: number, currency: string, fx?: number | null) => (currency === "NGN" ? amount : amount * (fx ?? usd));
  const horizon = addDays(today, days);
  const flows: Flow[] = [];

  // opening balance: latest reconciled snapshot per account, else opening balance
  const accounts = await db.bankAccount.findMany({ where: { isActive: true }, include: { balanceSnapshots: { orderBy: { asOf: "desc" }, take: 1 } } });
  const opening = round2(accounts.reduce((n, a) => n + ngn(Number(a.balanceSnapshots[0]?.balance ?? a.openingBalance), a.currency), 0));

  // receivables
  const invoices = await db.invoice.findMany({ where: { kind: "INVOICE", status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] } }, select: { number: true, total: true, amountPaid: true, currency: true, fxRate: true, dueDate: true } });
  for (const i of invoices) {
    const overdueDays = Math.floor((Date.parse(today) - i.dueDate.getTime()) / 86_400_000);
    const p = overdueDays <= 0 ? 0.9 : overdueDays <= 30 ? 0.7 : overdueDays <= 90 ? 0.5 : 0.2;
    flows.push({ date: localDate(i.dueDate), amount: ngn(Number(i.total) - Number(i.amountPaid), i.currency, i.fxRate ? Number(i.fxRate) : null), kind: "receivable", label: `Invoice ${i.number}`, probability: p });
  }
  // payables
  const bills = await db.bill.findMany({ where: { status: { in: ["DRAFT", "APPROVED", "PARTIALLY_PAID"] } }, select: { number: true, supplierName: true, total: true, amountPaid: true, currency: true, fxRate: true, dueDate: true } });
  for (const b of bills) flows.push({ date: localDate(b.dueDate), amount: -ngn(Number(b.total) - Number(b.amountPaid), b.currency, b.fxRate ? Number(b.fxRate) : null), kind: "payable", label: `Bill ${b.number ?? b.supplierName ?? ""}`, probability: 1 });

  // weighted pipeline: cash 14 days after expected close
  const deals = await db.deal.findMany({ where: { status: "OPEN", deletedAt: null, expectedCloseDate: { lte: new Date(addDays(horizon, -14)) } }, include: { stage: { select: { probability: true } } } });
  for (const d of deals) {
    const close = d.expectedCloseDate && d.expectedCloseDate > new Date(today) ? localDate(d.expectedCloseDate) : today;
    flows.push({ date: addDays(close, 14), amount: ngn(Number(d.value), d.currency), kind: "pipeline", label: `Deal ${d.title}`, probability: (d.probability ?? d.stage.probability) / 100 });
  }

  // telecom: project the last 28 days forward by each account's cycle and terms
  const since = new Date(addDays(today, -28));
  const traffic = await db.trafficEntry.groupBy({ by: ["customerAccountId", "vendorAccountId", "currency"], where: { periodStart: { gte: since } }, _sum: { revenueAmount: true, costAmount: true } });
  const accountIds = [...new Set(traffic.flatMap((t) => [t.customerAccountId, t.vendorAccountId]))];
  const acc = new Map((await db.carrierAccount.findMany({ where: { id: { in: accountIds } }, include: { carrier: { select: { name: true } } } })).map((a) => [a.id, a]));
  const perDay = new Map<string, { amount: number; currency: string }>();
  for (const t of traffic) {
    const c = perDay.get(`c:${t.customerAccountId}`) ?? { amount: 0, currency: t.currency };
    c.amount += Number(t._sum.revenueAmount ?? 0) / 28;
    perDay.set(`c:${t.customerAccountId}`, c);
    const v = perDay.get(`v:${t.vendorAccountId}`) ?? { amount: 0, currency: t.currency };
    v.amount += Number(t._sum.costAmount ?? 0) / 28;
    perDay.set(`v:${t.vendorAccountId}`, v);
  }
  for (const [key, { amount, currency }] of perDay) {
    const a = acc.get(key.slice(2));
    if (!a || amount <= 0) continue;
    const cycle = a.billingCycleDays;
    for (let end = addDays(today, cycle); end <= horizon; end = addDays(end, cycle)) {
      const value = ngn(amount * cycle, currency);
      if (key.startsWith("c:")) flows.push({ date: addDays(end, a.paymentTermDays), amount: value, kind: "telecom_in", label: `${a.carrier.name} (projected cycle)`, probability: 0.85 });
      else if (a.paymentMode === "PREPAID") flows.push({ date: addDays(end, -cycle), amount: -value, kind: "topup", label: `${a.carrier.name} prepaid top-up (projected)`, probability: 1 });
      else flows.push({ date: addDays(end, a.paymentTermDays), amount: -value, kind: "telecom_out", label: `${a.carrier.name} (projected cycle)`, probability: 1 });
    }
  }

  // payroll on the 25th — aggregate only; salaries are decrypted here and never returned
  const profiles = await db.staffProfile.findMany({ where: { user: { status: { in: ["ACTIVE", "ONBOARDING"] } } }, select: { salaryEnc: true, allowancesEnc: true } });
  const monthlyPayroll = profiles.reduce((n, p) => {
    const salary = Number(decryptOptional(p.salaryEnc) ?? 0);
    const allowances = p.allowancesEnc ? decryptJson<{ amount: number }[]>(p.allowancesEnc).reduce((s, a) => s + Number(a.amount), 0) : 0;
    return n + salary + allowances;
  }, 0);
  for (let m = 0; m <= Math.ceil(days / 28); m++) {
    const date = addMonthsKeepDay(`${today.slice(0, 7)}-25`, m);
    if (date >= today && date <= horizon && monthlyPayroll > 0) flows.push({ date, amount: -monthlyPayroll, kind: "payroll", label: `Payroll ${date.slice(0, 7)}`, probability: 1 });
  }

  // subscriptions & recurring items
  const subs = await db.subscription.findMany({ where: { status: { in: ["ACTIVE", "TRIAL"] } } });
  for (const s of subs) {
    for (let d = localDate(s.renewalDate); d <= horizon; d = s.recurrence === "MONTHLY" ? addMonthsKeepDay(d, 1) : s.recurrence === "QUARTERLY" ? addMonthsKeepDay(d, 3) : s.recurrence === "ANNUAL" ? addMonthsKeepDay(d, 12) : addDays(d, STEP_DAYS[s.recurrence])) {
      if (d >= today) flows.push({ date: d, amount: -ngn(Number(s.cost), s.currency), kind: "subscription", label: s.name, probability: 1 });
    }
  }
  const recurring = await db.recurringItem.findMany({ where: { isActive: true } });
  for (const r of recurring) {
    for (let d = localDate(r.nextDueOn); d <= horizon; d = r.recurrence === "MONTHLY" ? addMonthsKeepDay(d, 1) : r.recurrence === "QUARTERLY" ? addMonthsKeepDay(d, 3) : r.recurrence === "ANNUAL" ? addMonthsKeepDay(d, 12) : addDays(d, 7)) {
      if (d >= today) flows.push({ date: d, amount: -ngn(Number(r.amount), r.currency), kind: "recurring", label: r.name, probability: 1 });
    }
  }
  return { opening, flows: flows.map((f) => ({ ...f, amount: round2(f.amount) })) };
}

export async function forecast(ctx: Ctx, raw: unknown) {
  requireScope(ctx, "finance.cashflow", "VIEW");
  const { days } = z.object({ days: z.union([z.literal(30), z.literal(60), z.literal(90)]).default(90) }).parse(raw ?? {});
  const today = localDate(new Date());
  const minimum = Number(await getSetting("finance.min_cash_balance_ngn"));
  const { opening, flows } = await buildFlows(today, days);
  const weeks = Math.ceil(days / 7);
  const scenarios = Object.fromEntries((["best", "expected", "worst"] as Scenario[]).map((s) => [s, projectCash(opening, flows, s, today, weeks, minimum)])) as Record<Scenario, ReturnType<typeof projectCash>>;
  const byKind = Object.entries(
    flows.reduce<Record<string, number>>((acc, f) => {
      acc[f.kind] = (acc[f.kind] ?? 0) + f.amount * (f.amount > 0 ? f.probability : 1);
      return acc;
    }, {}),
  ).map(([kind, amount]) => ({ kind, amount: round2(amount) }));
  const largest = [...flows].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 12);
  return { today, days, opening, minimum, scenarios, byKind, largest };
}
