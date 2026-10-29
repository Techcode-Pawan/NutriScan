/**
 * Loads cleaned records (output of `npm run etl`) into PostgreSQL inside transactions,
 * upserting by source reference/barcode and computing the INR score for each product
 * (thesis Table 3.2 step 8).
 *
 * Usage:
 *   npm run data:import                       # data/processed/products.jsonl
 *   npm run data:import -- --file <jsonl> --batch <label>
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import '../config/env.js';
import { DATA_DIR } from '../config/paths.js';
import type { NormalizedProduct } from '../etl/normalize.js';
import { prisma } from '../lib/prisma.js';
import { categoryLookup, upsertNormalizedProduct } from '../modules/products/product-writer.js';
import { seedReferenceData } from './seed.js';

const CHUNK = 100;

export async function importFile(file: string, batchLabel: string): Promise<{ imported: number; failed: number }> {
  if (!existsSync(file)) throw new Error(`File not found: ${file}. Run \`npm run etl\` first.`);
  const records = readFileSync(file, 'utf-8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as NormalizedProduct);

  await seedReferenceData();
  const categories = await categoryLookup(prisma);
  const batch = await prisma.importBatch.create({ data: { source: batchLabel, fileName: path.basename(file) } });

  let imported = 0;
  let failed = 0;
  const errors: Array<{ sourceRef: string; error: string }> = [];
  for (let i = 0; i < records.length; i += CHUNK) {
    const chunk = records.slice(i, i + CHUNK);
    try {
      await prisma.$transaction(
        async (tx) => {
          for (const p of chunk) await upsertNormalizedProduct(tx, p, categories, batch.id);
        },
        { timeout: 60000 },
      );
      imported += chunk.length;
    } catch {
      // Retry the chunk row by row so one bad record does not block the others.
      for (const p of chunk) {
        try {
          await prisma.$transaction((tx) => upsertNormalizedProduct(tx, p, categories, batch.id));
          imported += 1;
        } catch (e) {
          failed += 1;
          errors.push({ sourceRef: p.sourceRef, error: (e as Error).message.split('\n').slice(-1)[0] });
        }
      }
    }
    process.stdout.write(`\r${Math.min(i + CHUNK, records.length)}/${records.length}`);
  }
  process.stdout.write('\n');

  const statusCounts = await prisma.healthScore.groupBy({ by: ['status'], _count: true });
  await prisma.importBatch.update({
    where: { id: batch.id },
    data: {
      finishedAt: new Date(),
      stats: { records: records.length, imported, failed, errors: errors.slice(0, 50), statusCounts: statusCounts.map((s) => ({ status: s.status, count: s._count })) },
    },
  });
  return { imported, failed };
}

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const file = path.resolve(flag('--file') ?? path.join(DATA_DIR, 'processed', 'products.jsonl'));
importFile(file, flag('--batch') ?? 'etl')
  .then(async ({ imported, failed }) => {
    const total = await prisma.product.count();
    const rated = await prisma.healthScore.count({ where: { starRating: { not: null } } });
    console.log(`Imported ${imported} records (${failed} failed). Database now holds ${total} products, ${rated} with an INR star rating.`);
  })
  .catch((e) => {
    console.error(e.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
