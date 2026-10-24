import { describe, expect, it } from "vitest";
import { asrAcd, billedMinutesAggregate, billSeconds, creditState, cycleFor, dueDateFor, lastClosedCycle, marginAlert, matchPrefix, parseCdr, parseRateDeck, rate, rateAt } from "@/domain/telecom/rating";

describe("billing increments", () => {
  it("charges the first block in full, then each started block", () => {
    expect(billSeconds(0, 60, 60)).toBe(0);
    expect(billSeconds(1, 60, 60)).toBe(60);
    expect(billSeconds(61, 60, 60)).toBe(120);
    expect(billSeconds(61, 30, 30)).toBe(90);
    expect(billSeconds(61, 1, 1)).toBe(61);
    expect(billSeconds(5, 30, 6)).toBe(30);
    expect(billSeconds(31, 30, 6)).toBe(36);
  });

  it("rates aggregated traffic per average call; 1/1 is exact", () => {
    expect(billedMinutesAggregate(6000, 100, 1, 1)).toBe(100);
    expect(billedMinutesAggregate(6100, 100, 60, 60)).toBe(200); // 61s average → 2 min each
    expect(billedMinutesAggregate(90, null, 60, 60)).toBe(2);
  });
});

describe("rating", () => {
  const rates = [
    { id: "a", ratePerMin: 0.05, effectiveFrom: new Date("2026-10-01T00:00:00Z"), effectiveTo: new Date("2026-10-15T00:00:00Z") },
    { id: "b", ratePerMin: 0.06, effectiveFrom: new Date("2026-10-15T00:00:00Z"), effectiveTo: null },
  ];
  it("uses the rate in force at the traffic time", () => {
    expect(rateAt(rates, new Date("2026-10-14T23:59:59Z"))!.id).toBe("a");
    expect(rateAt(rates, new Date("2026-10-15T00:00:00Z"))!.id).toBe("b");
    expect(rateAt(rates, new Date("2026-09-30T00:00:00Z"))).toBeNull();
  });

  it("computes cost, revenue and margin, and alerts on thin or negative margin", () => {
    const r = rate(1000, 0.05, 1000, 0.052);
    expect(r).toEqual({ cost: 50, revenue: 52, margin: 2, marginPct: 3.85 });
    expect(marginAlert(r, 2)).toBeNull();
    expect(marginAlert(rate(1000, 0.05, 1000, 0.0505), 2)).toBe("thin");
    expect(marginAlert(rate(1000, 0.05, 1000, 0.049), 2)).toBe("negative");
    expect(asrAcd(200, 90, 27000)).toEqual({ asr: 45, acd: 5 });
  });
});

describe("cycles and credit", () => {
  it("finds 7/3 cycles from the anchor and the due date", () => {
    const anchor = new Date("2026-10-05T00:00:00Z"); // a Monday
    const c = cycleFor(anchor, 7, new Date("2026-10-21T13:00:00Z"));
    expect(c.start.toISOString().slice(0, 10)).toBe("2026-10-19");
    expect(c.end.toISOString().slice(0, 10)).toBe("2026-10-26");
    const last = lastClosedCycle(anchor, 7, new Date("2026-10-21T13:00:00Z"));
    expect(last.start.toISOString().slice(0, 10)).toBe("2026-10-12");
    expect(dueDateFor(last.end, 3).toISOString().slice(0, 10)).toBe("2026-10-22");
  });

  it("warns at 80% of the credit limit and blocks at 100%", () => {
    expect(creditState(7_000, 10_000)).toBe("ok");
    expect(creditState(8_000, 10_000)).toBe("warning");
    expect(creditState(10_000, 10_000)).toBe("over");
    expect(creditState(1e9, null)).toBe("ok");
  });
});

describe("files", () => {
  it("parses rate decks with aliases, and reports bad lines", () => {
    const { rows, errors } = parseRateDeck('Code,Destination,Rate,Effective Date\n234803,"Nigeria, MTN",0.0520,2026-11-01\n234805,Nigeria Glo,abc,\n234803,dup,0.1,\n');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ prefix: "234803", destination: "Nigeria, MTN", ratePerMin: 0.052 });
    expect(rows[0]!.effectiveFrom!.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(errors.map((e) => e.line)).toEqual([3, 4]);
    expect(parseRateDeck("destination,price\nx,1").errors[0]!.message).toMatch(/prefix/);
  });

  it("parses CDRs and matches the longest prefix", () => {
    const { rows, errors } = parseCdr("start_time,called_number,billsec\n2026-10-20T10:00:00Z,+2348031234567,65\n2026-10-20T10:01:00Z,123,10\n");
    expect(rows).toEqual([{ line: 2, startedAt: new Date("2026-10-20T10:00:00Z"), dialled: "2348031234567", seconds: 65 }]);
    expect(errors).toEqual([{ line: 3, message: "Bad dialled number" }]);
    const routes = [{ prefix: "234" }, { prefix: "234803" }, { prefix: "2348" }];
    expect(matchPrefix("002348031234567", routes)!.prefix).toBe("234803");
    expect(matchPrefix("4420", routes)).toBeNull();
  });
});
