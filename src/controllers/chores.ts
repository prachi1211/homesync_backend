import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../config/database";
import { getNextAssignee } from "../utils/choreRotation";
import { success, AppError, notFound } from "../utils/response";
import type { AssignmentType, ChoreFrequency } from "@prisma/client";

const frequencyValues = ["Daily", "Every2Days", "Every3Days", "Weekly", "Biweekly", "Monthly"] as const;
const assignmentValues = ["Fixed", "Rotating", "Personal"] as const;

const freqMap: Record<string, ChoreFrequency> = {
  Daily: "DAILY", Every2Days: "EVERY2DAYS", Every3Days: "EVERY3DAYS",
  Weekly: "WEEKLY", Biweekly: "BIWEEKLY", Monthly: "MONTHLY",
};
const freqReverseMap: Record<ChoreFrequency, string> = {
  DAILY: "Daily", EVERY2DAYS: "Every2Days", EVERY3DAYS: "Every3Days",
  WEEKLY: "Weekly", BIWEEKLY: "Biweekly", MONTHLY: "Monthly",
};
const assignMap: Record<string, AssignmentType> = {
  Fixed: "FIXED", Rotating: "ROTATING", Personal: "PERSONAL",
};
const assignReverseMap: Record<AssignmentType, string> = {
  FIXED: "Fixed", ROTATING: "Rotating", PERSONAL: "Personal",
};

function serializeChore(
  chore: {
    id: string; household_id: string; name: string; assignment_type: AssignmentType;
    frequency: ChoreFrequency; current_assignee_id: string | null; created_by: string;
    deadline: Date | null; end_date: Date | null; created_at: Date;
    participants?: { user_id: string; queue_position: number }[];
  }
) {
  const queue = chore.participants
    ?.sort((a, b) => a.queue_position - b.queue_position)
    .map((pp) => pp.user_id) ?? [];

  return {
    id: chore.id,
    householdId: chore.household_id,
    name: chore.name,
    assignmentType: assignReverseMap[chore.assignment_type],
    frequency: freqReverseMap[chore.frequency],
    currentAssigneeId: chore.current_assignee_id,
    participants: queue,
    rotationQueue: queue,
    createdBy: chore.created_by,
    deadline: chore.deadline ? chore.deadline.toISOString().slice(0, 10) : null,
    endDate: chore.end_date ? chore.end_date.toISOString().slice(0, 10) : null,
    createdAt: chore.created_at,
  };
}

export async function getChores(req: Request, res: Response, next: NextFunction) {
  try {
    const { hid } = req.params as Record<string, string>;
    const chores = await prisma.chore.findMany({
      where: { household_id: hid },
      include: { participants: { orderBy: { queue_position: "asc" } } },
      orderBy: { created_at: "asc" },
    });
    success(res, { chores: chores.map(serializeChore) });
  } catch (err) {
    next(err);
  }
}

