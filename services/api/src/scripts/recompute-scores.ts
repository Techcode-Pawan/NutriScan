/**
 * Recomputes every stored INR score from stored nutrition values - use after changing the
 * category mapping or releasing a new INR_CONFIG version. Usage: npm run scores:recompute
 */
import type { Prisma } from '@prisma/client';
import '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { num, scoreNutrition } from '../modules/scoring/score-product.js';

async function main() {
  const products = await prisma.product.findMany({ include: { nutrition: true, category: true } });
  let changed = 0;
  for (const p of products) {
    const n = p.nutrition;
    const s = scoreNutrition(
      n
        ? {
            basis: n.basis,
            energyKcal: num(n.energyKcal),
            saturatedFatG: num(n.saturatedFatG),
            sugarsG: num(n.sugarsG),
            sodiumMg: num(n.sodiumMg),
            fiberG: num(n.fiberG),
            proteinG: num(n.proteinG),
            fruitVegPct: num(n.fruitVegPct),
            nutsLegumesMilletsPct: num(n.nutsLegumesMilletsPct),
          }
        : null,
      p.category ? { inrClass: p.category.inrClass, isBeverage: p.category.isBeverage } : null,
    );
    const data = {
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
    await prisma.healthScore.upsert({ where: { productId: p.id }, create: { productId: p.id, ...data }, update: data });
    changed += 1;
  }
  console.log(`Recomputed ${changed} INR scores.`);
}

main().finally(() => prisma.$disconnect());
