import { Prisma } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { AppError } from '../lib/http.js';

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: { code: 'ROUTE_NOT_FOUND', message: `No route for ${req.method} ${req.path}` } });
}

// Express recognises error handlers by their four parameters.
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  if (err instanceof multer.MulterError) {
    const tooLarge = err.code === 'LIMIT_FILE_SIZE';
    res.status(tooLarge ? 413 : 400).json({
      error: { code: tooLarge ? 'FILE_TOO_LARGE' : 'UPLOAD_ERROR', message: tooLarge ? 'Image must be 8 MB or smaller.' : err.message },
    });
    return;
  }
  if (err instanceof SyntaxError && 'body' in (err as object)) {
    res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON.' } });
    return;
  }
  if (err instanceof Prisma.PrismaClientInitializationError || (err as { code?: string })?.code === 'P1001') {
    res.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'The product database is temporarily unavailable. Please try again shortly.' } });
    return;
  }
  // Unexpected: log server-side without request bodies (they may hold passwords), return a generic message.
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}`, err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on the server.' } });
}
