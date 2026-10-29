import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from '../lib/http.js';
import { prisma } from '../lib/prisma.js';

export interface AuthUser {
  id: string;
  email: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

interface TokenPayload {
  sub: string;
  email: string;
  tv: number;
}

export function signToken(user: { id: string; email: string; tokenVersion: number }): string {
  return jwt.sign({ sub: user.id, email: user.email, tv: user.tokenVersion } satisfies TokenPayload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    algorithm: 'HS256',
  });
}

async function resolveUser(req: Request): Promise<AuthUser | null> {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw new AppError(401, 'INVALID_TOKEN', 'Authorization header must be "Bearer <token>"');
  let payload: TokenPayload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }) as TokenPayload;
  } catch {
    throw new AppError(401, 'INVALID_TOKEN', 'Session expired or invalid. Please log in again.');
  }
  const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, email: true, tokenVersion: true } });
  // tokenVersion lets "log out everywhere" and account deletion invalidate existing tokens.
  if (!user || user.tokenVersion !== payload.tv) throw new AppError(401, 'INVALID_TOKEN', 'Session is no longer valid. Please log in again.');
  return { id: user.id, email: user.email };
}

/** Attaches req.user when a valid token is sent; guests continue without one. */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  req.user = (await resolveUser(req)) ?? undefined;
  next();
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const user = await resolveUser(req);
  if (!user) throw new AppError(401, 'AUTH_REQUIRED', 'Please log in to use this feature.');
  req.user = user;
  next();
}
