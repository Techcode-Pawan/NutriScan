import type { Prisma, PrismaClient } from '@prisma/client';
import { completeness, type NormalizedProduct } from '../../etl/normalize.js';
import { scoreNutrition } from '../scoring/score-product.js';

type Tx = Prisma.TransactionClient | PrismaClient;

export interface CategoryLookup {
  get(slug: string): { id: number; inrClass: 'SOLID' | 'LIQUID' | 'EXEMPT' | null; isBeverage: boolean } | undefined;
}

/**
 * Upserts one normalised product with its nutrition facts and INR health score.
 * Keyed by sourceRef (and barcode when present) so re-imports update in place.
 */
export async function upsertNormalizedProduct(
  tx: Tx,
  p: NormalizedProduct,
  categories: CategoryLookup,
  importBatchId: number | null,
): Promise<string> {
  const cat = p.categorySlug ? categories.get(p.categorySlug) : undefined;
  const base = {
    barcode: p.barcode,
    name: p.name,
    brand: p.brand,
    categoryId: cat?.id ?? null,
    subcategory: p.subcategory,
    ingredientsText: p.ingredientsText,
    imageUrl: p.imageUrl,
    quantity: p.quantity,
    isVegetarian: p.isVegetarian,
    dataSource: p.dataSource,
    sourceModifiedAt: p.sourceModifiedAt ? new Date(p.sourceModifiedAt) : null,
    qualityFlags: p.qualityFlags,
    referenceLabels: (p.referenceLabels ?? undefined) as Prisma.InputJsonValue | undefined,
    importBatchId,
  };
  // A barcode may already exist under another sourceRef (e.g. an approved submission later found in OFF).
  const existing = p.barcode
    ? await tx.product.findFirst({ where: { OR: [{ sourceRef: p.sourceRef }, { barcode: p.barcode }] }, select: { id: true } })
    : await tx.product.findUnique({ where: { sourceRef: p.sourceRef }, select: { id: true } });
  const product = existing
    ? await tx.product.update({ where: { id: existing.id }, data: { ...base, sourceRef: p.sourceRef } })
    : await tx.product.create({ data: { ...base, sourceRef: p.sourceRef } });

  const n = p.nutrition;
  const nutritionData = {
    basis: n.basis,
    basisNote: n.basisNote,
    energyKcal: n.energyKcal,
    fatG: n.fatG,
    saturatedFatG: n.saturatedFatG,
    transFatG: n.transFatG,
    carbohydratesG: n.carbohydratesG,
    sugarsG: n.sugarsG,
    fiberG: n.fiberG,
    proteinG: n.proteinG,
    sodiumMg: n.sodiumMg,
    fruitVegPct: n.fruitVegPct,
    nutsLegumesMilletsPct: n.nutsLegumesMilletsPct,
    completeness: completeness(n),
    extra: (n.extra ?? undefined) as Prisma.InputJsonValue | undefined,
  };
  await tx.nutritionFacts.upsert({
    where: { productId: product.id },
    create: { productId: product.id, ...nutritionData },
    update: nutritionData,
  });

  const s = scoreNutrition(n, cat ? { inrClass: cat.inrClass, isBeverage: cat.isBeverage } : null);
  const scoreData = {
    algorithmVersion: s.result.algorithmVersion,
    status: s.result.status,
    inrClass: s.result.inrClass,
    starRating: s.result.stars,
    finalScore: s.result.finalScore,
    baselinePoints: s.result.baselinePoints,
    positivePoints: s.result.positivePoints,
    breakdown: s.result as unknown as Prisma.InputJsonValue,
    explanation: s.explanation as unknown as Prisma.InputJsonValue,
    dataCompleteness: s.result.dataCompleteness,
    isHfss: s.hfss.isHfss,
    computedAt: new Date(),
  };
  await tx.healthScore.upsert({
    where: { productId: product.id },
    create: { productId: product.id, ...scoreData },
    update: scoreData,
  });
  return product.id;
}

export async function categoryLookup(tx: Tx): Promise<CategoryLookup> {
  const rows = await tx.category.findMany({ select: { id: true, slug: true, inrClass: true, isBeverage: true } });
  const map = new Map(rows.map((r) => [r.slug, r]));
  return { get: (slug) => map.get(slug) };
}
