import type { NormalizedProduct } from '../../src/etl/normalize.js';
import { prisma } from '../../src/lib/prisma.js';
import { categoryLookup, upsertNormalizedProduct } from '../../src/modules/products/product-writer.js';
import { seedReferenceData } from '../../src/scripts/seed.js';

/** EAN-13 in the GS1 "200-299" restricted-circulation range: never a real retail product. */
export function testBarcode(n: number): string {
  const body = `200000000${String(n).padStart(3, '0')}`;
  let sum = 0;
  for (let i = body.length - 1, w = 3; i >= 0; i -= 1, w = w === 3 ? 1 : 3) sum += Number(body[i]) * w;
  return body + ((10 - (sum % 10)) % 10);
}

type N = Partial<NormalizedProduct['nutrition']>;
const fixture = (n: number, name: string, category: string, nutrition: N, extra: Partial<NormalizedProduct> = {}): NormalizedProduct => ({
  sourceRef: `test:${n}`,
  dataSource: 'OPEN_FOOD_FACTS',
  barcode: testBarcode(n),
  name,
  brand: 'Test Brand',
  categorySlug: category,
  categoryMethod: 'source_tag',
  subcategory: null,
  ingredientsText: 'Wheat flour, sugar, palm oil',
  imageUrl: null,
  quantity: null,
  isVegetarian: true,
  sourceModifiedAt: null,
  nutrition: {
    basis: 'PER_100G',
    basisNote: 'test fixture',
    energyKcal: null,
    fatG: 15,
    saturatedFatG: null,
    transFatG: null,
    carbohydratesG: 65,
    sugarsG: null,
    fiberG: null,
    proteinG: null,
    sodiumMg: null,
    fruitVegPct: null,
    nutsLegumesMilletsPct: null,
    extra: null,
    ...nutrition,
  },
  qualityFlags: ['test_fixture'],
  referenceLabels: null,
  ...extra,
});

/**
 * Hand-computed expected INR results (FSSAI draft Table 2 / 3 / 4 / 6):
 *  1 Choco Cream: E5 S9 U7 Na2 = 23 (>20, reduced caps); P 6g -> 5; final 18 -> 1.5 stars
 *  2 Oat Digestive: E5 S3 U2 Na3 = 13; F 7g -> 2, P 9g -> 6; final 5 -> 3 stars
 *  3 Millet Cracker: E4 S0 U0 Na4 = 8; F 10g -> 3, P 12g -> 7, NLM 60% -> 10; final -12 -> 5 stars
 *  4 Egg Cookie (non-veg): E4 S1 U1 Na1 = 7; F 4g -> 1, P 8g -> 6; final 0 -> 3.5 stars
 *  5 Partial Biscuit (no fibre): E3 S0 U0 Na0 = 3; P 12g -> 7; final -4 -> 4 stars, PARTIAL
 *  6 Orange Drink (liquid): E8 U8 = 16 (>10); final 16 -> 1.5 stars
 *  7 No-barcode legacy product: sodium missing -> INSUFFICIENT_DATA
 */
export const FIXTURES: NormalizedProduct[] = [
  fixture(1, 'Test Choco Cream Biscuit', 'biscuits-cookies', { energyKcal: 480, saturatedFatG: 10, fatG: 20, sugarsG: 32, sodiumMg: 200, fiberG: 1, proteinG: 6 }),
  fixture(2, 'Test Oat Digestive', 'biscuits-cookies', { energyKcal: 430, saturatedFatG: 4, sugarsG: 12, sodiumMg: 300, fiberG: 7, proteinG: 9 }, { ingredientsText: 'Whole wheat flour (40%), oats (20%), sugar, palm oil' }),
  fixture(3, 'Test Millet Cracker', 'biscuits-cookies', { energyKcal: 400, saturatedFatG: 1, sugarsG: 2, sodiumMg: 400, fiberG: 10, proteinG: 12, nutsLegumesMilletsPct: 60 }, { ingredientsText: 'Ragi flour (60%), rice flour, salt' }),
  fixture(4, 'Test Egg Cookie', 'biscuits-cookies', { energyKcal: 380, saturatedFatG: 2, sugarsG: 5, sodiumMg: 100, fiberG: 4, proteinG: 8 }, { isVegetarian: false, ingredientsText: 'Wheat flour, egg, butter' }),
  fixture(5, 'Test Partial Biscuit', 'biscuits-cookies', { energyKcal: 300, saturatedFatG: 0.5, sugarsG: 3, sodiumMg: 50, fiberG: null, proteinG: 12 }),
  fixture(6, 'Test Orange Drink', 'beverages', { basis: 'PER_100ML', energyKcal: 50, saturatedFatG: 0, fatG: 0, carbohydratesG: 12.5, sugarsG: 12, sodiumMg: 10, fiberG: 0, proteinG: 0 }, { ingredientsText: 'Water, orange juice concentrate (10%), sugar' }),
  fixture(7, 'Test Legacy Namkeen', 'snacks-namkeen', { energyKcal: 520, saturatedFatG: 8, sugarsG: 3, sodiumMg: null, fiberG: 2, proteinG: 10 }, { barcode: null, dataSource: 'LEGACY_CSV', sourceRef: 'test-legacy:7' }),
];

export async function resetDatabase() {
  if (!process.env.DATABASE_URL?.includes('nutriscan_test')) throw new Error('Refusing to reset a non-test database');
  await prisma.$executeRawUnsafe(
    'TRUNCATE assistant_queries, ml_predictions, ml_model_versions, product_submissions, favorites, scan_history, user_preferences, users, health_scores, nutrition_facts, products, import_batches, category_thresholds, scoring_algorithms, categories RESTART IDENTITY CASCADE',
  );
  await seedReferenceData();
  const cats = await categoryLookup(prisma);
  for (const f of FIXTURES) await upsertNormalizedProduct(prisma, f, cats, null);
}
