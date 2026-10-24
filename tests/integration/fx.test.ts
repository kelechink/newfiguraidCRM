import { beforeAll, describe, expect, it } from "vitest";
import { ForbiddenError } from "@/server/authz/errors";
import { db } from "@/server/db";
import { currentRates, setRate } from "@/server/fx/rates";
import { createBill } from "@/server/modules/finance/money-service";
import { listSubscriptions, saveSubscription } from "@/server/modules/finance/subscriptions-service";
import { vendorPosition } from "@/server/modules/finance/vendors-service";
import { ctxFor, ensureRolesAndUnits, makeUser } from "./world";

let finance: { id: string }, staff: { id: string }, hq: string;
const rnd = () => Math.random().toString(36).slice(2, 8);

beforeAll(async () => {
  const units = await ensureRolesAndUnits();
  hq = units.HQ;
  finance = await makeUser({ role: "finance", unitId: units.HQ });
  staff = await makeUser({ role: "staff", unitId: units.HQ });
  const f = await ctxFor(finance.id);
  await setRate(f, { currency: "USD", rate: 1500 });
  await setRate(f, { currency: "EUR", rate: 1700 });
});

describe("exchange rates", () => {
  it("uses each currency's own rate (euros are not converted at the dollar rate)", async () => {
    const rates = await currentRates();
    expect(rates).toMatchObject({ NGN: 1, USD: 1500, EUR: 1700 });
    await expect(setRate(await ctxFor(staff.id), { currency: "USD", rate: 1 })).rejects.toBeInstanceOf(ForbiddenError);
    const f = await ctxFor(finance.id);
    const name = `Hosting ${rnd()}`;
    await saveSubscription(f, { name, vendor: `Hetzner ${rnd()}`, unitId: hq, cost: 50, currency: "EUR", recurrence: "MONTHLY", renewalDate: new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10) });
    const sub = (await listSubscriptions(f)).items.find((i) => i.name === name)!;
    expect(sub.monthlyNgn).toBe(85_000);
    expect(sub.nextChargeNgn).toBe(85_000);
  });

  it("shows what we owe each vendor in their currency and in naira", async () => {
    const f = await ctxFor(finance.id);
    const vendor = `Carrier Bill ${rnd()}`;
    await createBill(f, { unitId: hq, supplierName: vendor, currency: "USD", fxRate: 1450, total: 200, issueDate: "2026-10-01", dueDate: "2026-10-05" });
    await createBill(f, { unitId: hq, supplierName: vendor, currency: "NGN", fxRate: null, total: 30_000, issueDate: "2026-10-01", dueDate: new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10) });
    const v = await vendorPosition(f);
    const row = v.rows.find((r) => r.vendor === vendor)!;
    expect(row.currencies.sort()).toEqual(["NGN", "USD"]);
    expect(row.owedNgn).toBe(200 * 1500 + 30_000); // today's rate for the naira view
    expect(row.overdueNgn).toBe(300_000);
    await expect(vendorPosition(await ctxFor(staff.id))).rejects.toBeInstanceOf(ForbiddenError);
  });
});
