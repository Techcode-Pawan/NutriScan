import { describe, expect, it } from 'vitest';
import { normalizeBarcode } from '../../src/etl/barcode.js';
import { resolveLegacyCategory, resolveOffCategory } from '../../src/etl/categories.js';
import { allergenMentions, declaredShares, ingredientInsights, nonVegetarianEvidence } from '../../src/etl/ingredients.js';
import { normalizeLegacyRow, normalizeOffProduct, plausibilityError } from '../../src/etl/normalize.js';
import { parseNutrient } from '../../src/etl/numbers.js';

describe('barcode normalisation (GS1)', () => {
  it('accepts a valid EAN-13', () => {
    expect(normalizeBarcode('8901719134845')).toEqual({ valid: true, gtin: '8901719134845', format: 'EAN-13' });
  });
  it('rejects a wrong check digit', () => {
    expect(normalizeBarcode('8901719134846')).toMatchObject({ valid: false, reason: 'check digit mismatch' });
  });
  it('converts UPC-A to 13 digits', () => {
    expect(normalizeBarcode('036000291452')).toEqual({ valid: true, gtin: '0036000291452', format: 'UPC-A' });
  });
  it('accepts EAN-8 and rejects unsupported lengths / non-numeric input', () => {
    expect(normalizeBarcode('96385074').valid).toBe(true);
    expect(normalizeBarcode('12345').valid).toBe(false);
    expect(normalizeBarcode('89017ABC34845').valid).toBe(false);
  });
});

describe('numeric parsing keeps missing as null', () => {
  it.each([
    ['', null, null],
    ['12.5', 12.5, null],
    ['<1', 1, 'less_than_value'],
    ['7,65', 7.65, 'decimal_comma'],
    ['5.928.8', null, 'invalid_number'],
    ['NA', null, null],
  ])('%s', (raw, value, flag) => {
    expect(parseNutrient(raw)).toEqual({ value, flag });
  });
});

const legacyRow = (over: Record<string, string> = {}) => ({
  'S.No': '1',
  'Item name': 'HIDE & SEEK® ',
  Brand_Name: 'PARLE',
  Category: 'BISCUIT',
  Sub_Category: 'COOKIES',
  Ingredients: 'REFINED WHEAT FLOUR (MAIDA), CHOCOLATE (23%), SUGAR, REFINED PALM OIL',
  Serving_Size_g: '100',
  Calories_kcal: '479',
  Carbohydrates_g: '73.4',
  Proteins_g: '5.9',
  Total_Fat_g: '18',
  Saturated_Fat_g: '9.4',
  Trans_Fat_g: '0',
  Sugar_g: '32.5',
  Sodium_mg: '114',
  Dietary_Fiber_g: '0',
  Price_INR: '30',
  ...over,
});

describe('legacy CSV normalisation', () => {
  it('cleans text, maps the category and records the basis assumption', () => {
    const r = normalizeLegacyRow(legacyRow());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.product.name).toBe('HIDE & SEEK');
    expect(r.product.brand).toBe('Parle');
    expect(r.product.barcode).toBeNull();
    expect(r.product.categorySlug).toBe('biscuits-cookies');
    expect(r.product.nutrition.basis).toBe('PER_100G');
    expect(r.product.qualityFlags).toEqual(expect.arrayContaining(['unverified_source', 'basis_assumed', 'fibre_zero_unverified']));
  });
  it('does not guess the basis when values could be per serving', () => {
    const r = normalizeLegacyRow(legacyRow({ Serving_Size_g: '30', Calories_kcal: '140', Carbohydrates_g: '20', Proteins_g: '2', Total_Fat_g: '5', Saturated_Fat_g: '2', Sugar_g: '8' }));
    expect(r.ok && r.product.nutrition.basis).toBe('UNKNOWN');
  });
  it('infers per-100 when macros exceed the serving mass', () => {
    const r = normalizeLegacyRow(legacyRow({ Serving_Size_g: '30' }));
    expect(r.ok && r.product.nutrition.basis).toBe('PER_100G');
    expect(r.ok && r.product.qualityFlags).toContain('basis_inferred');
  });
  it('keeps missing nutrients as null', () => {
    const r = normalizeLegacyRow(legacyRow({ Sodium_mg: '' }));
    expect(r.ok && r.product.nutrition.sodiumMg).toBeNull();
  });
  it('rejects implausible rows', () => {
    const r = normalizeLegacyRow(legacyRow({ Sugar_g: '90', Carbohydrates_g: '50' }));
    expect(r).toMatchObject({ ok: false });
  });
  it('treats juices as per 100 ml', () => {
    const r = normalizeLegacyRow(legacyRow({ Category: 'JUICE', Sub_Category: 'FRUIT BEVERAGE', 'Item name': 'Mango drink' }));
    expect(r.ok && r.product.categorySlug).toBe('beverages');
    expect(r.ok && r.product.nutrition.basis).toBe('PER_100ML');
  });
});

