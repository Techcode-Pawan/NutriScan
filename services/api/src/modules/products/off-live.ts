import { env } from '../../config/env.js';
import { normalizeOffProduct, type OffProduct } from '../../etl/normalize.js';
import { prisma } from '../../lib/prisma.js';
import { categoryLookup, upsertNormalizedProduct } from './product-writer.js';
import type { ProductWithRelations } from './product.service.js';

const FIELDS = [
  'code', 'product_name', 'product_name_en', 'brands', 'categories_tags', 'ingredients_text', 'ingredients_text_en',
  'image_front_small_url', 'last_modified_t', 'nutriments', 'nutriscore_grade', 'nova_group', 'quantity',
  'labels_tags', 'ingredients_analysis_tags',
].join(',');

/**
 * Optional on-demand lookup (OFF_LIVE_LOOKUP=true). Disabled by default because the thesis
 * design avoids third-party calls at scan time. A product found this way is normalised with the
 * same ETL rules and stored with Open Food Facts provenance. Failures return null, never fake data.
 */
export async function liveLookupOpenFoodFacts(barcode: string): Promise<ProductWithRelations | null> {
  if (!env.OFF_LIVE_LOOKUP) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=${FIELDS}`, {
      headers: { 'User-Agent': env.OFF_USER_AGENT },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { status?: number; product?: OffProduct };
    if (body.status !== 1 || !body.product) return null;
    const normalized = normalizeOffProduct({ ...body.product, code: barcode });
    if (!normalized.ok) return null;
    normalized.product.qualityFlags.push('live_lookup');
    const categories = await categoryLookup(prisma);
    const id = await prisma.$transaction((tx) => upsertNormalizedProduct(tx, normalized.product, categories, null));
    return prisma.product.findUnique({ where: { id }, include: { category: true, nutrition: true, healthScore: true } });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
