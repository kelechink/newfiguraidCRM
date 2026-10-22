import { describe, expect, it } from "vitest";
import { initialRanks, rankBetween } from "@/domain/shared/rank";

describe("rankBetween", () => {
  it("sorts strictly between its neighbours", () => {
    const a = rankBetween(null, null);
    const b = rankBetween(a, null);
    const mid = rankBetween(a, b);
    expect(a < mid && mid < b).toBe(true);
    expect(rankBetween(null, a) < a).toBe(true);
  });

  it("keeps order across many random inserts", () => {
    let list = initialRanks(3);
    let seed = 42;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 500; i++) {
      const at = Math.floor(rand() * (list.length + 1));
      const r = rankBetween(list[at - 1] ?? null, list[at] ?? null);
      list = [...list.slice(0, at), r, ...list.slice(at)];
    }
    expect([...list].sort()).toEqual(list);
    expect(new Set(list).size).toBe(list.length);
  });

  it("survives repeated inserts at the top of a column", () => {
    let top = rankBetween(null, null);
    for (let i = 0; i < 200; i++) {
      const next = rankBetween(null, top);
      expect(next < top).toBe(true);
      top = next;
    }
  });

  it("rejects out-of-order or malformed neighbours", () => {
    expect(() => rankBetween("b", "a")).toThrow();
    expect(() => rankBetween("a0", null)).toThrow();
    expect(() => rankBetween("a!", null)).toThrow();
  });
});
