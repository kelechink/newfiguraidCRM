// Payroll maths. Pure functions: the payroll service feeds in attendance facts,
// the policy and the (decrypted) pay, and stores the encrypted result.

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface Tier {
  fromMinutes: number;
  toMinutes: number | null; // null = no upper bound
  amount: number;
}

export interface PolicyRule {
  latenessMode: "FIXED" | "TIERED";
  fixedAmount: number | null;
  tiers: Tier[];
  absenceMode: "DAILY_RATE" | "FIXED";
  absenceAmount: number | null;
  monthlyCapAmount: number | null;
  monthlyCapPct: number | null;
}

/** Charge for one late day. Tiers are inclusive ranges of minutes late. */
export function latenessCharge(rule: PolicyRule, minutesLate: number): { amount: number; label: string } {
  if (minutesLate <= 0) return { amount: 0, label: "" };
  if (rule.latenessMode === "FIXED") return { amount: r2(rule.fixedAmount ?? 0), label: "flat rate" };
  const tier = [...rule.tiers].sort((a, b) => a.fromMinutes - b.fromMinutes).find((t) => minutesLate >= t.fromMinutes && (t.toMinutes == null || minutesLate <= t.toMinutes));
  if (!tier) return { amount: 0, label: "below first tier" };
  return { amount: r2(tier.amount), label: tier.toMinutes == null ? `tier ${tier.fromMinutes}+ min` : `tier ${tier.fromMinutes}–${tier.toMinutes} min` };
}

/** Charge for an unexcused absence: a day's pay (gross ÷ working days in the month) or a fixed sum. */
export function absenceCharge(rule: PolicyRule, monthlyGross: number, workingDaysInMonth: number): number {
  if (rule.absenceMode === "FIXED") return r2(rule.absenceAmount ?? 0);
  return workingDaysInMonth > 0 ? r2(monthlyGross / workingDaysInMonth) : 0;
}

/** The lower of the amount cap and the percentage-of-gross cap; null when neither is set. */
export function monthlyCap(rule: PolicyRule, monthlyGross: number): number | null {
  const caps = [rule.monthlyCapAmount, rule.monthlyCapPct != null ? (monthlyGross * rule.monthlyCapPct) / 100 : null].filter((c): c is number => c != null && c >= 0);
  return caps.length ? r2(Math.min(...caps)) : null;
}

export interface DayFact {
  date: string; // YYYY-MM-DD
  dayId?: string;
  status: "PRESENT" | "LATE" | "ABSENT" | "ON_LEAVE" | "HOLIDAY" | "WEEKEND" | "PENDING";
  minutesLate: number;
  excused: boolean; // an approved excuse covers this day
}

export interface DeductionLine {
  date: string;
  dayId?: string;
  type: "LATENESS" | "ABSENCE";
  amount: number;
  reason: string;
  status: "active" | "capped";
}

const dayLabel = (iso: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));

/**
 * Attendance deductions for a month. Leave, holidays, weekends and days with an approved
 * excuse are never charged; the monthly cap is applied in date order.
 */
export function attendanceDeductions(input: { rule: PolicyRule; monthlyGross: number; workingDaysInMonth: number; days: DayFact[] }) {
  const { rule, monthlyGross, workingDaysInMonth } = input;
  const raw: DeductionLine[] = [];
  for (const d of [...input.days].sort((a, b) => a.date.localeCompare(b.date))) {
    if (d.excused) continue;
    if (d.status === "LATE") {
      const c = latenessCharge(rule, d.minutesLate);
      if (c.amount > 0) raw.push({ date: d.date, dayId: d.dayId, type: "LATENESS", amount: c.amount, reason: `Late ${d.minutesLate} min on ${dayLabel(d.date)} (${c.label})`, status: "active" });
    } else if (d.status === "ABSENT") {
      const amount = absenceCharge(rule, monthlyGross, workingDaysInMonth);
      if (amount > 0) raw.push({ date: d.date, dayId: d.dayId, type: "ABSENCE", amount, reason: `Absent without approved leave or excuse on ${dayLabel(d.date)}`, status: "active" });
    }
  }
  const cap = monthlyCap(rule, monthlyGross);
  const uncapped = r2(raw.reduce((n, l) => n + l.amount, 0));
  if (cap == null || uncapped <= cap) return { items: raw, total: uncapped, uncapped, cap };
  let left = cap;
  const items = raw.map((l) => {
    if (left >= l.amount) {
      left = r2(left - l.amount);
      return l;
    }
    const amount = r2(Math.max(0, left));
    left = 0;
    return { ...l, amount, status: "capped" as const, reason: `${l.reason} — reduced by the monthly cap` };
  });
  return { items, total: cap, uncapped, cap };
}

