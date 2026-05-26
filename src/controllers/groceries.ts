import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../config/database";
import { success, notFound } from "../utils/response";
import type { Priority } from "@prisma/client";

const priorityMap: Record<string, Priority> = {
  High: "HIGH", Medium: "MEDIUM", Low: "LOW",
};
const priorityReverseMap: Record<Priority, string> = {
  HIGH: "High", MEDIUM: "Medium", LOW: "Low",
};

function serializeItem(item: {
  id: string; household_id: string; added_by: string; name: string; quantity: number;
  category: string; priority: Priority | null; is_bought: boolean; bought_at: Date | null;
  starred: boolean; notes: string; created_at: Date;
}) {
  return {
    id: item.id,
    householdId: item.household_id,
    addedBy: item.added_by,
    name: item.name,
    qty: item.quantity,
    category: item.category,
    priority: item.priority ? priorityReverseMap[item.priority] : null,
    isBought: item.is_bought,
    boughtAt: item.bought_at,
    starred: item.starred,
    notes: item.notes,
    createdAt: item.created_at,
  };
}

export async function getItems(req: Request, res: Response, next: NextFunction) {
  try {
    const { hid } = req.params as Record<string, string>;
    const items = await prisma.groceryItem.findMany({
      where: { household_id: hid },
      orderBy: { created_at: "desc" },
    });
    success(res, { items: items.map(serializeItem) });
  } catch (err) {
    next(err);
  }
}

export const addItemSchema = z.object({
  name: z.string().min(1, "Item name is required").max(60, "Item name must be 60 characters or fewer").trim(),
  qty: z.number().int().min(1).default(1),
  category: z.string().default("Other"),
  priority: z.enum(["High", "Medium", "Low"]).nullable().default(null),
  notes: z.string().default(""),
});

export async function addItem(req: Request, res: Response, next: NextFunction) {
  try {
    const { hid } = req.params as Record<string, string>;
    const body = req.body as z.infer<typeof addItemSchema>;
    const item = await prisma.groceryItem.create({
      data: {
        household_id: hid,
        added_by: req.user!.id,
        name: body.name,
        quantity: Math.max(1, body.qty),
        category: body.category,
        priority: body.priority ? priorityMap[body.priority] : null,
        notes: body.notes,
      },
    });
    success(res, { item: serializeItem(item) }, 201);
  } catch (err) {
    next(err);
  }
}

export const updateItemSchema = z.object({
  name: z.string().min(1).max(60).trim().optional(),
  qty: z.number().int().min(1).optional(),
  category: z.string().optional(),
  priority: z.enum(["High", "Medium", "Low"]).nullable().optional(),
  notes: z.string().optional(),
});

export async function updateItem(req: Request, res: Response, next: NextFunction) {
  try {
    const { hid, id } = req.params as Record<string, string>;
    const body = req.body as z.infer<typeof updateItemSchema>;
    const existing = await prisma.groceryItem.findFirst({ where: { id, household_id: hid } });
    if (!existing) throw notFound("Grocery item");

    const item = await prisma.groceryItem.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.qty !== undefined && { quantity: Math.max(1, body.qty) }),
        ...(body.category !== undefined && { category: body.category }),
        ...(body.priority !== undefined && { priority: body.priority ? priorityMap[body.priority] : null }),
        ...(body.notes !== undefined && { notes: body.notes }),
      },
    });
    success(res, { item: serializeItem(item) });
  } catch (err) {
    next(err);
  }
}

export async function deleteItem(req: Request, res: Response, next: NextFunction) {
  try {
    const { hid, id } = req.params as Record<string, string>;
    const existing = await prisma.groceryItem.findFirst({ where: { id, household_id: hid } });
    if (!existing) throw notFound("Grocery item");
    await prisma.groceryItem.delete({ where: { id } });
    success(res, { message: "Item deleted" });
  } catch (err) {
    next(err);
  }
}

export async function toggleBought(req: Request, res: Response, next: NextFunction) {
  try {
    const { hid, id } = req.params as Record<string, string>;
    const existing = await prisma.groceryItem.findFirst({ where: { id, household_id: hid } });
    if (!existing) throw notFound("Grocery item");

    const becomingBought = !existing.is_bought;
    const item = await prisma.groceryItem.update({
      where: { id },
      data: { is_bought: becomingBought, bought_at: becomingBought ? new Date() : null },
    });

    if (becomingBought) {
      await prisma.groceryPurchaseLog.create({
        data: { item_id: id, household_id: hid, item_name: existing.name, purchased_by: req.user!.id },
      });
    }

    success(res, { item: serializeItem(item) });
  } catch (err) {
    next(err);
  }
}

export async function toggleStarred(req: Request, res: Response, next: NextFunction) {
  try {
    const { hid, id } = req.params as Record<string, string>;
    const existing = await prisma.groceryItem.findFirst({ where: { id, household_id: hid } });
    if (!existing) throw notFound("Grocery item");
    const item = await prisma.groceryItem.update({ where: { id }, data: { starred: !existing.starred } });
    success(res, { item: serializeItem(item) });
  } catch (err) {
    next(err);
  }
}

export async function clearBought(req: Request, res: Response, next: NextFunction) {
  try {
    const { hid } = req.params as Record<string, string>;
    const result = await prisma.groceryItem.deleteMany({ where: { household_id: hid, is_bought: true } });
    success(res, { deletedCount: result.count });
  } catch (err) {
    next(err);
  }
}
