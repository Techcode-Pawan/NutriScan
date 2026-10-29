import { Prisma } from '@prisma/client';
import { normalizeBarcode } from '../../etl/barcode.js';
import { allergenMentions, declaredShares, ingredientInsights } from '../../etl/ingredients.js';
import { AppError, badRequest, notFound } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';
import { ageGroupNote, evaluatePreferences, type Preferences } from '../preferences/preference-context.js';
import { hfssCheck } from '../scoring/inr.engine.js';
import { num } from '../scoring/score-product.js';
import { liveLookupOpenFoodFacts } from './off-live.js';

export const productInclude = {
  category: true,
  nutrition: true,
  healthScore: true,
} satisfies Prisma.ProductInclude;

export type ProductWithRelations = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

export const SOURCE_INFO = {
  OPEN_FOOD_FACTS: {
    label: 'Open Food Facts',
    attribution: 'Data from Open Food Facts contributors (openfoodfacts.org), licensed under the Open Database License (ODbL 1.0).',
    verified: false,
    note: 'Crowd-sourced data. Please verify against the label on the pack.',
  },
  LEGACY_CSV: {
    label: 'NutriScan project dataset (student-collected)',
    attribution: 'Collected by the NutriScan project team from product listings; collection provenance largely unrecorded.',
    verified: false,
    note: 'Unverified data without a barcode. Please verify against the label on the pack.',
  },
  USER_SUBMISSION: {
    label: 'User submission (reviewed)',
    attribution: 'Submitted by a NutriScan user and approved by a reviewer.',
    verified: false,
    note: 'User-submitted values. Please verify against the label on the pack.',
  },
} as const;

const PRODUCT_ID = /^c[a-z0-9]{20,30}$/;

/** Resolves ":key" path params: numeric barcodes go through GS1 validation, otherwise a product id. */
export function parseProductKey(key: string): { barcode: string } | { id: string } {
  const k = key.trim();
  if (/^\d+$/.test(k)) {
    const bc = normalizeBarcode(k);
    if (!bc.valid) throw badRequest('INVALID_BARCODE', `"${k}" is not a valid EAN-8, UPC-A or EAN-13 barcode (${bc.reason}).`);
    return { barcode: bc.gtin };
  }
  if (PRODUCT_ID.test(k)) return { id: k };
  throw badRequest('INVALID_PRODUCT_KEY', 'Expected a numeric barcode or a product id.');
}

export async function findProduct(key: string): Promise<ProductWithRelations | null> {
  const parsed = parseProductKey(key);
  return prisma.product.findUnique({ where: 'barcode' in parsed ? { barcode: parsed.barcode } : { id: parsed.id }, include: productInclude });
}

/** Finds a product or throws a 404 that tells the client a submission is possible. */
export async function getProductOrThrow(key: string, opts: { allowLiveLookup?: boolean } = {}): Promise<{ product: ProductWithRelations; lookup: 'local' | 'open_food_facts_live' }> {
  const parsed = parseProductKey(key);
  const product = await findProduct(key);
  if (product) return { product, lookup: 'local' };
  if ('barcode' in parsed && opts.allowLiveLookup) {
    const live = await liveLookupOpenFoodFacts(parsed.barcode);
    if (live) return { product: live, lookup: 'open_food_facts_live' };
  }
  if ('barcode' in parsed) {
    throw notFound('PRODUCT_NOT_FOUND', 'This barcode is not in the NutriScan database yet. You can submit the product details for review.', {
      barcode: parsed.barcode,
      canSubmit: true,
    });
  }
  throw notFound('PRODUCT_NOT_FOUND', 'Product not found.');
}

export function nutritionValues(p: ProductWithRelations) {
  const n = p.nutrition;
  if (!n) return null;
  return {
    energyKcal: num(n.energyKcal),
    fatG: num(n.fatG),
    saturatedFatG: num(n.saturatedFatG),
    transFatG: num(n.transFatG),
    carbohydratesG: num(n.carbohydratesG),
    sugarsG: num(n.sugarsG),
    fiberG: num(n.fiberG),
    proteinG: num(n.proteinG),
    sodiumMg: num(n.sodiumMg),
    fruitVegPct: num(n.fruitVegPct),
    nutsLegumesMilletsPct: num(n.nutsLegumesMilletsPct),
  };
}

