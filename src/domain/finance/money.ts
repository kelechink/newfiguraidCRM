// Finance maths. Amounts are handled in kobo/cents (integers) to avoid float drift,
// then returned as 2-dp numbers for storage in Decimal columns.

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface LineInput {
  quantity: number;
  unitPrice: number;
  vatable: boolean;
}

export interface Totals {
  lines: number[];
  subtotal: number;
  vatAmount: number;
  total: number;
}

/** Invoice totals: VAT applies to vatable lines only, rounded once at the end (FIRS practice). */
export function invoiceTotals(lines: LineInput[], vatRatePct: number): Totals {
  const amounts = lines.map((l) => round2(l.quantity * l.unitPrice));
  const subtotal = round2(amounts.reduce((a, b) => a + b, 0));
  const vatable = amounts.reduce((sum, a, i) => sum + (lines[i]!.vatable ? a : 0), 0);
  const vatAmount = round2((vatable * vatRatePct) / 100);
  return { lines: amounts, subtotal, vatAmount, total: round2(subtotal + vatAmount) };
}

/** Convert to naira. Non-NGN amounts must carry the rate captured on the transaction. */
export function toNgn(amount: number, currency: string, fxRate: number | null | undefined): number {
  if (currency === "NGN") return round2(amount);
  if (!fxRate || fxRate <= 0) throw new Error(`An exchange rate is required for ${currency}`);
  return round2(amount * fxRate);
}

export type AgeBucket = "current" | "1-30" | "31-60" | "61-90" | "90+";
export const AGE_BUCKETS: AgeBucket[] = ["current", "1-30", "31-60", "61-90", "90+"];

export function ageBucket(dueDate: Date, asOf: Date): AgeBucket {
  const days = Math.floor((asOf.getTime() - dueDate.getTime()) / 86_400_000);
  if (days <= 0) return "current";
  if (days <= 30) return "1-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

export function ageing(items: { dueDate: Date; outstanding: number }[], asOf: Date): Record<AgeBucket, number> {
  const out = Object.fromEntries(AGE_BUCKETS.map((b) => [b, 0])) as Record<AgeBucket, number>;
  for (const i of items) out[ageBucket(i.dueDate, asOf)] = round2(out[ageBucket(i.dueDate, asOf)] + i.outstanding);
  return out;
}

export function invoiceStatusFor(total: number, paid: number, dueDate: Date, now: Date, current: string): string {
  if (current === "VOID" || current === "DRAFT") return current;
  if (paid >= total - 0.005) return "PAID";
  if (paid > 0) return dueDate < now ? "OVERDUE" : "PARTIALLY_PAID";
  return dueDate < now ? "OVERDUE" : current === "OVERDUE" ? "SENT" : current;
}

// ── cash-flow projection (Module M) ──────────────────────────────────────────

export type Scenario = "best" | "expected" | "worst";

export interface Flow {
  date: string; // YYYY-MM-DD
  amount: number; // + in, − out (NGN)
  kind: "receivable" | "pipeline" | "telecom_in" | "telecom_out" | "payroll" | "subscription" | "recurring" | "payable" | "topup";
  label: string;
  /** chance it happens on time (0–1); certain outflows are 1 */
  probability: number;
}

/** How each scenario treats uncertain money. Outflows are always taken at face value (prudent). */
const FACTOR: Record<Scenario, (f: Flow) => number> = {
  best: (f) => (f.amount >= 0 ? Math.min(1, f.probability * 1.25) : 1),
  expected: (f) => (f.amount >= 0 ? f.probability : 1),
  worst: (f) => (f.amount >= 0 ? (f.kind === "pipeline" ? f.probability * 0.5 : f.probability * 0.75) : 1.1),
};

export interface WeekPoint {
  weekStart: string;
  inflow: number;
  outflow: number;
  closing: number;
  belowMinimum: boolean;
}

export function projectCash(opening: number, flows: Flow[], scenario: Scenario, startDate: string, weeks: number, minimum: number): WeekPoint[] {
  const points: WeekPoint[] = [];
  let balance = opening;
  const start = Date.parse(`${startDate}T00:00:00Z`);
  for (let w = 0; w < weeks; w++) {
    const from = start + w * 7 * 86_400_000;
    const to = from + 7 * 86_400_000;
    let inflow = 0;
    let outflow = 0;
    for (const f of flows) {
      const t = Date.parse(`${f.date}T00:00:00Z`);
      const inWindow = w === 0 ? t < to : t >= from && t < to; // anything overdue lands in week one
      if (!inWindow) continue;
      const v = f.amount * FACTOR[scenario](f);
      if (v >= 0) inflow += v;
      else outflow += -v;
    }
    balance += inflow - outflow;
    points.push({ weekStart: new Date(from).toISOString().slice(0, 10), inflow: round2(inflow), outflow: round2(outflow), closing: round2(balance), belowMinimum: balance < minimum });
  }
  return points;
}
