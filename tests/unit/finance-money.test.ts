import { describe, expect, it } from "vitest";
import { ageBucket, ageing, invoiceStatusFor, invoiceTotals, projectCash, toNgn, type Flow } from "@/domain/finance/money";

describe("invoiceTotals", () => {
  it("applies 7.5% VAT to vatable lines only and rounds to kobo", () => {
    const t = invoiceTotals(
      [
        { quantity: 3, unitPrice: 33333.333, vatable: true },
        { quantity: 1, unitPrice: 15000, vatable: false }, // e.g. disbursement
      ],
      7.5,
    );
    expect(t.lines).toEqual([100000, 15000]);
    expect(t.subtotal).toBe(115000);
    expect(t.vatAmount).toBe(7500);
    expect(t.total).toBe(122500);
  });
});

describe("toNgn", () => {
  it("needs a rate for foreign currency", () => {
    expect(toNgn(1000, "NGN", null)).toBe(1000);
    expect(toNgn(84.2, "USD", 1550)).toBe(130510);
    expect(() => toNgn(10, "USD", null)).toThrow();
  });
});

describe("ageing", () => {
  const asOf = new Date("2026-10-24T12:00:00Z");
  it("buckets by days past due", () => {
    expect(ageBucket(new Date("2026-10-30"), asOf)).toBe("current");
    expect(ageBucket(new Date("2026-10-10"), asOf)).toBe("1-30");
    expect(ageBucket(new Date("2026-08-01"), asOf)).toBe("61-90");
    expect(ageBucket(new Date("2026-01-01"), asOf)).toBe("90+");
    expect(ageing([{ dueDate: new Date("2026-10-10"), outstanding: 100 }, { dueDate: new Date("2026-10-11"), outstanding: 50.5 }], asOf)["1-30"]).toBe(150.5);
  });
  it("derives invoice status from payments and due date", () => {
    expect(invoiceStatusFor(1000, 1000, new Date("2026-10-01"), asOf, "SENT")).toBe("PAID");
    expect(invoiceStatusFor(1000, 400, new Date("2026-11-01"), asOf, "SENT")).toBe("PARTIALLY_PAID");
    expect(invoiceStatusFor(1000, 0, new Date("2026-10-01"), asOf, "SENT")).toBe("OVERDUE");
    expect(invoiceStatusFor(1000, 0, new Date("2026-10-01"), asOf, "DRAFT")).toBe("DRAFT");
  });
});

describe("projectCash", () => {
  const flows: Flow[] = [
    { date: "2026-10-20", amount: 1_000_000, kind: "receivable", label: "Overdue invoice", probability: 0.8 },
    { date: "2026-10-28", amount: -600_000, kind: "payroll", label: "Payroll", probability: 1 },
    { date: "2026-11-05", amount: 2_000_000, kind: "pipeline", label: "Deal", probability: 0.4 },
  ];
  it("weights inflows by scenario and flags weeks under the minimum", () => {
    const expected = projectCash(500_000, flows, "expected", "2026-10-24", 3, 600_000);
    expect(expected[0]).toMatchObject({ inflow: 800_000, outflow: 600_000, closing: 700_000, belowMinimum: false }); // overdue lands in week 1
    expect(expected[1]!.closing).toBe(1_500_000);
    const worst = projectCash(500_000, flows, "worst", "2026-10-24", 3, 600_000);
    expect(worst[0]!.closing).toBe(500_000 + 600_000 - 660_000);
    expect(worst[0]!.belowMinimum).toBe(true);
    expect(worst[1]!.closing).toBeLessThan(expected[1]!.closing);
    const best = projectCash(500_000, flows, "best", "2026-10-24", 3, 0);
    expect(best[1]!.closing).toBeGreaterThan(expected[1]!.closing);
  });
});
