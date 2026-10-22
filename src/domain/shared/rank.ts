// Fractional indexing for drag-and-drop ordering. A rank is a base-62 digit
// string read as a fraction in (0, 1); `rankBetween(a, b)` returns a string
// that sorts strictly between a and b, so a move rewrites one row only.
// Digits are in ASCII order, so a plain JS string comparison gives the right
// order. Don't ORDER BY rank in Postgres: locale collations ignore case.

const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function midpoint(a: string, b: string | null): string {
  if (b !== null) {
    let n = 0;
    while ((a[n] ?? "0") === b[n]) n++;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }
  const digitA = a ? DIGITS.indexOf(a[0]!) : 0;
  const digitB = b !== null ? DIGITS.indexOf(b[0]!) : DIGITS.length;
  if (digitB - digitA > 1) return DIGITS[Math.round((digitA + digitB) / 2)]!;
  if (b !== null && b.length > 1) return b.slice(0, 1);
  return DIGITS[digitA]! + midpoint(a.slice(1), null);
}

function assertValid(rank: string) {
  if (!rank || rank.endsWith("0") || [...rank].some((c) => !DIGITS.includes(c))) {
    throw new Error(`Invalid rank "${rank}"`);
  }
}

/** Rank strictly between `before` and `after`; null means the start / end of the list. */
export function rankBetween(before: string | null, after: string | null): string {
  if (before !== null) assertValid(before);
  if (after !== null) assertValid(after);
  if (before !== null && after !== null && before >= after) {
    throw new Error(`rankBetween: "${before}" must sort before "${after}"`);
  }
  return midpoint(before ?? "", after);
}

/** `count` evenly-spaced ascending ranks, for seeding or rebalancing a column. */
export function initialRanks(count: number): string[] {
  const ranks: string[] = [];
  let prev: string | null = null;
  for (let i = 0; i < count; i++) {
    prev = rankBetween(prev, null);
    ranks.push(prev);
  }
  return ranks;
}
