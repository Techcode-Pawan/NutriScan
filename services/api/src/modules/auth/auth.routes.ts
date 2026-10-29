import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { AppError, parse } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';
import { requireAuth, signToken } from '../../middleware/auth.js';
import { authLimiter } from '../../middleware/rate-limit.js';

export const authRouter = Router();
export const meRouter = Router();

const BCRYPT_ROUNDS = 12;
// Compared against when the email is unknown, so both paths take the same time.
let dummyHash: string | null = null;
const getDummyHash = async () => (dummyHash ??= await bcrypt.hash('timing-equaliser-not-a-password', BCRYPT_ROUNDS));
const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number');

const publicUser = (u: { id: string; email: string; displayName: string | null; createdAt: Date }) => ({
  id: u.id,
  email: u.email,
  displayName: u.displayName,
  createdAt: u.createdAt,
});

authRouter.post('/register', authLimiter, async (req, res) => {
  const body = parse(z.object({ email, password, displayName: z.string().trim().min(1).max(60).optional() }), req.body);
  const exists = await prisma.user.findUnique({ where: { email: body.email }, select: { id: true } });
  if (exists) throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists.');
  const user = await prisma.user.create({
    data: {
      email: body.email,
      passwordHash: await bcrypt.hash(body.password, BCRYPT_ROUNDS),
      displayName: body.displayName,
      preferences: { create: {} },
    },
  });
  res.status(201).json({ data: { token: signToken(user), user: publicUser(user) } });
});

authRouter.post('/login', authLimiter, async (req, res) => {
  const body = parse(z.object({ email, password: z.string().min(1).max(128) }), req.body);
  const user = await prisma.user.findUnique({ where: { email: body.email } });
  // Same message for unknown email and wrong password, to avoid account enumeration.
  const ok = await bcrypt.compare(body.password, user ? user.passwordHash : await getDummyHash());
  if (!user || !ok) throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  res.json({ data: { token: signToken(user), user: publicUser(user) } });
});

/** Tokens are stateless; the client discards its token. This endpoint exists for symmetry and auditing. */
authRouter.post('/logout', requireAuth, (_req, res) => {
  res.status(204).end();
});

/** Invalidates every token issued so far for this account. */
authRouter.post('/logout-all', requireAuth, async (req, res) => {
  await prisma.user.update({ where: { id: req.user!.id }, data: { tokenVersion: { increment: 1 } } });
  res.status(204).end();
});

meRouter.use(requireAuth);

meRouter.get('/', async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  const [scans, favorites, submissions] = await Promise.all([
    prisma.scanHistory.count({ where: { userId: user.id } }),
    prisma.favorite.count({ where: { userId: user.id } }),
    prisma.productSubmission.count({ where: { userId: user.id } }),
  ]);
  res.json({ data: { ...publicUser(user), counts: { scans, favorites, submissions } } });
});

meRouter.patch('/', async (req, res) => {
  const body = parse(z.object({ displayName: z.string().trim().min(1).max(60).nullable() }), req.body);
  const user = await prisma.user.update({ where: { id: req.user!.id }, data: { displayName: body.displayName } });
  res.json({ data: publicUser(user) });
});

meRouter.post('/password', async (req, res) => {
  const body = parse(z.object({ currentPassword: z.string().min(1).max(128), newPassword: password }), req.body);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (!(await bcrypt.compare(body.currentPassword, user.passwordHash))) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Current password is incorrect.');
  }
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(body.newPassword, BCRYPT_ROUNDS), tokenVersion: { increment: 1 } },
  });
  res.json({ data: { token: signToken(updated) } });
});

/** Deletes the account and, through cascades, its history, favourites and preferences. */
meRouter.delete('/', async (req, res) => {
  await prisma.user.delete({ where: { id: req.user!.id } });
  res.status(204).end();
});
