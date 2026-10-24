import "server-only";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { asrAcd, billedMinutesAggregate, billSeconds, creditState, marginAlert, marginOf, matchPrefix, parseCdr, rate, rateAt, round4 } from "@/domain/telecom/rating";
import { audit } from "@/server/audit/audit";
import { can, requireScope, type Ctx } from "@/server/authz/context";
import { NotFoundError, RuleError } from "@/server/authz/errors";
import { db } from "@/server/db";
import { storeFile } from "@/server/files/upload";
import { notify } from "@/server/notify/notify";
import { getSetting } from "@/server/modules/settings/service";
import { accountExposure } from "./carriers-service";
import { accountWhere, canSeeMargin } from "./scope";

const id = z.string().cuid();
type Tx = Prisma.TransactionClient;
type Account = Prisma.CarrierAccountGetPayload<{ include: { carrier: { select: { name: true; managerId: true } } } }>;

const ratesFor = (tx: Tx, routeId: string, accountId: string) =>
  tx.rate.findMany({ where: { routeId, carrierAccountId: accountId }, orderBy: { effectiveFrom: "asc" } }).then((rs) => rs.map((r) => ({ ...r, ratePerMin: Number(r.ratePerMin) })));

/** Post prepaid usage to the ledger and keep the cached balance in step. */
async function postUsage(tx: Tx, account: Account, amount: number, trafficEntryId: string, actorId: string | null) {
  if (account.paymentMode !== "PREPAID" || amount === 0) return null;
  const updated = await tx.carrierAccount.update({ where: { id: account.id }, data: { prepaidBalance: { decrement: amount } } });
  await tx.prepaidLedgerEntry.create({ data: { carrierAccountId: account.id, type: "USAGE", amount: -amount, balanceAfter: updated.prepaidBalance, trafficEntryId, createdById: actorId } });
  return Number(updated.prepaidBalance);
}

interface EntryInput {
  periodStart: Date;
  periodEnd: Date;
  routeId: string;
  vendor: Account;
  customer: Account;
  calls: number | null;
  connected: number | null;
  rawSeconds: number;
  vendorMinutes: number;
  customerMinutes: number;
  buy: { id: string; ratePerMin: number };
  sell: { id: string; ratePerMin: number };
  cost?: number;
  revenue?: number;
  source: "MANUAL" | "CDR";
  cdrImportId?: string;
  actorId: string;
}

async function storeEntry(tx: Tx, e: EntryInput) {
  const r = e.cost != null && e.revenue != null ? marginOf(round4(e.revenue), round4(e.cost)) : rate(e.vendorMinutes, e.buy.ratePerMin, e.customerMinutes, e.sell.ratePerMin);
  const row = await tx.trafficEntry.create({
    data: {
      periodStart: e.periodStart,
      periodEnd: e.periodEnd,
      routeId: e.routeId,
      vendorAccountId: e.vendor.id,
      customerAccountId: e.customer.id,
      calls: e.calls,
      connectedCalls: e.connected,
      rawSeconds: e.rawSeconds,
      vendorBilledMinutes: e.vendorMinutes,
      customerBilledMinutes: e.customerMinutes,
      buyRateId: e.buy.id,
      sellRateId: e.sell.id,
      costAmount: r.cost,
      revenueAmount: r.revenue,
      currency: e.customer.currency,
      source: e.source,
      cdrImportId: e.cdrImportId ?? null,
      enteredById: e.actorId,
    },
  });
  const vendorBalance = await postUsage(tx, e.vendor, r.cost, row.id, e.actorId);
  const customerBalance = await postUsage(tx, e.customer, r.revenue, row.id, e.actorId);
  return { id: row.id, rated: r, vendorBalance, customerBalance };
}

async function loadAccounts(ctx: Ctx, vendorAccountId: string, customerAccountId: string) {
  const where = await accountWhere(ctx, "telecom.traffic", "CREATE");
  const include = { carrier: { select: { name: true, managerId: true } } } as const;
  const [vendor, customer] = await Promise.all([
    db.carrierAccount.findFirst({ where: { AND: [{ id: vendorAccountId, side: "VENDOR" }, where] }, include }),
    db.carrierAccount.findFirst({ where: { AND: [{ id: customerAccountId, side: "CUSTOMER" }, where] }, include }),
  ]);
  if (!vendor) throw new NotFoundError("Vendor account");
  if (!customer) throw new NotFoundError("Customer account");
  if (vendor.currency !== customer.currency) throw new RuleError(`Vendor bills in ${vendor.currency} and customer in ${customer.currency} — align the account currencies first`);
  return { vendor, customer };
}

