import type { NextFunction, Request, Response } from 'express';
import { z, type ZodType } from 'zod';

/** Error with an HTTP status and a stable machine-readable code. */
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (code: string, message: string, details?: unknown) => new AppError(404, code, message, details);
export const badRequest = (code: string, message: string, details?: unknown) => new AppError(400, code, message, details);

/** Parses and validates part of a request; throws a 400 with field errors on failure. */
export function parse<T extends ZodType>(schema: T, value: unknown): z.infer<T> {
  const r = schema.safeParse(value);
  if (!r.success) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Request validation failed',
      r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return r.data;
}

export function paginationMeta(page: number, pageSize: number, total: number) {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export const pageQuery = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
};

/** Express 5 forwards rejected promises to the error handler; this keeps handler typing tidy. */
export type Handler = (req: Request, res: Response, next: NextFunction) => unknown;
