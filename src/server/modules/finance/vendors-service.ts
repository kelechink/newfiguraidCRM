import "server-only";
import { round2 } from "@/domain/finance/money";
import { can, scopeOf, type Ctx } from "@/server/authz/context";
import { ForbiddenError } from "@/server/authz/errors";
import { db } from "@/server/db";
import { currentRates, ngn, rateInfo } from "@/server/fx/rates";
import { billWhere } from "./scope";

type Item = { kind: "bill" | "subscription" | "prepaid"; label: string; due: string | null; amount: number; currency: string; ngn: number; status: string; href: string };

const DAY = 86_400_000;
const PER_MONTH = { WEEKLY: 52 / 12, MONTHLY: 1, QUARTERLY: 1 / 3, ANNUAL: 1 / 12 } as const;

/**
 * Everything we owe or pay suppliers, in each supplier's own currency and in naira at
 * today's rates: unpaid bills and vendor statements, upcoming subscription charges, and
 * prepaid balances held with telecom vendors.
 */
export async function vendorPosition(ctx: Ctx) {
  const seeBills = can(ctx, "finance.bills", "VIEW");
  const seeSubs = can(ctx, "subscriptions", "VIEW");
  const seePrepaid = can(ctx, "telecom.prepaid", "VIEW") && can(ctx, "telecom.buy_rates", "VIEW");
  if (!seeBills && !seeSubs) throw new ForbiddenError("finance.bills:VIEW");
  const rates = await currentRates();
  const vendors = new Map<string, Item[]>();
  const push = (vendor: string, item: Item) => vendors.set(vendor, [...(vendors.get(vendor) ?? []), item]);

  if (seeBills) {
    const bills = await db.bill.findMany({ where: { AND: [billWhere(ctx, "VIEW"), { status: { in: ["DRAFT", "APPROVED", "PARTIALLY_PAID", "DISPUTED"] } }] }, include: { carrierAccount: { select: { carrier: { select: { name: true } } } } }, orderBy: { dueDate: "asc" } });
    for (const b of bills) {
      const bal = round2(Number(b.total) - Number(b.amountPaid));
      if (bal <= 0) continue;
      push(b.carrierAccount?.carrier.name ?? b.supplierName ?? "Unnamed supplier", { kind: "bill", label: b.number ? `Bill ${b.number}` : b.carrierAccountId ? "Vendor statement" : "Bill", due: b.dueDate.toISOString().slice(0, 10), amount: bal, currency: b.currency, ngn: ngn(bal, b.currency, rates), status: b.status, href: "/money/bills" });
    }
  }
  let monthlyRecurringNgn = 0;
  if (seeSubs) {
    const scope = scopeOf(ctx, "subscriptions", "VIEW");
    const scoped = scope === "ALL" ? {} : scope === "UNIT" ? { unitId: { in: ctx.unitIds } } : { ownerId: ctx.userId };
    const subs = await db.subscription.findMany({ where: { status: { in: ["ACTIVE", "TRIAL"] }, ...scoped }, orderBy: { renewalDate: "asc" } });
    for (const s of subs) {
      const amount = Number(s.cost);
      monthlyRecurringNgn += ngn(amount * PER_MONTH[s.recurrence], s.currency, rates);
      push(s.vendor, { kind: "subscription", label: `${s.name} (${s.recurrence.toLowerCase()})`, due: s.renewalDate.toISOString().slice(0, 10), amount, currency: s.currency, ngn: ngn(amount, s.currency, rates), status: s.status, href: "/money/subscriptions" });
    }
  }
  if (seePrepaid) {
    const accounts = await db.carrierAccount.findMany({ where: { side: "VENDOR", paymentMode: "PREPAID", carrier: { isActive: true } }, include: { carrier: { select: { id: true, name: true } } } });
    for (const a of accounts) {
      const bal = Number(a.prepaidBalance);
      push(a.carrier.name, { kind: "prepaid", label: "Prepaid balance held", due: null, amount: bal, currency: a.currency, ngn: ngn(bal, a.currency, rates), status: a.lowBalanceAlert != null && bal <= Number(a.lowBalanceAlert) ? "LOW" : "OK", href: "/money/telecom/billing" });
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const in30 = new Date(Date.now() + 30 * DAY).toISOString().slice(0, 10);
  const rows = [...vendors.entries()]
    .map(([vendor, items]) => {
      const owed = items.filter((i) => i.kind !== "prepaid");
      return {
        vendor,
        items,
        currencies: [...new Set(items.map((i) => i.currency))],
        owedNgn: round2(owed.reduce((n, i) => n + i.ngn, 0)),
        overdueNgn: round2(owed.filter((i) => i.kind === "bill" && i.due! < today).reduce((n, i) => n + i.ngn, 0)),
        prepaidNgn: round2(items.filter((i) => i.kind === "prepaid").reduce((n, i) => n + i.ngn, 0)),
        nextDue: owed.map((i) => i.due).filter(Boolean).sort()[0] ?? null,
      };
    })
    .sort((a, b) => b.owedNgn - a.owedNgn);
  const all = rows.flatMap((r) => r.items);
  return {
    rates: await rateInfo(),
    rows,
    totals: {
      billsNgn: round2(all.filter((i) => i.kind === "bill").reduce((n, i) => n + i.ngn, 0)),
      overdueNgn: round2(rows.reduce((n, r) => n + r.overdueNgn, 0)),
      due30Ngn: round2(all.filter((i) => i.kind !== "prepaid" && i.due && i.due <= in30).reduce((n, i) => n + i.ngn, 0)),
      monthlyRecurringNgn: round2(monthlyRecurringNgn),
      prepaidNgn: round2(rows.reduce((n, r) => n + r.prepaidNgn, 0)),
    },
  };
}
