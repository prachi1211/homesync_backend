import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import type { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../config/database";
import { buildSplits } from "../utils/splitBuilder";
import { computeNetBalances, simplifyDebts } from "../utils/balanceCalc";
import { success, AppError, notFound } from "../utils/response";
import type { ExpenseCategory, SplitType } from "@prisma/client";

const categoryValues = [
  "Groceries", "Utilities", "Rent", "Dining", "Transport",
  "Entertainment", "Healthcare", "Household", "Other",
] as const;
const splitTypeValues = ["Equal", "Percentage", "Exact"] as const;

const catMap: Record<string, ExpenseCategory> = {
  Groceries: "GROCERIES", Utilities: "UTILITIES", Rent: "RENT", Dining: "DINING",
  Transport: "TRANSPORT", Entertainment: "ENTERTAINMENT", Healthcare: "HEALTHCARE",
  Household: "HOUSEHOLD", Other: "OTHER",
};
const catReverseMap: Record<ExpenseCategory, string> = {
  GROCERIES: "Groceries", UTILITIES: "Utilities", RENT: "Rent", DINING: "Dining",
  TRANSPORT: "Transport", ENTERTAINMENT: "Entertainment", HEALTHCARE: "Healthcare",
  HOUSEHOLD: "Household", OTHER: "Other",
};
const splitMap: Record<string, SplitType> = {
  Equal: "EQUAL", Percentage: "PERCENTAGE", Exact: "EXACT",
};
const splitReverseMap: Record<SplitType, string> = {
  EQUAL: "Equal", PERCENTAGE: "Percentage", EXACT: "Exact",
};

function toNum(v: Decimal | number): number {
  return typeof v === "number" ? v : v.toNumber();
}

function serializeExpense(e: {
  id: string; household_id: string; description: string; amount: Decimal | number;
  category: ExpenseCategory; date: Date; paid_by: string; split_type: SplitType;
  notes: string; created_by: string; created_at: Date;
  splits?: { id: string; user_id: string; amount: Decimal | number; percentage: Decimal | number }[];
}) {
  return {
    id: e.id,
    householdId: e.household_id,
    description: e.description,
    amount: toNum(e.amount),
    category: catReverseMap[e.category],
    date: e.date.toISOString().slice(0, 10),
    paidBy: e.paid_by,
    splitType: splitReverseMap[e.split_type],
    notes: e.notes,
    createdBy: e.created_by,
    createdAt: e.created_at,
    splits: e.splits?.map((s) => ({
      id: s.id,
      userId: s.user_id,
      amount: toNum(s.amount),
      percentage: toNum(s.percentage),
    })) ?? [],
  };
}

function serializeSettlement(s: {
  id: string; household_id: string; from_user_id: string; to_user_id: string;
  amount: Decimal | number; note: string; created_by: string; created_at: Date;
}) {
  return {
    id: s.id,
    householdId: s.household_id,
    fromUserId: s.from_user_id,
    toUserId: s.to_user_id,
    amount: toNum(s.amount),
    note: s.note,
    createdBy: s.created_by,
    createdAt: s.created_at,
  };
}

export async function getExpenses(req: Request, res: Response, next: NextFunction) {
  try {
    const { hid } = req.params as Record<string, string>;
    const expenses = await prisma.expense.findMany({
      where: { household_id: hid },
      include: { splits: true },
      orderBy: [{ date: "desc" }, { created_at: "desc" }],
    });
    success(res, { expenses: expenses.map(serializeExpense) });
  } catch (err) {
    next(err);
  }
}

const splitInputSchema = z.object({
  userId: z.string().uuid(),
  amount: z.number().optional(),
  percentage: z.number().optional(),
});

export const addExpenseSchema = z.object({
  description: z.string().min(1, "Description is required").max(255).trim(),
  amount: z.number().positive("Amount must be greater than 0"),
  category: z.enum(categoryValues),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(() => new Date().toISOString().slice(0, 10)),
  paidBy: z.string().uuid(),
  splitType: z.enum(splitTypeValues),
  splits: z.array(splitInputSchema).min(1, "Select at least one participant"),
  notes: z.string().default(""),
});

export async function addExpense(req: Request, res: Response, next: NextFunction) {
  try {
    const { hid } = req.params as Record<string, string>;
    const body = req.body as z.infer<typeof addExpenseSchema>;
    const builtSplits = buildSplits(
      body.amount,
      splitMap[body.splitType] as "EQUAL" | "PERCENTAGE" | "EXACT",
      body.splits
    );

    const expense = await prisma.expense.create({
      data: {
        household_id: hid,
        description: body.description,
        amount: body.amount,
        category: catMap[body.category],
        date: new Date(body.date),
        paid_by: body.paidBy,
        split_type: splitMap[body.splitType],
        notes: body.notes,
        created_by: req.user!.id,
        splits: {
          create: builtSplits.map((s) => ({
            user_id: s.userId,
            amount: s.amount,
            percentage: s.percentage,
          })),
        },
      },
      include: { splits: true },
    });

    success(res, { expense: serializeExpense(expense) }, 201);
  } catch (err) {
    next(err);
  }
}

export const updateExpenseSchema = z.object({
  description: z.string().min(1).max(255).trim().optional(),
  amount: z.number().positive().optional(),
  category: z.enum(categoryValues).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  paidBy: z.string().uuid().optional(),
  splitType: z.enum(splitTypeValues).optional(),
  splits: z.array(splitInputSchema).optional(),
  notes: z.string().optional(),
});

export async function updateExpense(req: Request, res: Response, next: NextFunction) {
  try {
    const { hid, id } = req.params as Record<string, string>;
    const body = req.body as z.infer<typeof updateExpenseSchema>;

    const existing = await prisma.expense.findFirst({
      where: { id, household_id: hid },
      include: { splits: true },
    });
    if (!existing) throw notFound("Expense");

    const amount = body.amount ?? toNum(existing.amount);
    const splitType = (body.splitType ? splitMap[body.splitType] : existing.split_type) as "EQUAL" | "PERCENTAGE" | "EXACT";
    const rawSplits = body.splits ?? existing.splits.map((s) => ({
      userId: s.user_id,
      amount: toNum(s.amount),
      percentage: toNum(s.percentage),
    }));

    const builtSplits = buildSplits(amount, splitType, rawSplits);

    await prisma.$transaction(async (tx) => {
      await tx.expenseSplit.deleteMany({ where: { expense_id: id } });
      await tx.expense.update({
        where: { id },
        data: {
          ...(body.description && { description: body.description }),
          ...(body.amount && { amount: body.amount }),
          ...(body.category && { category: catMap[body.category] }),
          ...(body.date && { date: new Date(body.date) }),
          ...(body.paidBy && { paid_by: body.paidBy }),
          ...(body.splitType && { split_type: splitMap[body.splitType] }),
          ...(body.notes !== undefined && { notes: body.notes }),
          splits: {
            create: builtSplits.map((s) => ({
              user_id: s.userId,
              amount: s.amount,
              percentage: s.percentage,
            })),
          },
        },
      });
    });

    const updated = await prisma.expense.findUnique({
      where: { id },
      include: { splits: true },
    });

    success(res, { expense: serializeExpense(updated!) });
  } catch (err) {
    next(err);
  }
}

export async function deleteExpense(req: Request, res: Response, next: NextFunction) {
  try {
    const { hid, id } = req.params as Record<string, string>;
    const existing = await prisma.expense.findFirst({ where: { id, household_id: hid } });
    if (!existing) throw notFound("Expense");
    await prisma.expense.delete({ where: { id } });
    success(res, { message: "Expense deleted" });
  } catch (err) {
    next(err);
  }
}

export async function getSettlements(req: Request, res: Response, next: NextFunction) {
  try {
    const { hid } = req.params as Record<string, string>;
    const settlements = await prisma.settlement.findMany({
      where: { household_id: hid },
      orderBy: { created_at: "desc" },
    });
    success(res, { settlements: settlements.map(serializeSettlement) });
  } catch (err) {
    next(err);
  }
}

export const addSettlementSchema = z.object({
  fromUserId: z.string().uuid(),
  toUserId: z.string().uuid(),
  amount: z.number().positive("Settlement amount must be greater than 0"),
  note: z.string().default(""),
});

export async function addSettlement(req: Request, res: Response, next: NextFunction) {
  try {
    const { hid } = req.params as Record<string, string>;
    const body = req.body as z.infer<typeof addSettlementSchema>;
    if (body.fromUserId === body.toUserId) {
      throw new AppError("INVALID_SETTLEMENT", "Cannot settle with yourself", 400);
    }

    const settlement = await prisma.settlement.create({
      data: {
        household_id: hid,
        from_user_id: body.fromUserId,
        to_user_id: body.toUserId,
        amount: body.amount,
        note: body.note,
        created_by: req.user!.id,
      },
    });

    success(res, { settlement: serializeSettlement(settlement) }, 201);
  } catch (err) {
    next(err);
  }
}

export async function getBalances(req: Request, res: Response, next: NextFunction) {
  try {
    const { hid } = req.params as Record<string, string>;
    const [expenses, settlements] = await Promise.all([
      prisma.expense.findMany({ where: { household_id: hid }, include: { splits: true } }),
      prisma.settlement.findMany({ where: { household_id: hid } }),
    ]);

    const net = computeNetBalances(expenses, settlements);
    const simplified = simplifyDebts(net);

    success(res, { net, simplified });
  } catch (err) {
    next(err);
  }
}
