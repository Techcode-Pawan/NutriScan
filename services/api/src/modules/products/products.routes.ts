import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { badRequest, pageQuery, paginationMeta, parse } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';
import { optionalAuth } from '../../middleware/auth.js';
import { compareProducts } from '../comparison/comparison.service.js';
import { getMlPrediction } from '../ml/ml.service.js';
import { findAlternatives } from '../recommendations/recommendation.service.js';
import { getProductOrThrow, loadPreferences, productDetail, productInclude, SORTS, searchProducts, type SortKey } from './product.service.js';

export const productsRouter = Router();
export const categoriesRouter = Router();
export const compareRouter = Router();

const sortKeys = ['relevance', ...Object.keys(SORTS)] as [SortKey, ...SortKey[]];
const searchSchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.coerce.number().int().positive().optional(),
  subcategory: z.string().trim().max(60).optional(),
  brand: z.string().trim().max(60).optional(),
  ratedOnly: z.enum(['true', 'false']).optional(),
  sort: z.enum(sortKeys).default('relevance'),
  order: z.enum(['asc', 'desc']).optional(),
  ...pageQuery,
});

// GET /api/products/search?q=&category=&subcategory=&brand=&sort=&order=&page=&pageSize=
productsRouter.get('/search', async (req, res) => {
  const q = parse(searchSchema, req.query);
  const order = q.order ?? (['rating', 'protein', 'fiber'].includes(q.sort) ? 'desc' : 'asc');
  const { items, total } = await searchProducts({
    q: q.q,
    categoryId: q.category,
    subcategory: q.subcategory,
    brand: q.brand,
    ratedOnly: q.ratedOnly === 'true',
    sort: q.sort,
    order,
    page: q.page,
    pageSize: q.pageSize,
  });
  res.json({ data: items, meta: paginationMeta(q.page, q.pageSize, total) });
});

// GET /api/products/:key  (key = barcode or product id)
productsRouter.get('/:key', optionalAuth, async (req, res) => {
  const { product, lookup } = await getProductOrThrow(String(req.params.key), { allowLiveLookup: env.OFF_LIVE_LOOKUP });
  const prefs = await loadPreferences(req.user?.id);
  res.json({ data: productDetail(product, prefs), meta: { lookup } });
});

// GET /api/products/:key/explanation - INR breakdown and explanation only
productsRouter.get('/:key/explanation', async (req, res) => {
  const { product } = await getProductOrThrow(String(req.params.key));
  const hs = product.healthScore;
  res.json({
    data: hs
      ? { status: hs.status, stars: hs.starRating === null ? null : Number(hs.starRating), breakdown: hs.breakdown, explanation: hs.explanation, algorithmVersion: hs.algorithmVersion }
      : null,
  });
});

// GET /api/products/:key/alternatives?limit=&includePartial=&applyPreferences=
productsRouter.get('/:key/alternatives', optionalAuth, async (req, res) => {
  const q = parse(
    z.object({
      limit: z.coerce.number().int().min(1).max(20).default(5),
      includePartial: z.enum(['true', 'false']).default('false'),
      applyPreferences: z.enum(['true', 'false']).default('true'),
    }),
    req.query,
  );
  const { product } = await getProductOrThrow(String(req.params.key));
  const prefs = await loadPreferences(req.user?.id);
  const result = await findAlternatives(product, prefs, {
    limit: q.limit,
    includePartial: q.includePartial === 'true',
    applyPreferences: q.applyPreferences === 'true',
  });
  res.json({ data: result });
});

// GET /api/products/:key/ml - experimental ML estimate (separate from INR)
productsRouter.get('/:key/ml', async (req, res) => {
  const { product } = await getProductOrThrow(String(req.params.key));
  res.json({ data: await getMlPrediction(product) });
});

// GET /api/categories
categoriesRouter.get('/', async (_req, res) => {
  const [categories, counts, rated] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: 'asc' } }),
    prisma.product.groupBy({ by: ['categoryId'], _count: true }),
    prisma.$queryRaw<Array<{ category_id: number; c: bigint }>>`
      SELECT p.category_id, count(*) AS c FROM products p JOIN health_scores h ON h.product_id = p.id
      WHERE h.star_rating IS NOT NULL GROUP BY p.category_id`,
  ]);
  const countMap = new Map(counts.map((c) => [c.categoryId, c._count]));
  const ratedMap = new Map(rated.map((r) => [r.category_id, Number(r.c)]));
  res.json({
    data: categories.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      inrClass: c.inrClass,
      isBeverage: c.isBeverage,
      description: c.description,
      productCount: countMap.get(c.id) ?? 0,
      ratedCount: ratedMap.get(c.id) ?? 0,
    })),
  });
});

// GET /api/categories/:id/products  (id or slug; sorted by INR rating by default)
categoriesRouter.get('/:id/products', async (req, res) => {
  const idParam = String(req.params.id);
  const category = /^\d+$/.test(idParam)
    ? await prisma.category.findUnique({ where: { id: Number(idParam) } })
    : await prisma.category.findUnique({ where: { slug: idParam } });
  if (!category) throw badRequest('UNKNOWN_CATEGORY', `Category "${idParam}" does not exist.`);
  const q = parse(
    z.object({
      sort: z.enum(sortKeys).default('rating'),
      order: z.enum(['asc', 'desc']).optional(),
      subcategory: z.string().trim().max(60).optional(),
      q: z.string().trim().max(100).optional(),
      ...pageQuery,
    }),
    req.query,
  );
  const order = q.order ?? (q.sort === 'rating' || q.sort === 'protein' || q.sort === 'fiber' ? 'desc' : 'asc');
  const { items, total } = await searchProducts({ categoryId: category.id, subcategory: q.subcategory, q: q.q, sort: q.sort, order, page: q.page, pageSize: q.pageSize });
  res.json({ data: items, meta: { ...paginationMeta(q.page, q.pageSize, total), category: { id: category.id, slug: category.slug, name: category.name } } });
});

// POST /api/compare  { products: [barcode|id, ...] }  (also accepts { barcodes: [...] })
compareRouter.post('/', async (req, res) => {
  const body = parse(
    z
      .object({ products: z.array(z.string().trim().min(1)).optional(), barcodes: z.array(z.string().trim().min(1)).optional() })
      .refine((b) => (b.products ?? b.barcodes ?? []).length >= 2 && (b.products ?? b.barcodes ?? []).length <= 4, {
        message: 'Provide between 2 and 4 products to compare',
      }),
    req.body,
  );
  const keys = [...new Set(body.products ?? body.barcodes ?? [])];
  if (keys.length < 2) throw badRequest('VALIDATION_ERROR', 'Provide at least two different products to compare.');
  const products = [];
  for (const k of keys) products.push((await getProductOrThrow(k)).product);
  const ml = await prisma.mlPrediction.findMany({ where: { productId: { in: products.map((p) => p.id) } }, orderBy: { createdAt: 'desc' } });
  const mlMap = new Map<string, { predictedGrade: string; mlIndex: number } | null>();
  for (const m of ml) if (!mlMap.has(m.productId)) mlMap.set(m.productId, { predictedGrade: m.predictedGrade, mlIndex: m.mlIndex });
  res.json({ data: compareProducts(products, mlMap) });
});

export { productInclude };