describe('Open Food Facts normalisation', () => {
  const off = {
    code: '8901719134845',
    product_name: 'Parle-G Biscuit',
    brands: 'Parle',
    categories_tags: ['en:snacks', 'en:biscuits'],
    nutriments: { 'energy-kj_100g': 1900, fat_100g: 13, 'saturated-fat_100g': 6, carbohydrates_100g: 77, sugars_100g: 25, proteins_100g: 7, salt_100g: 0.75 },
    nutriscore_grade: 'e',
  };
  it('converts kJ to kcal and salt to sodium, keeps the reference grade', () => {
    const r = normalizeOffProduct(off);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.product.nutrition.energyKcal).toBeCloseTo(454.11, 1);
    expect(r.product.nutrition.sodiumMg).toBe(300);
    expect(r.product.nutrition.fiberG).toBeNull();
    expect(r.product.categorySlug).toBe('biscuits-cookies');
    expect(r.product.referenceLabels).toEqual({ nutriscoreGrade: 'e' });
    expect(r.product.qualityFlags).toEqual(expect.arrayContaining(['energy_converted_from_kj', 'sodium_from_salt']));
  });
  it('rejects invalid barcodes instead of inventing one', () => {
    expect(normalizeOffProduct({ ...off, code: '12345' })).toMatchObject({ ok: false });
  });
  it('flags implausibly low energy for a dry category as unknown basis', () => {
    const r = normalizeOffProduct({ ...off, nutriments: { 'energy-kcal_100g': 57, fat_100g: 2.6, 'saturated-fat_100g': 1.3, carbohydrates_100g: 8, sugars_100g: 1.7, proteins_100g: 1, sodium_100g: 0.05 } });
    expect(r.ok && r.product.nutrition.basis).toBe('UNKNOWN');
    expect(r.ok && r.product.qualityFlags).toContain('suspected_per_serving_values');
  });
});

describe('plausibility rules (thesis Table 3.2)', () => {
  const base = { basis: 'PER_100G' as const, basisNote: '', energyKcal: 400, fatG: 10, saturatedFatG: 5, transFatG: null, carbohydratesG: 60, sugarsG: 20, fiberG: 3, proteinG: 8, sodiumMg: 300, fruitVegPct: null, nutsLegumesMilletsPct: null, extra: null };
  it('accepts a normal record', () => expect(plausibilityError(base)).toBeNull());
  it('rejects negative values', () => expect(plausibilityError({ ...base, proteinG: -1 })).toMatch(/negative/));
  it('rejects energy above 900 kcal', () => expect(plausibilityError({ ...base, energyKcal: 950 })).toMatch(/900/));
  it('rejects saturated fat above total fat', () => expect(plausibilityError({ ...base, saturatedFatG: 12 })).toMatch(/saturated/));
  it('rejects grams above 100', () => expect(plausibilityError({ ...base, carbohydratesG: 120, sugarsG: 10 })).toMatch(/above 100/));
});

describe('category mapping', () => {
  it('uses the first matching OFF rule (exempt before generic)', () => {
    expect(resolveOffCategory(['en:beverages', 'en:waters'], 'Water').slug).toBe('waters');
    expect(resolveOffCategory(['en:dairies', 'en:flavoured-milks', 'en:milks'], 'Kesar milk').slug).toBe('dairy-beverages');
  });
  it('falls back to name keywords and reports the method', () => {
    expect(resolveOffCategory([], 'Classic Salted Potato Chips')).toEqual({ slug: 'snacks-namkeen', method: 'name_keyword' });
    expect(resolveOffCategory([], 'Xyz 123')).toEqual({ slug: null, method: null });
  });
  it('distinguishes plain oats (exempt) from masala oats', () => {
    expect(resolveLegacyCategory('INSTANT FOOD', 'OATS', 'Saffola Oats, Instant Rolled Oats').slug).toBe('grains-flours');
    expect(resolveLegacyCategory('INSTANT FOOD', 'OATS', 'Saffola Masala Oats').slug).toBe('breakfast-cereals');
  });
});

describe('ingredient parsing', () => {
  it('sums declared FV and NLM percentages, excluding potato', () => {
    const s = declaredShares('Mango Pulp (20%), Potato (40%), Almonds (5%), Ragi flour 12%, Sugar');
    expect(s.fruitVegPct).toBe(20);
    expect(s.nutsLegumesMilletsPct).toBe(17);
  });
  it('returns null when nothing is declared', () => {
    expect(declaredShares('Wheat flour, sugar, palm oil')).toEqual({ fruitVegPct: null, nutsLegumesMilletsPct: null, evidence: [] });
  });
  it('detects non-vegetarian ingredients but never infers vegetarian', () => {
    expect(nonVegetarianEvidence('Chicken (30%), spices')).toBe('Chicken');
    expect(nonVegetarianEvidence('Eggless cake: flour, milk')).toBeNull();
    expect(nonVegetarianEvidence('Flour, egg white powder')).not.toBeNull();
  });
  it('produces descriptive insights and allergen mentions', () => {
    expect(ingredientInsights('Maida, sugar, palmolein, INS 102').map((i) => i.code)).toEqual(['added_sugars', 'palm_oil', 'refined_flour', 'synthetic_colours']);
    expect(allergenMentions('Wheat flour, milk solids, soy lecithin')).toEqual(['Milk', 'Wheat / gluten', 'Soy']);
  });
});
