import { describe, it, expect } from "vitest";
import { buildSplits } from "../../../src/utils/splitBuilder";

describe("buildSplits — EQUAL", () => {
  it("two-person equal split", () => {
    const splits = buildSplits(100, "EQUAL", [{ userId: "A" }, { userId: "B" }]);
    expect(splits[0].amount + splits[1].amount).toBe(100);
    expect(splits[0].amount).toBe(50);
    expect(splits[1].amount).toBe(50);
  });

  it("three-person with rounding remainder on first", () => {
    const splits = buildSplits(10, "EQUAL", [{ userId: "A" }, { userId: "B" }, { userId: "C" }]);
    const total = splits.reduce((s, sp) => s + sp.amount, 0);
    expect(total).toBe(10);
    // A gets remainder: 10 - 3.33 * 2 = 3.34
    expect(splits[0].amount).toBe(3.34);
    expect(splits[1].amount).toBe(3.33);
    expect(splits[2].amount).toBe(3.33);
  });
});

describe("buildSplits — PERCENTAGE", () => {
  it("70/30 split", () => {
    const splits = buildSplits(200, "PERCENTAGE", [
      { userId: "A", percentage: 70 },
      { userId: "B", percentage: 30 },
    ]);
    expect(splits[0].amount).toBe(140);
    expect(splits[1].amount).toBe(60);
  });

  it("throws when percentages don't sum to 100", () => {
    expect(() =>
      buildSplits(100, "PERCENTAGE", [{ userId: "A", percentage: 60 }, { userId: "B", percentage: 30 }])
    ).toThrow("Percentages must sum to 100%");
  });
});

describe("buildSplits — EXACT", () => {
  it("valid exact split", () => {
    const splits = buildSplits(150, "EXACT", [
      { userId: "A", amount: 100 },
      { userId: "B", amount: 50 },
    ]);
    expect(splits[0].amount).toBe(100);
    expect(splits[1].amount).toBe(50);
  });

  it("throws when amounts don't match total", () => {
    expect(() =>
      buildSplits(100, "EXACT", [{ userId: "A", amount: 60 }, { userId: "B", amount: 30 }])
    ).toThrow("Split amounts must sum to");
  });
});
