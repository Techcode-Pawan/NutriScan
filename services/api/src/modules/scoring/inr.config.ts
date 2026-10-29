/**
 * Indian Nutrition Rating (INR) tables, transcribed from:
 *   FSSAI Draft Notification F. No. Std./SP-08/T(FoPNL-N-01), 13 September 2022,
 *   Schedule-III Tables 1-6 and Schedule-IV (copy in docs/reference/FSSAI_Draft_INR_2022.pdf).
 *
 * Each points table is a list of strict lower bounds: `thresholds[i]` is the value that
 * must be EXCEEDED (">") to earn `i + 1` points. A value <= thresholds[0] earns 0 points.
 * This mirrors the draft's "0: <= x, 1: > x, 2: > y ..." layout exactly.
 *
 * Where the draft is ambiguous, the interpretation is recorded in `assumptions` and in
 * docs/SCORING.md. Nothing here is tuned or invented; changing a value requires a new version.
 */

export type FoodClass = 'SOLID' | 'LIQUID';
export type NegativeFactor = 'energyKcal' | 'saturatedFatG' | 'sugarsG' | 'sodiumMg';
export type PositiveFactor = 'fruitVegPct' | 'nutsLegumesMilletsPct' | 'fiberG' | 'proteinG';

export interface StarBand {
  stars: number;
  /** inclusive lower bound of the final score; null = no lower bound */
  min: number | null;
  /** inclusive upper bound of the final score; null = no upper bound */
  max: number | null;
}

export interface FoodClassTables {
  /** Unit basis the tables apply to. */
  basis: 'per 100 g' | 'per 100 ml';
  /** Factors that contribute baseline (negative) points for this class. */
  baseline: Partial<Record<NegativeFactor, number[]>>;
  /** Factors that can earn positive points for this class. */
  positive: Partial<Record<PositiveFactor, number[]>>;
  /** Table 4: positive-point caps, chosen by comparing baseline points to `baselineLimit`. */
  caps: {
    baselineLimit: number;
    atOrBelow: Partial<Record<PositiveFactor, number>>;
    above: Partial<Record<PositiveFactor, number>>;
  };
  /** Table 6 star bands, ordered best-first; first matching band wins. */
  stars: StarBand[];
  /** Table 1 reference values (used for explanations only, not for points). */
  referenceValues: Partial<Record<NegativeFactor, number>>;
  /** Table 1 minimum % / amount for a positive factor to count. */
  positiveMinimums: Partial<Record<PositiveFactor, number>>;
}

export interface InrConfig {
  version: string;
  source: string;
  classes: Record<FoodClass, FoodClassTables>;
  assumptions: string[];
}

