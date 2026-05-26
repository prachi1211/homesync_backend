import { describe, it, expect } from "vitest";
import { getNextAssignee } from "../../../src/utils/choreRotation";

describe("getNextAssignee", () => {
  it("single participant always returns themselves", () => {
    expect(getNextAssignee("A", ["A"], {})).toBe("A");
  });

  it("advances to person with fewer completions", () => {
    // A has 2 completions, B has 1 → next should be B
    const next = getNextAssignee("A", ["A", "B", "C"], { A: 2, B: 1, C: 2 });
    expect(next).toBe("B");
  });

  it("round-robin when all tied: picks first person after current", () => {
    // All tied at 1 completion each; current is A → should pick B (next in queue)
    const next = getNextAssignee("A", ["A", "B", "C"], { A: 1, B: 1, C: 1 });
    expect(next).toBe("B");
  });

  it("wraps around the queue", () => {
    // All tied at 1; current is C (last) → should wrap to A (first)
    const next = getNextAssignee("C", ["A", "B", "C"], { A: 1, B: 1, C: 1 });
    expect(next).toBe("A");
  });

  it("full A→B→C→A cycle with equal completions", () => {
    const queue = ["A", "B", "C"];
    let current = "A";
    const counts: Record<string, number> = { A: 0, B: 0, C: 0 };

    // Complete one full cycle
    for (let i = 0; i < 6; i++) {
      counts[current]++;
      const next = getNextAssignee(current, queue, { ...counts });
      current = next;
    }

    // After 6 completions (2 each), should be back at A
    expect(current).toBe("A");
  });

  it("treats missing counts as 0", () => {
    // B hasn't completed anything (not in counts map) → B should go next
    const next = getNextAssignee("A", ["A", "B", "C"], { A: 1, C: 1 });
    expect(next).toBe("B");
  });
});
