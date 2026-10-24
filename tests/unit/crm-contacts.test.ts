import { describe, expect, it } from "vitest";
import { duplicateReason, leadScore, normalizeEmail, normalizePhone, scoreBand } from "@/domain/crm/contacts";

describe("normalizePhone", () => {
  it("turns Nigerian formats into E.164", () => {
    expect(normalizePhone("0803 123 4567")).toBe("+2348031234567");
    expect(normalizePhone("2348031234567")).toBe("+2348031234567");
    expect(normalizePhone("+234 (803) 123-4567")).toBe("+2348031234567");
    expect(normalizePhone("8031234567")).toBe("+2348031234567");
    expect(normalizePhone("00447700900123")).toBe("+447700900123");
    expect(normalizePhone("+44 7700 900123")).toBe("+447700900123");
  });
  it("rejects junk", () => {
    expect(normalizePhone("call me")).toBeNull();
    expect(normalizePhone("123")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });
});

describe("normalizeEmail", () => {
  it("lower-cases and validates", () => {
    expect(normalizeEmail("  Ada@FigureWeb.NG ")).toBe("ada@figureweb.ng");
    expect(normalizeEmail("not-an-email")).toBeNull();
  });
});

describe("leadScore", () => {
  it("rewards referrals, engagement and budget, and decays when cold", () => {
    const hot = leadScore({ source: "REFERRAL", budgetNgn: 5_000_000, activities30d: 5, inboundMessages30d: 2, daysSinceLastActivity: 1, hasOpenDeal: true });
    const cold = leadScore({ source: "IMPORT", budgetNgn: null, activities30d: 0, inboundMessages30d: 0, daysSinceLastActivity: 120, hasOpenDeal: false });
    expect(hot).toBeGreaterThanOrEqual(80);
    expect(scoreBand(hot)).toBe("hot");
    expect(cold).toBe(0);
    expect(leadScore({ source: "WHATSAPP", budgetNgn: 0, activities30d: 99, inboundMessages30d: 99, daysSinceLastActivity: 0, hasOpenDeal: true })).toBeLessThanOrEqual(100);
  });
});

describe("duplicateReason", () => {
  const base = { id: "a", displayName: "Ngozi Eze", emailNormalized: "ngozi@x.ng", phoneE164: "+2348031234567" };
  it("matches on email, then phone, then identical names", () => {
    expect(duplicateReason(base, { ...base, id: "b" })).toBe("email");
    expect(duplicateReason(base, { ...base, id: "b", emailNormalized: null })).toBe("phone");
    expect(duplicateReason(base, { id: "b", displayName: "ngozi  eze", emailNormalized: null, phoneE164: null })).toBe("name");
    expect(duplicateReason(base, { id: "b", displayName: "Ngozi Okafor", emailNormalized: null, phoneE164: null })).toBeNull();
    expect(duplicateReason(base, base)).toBeNull();
  });
});
