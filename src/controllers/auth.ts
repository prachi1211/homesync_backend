import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { prisma } from "../config/database";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/jwt";
import {
  hashPassword,
  comparePassword,
  generateSecureToken,
  hashToken,
} from "../utils/crypto";
import { sendPasswordResetEmail } from "../utils/email";
import { success, AppError } from "../utils/response";

function makeTokenPair(user: { id: string; email: string; name: string }) {
  return {
    access_token: signAccessToken({ sub: user.id, email: user.email, name: user.name }),
    refresh_token: signRefreshToken(user.id),
  };
}

async function storeRefreshToken(userId: string, rawToken: string) {
  const { exp } = jwt.decode(rawToken) as { exp: number };
  await prisma.refreshToken.create({
    data: { user_id: userId, token_hash: hashToken(rawToken), expires_at: new Date(exp * 1000) },
  });
}

function serializeUser(user: { id: string; email: string; name: string; avatar_url: string | null; google_id: string | null; created_at: Date }) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatar_url: user.avatar_url,
    google_id: user.google_id,
    created_at: user.created_at,
  };
}

export const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(50, "Name must be 50 characters or fewer").trim(),
  email: z.string().email("Please enter a valid email address").toLowerCase().trim(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
});

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, email, password } = req.body as z.infer<typeof registerSchema>;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new AppError("EMAIL_TAKEN", "An account with this email already exists", 409);

    const password_hash = await hashPassword(password);
    const user = await prisma.user.create({ data: { name, email, password_hash } });

    const { access_token, refresh_token } = makeTokenPair(user);
    await storeRefreshToken(user.id, refresh_token);

    success(res, { user: serializeUser(user), access_token, refresh_token }, 201);
  } catch (err) {
    next(err);
  }
}

export const loginSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(1),
});

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = req.body as z.infer<typeof loginSchema>;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.password_hash) {
      throw new AppError("INVALID_CREDENTIALS", "Invalid email or password", 401);
    }

    const valid = await comparePassword(password, user.password_hash);
    if (!valid) throw new AppError("INVALID_CREDENTIALS", "Invalid email or password", 401);

    const { access_token, refresh_token } = makeTokenPair(user);
    await storeRefreshToken(user.id, refresh_token);

    success(res, { user: serializeUser(user), access_token, refresh_token });
  } catch (err) {
    next(err);
  }
}

export const refreshSchema = z.object({
  refresh_token: z.string().min(1),
});

export async function refreshTokens(req: Request, res: Response, next: NextFunction) {
  try {
    const { refresh_token: rawToken } = req.body as z.infer<typeof refreshSchema>;

    // Verify JWT signature and expiry
    const payload = verifyRefreshToken(rawToken);

    // Revoke the presented token atomically — count 0 means unknown, expired or already used
    const [revoked, user] = await Promise.all([
      prisma.refreshToken.updateMany({
        where: {
          token_hash: hashToken(rawToken),
          user_id: payload.sub,
          revoked_at: null,
          expires_at: { gt: new Date() },
        },
        data: { revoked_at: new Date() },
      }),
      prisma.user.findUnique({ where: { id: payload.sub } }),
    ]);

    if (revoked.count === 0) {
      throw new AppError("INVALID_REFRESH_TOKEN", "Invalid or expired refresh token", 401);
    }
    if (!user) throw new AppError("INVALID_REFRESH_TOKEN", "User not found", 401);

    const { access_token, refresh_token: newRefresh } = makeTokenPair(user);
    await storeRefreshToken(user.id, newRefresh);

    success(res, { user: serializeUser(user), access_token, refresh_token: newRefresh });
  } catch (err) {
    next(err);
  }
}

export const logoutSchema = z.object({
  refresh_token: z.string().min(1),
});

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    const { refresh_token: rawToken } = req.body as z.infer<typeof logoutSchema>;

    // Best-effort revoke — don't error if not found
    await prisma.refreshToken.updateMany({
      where: { token_hash: hashToken(rawToken), user_id: req.user!.id, revoked_at: null },
      data: { revoked_at: new Date() },
    });

    success(res, { message: "Logged out successfully" });
  } catch (err) {
    next(err);
  }
}

export const forgotPasswordSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
});

export async function forgotPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { email } = req.body as z.infer<typeof forgotPasswordSchema>;

    // Always return success — don't reveal whether email exists
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      const rawToken = generateSecureToken();
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await prisma.passwordResetToken.create({
        data: { user_id: user.id, token_hash: tokenHash, expires_at: expiresAt },
      });
      await sendPasswordResetEmail(user.email, user.name, rawToken);
    }

    success(res, { message: "If an account with that email exists, a password reset link has been sent." });
  } catch (err) {
    next(err);
  }
}

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
});

export async function resetPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { token: rawToken, password } = req.body as z.infer<typeof resetPasswordSchema>;
    const invalid = new AppError("INVALID_RESET_TOKEN", "Invalid or expired reset link", 400);

    const matched = await prisma.passwordResetToken.findFirst({
      where: { token_hash: hashToken(rawToken), used_at: null, expires_at: { gt: new Date() } },
    });

    if (!matched) throw invalid;

    const password_hash = await hashPassword(password);
    await prisma.$transaction([
      prisma.user.update({ where: { id: matched.user_id }, data: { password_hash } }),
      prisma.passwordResetToken.update({ where: { id: matched.id }, data: { used_at: new Date() } }),
      // Revoke all existing refresh tokens for security
      prisma.refreshToken.updateMany({
        where: { user_id: matched.user_id, revoked_at: null },
        data: { revoked_at: new Date() },
      }),
    ]);

    success(res, { message: "Password reset successfully" });
  } catch (err) {
    next(err);
  }
}

export async function getMe(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw new AppError("NOT_FOUND", "User not found", 404);
    success(res, { user: serializeUser(user) });
  } catch (err) {
    next(err);
  }
}

export const updateMeSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(50).trim(),
});

export async function updateMe(req: Request, res: Response, next: NextFunction) {
  try {
    const { name } = req.body as z.infer<typeof updateMeSchema>;
    const user = await prisma.user.update({ where: { id: req.user!.id }, data: { name } });
    success(res, { user: serializeUser(user) });
  } catch (err) {
    next(err);
  }
}

export const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z
    .string()
    .min(8)
    .regex(/[A-Z]/)
    .regex(/[a-z]/)
    .regex(/[0-9]/),
});

export async function changePassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { current_password, new_password } = req.body as z.infer<typeof changePasswordSchema>;

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user || !user.password_hash) {
      throw new AppError("INVALID_CREDENTIALS", "Cannot change password for this account", 400);
    }

    const valid = await comparePassword(current_password, user.password_hash);
    if (!valid) throw new AppError("INVALID_CREDENTIALS", "Current password is incorrect", 401);

    const password_hash = await hashPassword(new_password);
    await prisma.user.update({ where: { id: user.id }, data: { password_hash } });

    success(res, { message: "Password updated successfully" });
  } catch (err) {
    next(err);
  }
}
