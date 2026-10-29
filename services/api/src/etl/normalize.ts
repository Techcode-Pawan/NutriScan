import { normalizeBarcode } from './barcode.js';
import { categoryBySlug, resolveLegacyCategory, resolveOffCategory, type CategoryMethod } from './categories.js';
import { declaredShares, nonVegetarianEvidence } from './ingredients.js';
import { parseNutrient, round } from './numbers.js';

export type Basis = 'PER_100G' | 'PER_100ML' | 'UNKNOWN';
export type Source = 'OPEN_FOOD_FACTS' | 'LEGACY_CSV' | 'USER_SUBMISSION';

export interface NormalizedNutrition {
  basis: Basis;
  basisNote: string;
  energyKcal: number | null;
  fatG: number | null;
  saturatedFatG: number | null;
  transFatG: number | null;
  carbohydratesG: number | null;
  sugarsG: number | null;
  fiberG: number | null;
  proteinG: number | null;
  sodiumMg: number | null;
  fruitVegPct: number | null;
  nutsLegumesMilletsPct: number | null;
  extra: Record<string, number> | null;
}

export interface NormalizedProduct {
  sourceRef: string;
  dataSource: Source;
  barcode: string | null;
  name: string;
  brand: string | null;
  categorySlug: string | null;
  categoryMethod: CategoryMethod | null;
  subcategory: string | null;
  ingredientsText: string | null;
  imageUrl: string | null;
  quantity: string | null;
  isVegetarian: boolean | null;
  sourceModifiedAt: string | null;
  nutrition: NormalizedNutrition;
  qualityFlags: string[];
  referenceLabels: Record<string, string | number> | null;
}

export type NormalizeOutcome =
  | { ok: true; product: NormalizedProduct }
  | { ok: false; sourceRef: string; reason: string };

export const DISPLAY_NUTRIENTS = [
  'energyKcal', 'fatG', 'saturatedFatG', 'carbohydratesG', 'sugarsG', 'fiberG', 'proteinG', 'sodiumMg',
] as const;

export function completeness(n: NormalizedNutrition): number {
  const present = DISPLAY_NUTRIENTS.filter((k) => n[k] !== null).length;
  return Math.round((present / DISPLAY_NUTRIENTS.length) * 100) / 100;
}

/** Text cleaning (thesis Table 3.2 step 6): unicode-normalise, drop marks and stray encodings. */
export function cleanText(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw)
    .normalize('NFKC')
    .replace(/[®™©]/g, ' ')
    .replace(/[ �]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > 0 ? s : null;
}

