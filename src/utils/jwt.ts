import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { AppError } from "./response";

export interface AccessTokenPayload {
  sub: string;
  email: string;
  name: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRY as jwt.SignOptions["expiresIn"],
  });
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRY as jwt.SignOptions["expiresIn"],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
  } catch {
    throw new AppError("INVALID_TOKEN", "Invalid or expired access token", 401);
  }
}

export function verifyRefreshToken(token: string): { sub: string } {
  try {
    return jwt.verify(token, env.JWT_REFRESH_SECRET) as { sub: string };
  } catch {
    throw new AppError("INVALID_REFRESH_TOKEN", "Invalid or expired refresh token", 401);
  }
}
