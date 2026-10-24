import "server-only";
import { z } from "zod";
import { round2 } from "@/domain/finance/money";
import { creditState, dueDateFor, lastClosedCycle, marginOf, round4, termsLabel } from "@/domain/telecom/rating";
import { audit } from "@/server/audit/audit";
import { can, requireScope, type Ctx } from "@/server/authz/context";
import { ForbiddenError, NotFoundError, RuleError } from "@/server/authz/errors";
import { requireRecentAuth } from "@/server/auth/session";
import { db } from "@/server/db";
import { notify } from "@/server/notify/notify";
import { nextInvoiceNumber } from "@/server/modules/finance/invoices-service";
import { accountExposure } from "./carriers-service";
import { accountWhere, canSeeBuy, telecomUnitId } from "./scope";

const id = z.string().cuid();
const DAY = 86_400_000;
/** Vendor statements within this tolerance of our own rating are accepted without a dispute. */
const TOLERANCE_PCT = 0.5;

// ── overview of accounts ─────────────────────────────────────────────────────

export async function billingOverview(ctx: Ctx) {
  requireScope(ctx, "telecom.billing", "VIEW");
  const acc = await accountWhere(ctx, "telecom.carriers", "VIEW");
  const seeBuy = canSeeBuy(ctx);
  const accounts = await db.carrierAccount.findMany({ where: { AND: [acc, { carrier: { isActive: true } }, seeBuy ? {} : { side: "CUSTOMER" }] }, include: { carrier: { select: { name: true } } }, orderBy: { carrier: { name: "asc" } } });
  const now = new Date();
  return Promise.all(
    accounts.map(async (a) => {
      const cycle = lastClosedCycle(a.cycleAnchor, a.billingCycleDays, now);
      const side = a.side === "CUSTOMER" ? { customerAccountId: a.id, invoiceId: null } : { vendorAccountId: a.id, billId: null };
      const unbilled = await db.trafficEntry.aggregate({ where: { ...side, periodStart: { lt: cycle.end } }, _sum: { revenueAmount: true, costAmount: true, customerBilledMinutes: true, vendorBilledMinutes: true }, _count: true });
      const billedThisCycle = a.side === "CUSTOMER"
        ? await db.invoice.findFirst({ where: { carrierAccountId: a.id, periodStart: cycle.start, status: { not: "VOID" } }, select: { id: true, number: true } })
        : await db.bill.findFirst({ where: { carrierAccountId: a.id, periodStart: cycle.start, status: { not: "VOID" } }, select: { id: true, number: true } });
      const exposure = a.side === "CUSTOMER" && a.paymentMode === "POSTPAID" ? await accountExposure(a.id) : null;
      return {
        id: a.id,
        carrier: a.carrier.name,
        side: a.side,
        currency: a.currency,
        terms: termsLabel(a.billingCycleDays, a.paymentTermDays),
        paymentMode: a.paymentMode,
        cycle: { start: cycle.start.toISOString().slice(0, 10), end: new Date(cycle.end.getTime() - DAY).toISOString().slice(0, 10), due: dueDateFor(cycle.end, a.paymentTermDays).toISOString().slice(0, 10) },
        unbilledEntries: unbilled._count,
        unbilledMinutes: Number((a.side === "CUSTOMER" ? unbilled._sum.customerBilledMinutes : unbilled._sum.vendorBilledMinutes) ?? 0),
        unbilledAmount: Number((a.side === "CUSTOMER" ? unbilled._sum.revenueAmount : unbilled._sum.costAmount) ?? 0),
        billed: billedThisCycle,
        balance: a.paymentMode === "PREPAID" && can(ctx, "telecom.prepaid", "VIEW") ? Number(a.prepaidBalance) : null,
        lowBalance: a.paymentMode === "PREPAID" && a.lowBalanceAlert != null && Number(a.prepaidBalance) <= Number(a.lowBalanceAlert),
        exposure,
        creditLimit: a.creditLimit != null ? Number(a.creditLimit) : null,
        credit: exposure != null ? creditState(exposure, a.creditLimit != null ? Number(a.creditLimit) : null) : "ok",
      };
    }),
  );
}

// ── customer invoices per cycle ──────────────────────────────────────────────

const CycleInput = z.object({ accountId: id, periodStart: z.coerce.date(), periodEnd: z.coerce.date() });

/**
 * Invoice a customer's unbilled traffic for a cycle (end exclusive). One line per route;
 * the traffic rows are stamped with the invoice so nothing is billed twice.
 */
