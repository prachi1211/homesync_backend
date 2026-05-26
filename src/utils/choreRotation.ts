import type { PrismaClient } from "@prisma/client";

export function getNextAssignee(
  currentAssigneeId: string,
  rotationQueue: string[],
  completionCounts: Record<string, number>
): string {
  if (rotationQueue.length === 1) return rotationQueue[0];

  const counts: Record<string, number> = {};
  rotationQueue.forEach((p) => (counts[p] = completionCounts[p] ?? 0));

  const currentIdx = rotationQueue.indexOf(currentAssigneeId);
  const minCount = Math.min(...rotationQueue.map((p) => counts[p]));

  const candidates = rotationQueue
    .filter((p) => counts[p] === minCount)
    .sort((a, b) => {
      const posA =
        (rotationQueue.indexOf(a) - currentIdx - 1 + rotationQueue.length) %
        rotationQueue.length;
      const posB =
        (rotationQueue.indexOf(b) - currentIdx - 1 + rotationQueue.length) %
        rotationQueue.length;
      return posA - posB;
    });

  return candidates[0];
}

export async function removeMemberFromChores(
  prisma: PrismaClient,
  householdId: string,
  userId: string
): Promise<void> {
  const chores = await prisma.chore.findMany({
    where: { household_id: householdId },
    include: {
      participants: { orderBy: { queue_position: "asc" } },
    },
  });

  const choreParticipantOf = chores.filter((c) =>
    c.participants.some((p) => p.user_id === userId)
  );

  await prisma.$transaction(async (tx) => {
    for (const chore of choreParticipantOf) {
      if (chore.assignment_type === "ROTATING") {
        const remaining = chore.participants.filter((p) => p.user_id !== userId);

        if (remaining.length < 2) {
          await tx.chore.delete({ where: { id: chore.id } });
          continue;
        }

        let nextAssigneeId = chore.current_assignee_id;
        if (chore.current_assignee_id === userId) {
          const queue = chore.participants.map((p) => p.user_id);
          const removedIdx = queue.indexOf(userId);
          let next: string | null = null;
          for (let k = 1; k < queue.length; k++) {
            const candidate = queue[(removedIdx + k) % queue.length];
            if (candidate !== userId) {
              next = candidate;
              break;
            }
          }
          nextAssigneeId = next;
        }

        await tx.choreParticipant.delete({
          where: { chore_id_user_id: { chore_id: chore.id, user_id: userId } },
        });

        await tx.chore.update({
          where: { id: chore.id },
          data: { current_assignee_id: nextAssigneeId },
        });
      } else if (chore.assignment_type === "FIXED") {
        const remaining = chore.participants.filter((p) => p.user_id !== userId);

        if (remaining.length === 0) {
          await tx.chore.delete({ where: { id: chore.id } });
        } else {
          await tx.choreParticipant.delete({
            where: { chore_id_user_id: { chore_id: chore.id, user_id: userId } },
          });
        }
      } else {
        // PERSONAL — delete if this user created it
        if (chore.created_by === userId) {
          await tx.chore.delete({ where: { id: chore.id } });
        }
      }
    }
  });
}