export const addChoreSchema = z.object({
  name: z.string().min(1, "Chore name is required").max(80, "Chore name must be 80 characters or fewer").trim(),
  assignmentType: z.enum(assignmentValues),
  frequency: z.enum(frequencyValues),
  participants: z.array(z.string().uuid()).default([]),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export async function addChore(req: Request, res: Response, next: NextFunction) {
  try {
    const { hid } = req.params as Record<string, string>;
    const body = req.body as z.infer<typeof addChoreSchema>;

    const dup = await prisma.chore.findFirst({
      where: { household_id: hid, name: { equals: body.name, mode: "insensitive" } },
    });
    if (dup) throw new AppError("CHORE_NAME_TAKEN", "A chore with this name already exists", 409);

    const assignmentType = assignMap[body.assignmentType];
    const frequency = freqMap[body.frequency];

    let participantIds: string[] = [];
    let currentAssigneeId: string | null = null;

    if (assignmentType === "ROTATING") {
      if (body.participants.length < 2) {
        throw new AppError("INSUFFICIENT_PARTICIPANTS", "Rotating chores require at least 2 participants", 400);
      }
      participantIds = body.participants;
      currentAssigneeId = participantIds.includes(req.user!.id) ? req.user!.id : participantIds[0];
    } else if (assignmentType === "FIXED") {
      if (body.participants.length === 0) {
        throw new AppError("INSUFFICIENT_PARTICIPANTS", "Select at least 1 member for this chore", 400);
      }
      participantIds = body.participants;
    } else {
      participantIds = [req.user!.id];
      currentAssigneeId = req.user!.id;
    }

    const chore = await prisma.chore.create({
      data: {
        household_id: hid,
        name: body.name,
        assignment_type: assignmentType,
        frequency,
        current_assignee_id: currentAssigneeId,
        created_by: req.user!.id,
        deadline: body.deadline ? new Date(body.deadline) : null,
        end_date: assignmentType === "ROTATING" && body.endDate ? new Date(body.endDate) : null,
        participants: {
          create: participantIds.map((uid, idx) => ({ user_id: uid, queue_position: idx })),
        },
      },
      include: { participants: { orderBy: { queue_position: "asc" } } },
    });

    success(res, { chore: serializeChore(chore) }, 201);
  } catch (err) {
    next(err);
  }
}

export const updateChoreSchema = z.object({
  name: z.string().min(1).max(80).trim().optional(),
  frequency: z.enum(frequencyValues).optional(),
  participants: z.array(z.string().uuid()).optional(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export async function updateChore(req: Request, res: Response, next: NextFunction) {
  try {
    const { hid, id } = req.params as Record<string, string>;
    const body = req.body as z.infer<typeof updateChoreSchema>;

    const existing = await prisma.chore.findFirst({
      where: { id, household_id: hid },
      include: { participants: { orderBy: { queue_position: "asc" } } },
    });
    if (!existing) throw notFound("Chore");

    if (body.name) {
      const dup = await prisma.chore.findFirst({
        where: { household_id: hid, name: { equals: body.name, mode: "insensitive" }, id: { not: id } },
      });
      if (dup) throw new AppError("CHORE_NAME_TAKEN", "A chore with this name already exists", 409);
    }

    let updatedParticipants = existing.participants.map((pp) => pp.user_id);
    let updatedCurrentAssignee = existing.current_assignee_id;

    if (body.participants !== undefined) {
      if (existing.assignment_type === "ROTATING") {
        if (body.participants.length < 2) {
          throw new AppError("INSUFFICIENT_PARTICIPANTS", "Rotating chores require at least 2 participants", 400);
        }
        updatedParticipants = body.participants;
        if (!body.participants.includes(existing.current_assignee_id ?? "")) {
          updatedCurrentAssignee = body.participants[0];
        }
      } else if (existing.assignment_type === "FIXED") {
        if (body.participants.length === 0) {
          throw new AppError("INSUFFICIENT_PARTICIPANTS", "Select at least 1 member for this chore", 400);
        }
        updatedParticipants = body.participants;
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.choreParticipant.deleteMany({ where: { chore_id: id } });
      await tx.choreParticipant.createMany({
        data: updatedParticipants.map((uid, idx) => ({
          chore_id: id,
          user_id: uid,
          queue_position: idx,
        })),
      });
      await tx.chore.update({
        where: { id },
        data: {
          ...(body.name && { name: body.name }),
          ...(body.frequency && { frequency: freqMap[body.frequency] }),
          current_assignee_id: updatedCurrentAssignee,
          ...(body.deadline !== undefined && { deadline: body.deadline ? new Date(body.deadline) : null }),
          ...(body.endDate !== undefined && existing.assignment_type === "ROTATING" && {
            end_date: body.endDate ? new Date(body.endDate) : null,
          }),
        },
      });
    });

    const updated = await prisma.chore.findUnique({
      where: { id },
      include: { participants: { orderBy: { queue_position: "asc" } } },
    });

    success(res, { chore: serializeChore(updated!) });
  } catch (err) {
    next(err);
  }
}

export async function deleteChore(req: Request, res: Response, next: NextFunction) {
  try {
    const { hid, id } = req.params as Record<string, string>;
    const existing = await prisma.chore.findFirst({ where: { id, household_id: hid } });
    if (!existing) throw notFound("Chore");
    await prisma.chore.delete({ where: { id } });
    success(res, { message: "Chore deleted" });
  } catch (err) {
    next(err);
  }
}

export async function getCompletions(req: Request, res: Response, next: NextFunction) {
  try {
    const { hid } = req.params as Record<string, string>;
    const completions = await prisma.choreCompletionLog.findMany({
      where: { household_id: hid },
      orderBy: { completed_at: "desc" },
    });
    success(res, {
      completions: completions.map((c) => ({
        id: c.id,
        choreId: c.chore_id,
        householdId: c.household_id,
        completedBy: c.completed_by,
        completedAt: c.completed_at,
      })),
    });
  } catch (err) {
    next(err);
  }
}

export async function markComplete(req: Request, res: Response, next: NextFunction) {
  try {
    const { hid, id } = req.params as Record<string, string>;
    const chore = await prisma.chore.findFirst({
      where: { id, household_id: hid },
      include: { participants: { orderBy: { queue_position: "asc" } } },
    });
    if (!chore) throw notFound("Chore");

    const log = await prisma.choreCompletionLog.create({
      data: { chore_id: id, household_id: hid, completed_by: req.user!.id },
    });

    let updatedChore: typeof chore = chore;

    if (chore.assignment_type === "ROTATING") {
      const queue = chore.participants.map((pp) => pp.user_id);
      const countRows = await prisma.choreCompletionLog.groupBy({
        by: ["completed_by"],
        where: { chore_id: id },
        _count: { id: true },
      });
      const counts: Record<string, number> = {};
      queue.forEach((uid) => (counts[uid] = 0));
      countRows.forEach((r) => {
        if (counts[r.completed_by] !== undefined) counts[r.completed_by] = r._count.id;
      });

      const nextAssignee = getNextAssignee(req.user!.id, queue, counts);
      updatedChore = await prisma.chore.update({
        where: { id },
        data: { current_assignee_id: nextAssignee },
        include: { participants: { orderBy: { queue_position: "asc" } } },
      });
    }

    success(res, {
      chore: serializeChore(updatedChore),
      log: { id: log.id, choreId: log.chore_id, householdId: log.household_id, completedBy: log.completed_by, completedAt: log.completed_at },
    });
  } catch (err) {
    next(err);
  }
}

export async function undoComplete(req: Request, res: Response, next: NextFunction) {
  try {
    const { hid, id: choreId, logId } = req.params as Record<string, string>;

    const logEntry = await prisma.choreCompletionLog.findFirst({
      where: { id: logId, chore_id: choreId, household_id: hid },
    });
    if (!logEntry) throw notFound("Completion record");

    await prisma.choreCompletionLog.delete({ where: { id: logId } });

    const chore = await prisma.chore.findUnique({
      where: { id: choreId },
      include: { participants: { orderBy: { queue_position: "asc" } } },
    });
    if (!chore) throw notFound("Chore");

    let updatedChore = chore;
    if (chore.assignment_type === "ROTATING") {
      updatedChore = await prisma.chore.update({
        where: { id: choreId },
        data: { current_assignee_id: logEntry.completed_by },
        include: { participants: { orderBy: { queue_position: "asc" } } },
      });
    }

    success(res, { chore: serializeChore(updatedChore), removedLogId: logId });
  } catch (err) {
    next(err);
  }
}
