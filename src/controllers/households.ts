import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../config/database";
import { generateUniqueInviteCode } from "../utils/crypto";
import { removeMemberFromChores } from "../utils/choreRotation";
import { computeNetBalances, simplifyDebts } from "../utils/balanceCalc";
import { success, AppError, notFound } from "../utils/response";
import type { Role } from "@prisma/client";

function serializeHousehold(h: {
  id: string; name: string; invite_code: string; archived_at: Date | null;
  created_at: Date; members?: { id: string }[];
}) {
  return {
    id: h.id,
    name: h.name,
    inviteCode: h.invite_code,
    archivedAt: h.archived_at,
    createdAt: h.created_at,
    memberCount: h.members?.length ?? 0,
  };
}

function serializeMember(m: {
  id: string; user_id: string; role: Role; joined_at: Date;
  user?: { name: string; avatar_url: string | null };
}) {
  return {
    id: m.id,
    userId: m.user_id,
    userName: m.user?.name ?? "",
    userAvatarUrl: m.user?.avatar_url ?? null,
    role: m.role.toLowerCase() as "owner" | "member",
    joinedAt: m.joined_at,
  };
}

export async function getHouseholds(req: Request, res: Response, next: NextFunction) {
  try {
    const memberships = await prisma.householdMember.findMany({
      where: { user_id: req.user!.id, household: { archived_at: null } },
      include: { household: { include: { members: { select: { id: true } } } } },
    });

    const households = memberships.map((m) => ({
      ...serializeHousehold(m.household),
      role: m.role.toLowerCase() as "owner" | "member",
    }));

    success(res, { households });
  } catch (err) {
    next(err);
  }
}

export const createHouseholdSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(50, "Name must be 50 characters or fewer").trim(),
});

export async function createHousehold(req: Request, res: Response, next: NextFunction) {
  try {
    const { name } = req.body as z.infer<typeof createHouseholdSchema>;
    const inviteCode = await generateUniqueInviteCode(prisma);

    const household = await prisma.household.create({
      data: {
        name,
        invite_code: inviteCode,
        created_by: req.user!.id,
        members: { create: { user_id: req.user!.id, role: "OWNER" } },
      },
      include: { members: { select: { id: true } } },
    });

    success(res, { household: serializeHousehold(household) }, 201);
  } catch (err) {
    next(err);
  }
}

export const joinHouseholdSchema = z.object({
  code: z.string().min(1).trim(),
});

export async function joinHousehold(req: Request, res: Response, next: NextFunction) {
  try {
    const code = (req.body as z.infer<typeof joinHouseholdSchema>).code.toUpperCase();

    const household = await prisma.household.findFirst({
      where: { invite_code: code, archived_at: null },
      include: { members: { select: { id: true } } },
    });
    if (!household) throw new AppError("INVITE_CODE_INVALID", "Invalid invite code. Check the code and try again.", 404);

    const existing = await prisma.householdMember.findUnique({
      where: { household_id_user_id: { household_id: household.id, user_id: req.user!.id } },
    });
    if (existing) throw new AppError("ALREADY_MEMBER", "You are already a member of this household.", 409);

    await prisma.householdMember.create({
      data: { household_id: household.id, user_id: req.user!.id, role: "MEMBER" },
    });

    const updated = await prisma.household.findUnique({
      where: { id: household.id },
      include: { members: { select: { id: true } } },
    });

    success(res, { household: serializeHousehold(updated!) });
  } catch (err) {
    next(err);
  }
}

export async function getHousehold(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params as Record<string, string>;
    const household = await prisma.household.findFirst({
      where: { id, archived_at: null },
      include: { members: { select: { id: true } } },
    });
    if (!household) throw notFound("Household");
    success(res, { household: serializeHousehold(household) });
  } catch (err) {
    next(err);
  }
}

export const updateHouseholdSchema = z.object({
  name: z.string().min(2).max(50).trim(),
});

export async function updateHousehold(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params as Record<string, string>;
    const { name } = req.body as z.infer<typeof updateHouseholdSchema>;
    const household = await prisma.household.update({
      where: { id },
      data: { name },
      include: { members: { select: { id: true } } },
    });
    success(res, { household: serializeHousehold(household) });
  } catch (err) {
    next(err);
  }
}

export async function deleteHousehold(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params as Record<string, string>;
    await prisma.household.update({ where: { id }, data: { archived_at: new Date() } });
    success(res, { message: "Household archived" });
  } catch (err) {
    next(err);
  }
}

export async function getMembers(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params as Record<string, string>;
    const members = await prisma.householdMember.findMany({
      where: { household_id: id },
      include: { user: { select: { name: true, avatar_url: true } } },
      orderBy: { joined_at: "asc" },
    });
    success(res, { members: members.map(serializeMember) });
  } catch (err) {
    next(err);
  }
}

