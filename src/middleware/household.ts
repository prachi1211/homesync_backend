import type { Request, Response, NextFunction, RequestHandler } from "express";
import { prisma } from "../config/database";
import { forbidden, notFound, type AppError } from "../utils/response";

// One round trip on the happy path: membership + active household in a single query.
// Only when that misses do we query again to tell "no such household" from "not a member".
function requireRole(paramName: string, ownerOnly: boolean): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const raw = req.params[paramName];
    const householdId = Array.isArray(raw) ? raw[0] : raw;
    if (!req.user) {
      next(forbidden());
      return;
    }

    try {
      const membership = await prisma.householdMember.findFirst({
        where: { household_id: householdId, user_id: req.user.id, household: { archived_at: null } },
      });

      if (!membership) {
        const household = await prisma.household.findFirst({
          where: { id: householdId, archived_at: null },
          select: { id: true },
        });
        const err: AppError = household
          ? forbidden(ownerOnly ? "Only an owner can perform this action" : "You are not a member of this household")
          : notFound("Household");
        next(err);
        return;
      }

      if (ownerOnly && membership.role !== "OWNER") {
        next(forbidden("Only an owner can perform this action"));
        return;
      }

      req.membership = membership;
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requireMember(paramName = "hid"): RequestHandler {
  return requireRole(paramName, false);
}

export function requireOwner(paramName = "id"): RequestHandler {
  return requireRole(paramName, true);
}
