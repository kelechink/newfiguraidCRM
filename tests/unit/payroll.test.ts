import { describe, expect, it } from "vitest";
import { annualPaye, attendanceDeductions, latenessCharge, monthlyCap, payslip, proRataFraction, workingDaysInMonth, type PolicyRule } from "@/domain/hr/payroll";

const tiered: PolicyRule = {
  latenessMode: "TIERED",
  fixedAmount: null,
  tiers: [
    { fromMinutes: 1, toMinutes: 15, amount: 500 },
    { fromMinutes: 16, toMinutes: 30, amount: 1000 },
    { fromMinutes: 31, toMinutes: null, amount: 2000 },
  ],
  absenceMode: "DAILY_RATE",
  absenceAmount: null,
  monthlyCapAmount: 10_000,
  monthlyCapPct: 5,
};

describe("lateness and absence", () => {
  it("picks the tier by minutes late, or the flat rate", () => {
    expect(latenessCharge(tiered, 0).amount).toBe(0);
    expect(latenessCharge(tiered, 15).amount).toBe(500);
    expect(latenessCharge(tiered, 16)).toEqual({ amount: 1000, label: "tier 16–30 min" });
    expect(latenessCharge(tiered, 240).amount).toBe(2000);
    expect(latenessCharge({ ...tiered, latenessMode: "FIXED", fixedAmount: 750 }, 3).amount).toBe(750);
  });

  it("never charges leave, holidays, weekends or excused days", () => {
    const r = attendanceDeductions({
      rule: { ...tiered, monthlyCapAmount: null, monthlyCapPct: null },
      monthlyGross: 220_000,
      workingDaysInMonth: 22,
      days: [
        { date: "2026-10-01", status: "LATE", minutesLate: 20, excused: false },
        { date: "2026-10-02", status: "LATE", minutesLate: 45, excused: true },
        { date: "2026-10-05", status: "ABSENT", minutesLate: 0, excused: false },
        { date: "2026-10-06", status: "ON_LEAVE", minutesLate: 0, excused: false },
        { date: "2026-10-01", status: "HOLIDAY", minutesLate: 0, excused: false },
        { date: "2026-10-04", status: "WEEKEND", minutesLate: 0, excused: false },
        { date: "2026-10-07", status: "ABSENT", minutesLate: 0, excused: true },
      ],
    });
    expect(r.items.map((i) => [i.date, i.type, i.amount])).toEqual([["2026-10-01", "LATENESS", 1000], ["2026-10-05", "ABSENCE", 10_000]]);
    expect(r.total).toBe(11_000);
  });

  it("applies the lower of the amount and percentage caps in date order", () => {
    expect(monthlyCap(tiered, 150_000)).toBe(7_500); // 5% of 150k < 10k
    expect(monthlyCap({ ...tiered, monthlyCapPct: null }, 150_000)).toBe(10_000);
    const r = attendanceDeductions({ rule: tiered, monthlyGross: 150_000, workingDaysInMonth: 20, days: [
      { date: "2026-10-01", status: "ABSENT", minutesLate: 0, excused: false }, // 7,500
      { date: "2026-10-02", status: "LATE", minutesLate: 40, excused: false }, // 2,000 → capped to 0
    ] });
    expect(r.uncapped).toBe(9_500);
    expect(r.total).toBe(7_500);
    expect(r.items[1]).toMatchObject({ amount: 0, status: "capped" });
  });

  it("counts working days without weekends or public holidays", () => {
    const days = workingDaysInMonth("2026-10", [1, 2, 3, 4, 5], new Set(["2026-10-01"]));
    expect(days).toHaveLength(21); // 22 weekdays in Oct 2026, minus Independence Day
    expect(proRataFraction(days, "2026-10-16", null)).toBeCloseTo(11 / 21, 4);
  });
});