export async function removeMember(req: Request, res: Response, next: NextFunction) {
  try {
    const { id: householdId, uid: targetUserId } = req.params as Record<string, string>;

    const target = await prisma.householdMember.findUnique({
      where: { household_id_user_id: { household_id: householdId, user_id: targetUserId } },
    });
    if (!target) throw notFound("Member");
    if (target.role === "OWNER") throw new AppError("CANNOT_REMOVE_OWNER", "Transfer ownership before removing this member", 400);
    if (targetUserId === req.user!.id) throw new AppError("CANNOT_REMOVE_SELF", "Use 'Leave household' to remove yourself", 400);

    await removeMemberFromChores(prisma, householdId, targetUserId);
    await prisma.householdMember.delete({
      where: { household_id_user_id: { household_id: householdId, user_id: targetUserId } },
    });

    success(res, { message: "Member removed" });
  } catch (err) {
    next(err);
  }
}

export const changeRoleSchema = z.object({
  role: z.enum(["owner", "member"]),
});

export async function changeRole(req: Request, res: Response, next: NextFunction) {
  try {
    const { id: householdId, uid: targetUserId } = req.params as Record<string, string>;
    const { role } = req.body as z.infer<typeof changeRoleSchema>;
    const newRole = role.toUpperCase() as Role;

    if (targetUserId === req.user!.id) {
      throw new AppError("CANNOT_CHANGE_OWN_ROLE", "You cannot change your own role", 400);
    }

    const target = await prisma.householdMember.findUnique({
      where: { household_id_user_id: { household_id: householdId, user_id: targetUserId } },
    });
    if (!target) throw notFound("Member");

    if (newRole === "MEMBER") {
      const ownerCount = await prisma.householdMember.count({
        where: { household_id: householdId, role: "OWNER" },
      });
      if (ownerCount <= 1) {
        throw new AppError("CANNOT_DEMOTE_LAST_OWNER", "Cannot demote the last owner. Promote another member first.", 400);
      }
    }

    const updated = await prisma.householdMember.update({
      where: { household_id_user_id: { household_id: householdId, user_id: targetUserId } },
      data: { role: newRole },
      include: { user: { select: { name: true, avatar_url: true } } },
    });

    success(res, { member: serializeMember(updated) });
  } catch (err) {
    next(err);
  }
}

export const transferOwnershipSchema = z.object({
  newOwnerId: z.string().uuid(),
});

export async function transferOwnership(req: Request, res: Response, next: NextFunction) {
  try {
    const { id: householdId } = req.params as Record<string, string>;
    const { newOwnerId } = req.body as z.infer<typeof transferOwnershipSchema>;

    const target = await prisma.householdMember.findUnique({
      where: { household_id_user_id: { household_id: householdId, user_id: newOwnerId } },
    });
    if (!target) throw notFound("Target member");

    await prisma.$transaction([
      prisma.householdMember.update({
        where: { household_id_user_id: { household_id: householdId, user_id: req.user!.id } },
        data: { role: "MEMBER" },
      }),
      prisma.householdMember.update({
        where: { household_id_user_id: { household_id: householdId, user_id: newOwnerId } },
        data: { role: "OWNER" },
      }),
    ]);

    success(res, { message: "Ownership transferred" });
  } catch (err) {
    next(err);
  }
}

export async function regenerateCode(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params as Record<string, string>;
    const newCode = await generateUniqueInviteCode(prisma);
    await prisma.household.update({ where: { id }, data: { invite_code: newCode } });
    success(res, { inviteCode: newCode });
  } catch (err) {
    next(err);
  }
}

export async function lookupByCode(req: Request, res: Response, next: NextFunction) {
  try {
    const code = ((req.query.code as string) ?? "").toUpperCase().trim();
    if (!code) throw new AppError("MISSING_CODE", "code query parameter is required", 400);

    const household = await prisma.household.findFirst({
      where: { invite_code: code, archived_at: null },
      include: { members: { select: { id: true } } },
    });

    success(res, { household: household ? serializeHousehold(household) : null });
  } catch (err) {
    next(err);
  }
}

export async function leaveHousehold(req: Request, res: Response, next: NextFunction) {
  try {
    const { id: householdId } = req.params as Record<string, string>;
    const userId = req.user!.id;

    const membership = await prisma.householdMember.findUnique({
      where: { household_id_user_id: { household_id: householdId, user_id: userId } },
    });
    if (!membership) throw new AppError("NOT_MEMBER", "You are not a member of this household", 400);
    if (membership.role === "OWNER") {
      throw new AppError("OWNER_CANNOT_LEAVE", "Owners cannot leave. Transfer ownership first or delete the household.", 400);
    }

    const [expenses, settlements] = await Promise.all([
      prisma.expense.findMany({ where: { household_id: householdId }, include: { splits: true } }),
      prisma.settlement.findMany({ where: { household_id: householdId } }),
    ]);

    const net = computeNetBalances(expenses, settlements);
    const pairs = simplifyDebts(net);
    const outstanding = pairs
      .filter((pp) => pp.fromUserId === userId || pp.toUserId === userId)
      .reduce((sum, pp) => sum + pp.amount, 0);

    if (outstanding > 0.01) {
      throw new AppError(
        "OUTSTANDING_BALANCE",
        `You have an outstanding balance of $${outstanding.toFixed(2)}. Settle up before leaving.`,
        400
      );
    }

    await removeMemberFromChores(prisma, householdId, userId);
    await prisma.householdMember.delete({
      where: { household_id_user_id: { household_id: householdId, user_id: userId } },
    });

    success(res, { message: "You have left the household" });
  } catch (err) {
    next(err);
  }
}
