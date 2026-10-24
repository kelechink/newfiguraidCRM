import { describe, expect, it } from "vitest";
import { extractJson, judgeRates } from "@/domain/finance/fx-research";

const today = "2026-10-24";

describe("AI-found exchange rates", () => {
  it("reads JSON even when the model wraps it in prose or fences", () => {
    expect(extractJson('Here you go:\n```json\n{"rates":[]}\n```')).toEqual({ rates: [] });
    expect(extractJson('Sure. {"rates":[{"currency":"USD"}]} Hope that helps')).toEqual({ rates: [{ currency: "USD" }] });
    expect(extractJson("no json here")).toBeNull();
  });

  it("uses a rate only when two recent sources agree, taking the median selling price", () => {
    const v = judgeRates(
      [
        { currency: "USD", buy: 1520, sell: 1540, source: "Nairametrics", publishedOn: "2026-10-24" },
        { currency: "USD", buy: 1525, sell: 1545, source: "BusinessDay", publishedOn: "2026-10-23" },
        { currency: "USD", buy: 1500, sell: 1900, source: "Random blog", publishedOn: "2026-10-24" }, // outlier dropped
        { currency: "EUR", buy: 1700, sell: 1720, source: "Punch", publishedOn: "2026-10-24" }, // single source
        { currency: "GBP", buy: 2000, sell: 2030, source: "Vanguard", publishedOn: "2026-09-01" }, // too old
        { currency: "GBP", buy: 2005, sell: 2035, source: "Vanguard ", publishedOn: "2026-10-24" }, // same outlet twice
      ],
      { USD: 1530 },
      today,
    );
    const usd = v.find((x) => x.currency === "USD")!;
    expect(usd).toMatchObject({ accepted: true, rate: 1542.5 });
    expect(usd.used.map((u) => u.source)).toEqual(["Nairametrics", "BusinessDay"]);
    expect(v.find((x) => x.currency === "EUR")).toMatchObject({ accepted: false, rate: null });
    expect(v.find((x) => x.currency === "GBP")!.accepted).toBe(false);
  });

  it("holds implausible jumps and nonsense values for Finance", () => {
    const jump = judgeRates([{ currency: "USD", buy: null, sell: 2100, source: "A" }, { currency: "USD", buy: null, sell: 2110, source: "B" }], { USD: 1550 }, today);
    expect(jump[0]).toMatchObject({ accepted: false, rate: 2105 });
    expect(jump[0]!.reason).toMatch(/more than 15%/);
    const silly = judgeRates([{ currency: "USD", buy: null, sell: 1.5, source: "A" }, { currency: "USD", buy: null, sell: 1.6, source: "B" }], {}, today);
    expect(silly[0]!.accepted).toBe(false);
  });
});
