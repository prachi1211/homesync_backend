import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Create test users
  const hash = await bcrypt.hash("Password1", 12);

  const alice = await prisma.user.upsert({
    where: { email: "alice@example.com" },
    update: {},
    create: { name: "Alice Johnson", email: "alice@example.com", password_hash: hash },
  });

  const bob = await prisma.user.upsert({
    where: { email: "bob@example.com" },
    update: {},
    create: { name: "Bob Smith", email: "bob@example.com", password_hash: hash },
  });

  // Create a household
  const existing = await prisma.household.findFirst({
    where: { members: { some: { user_id: alice.id } }, archived_at: null },
  });

  if (!existing) {
    const household = await prisma.household.create({
      data: {
        name: "Test Household",
        invite_code: "TEST01",
        created_by: alice.id,
        members: {
          create: [
            { user_id: alice.id, role: "OWNER" },
            { user_id: bob.id, role: "MEMBER" },
          ],
        },
      },
    });

    // Seed a chore
    await prisma.chore.create({
      data: {
        household_id: household.id,
        name: "Do the dishes",
        assignment_type: "ROTATING",
        frequency: "DAILY",
        current_assignee_id: alice.id,
        created_by: alice.id,
        participants: {
          create: [
            { user_id: alice.id, queue_position: 0 },
            { user_id: bob.id, queue_position: 1 },
          ],
        },
      },
    });

    console.log(`✅ Created household "${household.name}" with id: ${household.id}`);
  }

  console.log("✅ Seed complete");
  console.log("   alice@example.com / Password1");
  console.log("   bob@example.com   / Password1");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
