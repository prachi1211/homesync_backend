import type { Request, Response, NextFunction, RequestHandler } from "express";
import type { ZodSchema } from "zod";
import { AppError } from "../utils/response";

export function validate(schema: ZodSchema): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const fields: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        const path = issue.path.join(".");
        if (path) fields[path] = issue.message;
      });
      next(
        new AppError("VALIDATION_ERROR", "Validation failed", 400, fields)
      );
      return;
    }
    req.body = result.data;
    next();
  };
}
