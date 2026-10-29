/**
 * Reviewer CLI for missing-product submissions (thesis FR11). Approved submissions become
 * products with dataSource USER_SUBMISSION and the flags "user_submitted" and "unverified".
 *
 *   npm run submissions:review -- list
 *   npm run submissions:review -- approve <id> [--category <slug>] [--note "..."]
 *   npm run submissions:review -- reject <id> --note "reason"
 */
import '../config/env.js';
import { normalizeBarcode } from '../etl/barcode.js';
import { categoryBySlug } from '../etl/categories.js';
import { declaredShares } from '../etl/ingredients.js';
import { plausibilityError, type NormalizedProduct } from '../etl/normalize.js';
import { prisma } from '../lib/prisma.js';
import { categoryLookup, upsertNormalizedProduct } from '../modules/products/product-writer.js';

const [cmd, idArg, ...rest] = process.argv.slice(2);
const opt = (name: string) => {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
};

async function main() {
  if (cmd === 'list' || !cmd) {
    const rows = await prisma.productSubmission.findMany({ where: { status: 'PENDING' }, orderBy: { submittedAt: 'asc' } });
    if (!rows.length) console.log('No pending submissions.');
    for (const r of rows) console.log(`#${r.id}  ${r.barcode ?? '(no barcode)'}  ${r.name}  ${r.brand ?? ''}  [${r.source}]  ${JSON.stringify(r.payload)}`);
    return;
  }
  const id = Number(idArg);
  const sub = await prisma.productSubmission.findUnique({ where: { id } });
  if (!sub) throw new Error(`Submission ${idArg} not found`);
  if (cmd === 'reject') {
    await prisma.productSubmission.update({ where: { id }, data: { status: 'REJECTED', reviewerNote: opt('--note') ?? null, reviewedAt: new Date() } });
    console.log(`Rejected #${id}.`);
    return;
  }
  if (cmd !== 'approve') throw new Error('Usage: list | approve <id> | reject <id>');

  const payload = sub.payload as { categorySlug?: string | null; ingredientsText?: string | null; nutrition?: Record<string, number | string | null> | null };
  const slug = opt('--category') ?? payload.categorySlug ?? null;
  if (slug && !categoryBySlug(slug)) throw new Error(`Unknown category ${slug}`);
  const n = payload.nutrition ?? {};
  const v = (k: string) => (n[k] === undefined || n[k] === null ? null : Number(n[k]));
  const shares = declaredShares(payload.ingredientsText ?? null);
  const barcode = sub.barcode ? normalizeBarcode(sub.barcode) : null;
  const product: NormalizedProduct = {
    sourceRef: `submission:${sub.id}`,
    dataSource: 'USER_SUBMISSION',
    barcode: barcode && barcode.valid ? barcode.gtin : null,
    name: sub.name,
    brand: sub.brand,
    categorySlug: slug,
    categoryMethod: slug ? 'legacy_mapping' : null,
    subcategory: null,
    ingredientsText: payload.ingredientsText ?? null,
    imageUrl: null,
    quantity: null,
    isVegetarian: null,
    sourceModifiedAt: sub.submittedAt.toISOString(),
    nutrition: {
      basis: ((n.basis as string) ?? 'UNKNOWN') as 'PER_100G' | 'PER_100ML' | 'UNKNOWN',
      basisNote: 'Entered by a user; approved by a reviewer.',
      energyKcal: v('energyKcal'),
      fatG: v('fatG'),
      saturatedFatG: v('saturatedFatG'),
      transFatG: null,
      carbohydratesG: v('carbohydratesG'),
      sugarsG: v('sugarsG'),
      fiberG: v('fiberG'),
      proteinG: v('proteinG'),
      sodiumMg: v('sodiumMg'),
      fruitVegPct: shares.fruitVegPct,
      nutsLegumesMilletsPct: shares.nutsLegumesMilletsPct,
      extra: null,
    },
    qualityFlags: ['user_submitted', 'unverified'],
    referenceLabels: null,
  };
  const err = plausibilityError(product.nutrition);
  if (err) throw new Error(`Cannot approve: implausible values (${err}). Reject it or correct the payload first.`);
  const categories = await categoryLookup(prisma);
  const productId = await prisma.$transaction(async (tx) => {
    const pid = await upsertNormalizedProduct(tx, product, categories, null);
    await tx.productSubmission.update({ where: { id }, data: { status: 'APPROVED', reviewerNote: opt('--note') ?? null, reviewedAt: new Date() } });
    return pid;
  });
  console.log(`Approved #${id} as product ${productId}.`);
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