function titleCaseBrand(brand: string | null): string | null {
  if (!brand) return null;
  if (brand !== brand.toUpperCase()) return brand; // already mixed case: keep as written
  return brand.toLowerCase().replace(/(^|[\s\-&/(])([a-z])/g, (_, p, c: string) => p + c.toUpperCase());
}

/**
 * Plausibility checks (thesis Table 3.2 step 4). Returns a rejection reason or null.
 * Small tolerances absorb label rounding.
 */
export function plausibilityError(n: NormalizedNutrition): string | null {
  const grams = ['fatG', 'saturatedFatG', 'transFatG', 'carbohydratesG', 'sugarsG', 'fiberG', 'proteinG'] as const;
  for (const k of [...grams, 'energyKcal', 'sodiumMg'] as const) {
    const v = n[k];
    if (v !== null && v < 0) return `negative ${k}`;
  }
  for (const k of grams) {
    const v = n[k];
    if (v !== null && v > 100) return `${k} above 100 g per 100`;
  }
  if (n.sodiumMg !== null && n.sodiumMg > 40000) return 'sodium above 40 000 mg per 100 (salt > 100 g)';
  if (n.energyKcal !== null && n.energyKcal > 900) return 'energy above 900 kcal per 100';
  if (n.sugarsG !== null && n.carbohydratesG !== null && n.sugarsG > n.carbohydratesG + 0.5)
    return 'sugars greater than carbohydrates';
  if (n.saturatedFatG !== null && n.fatG !== null && n.saturatedFatG > n.fatG + 0.5)
    return 'saturated fat greater than total fat';
  const macros = (n.fatG ?? 0) + (n.carbohydratesG ?? 0) + (n.proteinG ?? 0);
  if (macros > 105) return 'fat + carbohydrate + protein above 105 g per 100';
  return null;
}

/** Flags (not rejects) energy values that disagree strongly with the macronutrients. */
function energyConsistencyFlag(n: NormalizedNutrition): string | null {
  if (n.energyKcal === null || n.fatG === null || n.carbohydratesG === null || n.proteinG === null) return null;
  const computed = 9 * n.fatG + 4 * n.carbohydratesG + 4 * n.proteinG + 2 * (n.fiberG ?? 0);
  const diff = Math.abs(computed - n.energyKcal);
  return diff > 60 && diff / Math.max(computed, n.energyKcal) > 0.35 ? 'energy_macro_mismatch' : null;
}

function finish(p: NormalizedProduct): NormalizeOutcome {
  const reason = plausibilityError(p.nutrition);
  if (reason) return { ok: false, sourceRef: p.sourceRef, reason: `implausible: ${reason}` };
  const flag = energyConsistencyFlag(p.nutrition);
  if (flag) p.qualityFlags.push(flag);
  const cat = p.categorySlug ? categoryBySlug(p.categorySlug) : undefined;
  const e = p.nutrition.energyKcal;
  if (cat?.minPlausibleEnergyKcal && e !== null && e < cat.minPlausibleEnergyKcal && p.nutrition.basis !== 'UNKNOWN') {
    p.nutrition.basis = 'UNKNOWN';
    p.nutrition.basisNote = `Energy of ${e} kcal is implausibly low per 100 g for ${cat.name.toLowerCase()}; the values are probably per serving or as prepared, so no rating is computed.`;
    p.qualityFlags.push('suspected_per_serving_values');
  }
  if (!p.categorySlug) p.qualityFlags.push('category_unmapped');
  else if (p.categoryMethod === 'name_keyword') p.qualityFlags.push('category_inferred_from_name');
  p.qualityFlags = [...new Set(p.qualityFlags)];
  return { ok: true, product: p };
}

// ---------------------------------------------------------------------------------------------
// Legacy CSV (data/raw/packaged_foods_india.csv)
// ---------------------------------------------------------------------------------------------

export type LegacyRow = Record<string, string>;

export function normalizeLegacyRow(row: LegacyRow): NormalizeOutcome {
  const sourceRef = `legacy-csv:${row['S.No']?.trim()}`;
  const name = cleanText(row['Item name']);
  if (!name) return { ok: false, sourceRef, reason: 'no usable name' };
  const flags: string[] = ['unverified_source'];

  const read = (col: string) => {
    const r = parseNutrient(row[col]);
    if (r.flag) flags.push(`${r.flag}:${col}`);
    return r.value;
  };
  const raw = {
    energyKcal: read('Calories_kcal'),
    carbohydratesG: read('Carbohydrates_g'),
    proteinG: read('Proteins_g'),
    fatG: read('Total_Fat_g'),
    saturatedFatG: read('Saturated_Fat_g'),
    transFatG: read('Trans_Fat_g'),
    sugarsG: read('Sugar_g'),
    sodiumMg: read('Sodium_mg'),
    fiberG: read('Dietary_Fiber_g'),
  };
  if (raw.fiberG === 0) flags.push('fibre_zero_unverified');

  const { slug, method } = resolveLegacyCategory(row['Category'] ?? '', row['Sub_Category'] ?? '', name);
  const cat = slug ? categoryBySlug(slug) : undefined;
  const isLiquid = cat?.isBeverage ?? false;

  // Measurement basis: the CSV gives a "Serving_Size_g" column but never states the basis.
  const serving = parseNutrient(row['Serving_Size_g']).value;
  let basis: Basis;
  let basisNote: string;
  const macros = (raw.fatG ?? 0) + (raw.carbohydratesG ?? 0) + (raw.proteinG ?? 0);
  if (serving === 100) {
    basis = isLiquid ? 'PER_100ML' : 'PER_100G';
    basisNote = 'Assumed per 100 g/ml because the source serving column is 100 (not stated explicitly).';
    flags.push('basis_assumed');
  } else if (serving !== null && (macros > serving * 1.05 || (raw.energyKcal ?? 0) > serving * 9 * 1.05)) {
    basis = isLiquid ? 'PER_100ML' : 'PER_100G';
    basisNote = `Inferred per 100: the macronutrients/energy exceed what a ${serving} g serving can contain.`;
    flags.push('basis_inferred');
  } else {
    basis = 'UNKNOWN';
    basisNote =
      serving === null
        ? 'Serving size missing; basis cannot be determined.'
        : `Values may be per ${serving} g serving or per 100 g; the source does not say, so no rating is computed.`;
    flags.push('basis_unknown');
  }

  const extra: Record<string, number> = {};
  for (const [col, key] of [['Cholesterol_mg', 'cholesterolMg'], ['Calcium_mg', 'calciumMg'], ['Iron_mg', 'ironMg']] as const) {
    const v = parseNutrient(row[col]).value;
    if (v !== null && v > 0) extra[key] = v;
  }

  const ingredients = cleanText(row['Ingredients']);
  const shares = declaredShares(ingredients);
  const nonVeg = nonVegetarianEvidence(`${name} ${ingredients ?? ''}`);
  const price = parseNutrient(row['Price_INR']).value;

  const product: NormalizedProduct = {
    sourceRef,
    dataSource: 'LEGACY_CSV',
    barcode: null,
    name,
    brand: titleCaseBrand(cleanText(row['Brand_Name'])),
    categorySlug: slug,
    categoryMethod: method,
    subcategory: cleanText(row['Sub_Category'])?.toLowerCase().replace(/(^|\s)\w/g, (c) => c.toUpperCase()) ?? null,
    ingredientsText: ingredients,
    imageUrl: null,
    quantity: null,
    isVegetarian: nonVeg ? false : null,
    sourceModifiedAt: null,
    nutrition: {
      basis,
      basisNote,
      ...Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, round(v)])) as Omit<
        NormalizedNutrition,
        'basis' | 'basisNote' | 'fruitVegPct' | 'nutsLegumesMilletsPct' | 'extra'
      >,
      fruitVegPct: shares.fruitVegPct,
      nutsLegumesMilletsPct: shares.nutsLegumesMilletsPct,
      extra: Object.keys(extra).length ? extra : null,
    },
    qualityFlags: flags,
    referenceLabels: price !== null ? { priceInr: price } : null,
  };
  return finish(product);
}