/** Margin, low-balance and credit alerts after traffic is rated. */
async function raiseAlerts(results: { rated: ReturnType<typeof rate>; vendorBalance: number | null; customerBalance: number | null }[], vendor: Account, customer: Account, routeName: string) {
  const threshold = Number(await getSetting("telecom.margin_alert_pct"));
  const money = await db.user.findMany({ where: { status: "ACTIVE", role: { key: { in: ["super_admin", "admin", "finance"] } } }, select: { id: true } });
  const moneyIds = money.map((m) => m.id);
  const managers = [vendor.carrier.managerId, customer.carrier.managerId].filter((x): x is string => !!x);
  const total = results.reduce((acc, r) => ({ cost: acc.cost + r.rated.cost, revenue: acc.revenue + r.rated.revenue }), { cost: 0, revenue: 0 });
  const m = marginOf(round4(total.revenue), round4(total.cost));
  const alert = marginAlert(m, threshold);
  if (alert) {
    // margin detail only to people who may see margins
    await notify({ userIds: moneyIds, type: "telecom.margin", title: alert === "negative" ? `Negative margin on ${routeName}` : `Thin margin on ${routeName}`, body: `${vendor.carrier.name} → ${customer.carrier.name}: ${m.marginPct ?? 0}% (${customer.currency} ${m.margin.toFixed(2)})`, link: "/money/telecom/traffic" });
  }
  const vBal = results.at(-1)?.vendorBalance;
  if (vBal != null && vendor.lowBalanceAlert != null && vBal <= Number(vendor.lowBalanceAlert)) {
    await notify({ userIds: [...moneyIds, ...managers], type: "telecom.low_balance", title: `Low prepaid balance with ${vendor.carrier.name}`, body: `${vendor.currency} ${vBal.toFixed(2)} left. Top up to keep the route open.`, link: "/money/telecom/billing", email: true });
  }
  const cBal = results.at(-1)?.customerBalance;
  if (cBal != null && cBal <= 0) {
    await notify({ userIds: [...moneyIds, ...managers], type: "telecom.customer_balance", title: `${customer.carrier.name} has used up their prepaid balance`, body: `Balance ${customer.currency} ${cBal.toFixed(2)}. Ask for a top-up before routing more traffic.`, link: "/money/telecom/billing", email: true });
  }
  if (customer.paymentMode === "POSTPAID" && customer.creditLimit != null) {
    const exposure = await accountExposure(customer.id);
    const state = creditState(exposure, Number(customer.creditLimit));
    if (state !== "ok") await notify({ userIds: [...moneyIds, ...managers], type: "telecom.credit", title: state === "over" ? `${customer.carrier.name} is over their credit limit` : `${customer.carrier.name} is at 80% of their credit limit`, body: `Exposure ${customer.currency} ${exposure.toFixed(2)} of ${Number(customer.creditLimit).toFixed(2)}.`, link: "/money/telecom/billing", email: state === "over" });
  }
  return alert;
}

// ── manual entry ─────────────────────────────────────────────────────────────

const ManualInput = z
  .object({
    periodStart: z.coerce.date(),
    periodEnd: z.coerce.date(),
    routeId: id,
    vendorAccountId: id,
    customerAccountId: id,
    calls: z.coerce.number().int().min(0).max(1e9).nullable().default(null),
    connectedCalls: z.coerce.number().int().min(0).max(1e9).nullable().default(null),
    minutes: z.coerce.number().min(0).max(1e9),
  })
  .refine((v) => v.periodEnd >= v.periodStart, { message: "The period ends before it starts", path: ["periodEnd"] })
  .refine((v) => v.connectedCalls == null || v.calls == null || v.connectedCalls <= v.calls, { message: "More connected calls than attempts", path: ["connectedCalls"] });