/** 1..10 for energy and steps of 1 g then 2 g for saturated fat (Table 2). */
const solidSatFat = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40];
const solidSugars = [4.2, 8.4, 12.6, 16.8, 21, 25.2, 29.4, 33.6, 37.8, 42, 46.2, 50.4, 54.6, 58.8, 63, 67.2, 71.4, 75.6, 79.8, 84];
const solidSodium = Array.from({ length: 25 }, (_, i) => 90 * (i + 1));
const solidEnergy = [80, 160, 240, 320, 400, 480, 560, 640, 720, 800];
// FV and NLM rows as printed: >10, >15 ... >50, then >55 (row 10).
const solidFvNlm = [10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
const solidFibre = [3, 6, 9, 12, 15, 18, 21, 24, 27, 30];
const protein = [1.5, 2.0, 2.5, 3.0, 5, 7, 10, 15, 20, 25, 30, 35, 40, 45, 50];

const liquidEnergy = [6, 12, 18, 24, 30, 36, 42, 48, 54, 60];
const liquidSugars = [0.1, 1.6, 3.1, 4.6, 6.1, 7.6, 9.1, 10.6, 12.1, 13.6];
// Liquid FV rows as printed: >5 ... >45, then >55 (row 10).
const liquidFv = [5, 10, 15, 20, 25, 30, 35, 40, 45, 55];

export const INR_CONFIG: InrConfig = {
  version: 'INR-FSSAI-DRAFT-2022-v1',
  source:
    'FSSAI Draft Notification F.No. Std./SP-08/T(FoPNL-N-01) dated 13.09.2022, Schedule-III Tables 1-6 and Schedule-IV',
  classes: {
    SOLID: {
      basis: 'per 100 g',
      baseline: {
        energyKcal: solidEnergy,
        saturatedFatG: solidSatFat,
        sugarsG: solidSugars,
        sodiumMg: solidSodium,
      },
      positive: {
        fruitVegPct: solidFvNlm,
        nutsLegumesMilletsPct: solidFvNlm,
        fiberG: solidFibre,
        proteinG: protein,
      },
      caps: {
        baselineLimit: 20,
        atOrBelow: { proteinG: 15, fruitVegPct: 10, nutsLegumesMilletsPct: 10, fiberG: 10 },
        above: { proteinG: 7, fruitVegPct: 5, nutsLegumesMilletsPct: 5, fiberG: 5 },
      },
      stars: [
        { stars: 5, min: null, max: -11 },
        { stars: 4.5, min: -10, max: -7 },
        { stars: 4, min: -6, max: -2 },
        { stars: 3.5, min: -1, max: 2 },
        { stars: 3, min: 3, max: 6 },
        { stars: 2.5, min: 7, max: 11 },
        { stars: 2, min: 12, max: 15 },
        { stars: 1.5, min: 16, max: 20 },
        { stars: 1, min: 21, max: 24 },
        { stars: 0.5, min: 25, max: null },
      ],
      referenceValues: { energyKcal: 400, sugarsG: 21, saturatedFatG: 5, sodiumMg: 450 },
      positiveMinimums: { fruitVegPct: 10, nutsLegumesMilletsPct: 10, fiberG: 3, proteinG: 1.5 },
    },
    LIQUID: {
      basis: 'per 100 ml',
      // Table 3 lists only energy and total sugars as baseline factors for Category-II.
      baseline: { energyKcal: liquidEnergy, sugarsG: liquidSugars },
      // Table 3 lists only FV and protein as positive factors for Category-II.
      positive: { fruitVegPct: liquidFv, proteinG: protein },
      caps: {
        baselineLimit: 10,
        atOrBelow: { fruitVegPct: 10, proteinG: 15 },
        above: { fruitVegPct: 5, proteinG: 7 },
      },
      // Draft Table 6 liquid column prints overlapping bands "16-18", "18-20", ">=20".
      // Resolved first-match from the best band: 18 -> 1.5, 19-20 -> 1, >=21 -> 0.5.
      stars: [
        { stars: 5, min: null, max: 0 },
        { stars: 4.5, min: 1, max: 2 },
        { stars: 4, min: 3, max: 4 },
        { stars: 3.5, min: 5, max: 6 },
        { stars: 3, min: 7, max: 9 },
        { stars: 2.5, min: 10, max: 12 },
        { stars: 2, min: 13, max: 15 },
        { stars: 1.5, min: 16, max: 18 },
        { stars: 1, min: 19, max: 20 },
        { stars: 0.5, min: 21, max: null },
      ],
      referenceValues: { energyKcal: 30, sugarsG: 6, saturatedFatG: 3, sodiumMg: 100 },
      positiveMinimums: { fruitVegPct: 5, proteinG: 1.5 },
    },
  },
  assumptions: [
    'Liquid star bands overlap in the draft (16-18, 18-20, >=20); resolved first-match: 18 -> 1.5 stars, 19-20 -> 1 star, >=21 -> 0.5 stars.',
    'FV/NLM tables skip from >50 (solid) / >45 (liquid) to >55 at row 10; transcribed as printed.',
    'Dairy beverages are Category-I (solid tables) per Table 2 heading; their per-100 ml values are treated as per-100 g.',
    '"Beverage without energy and/or sugar" is interpreted as declared energy = 0 or declared total sugars = 0 -> not eligible.',
    'FV/NLM percentages are only counted when declared in the ingredient list; otherwise 0 points are awarded and the explanation says so.',
    'Product-to-category mapping uses data/import/category_mapping.json because datasets do not carry FSS Appendix-A category numbers.',
    'Final scores are integers because all points are integers; star bands are matched on that integer.',
  ],
};