const NUTRIENT_LABELS: Record<string, string> = {
  energyKcal: 'Energy',
  fatG: 'Total fat',
  saturatedFatG: 'Saturated fat',
  carbohydratesG: 'Carbohydrates',
  sugarsG: 'Total sugars',
  fiberG: 'Dietary fibre',
  proteinG: 'Protein',
  sodiumMg: 'Sodium',
};

export const basisLabel = (b: string | undefined) => (b === 'PER_100ML' ? 'per 100 ml' : b === 'PER_100G' ? 'per 100 g' : 'basis unknown');

export function productSummary(p: ProductWithRelations) {
  const n = nutritionValues(p);
  return {
    id: p.id,
    barcode: p.barcode,
    name: p.name,
    brand: p.brand,
    imageUrl: p.imageUrl,
    category: p.category ? { id: p.category.id, slug: p.category.slug, name: p.category.name } : null,
    dataSource: p.dataSource,
    inr: {
      status: p.healthScore?.status ?? 'INSUFFICIENT_DATA',
      stars: num(p.healthScore?.starRating),
    },
    basis: p.nutrition?.basis ?? 'UNKNOWN',
    keyNutrients: n ? { energyKcal: n.energyKcal, sugarsG: n.sugarsG, sodiumMg: n.sodiumMg, saturatedFatG: n.saturatedFatG } : null,
  };
}

export function productDetail(p: ProductWithRelations, prefs: Preferences | null) {
  const n = nutritionValues(p);
  const hs = p.healthScore;
  const missing = n ? Object.entries(NUTRIENT_LABELS).filter(([k]) => n[k as keyof typeof n] === null).map(([, l]) => l) : Object.values(NUTRIENT_LABELS);
  const source = SOURCE_INFO[p.dataSource];
  const isLiquid = p.nutrition?.basis === 'PER_100ML';
  return {
    ...productSummary(p),
    subcategory: p.subcategory,
    quantity: p.quantity,
    isVegetarian: p.isVegetarian,
    ingredientsText: p.ingredientsText,
    category: p.category
      ? { id: p.category.id, slug: p.category.slug, name: p.category.name, inrClass: p.category.inrClass, isBeverage: p.category.isBeverage }
      : null,
    source: {
      type: p.dataSource,
      label: source.label,
      attribution: source.attribution,
      verified: source.verified,
      note: source.note,
      reference: p.sourceRef,
      lastModified: p.sourceModifiedAt,
      qualityFlags: p.qualityFlags,
    },
    nutrition: p.nutrition
      ? {
          basis: p.nutrition.basis,
          basisLabel: basisLabel(p.nutrition.basis),
          basisNote: p.nutrition.basisNote,
          values: n,
          completeness: p.nutrition.completeness,
          missing,
          extra: p.nutrition.extra,
          dataKind: 'source_data' as const,
        }
      : null,
    inr: hs
      ? {
          method: 'INR' as const,
          algorithmVersion: hs.algorithmVersion,
          status: hs.status,
          inrClass: hs.inrClass,
          stars: num(hs.starRating),
          finalScore: hs.finalScore,
          baselinePoints: hs.baselinePoints,
          positivePoints: hs.positivePoints,
          breakdown: hs.breakdown,
          explanation: hs.explanation,
          dataCompleteness: hs.dataCompleteness,
          hfss: n ? hfssCheck(n) : { evaluable: false, isHfss: null, triggers: [] },
          computedAt: hs.computedAt,
        }
      : null,
    ingredients: {
      insights: ingredientInsights(p.ingredientsText),
      allergensMentioned: allergenMentions(p.ingredientsText),
      declaredShares: declaredShares(p.ingredientsText),
      note: p.ingredientsText
        ? 'Ingredient notes are descriptive and rule-based; they do not mean an ingredient is unsafe.'
        : 'No ingredient list is available for this product.',
    },
    personal: prefs
      ? {
          checks: evaluatePreferences(prefs, n, { isVegetarian: p.isVegetarian, ingredientsText: p.ingredientsText, isLiquid }),
          ageGroupNote: ageGroupNote(prefs.ageGroup, n),
          note: 'Your preferences do not change the INR rating; they only add this personal context and re-rank alternatives.',
        }
      : null,
  };
}

// ---------------------------------------------------------------------------------------------
// Search (parameterised SQL; sort columns come from a whitelist)
// ---------------------------------------------------------------------------------------------