// ---------------------------------------------------------------------------------------------
// Open Food Facts
// ---------------------------------------------------------------------------------------------

export interface OffProduct {
  code?: string | number;
  product_name?: string;
  product_name_en?: string;
  brands?: string | string[];
  categories_tags?: string[];
  ingredients_text?: string | null;
  ingredients_text_en?: string | null;
  image_front_small_url?: string | null;
  last_modified_t?: number;
  nutriments?: Record<string, number | string | undefined>;
  nutriscore_grade?: string;
  nova_group?: number;
  quantity?: string;
  labels_tags?: string[];
  ingredients_analysis_tags?: string[];
}

const nut = (n: OffProduct['nutriments'], key: string): number | null => {
  const v = n?.[key];
  if (v === undefined || v === null || v === '') return null;
  const num = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(num) ? num : null;
};

export function normalizeOffProduct(p: OffProduct): NormalizeOutcome {
  const rawCode = p.code === undefined ? '' : String(p.code);
  const sourceRef = `off:${rawCode}`;
  const bc = normalizeBarcode(rawCode);
  if (!bc.valid) return { ok: false, sourceRef, reason: `invalid barcode (${bc.reason})` };
  const name = cleanText(p.product_name) ?? cleanText(p.product_name_en);
  if (!name) return { ok: false, sourceRef, reason: 'no usable name' };
  const flags: string[] = [];
  const n = p.nutriments ?? {};

  let energyKcal = nut(n, 'energy-kcal_100g');
  if (energyKcal === null) {
    const kj = nut(n, 'energy-kj_100g') ?? nut(n, 'energy_100g');
    if (kj !== null) {
      energyKcal = kj / 4.184;
      flags.push('energy_converted_from_kj');
    }
  }
  let sodiumMg: number | null = null;
  const sodiumG = nut(n, 'sodium_100g');
  const saltG = nut(n, 'salt_100g');
  if (sodiumG !== null) sodiumMg = sodiumG * 1000;
  else if (saltG !== null) {
    sodiumMg = (saltG / 2.5) * 1000;
    flags.push('sodium_from_salt');
  }

  const { slug, method } = resolveOffCategory(p.categories_tags, name);
  const cat = slug ? categoryBySlug(slug) : undefined;
  const qty = p.quantity ?? '';
  const liquidByQty = /\d\s*(ml|l|ltr|litre|liter)\b/i.test(qty);
  const isLiquid = cat ? cat.isBeverage : liquidByQty;

  const ingredients = cleanText(p.ingredients_text_en) ?? cleanText(p.ingredients_text);
  const shares = declaredShares(ingredients);
  const analysis = p.ingredients_analysis_tags ?? [];
  const labels = p.labels_tags ?? [];
  let isVegetarian: boolean | null = null;
  if (analysis.includes('en:non-vegetarian')) isVegetarian = false;
  else if (analysis.includes('en:vegetarian') || labels.includes('en:vegetarian') || labels.includes('en:vegan')) isVegetarian = true;
  if (nonVegetarianEvidence(`${name} ${ingredients ?? ''}`)) isVegetarian = false;

  const brand = Array.isArray(p.brands) ? p.brands[0] : p.brands?.split(',')[0];
  const ref: Record<string, string | number> = {};
  if (p.nutriscore_grade && /^[a-e]$/.test(p.nutriscore_grade)) ref.nutriscoreGrade = p.nutriscore_grade;
  if (typeof p.nova_group === 'number') ref.novaGroup = p.nova_group;

  const product: NormalizedProduct = {
    sourceRef,
    dataSource: 'OPEN_FOOD_FACTS',
    barcode: bc.gtin,
    name,
    brand: cleanText(brand),
    categorySlug: slug,
    categoryMethod: method,
    subcategory: null,
    ingredientsText: ingredients,
    imageUrl: p.image_front_small_url ?? null,
    quantity: cleanText(p.quantity),
    isVegetarian,
    sourceModifiedAt: p.last_modified_t ? new Date(p.last_modified_t * 1000).toISOString() : null,
    nutrition: {
      basis: isLiquid ? 'PER_100ML' : 'PER_100G',
      basisNote: 'Open Food Facts normalised per-100 g/ml values.',
      energyKcal: round(energyKcal),
      fatG: round(nut(n, 'fat_100g')),
      saturatedFatG: round(nut(n, 'saturated-fat_100g')),
      transFatG: round(nut(n, 'trans-fat_100g')),
      carbohydratesG: round(nut(n, 'carbohydrates_100g')),
      sugarsG: round(nut(n, 'sugars_100g')),
      fiberG: round(nut(n, 'fiber_100g')),
      proteinG: round(nut(n, 'proteins_100g')),
      sodiumMg: round(sodiumMg),
      fruitVegPct: shares.fruitVegPct,
      nutsLegumesMilletsPct: shares.nutsLegumesMilletsPct,
      extra: null,
    },
    qualityFlags: flags,
    referenceLabels: Object.keys(ref).length ? ref : null,
  };
  return finish(product);
}

/** Thesis Table 3.2 step 2: keep one record per key, preferring completeness then recency. */
export function dedupe(products: NormalizedProduct[], key: (p: NormalizedProduct) => string): {
  kept: NormalizedProduct[];
  dropped: Array<{ sourceRef: string; keptRef: string }>;
} {
  const best = new Map<string, NormalizedProduct>();
  const dropped: Array<{ sourceRef: string; keptRef: string }> = [];
  for (const p of products) {
    const k = key(p);
    const cur = best.get(k);
    if (!cur) {
      best.set(k, p);
      continue;
    }
    const better =
      completeness(p.nutrition) > completeness(cur.nutrition) ||
      (completeness(p.nutrition) === completeness(cur.nutrition) && (p.sourceModifiedAt ?? '') > (cur.sourceModifiedAt ?? ''));
    if (better) {
      dropped.push({ sourceRef: cur.sourceRef, keptRef: p.sourceRef });
      best.set(k, p);
    } else dropped.push({ sourceRef: p.sourceRef, keptRef: cur.sourceRef });
  }
  return { kept: [...best.values()], dropped };
}