export async function invoiceCycle(ctx: Ctx | null, raw: unknown): Promise<{ id: string; number: string } | null> {
  const input = CycleInput.parse(raw);
  if (ctx) requireScope(ctx, "telecom.billing", "CREATE");
  const account = await db.carrierAccount.findFirst({ where: { AND: [{ id: input.accountId, side: "CUSTOMER" }, ctx ? await accountWhere(ctx, "telecom.billing", "CREATE") : {}] }, include: { carrier: true } });
  if (!account) throw new NotFoundError("Customer account");
  if (input.periodEnd <= input.periodStart) throw new RuleError("The cycle must end after it starts");
  if (input.periodEnd > new Date()) throw new RuleError("Wait until the cycle has closed");
  const unitId = await telecomUnitId();
  const created = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`telecom-invoice:${account.id}`}))`;
    const traffic = await tx.trafficEntry.findMany({ where: { customerAccountId: account.id, invoiceId: null, periodStart: { gte: input.periodStart, lt: input.periodEnd } }, include: { route: true, sellRate: true } });
    if (!traffic.length) return null;
    const byRoute = new Map<string, { name: string; minutes: number; amount: number; rate: number | null }>();
    for (const t of traffic) {
      const key = `${t.routeId}|${t.sellRateId}`;
      const line = byRoute.get(key) ?? { name: `${t.route.destination} (${t.route.prefix}, ${t.route.routeType})`, minutes: 0, amount: 0, rate: t.sellRate ? Number(t.sellRate.ratePerMin) : null };
      line.minutes += Number(t.customerBilledMinutes);
      line.amount += Number(t.revenueAmount);
      byRoute.set(key, line);
    }
    const lines = [...byRoute.values()].sort((a, b) => b.amount - a.amount).map((l, i) => ({ position: i + 1, description: `${l.name}${l.rate != null ? ` @ ${l.rate.toFixed(4)}/min` : ""}`, quantity: round4(l.minutes), unitPrice: l.minutes > 0 ? round4(l.amount / l.minutes) : 0, amount: round2(l.amount), vatable: false }));
    const total = round2(lines.reduce((n, l) => n + l.amount, 0));
    const number = await nextInvoiceNumber(tx, unitId, "INVOICE", input.periodStart);
    const fx = account.currency === "NGN" ? null : Number((await tx.setting.findUnique({ where: { key: "finance.usd_ngn_rate" } }))?.value ?? 1550);
    const inv = await tx.invoice.create({
      data: {
        number,
        kind: "INVOICE",
        status: "DRAFT",
        unitId,
        ownerId: ctx?.userId ?? account.carrier.managerId,
        carrierAccountId: account.id,
        currency: account.currency,
        fxRate: fx,
        subtotal: total,
        vatRate: 0, // international wholesale voice is zero-rated
        vatAmount: 0,
        total,
        issueDate: input.periodEnd,
        dueDate: dueDateFor(input.periodEnd, account.paymentTermDays),
        periodStart: input.periodStart,
        periodEnd: new Date(input.periodEnd.getTime() - 1),
        notes: `Wholesale voice ${termsLabel(account.billingCycleDays, account.paymentTermDays)}, increments ${account.incrementFirst}/${account.incrementNext}. Dispute within 7 days of issue with CDR evidence.`,
        lines: { create: lines },
      },
    });
    await tx.trafficEntry.updateMany({ where: { id: { in: traffic.map((t) => t.id) } }, data: { invoiceId: inv.id } });
    await audit(tx, { actorId: ctx?.userId ?? null, actorType: ctx ? "user" : "system", action: "telecom.invoice", entityType: "Invoice", entityId: inv.id, unitId, after: { number, carrier: account.carrier.name, entries: traffic.length, total } });
    return { id: inv.id, number };
  });
  return created;
}

/** Daily job: draft invoices for every customer cycle that closed and has traffic. */
export async function runDueCycles(now = new Date()): Promise<number> {
  const accounts = await db.carrierAccount.findMany({ where: { side: "CUSTOMER", carrier: { isActive: true } }, select: { id: true, cycleAnchor: true, billingCycleDays: true, carrier: { select: { name: true } } } });
  const finance = await db.user.findMany({ where: { status: "ACTIVE", role: { key: "finance" } }, select: { id: true } });
  let n = 0;
  for (const a of accounts) {
    const c = lastClosedCycle(a.cycleAnchor, a.billingCycleDays, now);
    const inv = await invoiceCycle(null, { accountId: a.id, periodStart: c.start, periodEnd: c.end });
    if (inv) {
      n++;
      await notify({ userIds: finance.map((f) => f.id), type: "telecom.invoice_draft", title: `Draft invoice ${inv.number} for ${a.carrier.name}`, body: "Review and send it from Finance → Invoices.", link: `/money/invoices/${inv.id}` });
    }
  }
  return n;
}

// ── vendor statements ────────────────────────────────────────────────────────

const StatementInput = z.object({
  accountId: id,
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  number: z.string().trim().max(60).optional(),
  theirMinutes: z.coerce.number().min(0),
  theirAmount: z.coerce.number().min(0),
  issueDate: z.coerce.date(),
});

/**
 * Record a vendor's statement against our own rating of the same period. Within
 * tolerance it's approved for payment; otherwise the bill is held and a dispute opened.
 */
export async function recordVendorStatement(ctx: Ctx, raw: unknown) {
  const input = StatementInput.parse(raw);
  requireScope(ctx, "telecom.billing", "CREATE");
  if (!canSeeBuy(ctx)) throw new ForbiddenError("telecom.buy_rates:VIEW");
  const account = await db.carrierAccount.findFirst({ where: { AND: [{ id: input.accountId, side: "VENDOR" }, await accountWhere(ctx, "telecom.billing", "CREATE")] }, include: { carrier: true } });
  if (!account) throw new NotFoundError("Vendor account");
  const end = new Date(input.periodEnd.getTime() + DAY); // inclusive end date from the form
  const unitId = await telecomUnitId();
  return db.$transaction(async (tx) => {
    const traffic = await tx.trafficEntry.findMany({ where: { vendorAccountId: account.id, billId: null, periodStart: { gte: input.periodStart, lt: end } }, select: { id: true, vendorBilledMinutes: true, costAmount: true } });
    const ourMinutes = round4(traffic.reduce((n, t) => n + Number(t.vendorBilledMinutes), 0));
    const ourAmount = round2(traffic.reduce((n, t) => n + Number(t.costAmount), 0));
    const diff = round2(input.theirAmount - ourAmount);
    const within = ourAmount === 0 ? input.theirAmount === 0 : Math.abs(diff) <= (ourAmount * TOLERANCE_PCT) / 100;
    const bill = await tx.bill.create({
      data: {
        number: input.number || null,
        unitId,
        supplierName: account.carrier.name,
        carrierAccountId: account.id,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        currency: account.currency,
        fxRate: account.currency === "NGN" ? null : Number((await tx.setting.findUnique({ where: { key: "finance.usd_ngn_rate" } }))?.value ?? 1550),
        total: input.theirAmount,
        issueDate: input.issueDate,
        dueDate: dueDateFor(end, account.paymentTermDays),
        status: within ? "DRAFT" : "DISPUTED",
      },
    });
    await tx.trafficEntry.updateMany({ where: { id: { in: traffic.map((t) => t.id) } }, data: { billId: bill.id } });
    let disputeId: string | null = null;
    if (!within) {
      disputeId = (
        await tx.dispute.create({
          data: { carrierAccountId: account.id, billId: bill.id, periodStart: input.periodStart, periodEnd: input.periodEnd, ourMinutes, theirMinutes: input.theirMinutes, ourAmount, theirAmount: input.theirAmount, description: `Statement ${input.number ?? ""} is ${account.currency} ${diff.toFixed(2)} ${diff > 0 ? "above" : "below"} our rating (${(input.theirMinutes - ourMinutes).toFixed(2)} min difference).`.replace("  ", " "), openedById: ctx.userId },
        })
      ).id;
    }
    await audit(tx, { actorId: ctx.userId, action: "telecom.vendor_statement", entityType: "Bill", entityId: bill.id, unitId, after: { carrier: account.carrier.name, ourAmount, theirAmount: input.theirAmount, disputed: !within } });
    return { billId: bill.id, ourMinutes, ourAmount, theirAmount: input.theirAmount, difference: diff, disputeId };
  });
}

// ── disputes ─────────────────────────────────────────────────────────────────

export async function listDisputes(ctx: Ctx, raw: unknown) {
  const { open } = z.object({ open: z.boolean().optional() }).parse(raw ?? {});
  requireScope(ctx, "telecom.disputes", "VIEW");
  const acc = await accountWhere(ctx, "telecom.disputes", "VIEW");
  const seeBuy = canSeeBuy(ctx);
  const rows = await db.dispute.findMany({
    where: { AND: [{ carrierAccount: { ...acc, ...(seeBuy ? {} : { side: "CUSTOMER" as const }) } }, open ? { status: { in: ["OPEN", "IN_REVIEW"] } } : {}] },
    include: { carrierAccount: { select: { side: true, currency: true, carrier: { select: { name: true } } } }, openedBy: { select: { name: true } }, invoice: { select: { id: true, number: true } }, bill: { select: { id: true, number: true } } },
    orderBy: [{ status: "asc" }, { openedAt: "desc" }],
    take: 200,
  });
  return rows.map((d) => ({
    id: d.id,
    carrier: d.carrierAccount.carrier.name,
    side: d.carrierAccount.side,
    currency: d.carrierAccount.currency,
    period: `${d.periodStart.toISOString().slice(0, 10)} – ${d.periodEnd.toISOString().slice(0, 10)}`,
    ourMinutes: d.ourMinutes != null ? Number(d.ourMinutes) : null,
    theirMinutes: d.theirMinutes != null ? Number(d.theirMinutes) : null,
    ourAmount: d.ourAmount != null ? Number(d.ourAmount) : null,
    theirAmount: d.theirAmount != null ? Number(d.theirAmount) : null,
    status: d.status,
    description: d.description,
    resolution: d.resolution,
    openedBy: d.openedBy.name,
    openedAt: d.openedAt.toISOString(),
    invoice: d.invoice,
    bill: d.bill,
  }));
}

const DisputeInput = z.object({
  accountId: id,
  invoiceId: id.nullable().default(null),
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  ourMinutes: z.coerce.number().min(0).nullable().default(null),
  theirMinutes: z.coerce.number().min(0).nullable().default(null),
  ourAmount: z.coerce.number().min(0).nullable().default(null),
  theirAmount: z.coerce.number().min(0).nullable().default(null),
  description: z.string().trim().min(5).max(2000),
});

export async function openDispute(ctx: Ctx, raw: unknown) {
  const input = DisputeInput.parse(raw);
  requireScope(ctx, "telecom.disputes", "CREATE");
  const account = await db.carrierAccount.findFirst({ where: { AND: [{ id: input.accountId }, await accountWhere(ctx, "telecom.disputes", "CREATE")] } });
  if (!account) throw new NotFoundError("Account");
  if (account.side === "VENDOR" && !canSeeBuy(ctx)) throw new ForbiddenError("telecom.buy_rates:VIEW");
  if (input.invoiceId && !(await db.invoice.count({ where: { id: input.invoiceId, carrierAccountId: account.id } }))) throw new NotFoundError("Invoice");
  const { accountId, ...data } = input;
  await db.$transaction(async (tx) => {
    const d = await tx.dispute.create({ data: { ...data, carrierAccountId: accountId, openedById: ctx.userId } });
    await audit(tx, { actorId: ctx.userId, action: "dispute.open", entityType: "Dispute", entityId: d.id, after: { account: accountId } });
  });
}

export async function updateDispute(ctx: Ctx, raw: unknown) {
  const input = z.object({ disputeId: id, status: z.enum(["OPEN", "IN_REVIEW", "RESOLVED_IN_OUR_FAVOUR", "RESOLVED_IN_THEIR_FAVOUR", "SETTLED", "REJECTED"]), resolution: z.string().trim().max(2000).optional() }).parse(raw);
  requireScope(ctx, "telecom.disputes", "EDIT");
  const d = await db.dispute.findFirst({ where: { AND: [{ id: input.disputeId }, { carrierAccount: await accountWhere(ctx, "telecom.disputes", "EDIT") }] }, include: { carrierAccount: { select: { side: true } } } });
  if (!d) throw new NotFoundError("Dispute");
  if (d.carrierAccount.side === "VENDOR" && !canSeeBuy(ctx)) throw new ForbiddenError("telecom.buy_rates:VIEW");
  const closing = !["OPEN", "IN_REVIEW"].includes(input.status);
  if (closing && !input.resolution) throw new RuleError("Record how it was resolved");
  await db.$transaction(async (tx) => {
    await tx.dispute.update({ where: { id: d.id }, data: { status: input.status, resolution: input.resolution || null, resolvedAt: closing ? new Date() : null } });
    // a vendor bill held for this dispute becomes payable once it's closed
    if (closing && d.billId) await tx.bill.updateMany({ where: { id: d.billId, status: "DISPUTED" }, data: { status: "DRAFT" } });
    await audit(tx, { actorId: ctx.userId, action: "dispute.update", entityType: "Dispute", entityId: d.id, before: { status: d.status }, after: { status: input.status } });
  });
}

// ── prepaid ledger ───────────────────────────────────────────────────────────

const LedgerInput = z.object({ accountId: id, type: z.enum(["TOPUP", "ADJUSTMENT", "REFUND"]), amount: z.coerce.number().refine((n) => n !== 0 && Math.abs(n) <= 1e10, "Enter an amount"), reference: z.string().trim().max(120).optional() });

/** Top-ups, refunds and adjustments. Usage is posted automatically when traffic is rated. */
export async function postLedger(ctx: Ctx, raw: unknown) {
  const input = LedgerInput.parse(raw);
  requireScope(ctx, "telecom.prepaid", "EDIT");
  const a = await db.carrierAccount.findFirst({ where: { AND: [{ id: input.accountId }, await accountWhere(ctx, "telecom.prepaid", "EDIT")] }, include: { carrier: { select: { name: true } } } });
  if (!a) throw new NotFoundError("Account");
  if (a.paymentMode !== "PREPAID") throw new RuleError("This account isn't prepaid");
  if (input.type === "TOPUP" && input.amount < 0) throw new RuleError("A top-up must be positive");
  const amount = input.type === "REFUND" ? -Math.abs(input.amount) : input.amount;
  await requireRecentAuth(ctx);
  return db.$transaction(async (tx) => {
    const u = await tx.carrierAccount.update({ where: { id: a.id }, data: { prepaidBalance: { increment: amount } } });
    await tx.prepaidLedgerEntry.create({ data: { carrierAccountId: a.id, type: input.type, amount, balanceAfter: u.prepaidBalance, reference: input.reference || null, createdById: ctx.userId } });
    await audit(tx, { actorId: ctx.userId, action: "prepaid.post", entityType: "CarrierAccount", entityId: a.id, before: { balance: Number(a.prepaidBalance) }, after: { type: input.type, amount, balance: Number(u.prepaidBalance) } });
    return { balance: Number(u.prepaidBalance) };
  });
}

export async function ledger(ctx: Ctx, raw: unknown) {
  const { accountId } = z.object({ accountId: id }).parse(raw);
  requireScope(ctx, "telecom.prepaid", "VIEW");
  const a = await db.carrierAccount.findFirst({ where: { AND: [{ id: accountId }, await accountWhere(ctx, "telecom.prepaid", "VIEW")] } });
  if (!a) throw new NotFoundError("Account");
  if (a.side === "VENDOR" && !canSeeBuy(ctx)) {
    // vendor usage is our buy cost — show top-ups only
    const rows = await db.prepaidLedgerEntry.findMany({ where: { carrierAccountId: a.id, type: { not: "USAGE" } }, orderBy: { occurredAt: "desc" }, take: 100 });
    return { balance: Number(a.prepaidBalance), rows: rows.map((r) => ({ id: r.id, type: r.type, amount: Number(r.amount), balanceAfter: null, reference: r.reference, at: r.occurredAt.toISOString() })) };
  }
  const rows = await db.prepaidLedgerEntry.findMany({ where: { carrierAccountId: a.id }, orderBy: { occurredAt: "desc" }, take: 100 });
  return { balance: Number(a.prepaidBalance), rows: rows.map((r) => ({ id: r.id, type: r.type, amount: Number(r.amount), balanceAfter: Number(r.balanceAfter), reference: r.reference, at: r.occurredAt.toISOString() })) };
}

/** Netting for carriers that are both: what they owe us vs what we owe them. */
export async function nettingPosition(ctx: Ctx, carrierId: string) {
  requireScope(ctx, "telecom.billing", "VIEW");
  if (!canSeeBuy(ctx)) throw new ForbiddenError("telecom.buy_rates:VIEW");
  const accounts = await db.carrierAccount.findMany({ where: { carrierId, carrier: { nettingEnabled: true } } });
  const customer = accounts.find((a) => a.side === "CUSTOMER");
  const vendor = accounts.find((a) => a.side === "VENDOR");
  if (!customer || !vendor) return null;
  const [recv, pay] = await Promise.all([
    db.invoice.findMany({ where: { carrierAccountId: customer.id, status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] } }, select: { total: true, amountPaid: true } }),
    db.bill.findMany({ where: { carrierAccountId: vendor.id, status: { in: ["APPROVED", "PARTIALLY_PAID"] } }, select: { total: true, amountPaid: true } }),
  ]);
  const theyOwe = round2(recv.reduce((n, i) => n + Number(i.total) - Number(i.amountPaid), 0));
  const weOwe = round2(pay.reduce((n, b) => n + Number(b.total) - Number(b.amountPaid), 0));
  return { currency: customer.currency, theyOwe, weOwe, net: round2(theyOwe - weOwe), margin: marginOf(theyOwe, weOwe) };
}
