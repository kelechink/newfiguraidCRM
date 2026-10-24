import { beforeAll, describe, expect, it } from "vitest";
import { ForbiddenError, RuleError } from "@/server/authz/errors";
import { db } from "@/server/db";
import { invoiceCycle, ledger, postLedger, recordVendorStatement, updateDispute } from "@/server/modules/telecom/billing-service";
import { saveCarrier } from "@/server/modules/telecom/carriers-service";
import { importRateDeck, listRoutes, saveRoute, setRate } from "@/server/modules/telecom/rates-service";
import { enterTraffic, importCdr, listTraffic, telecomSummary } from "@/server/modules/telecom/traffic-service";
import { ctxFor, ensureRolesAndUnits, makeUser } from "./world";

let admin: { id: string }, finance: { id: string }, ops: { id: string }, webStaff: { id: string };
let route: { id: string; prefix: string };
let vendor: { id: string }, customer: { id: string }, prepaidVendor: { id: string };
const rnd = () => Math.random().toString(36).slice(2, 8);
const day = (n: number) => new Date(Date.UTC(2026, 8, n)); // September 2026

async function carrierAccount(name: string, type: "VENDOR" | "CUSTOMER", over: Record<string, unknown> = {}) {
  const { id } = await saveCarrier(await ctxFor(admin.id), { name, type, currency: "USD" });
  const a = await db.carrierAccount.findFirstOrThrow({ where: { carrierId: id } });
  return db.carrierAccount.update({ where: { id: a.id }, data: { cycleAnchor: day(1), ...over } });
}

beforeAll(async () => {
  const units = await ensureRolesAndUnits();
  admin = await makeUser({ role: "admin", unitId: units.HQ });
  finance = await makeUser({ role: "finance", unitId: units.HQ });
  ops = await makeUser({ role: "telecom_ops", unitId: units.TELECOM });
  webStaff = await makeUser({ role: "staff", unitId: units.FIGUREWEB });
  const prefix = `9${Math.floor(1e6 + Math.random() * 8e6)}`;
  await saveRoute(await ctxFor(ops.id), { destination: `Testland Mobile ${rnd()}`, prefix, routeType: "CLI" });
  route = await db.route.findFirstOrThrow({ where: { prefix, routeType: "CLI" } });
  vendor = await carrierAccount(`Vendor ${rnd()}`, "VENDOR", { incrementFirst: 60, incrementNext: 60 });
  customer = await carrierAccount(`Customer ${rnd()}`, "CUSTOMER", { incrementFirst: 1, incrementNext: 1, billingCycleDays: 7, paymentTermDays: 3, creditLimit: 100000 });
  prepaidVendor = await carrierAccount(`Prepaid ${rnd()}`, "VENDOR", { paymentMode: "PREPAID", incrementFirst: 1, incrementNext: 1, lowBalanceAlert: 50 });
  const a = await ctxFor(admin.id);
  await setRate(a, { routeId: route.id, accountId: vendor.id, ratePerMin: 0.05, effectiveFrom: day(1) });
  await setRate(a, { routeId: route.id, accountId: vendor.id, ratePerMin: 0.06, effectiveFrom: day(15) });
  await setRate(a, { routeId: route.id, accountId: prepaidVendor.id, ratePerMin: 0.04, effectiveFrom: day(1) });
  await setRate(await ctxFor(ops.id), { routeId: route.id, accountId: customer.id, ratePerMin: 0.07, effectiveFrom: day(1) });
});