describe("payslip", () => {
  it("uses the 2026 PAYE bands", () => {
    expect(annualPaye(800_000)).toBe(0);
    expect(annualPaye(3_000_000)).toBe(330_000); // 2.2m × 15%
    expect(annualPaye(12_000_000)).toBe(1_950_000); // + 9m × 18%
  });

  it("computes gross, pension, PAYE and deductions to net", () => {
    const p = payslip({
      base: 200_000,
      allowances: [{ name: "Housing", amount: 60_000 }, { name: "Transport", amount: 40_000 }, { name: "Data", amount: 10_000 }],
      bonuses: [{ name: "Target bonus", amount: 15_000 }],
      attendance: 3_000,
      other: [{ name: "Salary advance", amount: 20_000 }],
      statutory: { payeEnabled: true, pensionPct: 8, nhfPct: 0 },
    });
    expect(p.gross).toBe(325_000);
    expect(p.statutory.find((s) => s.name.startsWith("Pension"))!.amount).toBe(24_000); // 8% of basic + housing + transport
    // chargeable 301,000 × 12 = 3,612,000 → 330,000 + 612,000 × 18% = 440,160 a year
    expect(p.statutory.find((s) => s.name === "PAYE")!.amount).toBe(36_680);
    expect(p.net).toBe(325_000 - 24_000 - 36_680 - 3_000 - 20_000);
  });

  it("pro-rates pay for part months and never pays below zero", () => {
    const half = payslip({ base: 100_000, allowances: [], bonuses: [], attendance: 0, other: [], statutory: { payeEnabled: false, pensionPct: 0, nhfPct: 0 }, proRata: 0.5 });
    expect(half.gross).toBe(50_000);
    const owed = payslip({ base: 50_000, allowances: [], bonuses: [], attendance: 0, other: [{ name: "Advance", amount: 80_000 }], statutory: { payeEnabled: false, pensionPct: 0, nhfPct: 0 } });
    expect(owed.net).toBe(0);
  });
});

describe("Figuraid attendance rule", () => {
  const rule: PolicyRule = { latenessMode: "FIXED", fixedAmount: 500, earlyLeaveAmount: 500, tiers: [], absenceMode: "FIXED", absenceAmount: 3000, monthlyCapAmount: null, monthlyCapPct: null };
  it("charges ₦500 per late arrival, ₦500 per early sign-off, ₦3,000 per unexcused absence, with no cap", () => {
    const days = [
      { date: "2026-10-05", status: "LATE" as const, minutesLate: 1, minutesEarly: 0, excused: false }, // 09:01 → 500
      { date: "2026-10-06", status: "LATE" as const, minutesLate: 40, minutesEarly: 30, excused: false }, // late and left early → 1,000
      { date: "2026-10-07", status: "PRESENT" as const, minutesLate: 0, minutesEarly: 5, excused: false }, // left 16:55 → 500
      { date: "2026-10-08", status: "ABSENT" as const, minutesLate: 0, excused: false }, // 3,000
      { date: "2026-10-09", status: "ABSENT" as const, minutesLate: 0, excused: true }, // approved excuse → 0
      { date: "2026-10-12", status: "ON_LEAVE" as const, minutesLate: 0, excused: false },
      ...Array.from({ length: 12 }, (_, i) => ({ date: `2026-10-${String(13 + i).padStart(2, "0")}`, status: "ABSENT" as const, minutesLate: 0, excused: false })),
    ];
    const r = attendanceDeductions({ rule, monthlyGross: 50_000, workingDaysInMonth: 21, days });
    expect(r.items.slice(0, 4).map((i) => [i.date, i.type, i.amount])).toEqual([["2026-10-05", "LATENESS", 500], ["2026-10-06", "LATENESS", 500], ["2026-10-06", "EARLY_DEPARTURE", 500], ["2026-10-07", "EARLY_DEPARTURE", 500]]);
    expect(r.cap).toBeNull();
    expect(r.total).toBe(2_000 + 13 * 3_000); // no cap, even beyond the month's pay
  });
});
