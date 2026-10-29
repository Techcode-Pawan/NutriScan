import { Router } from 'express';
import { z } from 'zod';
import { AppError, notFound, pageQuery, paginationMeta, parse } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';
import { requireAuth } from '../../middleware/auth.js';
import { DEFAULT_PREFERENCES } from '../preferences/preference-context.js';
import { findProduct, productInclude, productSummary } from '../products/product.service.js';

export const historyRouter = Router();
export const favoritesRouter = Router();
export const preferencesRouter = Router();

historyRouter.use(requireAuth);
favoritesRouter.use(requireAuth);
preferencesRouter.use(requireAuth);

async function productIdFor(key: string): Promise<string> {
  const p = await findProduct(key);
  if (!p) throw notFound('PRODUCT_NOT_FOUND', 'Product not found.');
  return p.id;
}

const productRef = z
  .object({ productId: z.string().optional(), barcode: z.string().optional() })
  .refine((b) => b.productId || b.barcode, { message: 'productId or barcode is required' });

// ---- Scan history ------------------------------------------------------------------------

historyRouter.get('/', async (req, res) => {
  const q = parse(z.object(pageQuery), req.query);
  const where = { userId: req.user!.id };
  const [rows, total] = await Promise.all([
    prisma.scanHistory.findMany({
      where,
      orderBy: { scannedAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: { product: { include: productInclude } },
    }),
    prisma.scanHistory.count({ where }),
  ]);
  res.json({
    data: rows.map((r) => ({ id: r.id.toString(), scannedAt: r.scannedAt, method: r.method, product: productSummary(r.product) })),
    meta: paginationMeta(q.page, q.pageSize, total),
  });
});

historyRouter.post('/', async (req, res) => {
  const body = parse(productRef.and(z.object({ method: z.enum(['CAMERA', 'MANUAL', 'IMAGE', 'SEARCH']).default('MANUAL') })), req.body);
  const productId = await productIdFor(body.productId ?? body.barcode!);
  const row = await prisma.scanHistory.create({ data: { userId: req.user!.id, productId, method: body.method } });
  res.status(201).json({ data: { id: row.id.toString(), scannedAt: row.scannedAt, method: row.method, productId } });
});

historyRouter.delete('/', async (req, res) => {
  const r = await prisma.scanHistory.deleteMany({ where: { userId: req.user!.id } });
  res.json({ data: { deleted: r.count } });
});

historyRouter.delete('/:id', async (req, res) => {
  const id = parse(z.coerce.bigint(), req.params.id);
  // Scoped to the owner: another user's id simply matches nothing.
  const r = await prisma.scanHistory.deleteMany({ where: { id, userId: req.user!.id } });
  if (r.count === 0) throw notFound('NOT_FOUND', 'History entry not found.');
  res.status(204).end();
});

// ---- Favourites --------------------------------------------------------------------------

favoritesRouter.get('/', async (req, res) => {
  const rows = await prisma.favorite.findMany({
    where: { userId: req.user!.id },
    orderBy: { addedAt: 'desc' },
    include: { product: { include: productInclude } },
  });
  res.json({ data: rows.map((r) => ({ addedAt: r.addedAt, product: productSummary(r.product) })) });
});

favoritesRouter.post('/', async (req, res) => {
  const body = parse(productRef, req.body);
  const productId = await productIdFor(body.productId ?? body.barcode!);
  const fav = await prisma.favorite.upsert({
    where: { userId_productId: { userId: req.user!.id, productId } },
    create: { userId: req.user!.id, productId },
    update: {},
  });
  res.status(201).json({ data: { productId, addedAt: fav.addedAt } });
});

// DELETE /api/favorites/:barcode  (barcode or product id)
favoritesRouter.delete('/:key', async (req, res) => {
  const productId = await productIdFor(String(req.params.key));
  const r = await prisma.favorite.deleteMany({ where: { userId: req.user!.id, productId } });
  if (r.count === 0) throw notFound('NOT_FOUND', 'This product is not in your favourites.');
  res.status(204).end();
});

// ---- Preferences -------------------------------------------------------------------------

const prefSchema = z.object({
  lowSugar: z.boolean(),
  lowSodium: z.boolean(),
  lowSaturatedFat: z.boolean(),
  highFiber: z.boolean(),
  highProtein: z.boolean(),
  vegetarian: z.boolean(),
  excludedIngredients: z
    .array(z.string().trim().min(2, 'Each excluded ingredient needs at least 2 characters').max(40))
    .max(20)
    .transform((a) => [...new Set(a.map((s) => s.toLowerCase()))]),
  ageGroup: z.enum(['CHILD', 'TEEN', 'ADULT', 'SENIOR']).nullable(),
});

preferencesRouter.get('/', async (req, res) => {
  const p = await prisma.userPreference.findUnique({ where: { userId: req.user!.id } });
  const { userId: _u, updatedAt, ...rest } = p ?? { userId: '', updatedAt: null, ...DEFAULT_PREFERENCES };
  res.json({ data: { ...rest, updatedAt } });
});

preferencesRouter.put('/', async (req, res) => {
  const body = parse(prefSchema.partial(), req.body);
  if (Object.keys(body).length === 0) throw new AppError(400, 'VALIDATION_ERROR', 'No preference fields supplied.');
  const p = await prisma.userPreference.upsert({
    where: { userId: req.user!.id },
    create: { userId: req.user!.id, ...DEFAULT_PREFERENCES, ...body },
    update: body,
  });
  const { userId: _u, ...rest } = p;
  res.json({ data: rest });
});
