import { computeInr, hfssCheck, type InrClass, type InrResult, type NutritionBasis } from './inr.engine.js';
import { explainInr, type InrExplanation } from './inr.explain.js';

/** Plain-number nutrition, as produced by the ETL or converted from Prisma decimals. */
export interface PlainNutrition {
  basis: NutritionBasis;
  energyKcal: number | null;
  saturatedFatG: number | null;
  sugarsG: number | null;
  sodiumMg: number | null;
  fiberG: number | null;
  proteinG: number | null;
  fruitVegPct: number | null;
  nutsLegumesMilletsPct: number | null;
}

export interface ProductScore {
  result: InrResult;
  explanation: InrExplanation;
  hfss: ReturnType<typeof hfssCheck>;
}

export function scoreNutrition(
  nutrition: PlainNutrition | null,
  category: { inrClass: InrClass | null; isBeverage: boolean } | null,
): ProductScore {
  const n: PlainNutrition = nutrition ?? {
    basis: 'UNKNOWN',
    energyKcal: null,
    saturatedFatG: null,
    sugarsG: null,
    sodiumMg: null,
    fiberG: null,
    proteinG: null,
    fruitVegPct: null,
    nutsLegumesMilletsPct: null,
  };
  const result = computeInr({
    inrClass: category?.inrClass ?? null,
    isBeverage: category?.isBeverage ?? false,
    ...n,
  });
  return { result, explanation: explainInr(result), hfss: hfssCheck(n) };
}

/** Converts Prisma Decimal | null fields into numbers. */
export const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