/** Enter switch-report traffic for one route between a vendor and a customer. */
export async function enterTraffic(ctx: Ctx, raw: unknown) {
  const input = ManualInput.parse(raw);
  requireScope(ctx, "telecom.traffic", "CREATE");
  if (input.periodStart > new Date()) throw new RuleError("That period hasn't happened yet");
  const { vendor, customer } = await loadAccounts(ctx, input.vendorAccountId, input.customerAccountId);
  const route = await db.route.findUnique({ where: { id: input.routeId } });
  if (!route) throw new NotFoundError("Route");
  const rawSeconds = Math.round(input.minutes * 60);
  const connected = input.connectedCalls ?? input.calls;
  const res = await db.$transaction(async (tx) => {
    const [buys, sells] = await Promise.all([ratesFor(tx, route.id, vendor.id), ratesFor(tx, route.id, customer.id)]);
    const buy = rateAt(buys, input.periodStart);
    const sell = rateAt(sells, input.periodStart);
    if (!buy) throw new RuleError(`${vendor.carrier.name} has no buy rate for ${route.destination} on that date`);
    if (!sell) throw new RuleError(`${customer.carrier.name} has no sell rate for ${route.destination} on that date`);
    const stored = await storeEntry(tx, {
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      routeId: route.id,
      vendor,
      customer,
      calls: input.calls,
      connected: input.connectedCalls,
      rawSeconds,
      vendorMinutes: billedMinutesAggregate(rawSeconds, connected, vendor.incrementFirst, vendor.incrementNext),
      customerMinutes: billedMinutesAggregate(rawSeconds, connected, customer.incrementFirst, customer.incrementNext),
      buy,
      sell,
      source: "MANUAL",
      actorId: ctx.userId,
    });
    await audit(tx, { actorId: ctx.userId, action: "traffic.enter", entityType: "TrafficEntry", entityId: stored.id, after: { route: route.prefix, minutes: input.minutes, vendor: vendor.carrier.name, customer: customer.carrier.name } });
    return stored;
  });
  const alert = await raiseAlerts([res], vendor, customer, route.destination);
  return { id: res.id, minutes: input.minutes, ...(canSeeMargin(ctx) ? { margin: res.rated.margin, marginPct: res.rated.marginPct, alert } : { margin: null, marginPct: null, alert: null }) };
}

// ── CDR upload ───────────────────────────────────────────────────────────────

/** Rate a CDR file call-by-call, then store one entry per route × day × rate pair. */
export async function importCdr(ctx: Ctx, form: FormData) {
  requireScope(ctx, "telecom.traffic", "CREATE");
  const meta = z.object({ vendorAccountId: id, customerAccountId: id }).parse({ vendorAccountId: form.get("vendorAccountId"), customerAccountId: form.get("customerAccountId") });
  const { vendor, customer } = await loadAccounts(ctx, meta.vendorAccountId, meta.customerAccountId);
  const file = form.get("file");
  if (!file || typeof file === "string" || file.size === 0) throw new RuleError("Choose a CDR file (CSV)");
  const bytes = Buffer.from(await file.arrayBuffer());
  const stored = await storeFile({ bytes, filename: file.name, purpose: "cdr", userId: ctx.userId });
  const { rows, errors } = parseCdr(bytes.toString("utf8"));
  if (rows.length > 500_000) throw new RuleError("Split CDR files over 500,000 calls");
  const imp = await db.cdrImport.create({ data: { carrierAccountId: customer.id, fileId: stored.id, status: "rating", rowsTotal: rows.length + errors.length, uploadedById: ctx.userId } });

  const routes = await db.route.findMany({ where: { isActive: true }, select: { id: true, prefix: true, destination: true } });
  const rateCache = new Map<string, { id: string; ratePerMin: number; effectiveFrom: Date; effectiveTo: Date | null }[]>();
  const getRates = async (routeId: string, accountId: string) => {
    const k = `${routeId}|${accountId}`;
    if (!rateCache.has(k)) rateCache.set(k, await ratesFor(db as unknown as Tx, routeId, accountId));
    return rateCache.get(k)!;
  };
  const rejected = [...errors];
  type Group = { routeId: string; day: string; buy: { id: string; ratePerMin: number }; sell: { id: string; ratePerMin: number }; start: Date; end: Date; calls: number; connected: number; raw: number; vSec: number; cSec: number; cost: number; revenue: number };
  const groups = new Map<string, Group>();
  for (const call of rows) {
    const route = matchPrefix(call.dialled, routes);
    if (!route) { rejected.push({ line: call.line, message: `No route for ${call.dialled.slice(0, 6)}…` }); continue; }
    const buy = rateAt(await getRates(route.id, vendor.id), call.startedAt);
    const sell = rateAt(await getRates(route.id, customer.id), call.startedAt);
    if (!buy || !sell) { rejected.push({ line: call.line, message: `No ${!buy ? "buy" : "sell"} rate for ${route.destination}` }); continue; }
    const vSec = billSeconds(call.seconds, vendor.incrementFirst, vendor.incrementNext);
    const cSec = billSeconds(call.seconds, customer.incrementFirst, customer.incrementNext);
    const day = call.startedAt.toISOString().slice(0, 10);
    const key = `${route.id}|${day}|${buy.id}|${sell.id}`;
    const g = groups.get(key) ?? { routeId: route.id, day, buy, sell, start: call.startedAt, end: call.startedAt, calls: 0, connected: 0, raw: 0, vSec: 0, cSec: 0, cost: 0, revenue: 0 };
    g.calls++;
    if (call.seconds > 0) g.connected++;
    g.raw += call.seconds;
    g.vSec += vSec;
    g.cSec += cSec;
    g.cost += (vSec / 60) * buy.ratePerMin;
    g.revenue += (cSec / 60) * sell.ratePerMin;
    if (call.startedAt < g.start) g.start = call.startedAt;
    if (call.startedAt > g.end) g.end = call.startedAt;
    groups.set(key, g);
  }

  const results: Awaited<ReturnType<typeof storeEntry>>[] = [];
  try {
    await db.$transaction(
      async (tx) => {
        for (const g of groups.values()) {
          results.push(
            await storeEntry(tx, {
              periodStart: g.start,
              periodEnd: g.end,
              routeId: g.routeId,
              vendor,
              customer,
              calls: g.calls,
              connected: g.connected,
              rawSeconds: g.raw,
              vendorMinutes: round4(g.vSec / 60),
              customerMinutes: round4(g.cSec / 60),
              buy: g.buy,
              sell: g.sell,
              cost: g.cost,
              revenue: g.revenue,
              source: "CDR",
              cdrImportId: imp.id,
              actorId: ctx.userId,
            }),
          );
        }
        await tx.cdrImport.update({ where: { id: imp.id }, data: { status: "done", rowsRated: rows.length - (rejected.length - errors.length), rowsRejected: rejected.length, errors: rejected.slice(0, 200) } });
        await audit(tx, { actorId: ctx.userId, action: "cdr.import", entityType: "CdrImport", entityId: imp.id, after: { calls: rows.length, rejected: rejected.length, entries: groups.size } });
      },
      { timeout: 300_000 },
    );
  } catch (e) {
    await db.cdrImport.update({ where: { id: imp.id }, data: { status: "failed", errors: [{ line: 0, message: e instanceof RuleError ? e.message : "Rating failed" }] } });
    throw e;
  }
  if (results.length) await raiseAlerts(results, vendor, customer, "CDR import");
  const minutes = round4([...groups.values()].reduce((n, g) => n + g.cSec / 60, 0));
  return { importId: imp.id, calls: rows.length, entries: groups.size, minutes, rejected: rejected.length, errors: rejected.slice(0, 20) };
}

