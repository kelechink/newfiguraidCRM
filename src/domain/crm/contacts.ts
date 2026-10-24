// Contact helpers: normalisation for matching, lead scoring and duplicate detection.

/** Nigerian-first E.164: "0803 123 4567", "234803…", "+234 803…" → "+2348031234567". */
export function normalizePhone(raw: string | null | undefined, defaultCountry = "234"): string | null {
  if (!raw) return null;
  const hasPlus = raw.trim().startsWith("+");
  let d = raw.replace(/\D/g, "");
  if (!d) return null;
  if (hasPlus) return d.length >= 8 && d.length <= 15 ? `+${d}` : null;
  if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0") && d.length === 11) d = defaultCountry + d.slice(1);
  else if (d.length === 10 && /^[789]/.test(d)) d = defaultCountry + d;
  return d.length >= 8 && d.length <= 15 ? `+${d}` : null;
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  const e = raw?.trim().toLowerCase();
  return e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

export function displayName(first?: string | null, last?: string | null, fallback?: string | null): string {
  const n = [first, last].filter(Boolean).join(" ").trim();
  return n || fallback?.trim() || "Unnamed contact";
}

// ── lead scoring (0–100): activity, source and budget ─────────────────────────

const SOURCE_POINTS: Record<string, number> = {
  REFERRAL: 25,
  TENDER: 25,
  WALK_IN: 20,
  PHONE: 18,
  WHATSAPP: 15,
  EMAIL: 15,
  FORM: 15,
  WEBCHAT: 12,
  LINKEDIN: 12,
  META_AD: 10,
  INSTAGRAM: 8,
  FACEBOOK: 8,
  SMS: 8,
  IMPORT: 3,
  OTHER: 5,
};

export interface ScoreInput {
  source: string | null;
  budgetNgn: number | null;
  activities30d: number; // touches in the last 30 days
  inboundMessages30d: number; // they wrote to us
  daysSinceLastActivity: number | null;
  hasOpenDeal: boolean;
}

export function leadScore(s: ScoreInput): number {
  let score = SOURCE_POINTS[s.source ?? "OTHER"] ?? 5; // up to 25
  score += Math.min(25, s.activities30d * 4); // engagement, up to 25
  score += Math.min(15, s.inboundMessages30d * 5); // they reached out, up to 15
  const b = s.budgetNgn ?? 0; // up to 25
  score += b >= 10_000_000 ? 25 : b >= 2_000_000 ? 20 : b >= 500_000 ? 14 : b >= 100_000 ? 8 : b > 0 ? 4 : 0;
  if (s.hasOpenDeal) score += 10;
  if (s.daysSinceLastActivity !== null && s.daysSinceLastActivity > 30) score -= Math.min(20, Math.floor((s.daysSinceLastActivity - 30) / 7) * 4); // decay
  return Math.max(0, Math.min(100, score));
}

export function scoreBand(score: number): "hot" | "warm" | "cold" {
  return score >= 60 ? "hot" : score >= 30 ? "warm" : "cold";
}

// ── duplicate detection ──────────────────────────────────────────────────────

export interface Matchable {
  id: string;
  displayName: string;
  emailNormalized: string | null;
  phoneE164: string | null;
}

/** Same email or phone = definite; very similar name in the same unit = possible. */
export function duplicateReason(a: Matchable, b: Matchable): "email" | "phone" | "name" | null {
  if (a.id === b.id) return null;
  if (a.emailNormalized && a.emailNormalized === b.emailNormalized) return "email";
  if (a.phoneE164 && a.phoneE164 === b.phoneE164) return "phone";
  const na = a.displayName.toLowerCase().replace(/[^a-z]/g, "");
  const nb = b.displayName.toLowerCase().replace(/[^a-z]/g, "");
  if (na.length >= 6 && na === nb) return "name";
  return null;
}
