import { AppError } from "./response";

export interface SplitInput {
  userId: string;
  amount?: number;
  percentage?: number;
}

export interface BuiltSplit {
  userId: string;
  amount: number;
  percentage: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildSplits(
  totalAmount: number,
  splitType: "EQUAL" | "PERCENTAGE" | "EXACT",
  rawSplits: SplitInput[]
): BuiltSplit[] {
  if (rawSplits.length === 0) {
    throw new AppError("VALIDATION_ERROR", "Select at least one participant");
  }

  if (splitType === "EQUAL") {
    const n = rawSplits.length;
    const share = round2(totalAmount / n);
    return rawSplits.map((s, i) => ({
      userId: s.userId,
      amount: i === 0 ? round2(totalAmount - share * (n - 1)) : share,
      percentage: round2(100 / n),
    }));
  }

  if (splitType === "PERCENTAGE") {
    const totalPct = rawSplits.reduce((sum, s) => sum + (s.percentage ?? 0), 0);
    if (Math.abs(totalPct - 100) > 0.01) {
      throw new AppError("PERCENTAGE_TOTAL_MISMATCH", "Percentages must sum to 100%");
    }
    return rawSplits.map((s) => ({
      userId: s.userId,
      amount: round2(((s.percentage ?? 0) / 100) * totalAmount),
      percentage: round2(s.percentage ?? 0),
    }));
  }

  // EXACT
  const totalExact = rawSplits.reduce((sum, s) => sum + (s.amount ?? 0), 0);
  if (Math.abs(totalExact - totalAmount) > 0.01) {
    throw new AppError(
      "SPLIT_TOTAL_MISMATCH",
      `Split amounts must sum to $${totalAmount.toFixed(2)} (got $${totalExact.toFixed(2)})`
    );
  }
  return rawSplits.map((s) => ({
    userId: s.userId,
    amount: round2(s.amount ?? 0),
    percentage: 0,
  }));
}
