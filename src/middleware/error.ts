import type { ErrorRequestHandler } from "express";
import { AppError } from "../utils/response";
import { logger } from "../config/logger";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    const body: Record<string, unknown> = {
      error: { code: err.code, message: err.message },
    };
    if (err.fields) {
      (body.error as Record<string, unknown>).fields = err.fields;
    }
    res.status(err.statusCode).json(body);
    return;
  }

  logger.error(`Unhandled error: ${err?.message ?? err}`);
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" },
  });
};
