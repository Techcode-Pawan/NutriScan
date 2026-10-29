/**
 * Seeds reference data: primary categories (from data/import/category_mapping.json),
 * the INR threshold rows (category_thresholds) and the active scoring algorithm record.
 * Idempotent: safe to run repeatedly.
 */
import '../config/env.js';
import { loadMapping } from '../etl/categories.js';
import { prisma } from '../lib/prisma.js';
import { INR_CONFIG } from '../modules/scoring/inr.config.js';

export async function seedReferenceData(): Promise<{ categories: number; thresholds: number }> {
  const mapping = loadMapping();
  for (const c of mapping.categories) {
    await prisma.category.upsert({
      where: { slug: c.slug },
      create: { slug: c.slug, name: c.name, inrClass: c.inrClass, isBeverage: c.isBeverage, description: c.description },
      update: { name: c.name, inrClass: c.inrClass, isBeverage: c.isBeverage, description: c.description },
    });
  }

  const rows: Array<{ algorithmVersion: string; inrClass: 'SOLID' | 'LIQUID'; parameter: string; kind: string; points: number; greaterThan: number }> = [];
  for (const cls of ['SOLID', 'LIQUID'] as const) {
    const t = INR_CONFIG.classes[cls];
    for (const [kind, table] of [['baseline', t.baseline], ['positive', t.positive]] as const) {
      for (const [parameter, thresholds] of Object.entries(table)) {
        (thresholds as number[]).forEach((gt, i) =>
          rows.push({ algorithmVersion: INR_CONFIG.version, inrClass: cls, parameter, kind, points: i + 1, greaterThan: gt }),
        );
      }
    }
  }
  await prisma.$transaction([
    prisma.categoryThreshold.deleteMany({ where: { algorithmVersion: INR_CONFIG.version } }),
    prisma.categoryThreshold.createMany({ data: rows }),
    prisma.scoringAlgorithm.updateMany({ data: { isActive: false } }),
    prisma.scoringAlgorithm.upsert({
      where: { version: INR_CONFIG.version },
      create: {
        version: INR_CONFIG.version,
        name: 'Indian Nutrition Rating (FSSAI draft 2022)',
        source: INR_CONFIG.source,
        config: INR_CONFIG.classes as object,
        assumptions: INR_CONFIG.assumptions,
        isActive: true,
      },
      update: { config: INR_CONFIG.classes as object, assumptions: INR_CONFIG.assumptions, isActive: true, source: INR_CONFIG.source },
    }),
  ]);
  return { categories: mapping.categories.length, thresholds: rows.length };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop()!);
if (isMain) {
  seedReferenceData()
    .then((r) => console.log(`Seeded ${r.categories} categories and ${r.thresholds} INR threshold rows (${INR_CONFIG.version}).`))
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