export const SORTS = {
  name: Prisma.sql`p.name`,
  rating: Prisma.sql`h.star_rating`,
  energy: Prisma.sql`n.energy_kcal`,
  sugar: Prisma.sql`n.sugars_g`,
  sodium: Prisma.sql`n.sodium_mg`,
  saturatedFat: Prisma.sql`n.saturated_fat_g`,
  protein: Prisma.sql`n.protein_g`,
  fiber: Prisma.sql`n.fiber_g`,
} as const;
export type SortKey = keyof typeof SORTS | 'relevance';

export interface SearchParams {
  q?: string;
  categoryId?: number;
  subcategory?: string;
  brand?: string;
  ratedOnly?: boolean;
  sort: SortKey;
  order: 'asc' | 'desc';
  page: number;
  pageSize: number;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function searchProducts(params: SearchParams) {
  const where: Prisma.Sql[] = [];
  const q = params.q?.trim();
  if (q) {
    const like = `%${escapeLike(q)}%`;
    where.push(Prisma.sql`(p.name ILIKE ${like} OR p.brand ILIKE ${like} OR p.barcode = ${q})`);
  }
  if (params.categoryId) where.push(Prisma.sql`p.category_id = ${params.categoryId}`);
  if (params.subcategory) where.push(Prisma.sql`p.subcategory ILIKE ${escapeLike(params.subcategory)}`);
  if (params.brand) where.push(Prisma.sql`p.brand ILIKE ${`%${escapeLike(params.brand)}%`}`);
  if (params.ratedOnly) where.push(Prisma.sql`h.star_rating IS NOT NULL`);
  const whereSql = where.length ? Prisma.sql`WHERE ${Prisma.join(where, ' AND ')}` : Prisma.empty;

  const dir = params.order === 'asc' ? Prisma.raw('ASC') : Prisma.raw('DESC');
  let orderSql: Prisma.Sql;
  if (params.sort === 'relevance') {
    orderSql = q
      ? Prisma.sql`ORDER BY (p.name ILIKE ${`${escapeLike(q)}%`}) DESC, similarity(p.name, ${q}) DESC, p.name ASC`
      : Prisma.sql`ORDER BY h.star_rating DESC NULLS LAST, p.name ASC`;
  } else {
    orderSql = Prisma.sql`ORDER BY ${SORTS[params.sort]} ${dir} NULLS LAST, p.name ASC`;
  }

  const offset = (params.page - 1) * params.pageSize;
  const rows = await prisma.$queryRaw<Array<{ id: string; total: bigint }>>`
    SELECT p.id, count(*) OVER () AS total
    FROM products p
    LEFT JOIN health_scores h ON h.product_id = p.id
    LEFT JOIN nutrition_facts n ON n.product_id = p.id
    ${whereSql}
    ${orderSql}
    LIMIT ${params.pageSize} OFFSET ${offset}`;

  const total = rows.length ? Number(rows[0].total) : await countOnly(whereSql);
  const ids = rows.map((r) => r.id);
  const products = await prisma.product.findMany({ where: { id: { in: ids } }, include: productInclude });
  const byId = new Map(products.map((p) => [p.id, p]));
  return { items: ids.map((id) => productSummary(byId.get(id)!)), total };
}

async function countOnly(whereSql: Prisma.Sql): Promise<number> {
  const r = await prisma.$queryRaw<Array<{ c: bigint }>>`
    SELECT count(*) AS c FROM products p
    LEFT JOIN health_scores h ON h.product_id = p.id
    LEFT JOIN nutrition_facts n ON n.product_id = p.id
    ${whereSql}`;
  return Number(r[0].c);
}

export async function loadPreferences(userId: string | undefined): Promise<Preferences | null> {
  if (!userId) return null;
  const p = await prisma.userPreference.findUnique({ where: { userId } });
  if (!p) return null;
  return {
    lowSugar: p.lowSugar,
    lowSodium: p.lowSodium,
    lowSaturatedFat: p.lowSaturatedFat,
    highFiber: p.highFiber,
    highProtein: p.highProtein,
    vegetarian: p.vegetarian,
    excludedIngredients: p.excludedIngredients,
    ageGroup: p.ageGroup,
  };
}

export function assertFound<T>(v: T | null | undefined, msg = 'Not found'): T {
  if (v === null || v === undefined) throw new AppError(404, 'NOT_FOUND', msg);
  return v;
}