// ── reading ──────────────────────────────────────────────────────────────────

const Range = z.object({ from: z.coerce.date(), to: z.coerce.date(), routeId: id.optional(), accountId: id.optional() });

export async function listTraffic(ctx: Ctx, raw: unknown) {
  const f = Range.parse(raw);
  const acc = await accountWhere(ctx, "telecom.traffic", "VIEW");
  const seeMargin = canSeeMargin(ctx);
  const rows = await db.trafficEntry.findMany({
    where: { AND: [{ periodStart: { gte: f.from, lt: f.to } }, f.routeId ? { routeId: f.routeId } : {}, f.accountId ? { OR: [{ vendorAccountId: f.accountId }, { customerAccountId: f.accountId }] } : {}, { customerAccount: acc }, { vendorAccount: acc }] },
    include: { route: { select: { destination: true, prefix: true, routeType: true } }, vendorAccount: { select: { carrier: { select: { name: true } } } }, customerAccount: { select: { carrier: { select: { name: true } } } }, invoice: { select: { id: true, number: true } } },
    orderBy: { periodStart: "desc" },
    take: 500,
  });
  return rows.map((t) => {
    const m = marginOf(Number(t.revenueAmount), Number(t.costAmount));
    return {
      id: t.id,
      periodStart: t.periodStart.toISOString(),
      periodEnd: t.periodEnd.toISOString(),
      route: t.route,
      vendor: t.vendorAccount.carrier.name,
      customer: t.customerAccount.carrier.name,
      calls: t.calls,
      ...asrAcd(t.calls, t.connectedCalls, t.rawSeconds),
      minutes: Number(t.customerBilledMinutes),
      revenue: Number(t.revenueAmount),
      currency: t.currency,
      cost: seeMargin ? m.cost : null,
      margin: seeMargin ? m.margin : null,
      marginPct: seeMargin ? m.marginPct : null,
      source: t.source,
      invoice: t.invoice,
    };
  });
}

