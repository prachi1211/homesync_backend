import crypto from "crypto";
import bcrypt from "bcrypt";
import { env } from "../config/env";
import type { PrismaClient } from "@prisma/client";

const INVITE_CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateInviteCode(): string {
  const bytes = crypto.randomBytes(6);
  return Array.from(bytes)
    .map((b) => INVITE_CHARSET[b % INVITE_CHARSET.length])
    .join("");
}

export async function generateUniqueInviteCode(prisma: PrismaClient): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateInviteCode();
    const existing = await prisma.household.findUnique({ where: { invite_code: code } });
    if (!existing) return code;
  }
  throw new Error("Failed to generate unique invite code after 10 attempts");
}

export function generateSecureToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// Refresh/reset tokens are high-entropy random values, so a fast deterministic
// hash is sufficient and lets us look them up directly by token_hash.
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, env.BCRYPT_ROUNDS);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
