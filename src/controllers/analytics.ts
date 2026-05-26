import type { Request, Response, NextFunction } from "express";
import type { ExpenseCategory } from "@prisma/client";
import { prisma } from "../config/database";
import { success } from "../utils/response";

const catReverseMap: Record<ExpenseCategory, string> = {
  GROCERIES: "Groceries", UTILITIES: "Utilities", RENT: "Rent", DINING: "Dining",
  TRANSPORT: "Transport", ENTERTAINMENT: "Entertainment", HEALTHCARE: "Healthcare",
  HOUSEHOLD: "Household", OTHER: "Other",
};

const p = (v: string | string[]): string => (Array.isArray(v) ? v[0] : v);

export async function getChoreAnalytics(req: Request, res: Response, next: NextFunction) {
  try {
    const hid = p(req.params.hid);

    const members = await prisma.householdMember.findMany({
      where: { household_id: hid },
      include: { user: { select: { name: true } } },
    });

    // Only Fixed + Rotating chores (exclude Personal) for fairness
    const sharedChores = await prisma.chore.findMany({
      where: { household_id: hid, assignment_type: { in: ["FIXED", "ROTATING"] } },
      select: { id: true },
    });
    const sharedIds = new Set(sharedChores.map((c) => c.id));

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const completions = await prisma.choreCompletionLog.findMany({
      where: { household_id: hid, completed_at: { gte: thirtyDaysAgo } },
    });

    const completionsPerMember = members.map((m) => ({
      userId: m.user_id,
      name: m.user.name.split(" ")[0],
      count: completions.filter(
        (c) => c.completed_by === m.user_id && sharedIds.has(c.chore_id)
      ).length,
    })).sort((a, b) => b.count - a.count);

    success(res, {
      completionsPerMember,
      totalCompletions: completions.filter((c) => sharedIds.has(c.chore_id)).length,
    });
  } catch (err) {
    next(err);
  }
}

export async function getExpenseAnalytics(req: Request, res: Response, next: NextFunction) {
  try {
    const hid = p(req.params.hid);
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const expenses = await prisma.expense.findMany({
      where: { household_id: hid, date: { gte: sixMonthsAgo } },
    });

    // Monthly totals
    const monthlyMap: Record<string, number> = {};
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthlyMap[key] = 0;
    }
    expenses.forEach((e) => {
      const key = `${e.date.getFullYear()}-${String(e.date.getMonth() + 1).padStart(2, "0")}`;
      if (monthlyMap[key] !== undefined) monthlyMap[key] += e.amount.toNumber();
    });
    const monthlySpending = Object.entries(monthlyMap)
      .map(([month, total]) => ({ month, total: Math.round(total * 100) / 100 }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // Category breakdown (this month)
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonthExpenses = expenses.filter((e) => e.date >= thisMonthStart);
    const categoryMap: Record<string, number> = {};
    thisMonthExpenses.forEach((e) => {
      const cat = catReverseMap[e.category] ?? e.category.toString();
      categoryMap[cat] = (categoryMap[cat] ?? 0) + e.amount.toNumber();
    });
    const categoryBreakdown = Object.entries(categoryMap)
      .map(([category, total]) => ({ category, total: Math.round(total * 100) / 100 }))
      .sort((a, b) => b.total - a.total);

    const thisMonthTotal = thisMonthExpenses.reduce((sum, e) => sum + e.amount.toNumber(), 0);

    success(res, {
      monthlySpending,
      categoryBreakdown,
      thisMonthTotal: Math.round(thisMonthTotal * 100) / 100,
    });
  } catch (err) {
    next(err);
  }
}