/** Dashboard numbers: minutes, revenue and (if allowed) cost and margin by day, route and carrier. */
export async function telecomSummary(ctx: Ctx, raw: unknown) {
  const f = Range.parse(raw);
  const acc = await accountWhere(ctx, "telecom.traffic", "VIEW");
  const seeMargin = canSeeMargin(ctx);
  const threshold = Number(await getSetting("telecom.margin_alert_pct"));
  const rows = await db.trafficEntry.findMany({
    where: { AND: [{ periodStart: { gte: f.from, lt: f.to } }, { customerAccount: acc }, { vendorAccount: acc }] },
    select: { periodStart: true, routeId: true, route: { select: { destination: true, prefix: true } }, customerAccount: { select: { carrier: { select: { name: true } } } }, vendorAccount: { select: { carrier: { select: { name: true } } } }, customerBilledMinutes: true, revenueAmount: true, costAmount: true, currency: true, calls: true, connectedCalls: true, rawSeconds: true },
  });
  type Agg = { minutes: number; revenue: number; cost: number; calls: number; connected: number; raw: number };
  const blank = (): Agg => ({ minutes: 0, revenue: 0, cost: 0, calls: 0, connected: 0, raw: 0 });
  const add = (a: Agg, t: (typeof rows)[number]) => {
    a.minutes += Number(t.customerBilledMinutes);
    a.revenue += Number(t.revenueAmount);
    a.cost += Number(t.costAmount);
    a.calls += t.calls ?? 0;
    a.connected += t.connectedCalls ?? t.calls ?? 0;
    a.raw += t.rawSeconds;
  };
  const total = blank();
  const byDay = new Map<string, Agg>();
  const byRoute = new Map<string, Agg & { name: string }>();
  const byCustomer = new Map<string, Agg>();
  const byVendor = new Map<string, Agg>();
  for (const t of rows) {
    add(total, t);
    const d = t.periodStart.toISOString().slice(0, 10);
    add(byDay.get(d) ?? byDay.set(d, blank()).get(d)!, t);
    add(byRoute.get(t.routeId) ?? byRoute.set(t.routeId, { ...blank(), name: `${t.route.destination} (${t.route.prefix})` }).get(t.routeId)!, t);
    add(byCustomer.get(t.customerAccount.carrier.name) ?? byCustomer.set(t.customerAccount.carrier.name, blank()).get(t.customerAccount.carrier.name)!, t);
    add(byVendor.get(t.vendorAccount.carrier.name) ?? byVendor.set(t.vendorAccount.carrier.name, blank()).get(t.vendorAccount.carrier.name)!, t);
  }
  const view = (a: Agg) => {
    const m = marginOf(round4(a.revenue), round4(a.cost));
    return { minutes: round4(a.minutes), revenue: m.revenue, ...asrAcd(a.calls || null, a.connected, a.raw), ...(seeMargin ? { cost: m.cost, margin: m.margin, marginPct: m.marginPct, alert: marginAlert(m, threshold) } : { cost: null, margin: null, marginPct: null, alert: null }) };
  };
  const days: string[] = [];
  for (let d = new Date(f.from); d < f.to; d = new Date(d.getTime() + 86_400_000)) days.push(d.toISOString().slice(0, 10));
  return {
    currency: rows[0]?.currency ?? "USD",
    seeMargin,
    total: view(total),
    byDay: days.map((d) => ({ day: d, ...view(byDay.get(d) ?? blank()) })),
    byRoute: [...byRoute.entries()].map(([routeId, a]) => ({ routeId, name: a.name, ...view(a) })).sort((a, b) => b.minutes - a.minutes),
    byCustomer: [...byCustomer.entries()].map(([name, a]) => ({ name, ...view(a) })).sort((a, b) => b.revenue - a.revenue),
    byVendor: seeMargin || can(ctx, "telecom.buy_rates", "VIEW") ? [...byVendor.entries()].map(([name, a]) => ({ name, ...view(a) })).sort((a, b) => b.minutes - a.minutes) : [],
  };
}

export async function listCdrImports(ctx: Ctx) {
  const acc = await accountWhere(ctx, "telecom.traffic", "VIEW");
  const rows = await db.cdrImport.findMany({ where: { carrierAccount: acc }, include: { carrierAccount: { select: { carrier: { select: { name: true } } } }, uploadedBy: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 20 });
  return rows.map((r) => ({ id: r.id, carrier: r.carrierAccount?.carrier.name ?? "—", status: r.status, total: r.rowsTotal, rated: r.rowsRated, rejected: r.rowsRejected, by: r.uploadedBy.name, at: r.createdAt.toISOString(), errors: (r.errors as { line: number; message: string }[] | null)?.slice(0, 5) ?? [] }));
}
