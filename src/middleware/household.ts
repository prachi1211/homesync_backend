import type { Request, Response, NextFunction, RequestHandler } from "express";
import { prisma } from "../config/database";
import { forbidden, notFound } from "../utils/response";

export function requireMember(paramName = "hid"): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const raw = req.params[paramName];
    const householdId = Array.isArray(raw) ? raw[0] : raw;
    if (!req.user) {
      next(forbidden());
      return;
    }

    const household = await prisma.household.findFirst({
      where: { id: householdId, archived_at: null },
    });
    if (!household) {
      next(notFound("Household"));
      return;
    }

    const membership = await prisma.householdMember.findUnique({
      where: {
        household_id_user_id: { household_id: householdId, user_id: req.user.id },
      },
    });
    if (!membership) {
      next(forbidden("You are not a member of this household"));
      return;
    }

    req.membership = membership;
    next();
  };
}

export function requireOwner(paramName = "id"): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const raw = req.params[paramName];
    const householdId = Array.isArray(raw) ? raw[0] : raw;
    if (!req.user) {
      next(forbidden());
      return;
    }

    const household = await prisma.household.findFirst({
      where: { id: householdId, archived_at: null },
    });
    if (!household) {
      next(notFound("Household"));
      return;
    }

    const membership = await prisma.householdMember.findUnique({
      where: {
        household_id_user_id: { household_id: householdId, user_id: req.user.id },
      },
    });
    if (!membership || membership.role !== "OWNER") {
      next(forbidden("Only an owner can perform this action"));
      return;
    }

    req.membership = membership;
    next();
  };
}
