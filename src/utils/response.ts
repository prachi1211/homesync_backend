import type { Response } from "express";

export function success<T>(res: Response, data: T, statusCode = 200): Response {
  return res.status(statusCode).json({ data });
}

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
    public readonly fields?: Record<string, string>
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function notFound(resource: string): AppError {
  return new AppError("NOT_FOUND", `${resource} not found`, 404);
}

export function forbidden(message = "Access denied"): AppError {
  return new AppError("FORBIDDEN", message, 403);
}

export function unauthorized(message = "Authentication required"): AppError {
  return new AppError("UNAUTHORIZED", message, 401);
}