describe("rates & sensitive data", () => {
  it("telecom ops set sell rates but can't set or see buy rates or margins", async () => {
    const o = await ctxFor(ops.id);
    await expect(setRate(o, { routeId: route.id, accountId: vendor.id, ratePerMin: 0.01, effectiveFrom: day(20) })).rejects.toBeInstanceOf(ForbiddenError);
    const r = (await listRoutes(o, { q: route.prefix })).find((x) => x.id === route.id)!;
    expect(r.sell[0]!.rate).toBe(0.07);
    expect(r.buy).toBeNull();
    expect(r.marginPerMin).toBeNull();
    const f = (await listRoutes(await ctxFor(finance.id), { q: route.prefix })).find((x) => x.id === route.id)!;
    expect(f.buy!.map((b) => b.rate)).toEqual([0.04, 0.06]); // current rates only, cheapest first
    expect(f.marginPerMin).toBe(0.03);
    await expect(listRoutes(await ctxFor(webStaff.id), {})).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("keeps rate history append-only and rates traffic at the rate in force", async () => {
    const hist = await db.rate.findMany({ where: { routeId: route.id, carrierAccountId: vendor.id }, orderBy: { effectiveFrom: "asc" } });
    expect(hist.map((h) => [Number(h.ratePerMin), h.effectiveTo?.toISOString().slice(0, 10) ?? null])).toEqual([[0.05, "2026-09-15"], [0.06, null]]);
  });
});

describe("rating & billing", () => {
  it("applies each side's increments, hides cost from ops, and invoices a closed 7/3 cycle once", async () => {
    const o = await ctxFor(ops.id);
    // 100 calls, 61 s average: vendor 60/60 bills 200 min, customer 1/1 bills 101.6667 min
    const res = await enterTraffic(o, { periodStart: day(2), periodEnd: day(2), routeId: route.id, vendorAccountId: vendor.id, customerAccountId: customer.id, calls: 100, minutes: 101.666667 });
    expect(res.margin).toBeNull();
    const e = await db.trafficEntry.findUniqueOrThrow({ where: { id: res.id } });
    expect(Number(e.vendorBilledMinutes)).toBe(200);
    expect(Number(e.customerBilledMinutes)).toBeCloseTo(101.6667, 3);
    expect(Number(e.costAmount)).toBe(10); // 200 × 0.05
    expect(Number(e.revenueAmount)).toBeCloseTo(7.1167, 3); // negative margin → alert
    expect((await listTraffic(o, { from: day(1), to: day(30) }))[0]!.cost).toBeNull();
    expect((await listTraffic(await ctxFor(finance.id), { from: day(1), to: day(30) })).find((t) => t.id === res.id)!.margin).toBeCloseTo(-2.8833, 3);
    const s = await telecomSummary(await ctxFor(finance.id), { from: day(1), to: day(8) });
    expect(s.byRoute.find((r) => r.routeId === route.id)!.alert).toBe("negative");

    // traffic after the rate change uses 0.06
    const later = await enterTraffic(o, { periodStart: day(16), periodEnd: day(16), routeId: route.id, vendorAccountId: vendor.id, customerAccountId: customer.id, minutes: 10 });
    expect(Number((await db.trafficEntry.findUniqueOrThrow({ where: { id: later.id } })).costAmount)).toBe(0.6);

    await expect(invoiceCycle(o, { accountId: customer.id, periodStart: day(1), periodEnd: day(8) })).rejects.toBeInstanceOf(ForbiddenError);
    const f = await ctxFor(finance.id);
    const inv = await invoiceCycle(f, { accountId: customer.id, periodStart: day(1), periodEnd: day(8) });
    expect(inv).not.toBeNull();
    const full = await db.invoice.findUniqueOrThrow({ where: { id: inv!.id }, include: { lines: true } });
    expect(Number(full.total)).toBeCloseTo(7.12, 2);
    expect(full.currency).toBe("USD");
    expect(Number(full.vatAmount)).toBe(0);
    expect(full.dueDate.toISOString().slice(0, 10)).toBe("2026-09-11"); // cycle ends 8th + 3 days
    expect(await invoiceCycle(f, { accountId: customer.id, periodStart: day(1), periodEnd: day(8) })).toBeNull(); // nothing billed twice
    expect((await db.trafficEntry.findUniqueOrThrow({ where: { id: later.id } })).invoiceId).toBeNull();
  });

  it("rates CDRs call by call and rejects unroutable lines", async () => {
    const f = new FormData();
    f.set("vendorAccountId", vendor.id);
    f.set("customerAccountId", customer.id);
    const csv = `start_time,called_number,billsec\n2026-09-20T10:00:00Z,${route.prefix}1234,30\n2026-09-20T11:00:00Z,${route.prefix}5678,61\n2026-09-20T11:30:00Z,00000000001,20\n`;
    f.set("file", new File([csv], "cdr.csv", { type: "text/csv" }));
    const r = await importCdr(await ctxFor(ops.id), f);
    expect(r.calls).toBe(3);
    expect(r.rejected).toBe(1);
    const e = await db.trafficEntry.findFirstOrThrow({ where: { cdrImportId: r.importId } });
    expect(Number(e.vendorBilledMinutes)).toBe(3); // 60 + 120 s
    expect(Number(e.customerBilledMinutes)).toBeCloseTo(91 / 60, 4);
    expect(Number(e.costAmount)).toBeCloseTo(0.18, 4);
  });

  it("debits prepaid vendors on usage and needs prepaid rights for top-ups", async () => {
    const fin = await ctxFor(finance.id);
    await postLedger(fin, { accountId: prepaidVendor.id, type: "TOPUP", amount: 100, reference: "TT-1" });
    await expect(postLedger(await ctxFor(ops.id), { accountId: prepaidVendor.id, type: "TOPUP", amount: 100 })).rejects.toBeInstanceOf(ForbiddenError);
    await enterTraffic(await ctxFor(ops.id), { periodStart: day(3), periodEnd: day(3), routeId: route.id, vendorAccountId: prepaidVendor.id, customerAccountId: customer.id, minutes: 1500 });
    const l = await ledger(fin, { accountId: prepaidVendor.id });
    expect(l.balance).toBe(40); // 100 − 1500 × 0.04
    expect(l.rows.map((r) => r.type)).toEqual(["USAGE", "TOPUP"]);
    expect((await ledger(await ctxFor(ops.id), { accountId: prepaidVendor.id })).rows.map((r) => r.type)).toEqual(["TOPUP"]);
  });

  it("holds a vendor statement that disagrees with our rating and releases it when the dispute closes", async () => {
    const fin = await ctxFor(finance.id);
    await enterTraffic(await ctxFor(ops.id), { periodStart: day(22), periodEnd: day(22), routeId: route.id, vendorAccountId: vendor.id, customerAccountId: customer.id, minutes: 100 }); // 100 × 0.06 = 6.00
    const ok = await recordVendorStatement(fin, { accountId: vendor.id, periodStart: day(22), periodEnd: day(22), theirMinutes: 100, theirAmount: 6.02, issueDate: day(23) });
    expect(ok.disputeId).toBeNull();
    await enterTraffic(await ctxFor(ops.id), { periodStart: day(24), periodEnd: day(24), routeId: route.id, vendorAccountId: vendor.id, customerAccountId: customer.id, minutes: 100 });
    const bad = await recordVendorStatement(fin, { accountId: vendor.id, periodStart: day(24), periodEnd: day(24), theirMinutes: 130, theirAmount: 7.8, issueDate: day(25) });
    expect(bad.disputeId).not.toBeNull();
    expect((await db.bill.findUniqueOrThrow({ where: { id: bad.billId } })).status).toBe("DISPUTED");
    await expect(recordVendorStatement(await ctxFor(ops.id), { accountId: vendor.id, periodStart: day(24), periodEnd: day(24), theirMinutes: 1, theirAmount: 1, issueDate: day(25) })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updateDispute(fin, { disputeId: bad.disputeId!, status: "SETTLED" })).rejects.toBeInstanceOf(RuleError);
    await updateDispute(fin, { disputeId: bad.disputeId!, status: "SETTLED", resolution: "Agreed at our CDRs" });
    expect((await db.bill.findUniqueOrThrow({ where: { id: bad.billId } })).status).toBe("DRAFT");
  });

  it("imports a sell deck, creating routes and flagging increases without a week's notice", async () => {
    const prefix = `8${Math.floor(1e6 + Math.random() * 8e6)}`;
    const f = new FormData();
    f.set("accountId", customer.id);
    f.set("routeType", "CLI");
    f.set("effectiveFrom", new Date().toISOString().slice(0, 10));
    f.set("file", new File([`prefix,destination,rate\n${route.prefix},Testland,0.09\n${prefix},Newland,0.1\nabc,Bad,x\n`], "deck.csv", { type: "text/csv" }));
    const r = await importRateDeck(await ctxFor(admin.id), f);
    expect(r).toMatchObject({ created: 1, changed: 1, newRoutes: 1, errorCount: 1 });
    expect(r.increasesWithoutNotice).toHaveLength(1);
  });
});