/** Working days in a month: the staff member's working weekdays, minus public holidays. */
export function workingDaysInMonth(month: string, workingDays: number[], holidays: Set<string>): string[] {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const out: string[] = [];
  for (let d = new Date(Date.UTC(y, m - 1, 1)); d.getUTCMonth() === m - 1; d = new Date(d.getTime() + 86_400_000)) {
    const iso = d.toISOString().slice(0, 10);
    const wd = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
    if (workingDays.includes(wd) && !holidays.has(iso)) out.push(iso);
  }
  return out;
}

// ── statutory (Nigeria Tax Act 2025, effective 1 Jan 2026) ───────────────────

/** Annual PAYE bands on chargeable income. Verify against current FIRS/State IRS guidance before go-live. */
export const PAYE_BANDS: { upTo: number | null; rate: number }[] = [
  { upTo: 800_000, rate: 0 },
  { upTo: 3_000_000, rate: 0.15 },
  { upTo: 12_000_000, rate: 0.18 },
  { upTo: 25_000_000, rate: 0.21 },
  { upTo: 50_000_000, rate: 0.23 },
  { upTo: null, rate: 0.25 },
];

export function annualPaye(chargeable: number): number {
  let tax = 0;
  let floor = 0;
  for (const b of PAYE_BANDS) {
    if (chargeable <= floor) break;
    const top = b.upTo ?? Infinity;
    tax += (Math.min(chargeable, top) - floor) * b.rate;
    floor = top;
  }
  return r2(tax);
}

export interface PayInput {
  base: number; // monthly basic
  allowances: { name: string; amount: number; pensionable?: boolean }[];
  bonuses: { name: string; amount: number }[];
  attendance: number; // total attendance deductions this month
  other: { name: string; amount: number }[]; // advances, loans
  statutory: { payeEnabled: boolean; pensionPct: number; nhfPct: number; annualRentRelief?: number };
  /** Fraction of the month paid (joiners and leavers). 1 = full month. */
  proRata?: number;
}

export interface Breakdown {
  base: number;
  allowances: { name: string; amount: number }[];
  bonuses: { name: string; amount: number }[];
  gross: number;
  statutory: { name: string; amount: number }[];
  deductions: { name: string; amount: number }[];
  totalDeductions: number;
  net: number;
  proRata: number;
}

/** One month's payslip. Pension and NHF reduce chargeable income for PAYE. Net never goes below zero. */
export function payslip(p: PayInput): Breakdown {
  const k = p.proRata ?? 1;
  const base = r2(p.base * k);
  const allowances = p.allowances.map((a) => ({ name: a.name, amount: r2(a.amount * k), pensionable: a.pensionable ?? /housing|transport/i.test(a.name) }));
  const bonuses = p.bonuses.map((b) => ({ name: b.name, amount: r2(b.amount) }));
  const gross = r2(base + allowances.reduce((n, a) => n + a.amount, 0) + bonuses.reduce((n, b) => n + b.amount, 0));
  const pensionable = base + allowances.filter((a) => a.pensionable).reduce((n, a) => n + a.amount, 0);
  const pension = r2((pensionable * p.statutory.pensionPct) / 100);
  const nhf = r2((base * p.statutory.nhfPct) / 100);
  const relief = (p.statutory.annualRentRelief ?? 0) / 12;
  const paye = p.statutory.payeEnabled ? r2(annualPaye(Math.max(0, (gross - pension - nhf - relief) * 12)) / 12) : 0;
  const statutory = [
    ...(paye > 0 ? [{ name: "PAYE", amount: paye }] : []),
    ...(pension > 0 ? [{ name: `Pension (${p.statutory.pensionPct}%)`, amount: pension }] : []),
    ...(nhf > 0 ? [{ name: `NHF (${p.statutory.nhfPct}%)`, amount: nhf }] : []),
  ];
  const deductions = [...(p.attendance > 0 ? [{ name: "Lateness & absence", amount: r2(p.attendance) }] : []), ...p.other.filter((o) => o.amount > 0).map((o) => ({ name: o.name, amount: r2(o.amount) }))];
  const totalDeductions = r2(statutory.reduce((n, s) => n + s.amount, 0) + deductions.reduce((n, d) => n + d.amount, 0));
  return { base, allowances: allowances.map(({ name, amount }) => ({ name, amount })), bonuses, gross, statutory, deductions, totalDeductions, net: r2(Math.max(0, gross - totalDeductions)), proRata: k };
}

/** Share of the month's working days a joiner or leaver was employed for. */
export function proRataFraction(workingDays: string[], from: string | null, to: string | null): number {
  if (!workingDays.length) return 0;
  const covered = workingDays.filter((d) => (!from || d >= from) && (!to || d <= to)).length;
  return Math.round((covered / workingDays.length) * 10_000) / 10_000;
}
