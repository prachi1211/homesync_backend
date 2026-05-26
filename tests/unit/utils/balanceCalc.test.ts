import { describe, it, expect } from "vitest";
import { computeNetBalances, simplifyDebts } from "../../../src/utils/balanceCalc";

describe("computeNetBalances", () => {
  it("two-person equal split: payer is owed half", () => {
    const expenses = [
      { paid_by: "A", splits: [{ user_id: "A", amount: 50 }, { user_id: "B", amount: 50 }] },
    ];
    const net = computeNetBalances(expenses, []);
    expect(net["A"]).toBe(50);
    expect(net["B"]).toBe(-50);
  });

  it("settlement zeroes out balance", () => {
    const expenses = [
      { paid_by: "A", splits: [{ user_id: "A", amount: 50 }, { user_id: "B", amount: 50 }] },
    ];
    const settlements = [{ from_user_id: "B", to_user_id: "A", amount: 50 }];
    const net = computeNetBalances(expenses, settlements);
    expect(net["A"]).toBe(0);
    expect(net["B"]).toBe(0);
  });

  it("three-person split accumulates correctly", () => {
    const expenses = [
      { paid_by: "A", splits: [{ user_id: "A", amount: 34 }, { user_id: "B", amount: 33 }, { user_id: "C", amount: 33 }] },
    ];
    const net = computeNetBalances(expenses, []);
    expect(net["A"]).toBe(66);
    expect(net["B"]).toBe(-33);
    expect(net["C"]).toBe(-33);
  });

  it("all balances sum to zero", () => {
    const expenses = [
      { paid_by: "A", splits: [{ user_id: "A", amount: 34 }, { user_id: "B", amount: 33 }, { user_id: "C", amount: 33 }] },
      { paid_by: "B", splits: [{ user_id: "A", amount: 25 }, { user_id: "B", amount: 25 }, { user_id: "C", amount: 50 }] },
    ];
    const net = computeNetBalances(expenses, []);
    const total = Object.values(net).reduce((sum, v) => sum + v, 0);
    expect(Math.abs(total)).toBeLessThan(0.01);
  });
});

describe("simplifyDebts", () => {
  it("single debt pair", () => {
    const pairs = simplifyDebts({ A: 50, B: -50 });
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toEqual({ fromUserId: "B", toUserId: "A", amount: 50 });
  });

  it("merges transitive debts", () => {
    // A owes B $30, C owes B $20 — B should receive both
    const pairs = simplifyDebts({ A: -30, B: 50, C: -20 });
    const total = pairs.reduce((s, p) => s + p.amount, 0);
    expect(total).toBe(50);
    expect(pairs.every((p) => p.toUserId === "B")).toBe(true);
  });

  it("returns empty for zero balances", () => {
    expect(simplifyDebts({ A: 0, B: 0 })).toHaveLength(0);
  });
});
