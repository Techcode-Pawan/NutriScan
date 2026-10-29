import {
  INR_CONFIG,
  type FoodClass,
  type InrConfig,
  type NegativeFactor,
  type PositiveFactor,
} from './inr.config.js';

export type InrClass = FoodClass | 'EXEMPT';
export type NutritionBasis = 'PER_100G' | 'PER_100ML' | 'UNKNOWN';
export type InrStatus =
  | 'RATED'
  | 'PARTIAL'
  | 'INSUFFICIENT_DATA'
  | 'EXEMPT'
  | 'NOT_ELIGIBLE'
  | 'BASIS_UNKNOWN';

export interface InrInput {
  /** INR category of the product; null when its category could not be mapped. */
  inrClass: InrClass | null;
  /** True for drinks (non-dairy liquids and dairy beverages) - used for the beverage proviso. */
  isBeverage?: boolean;
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

export interface FactorLine<F extends string> {
  factor: F;
  label: string;
  unit: string;
  value: number | null;
  points: number;
  maxPoints: number;
  /** Threshold that was exceeded to earn `points` (null for 0 points). */
  exceeded: number | null;
  /** Next threshold above the current value (null when at maximum). */
  nextThreshold: number | null;
}

export interface PositiveLine extends FactorLine<PositiveFactor> {
  rawPoints: number;
  cap: number;
  state: 'awarded' | 'zero' | 'missing' | 'not_declared';
}

export interface InrResult {
  algorithmVersion: string;
  status: InrStatus;
  inrClass: InrClass | null;
  stars: number | null;
  finalScore: number | null;
  baselinePoints: number | null;
  positivePoints: number | null;
  baseline: FactorLine<NegativeFactor>[];
  positive: PositiveLine[];
  capRule: string | null;
  missingCore: string[];
  missingPositive: string[];
  dataCompleteness: number;
  reasons: string[];
}

export const FACTOR_META: Record<NegativeFactor | PositiveFactor, { label: string; unit: string }> = {
  energyKcal: { label: 'Energy', unit: 'kcal' },
  saturatedFatG: { label: 'Saturated fat', unit: 'g' },
  sugarsG: { label: 'Total sugars', unit: 'g' },
  sodiumMg: { label: 'Sodium', unit: 'mg' },
  fruitVegPct: { label: 'Fruit & vegetables', unit: '%' },
  nutsLegumesMilletsPct: { label: 'Nuts, legumes & millets', unit: '%' },
  fiberG: { label: 'Dietary fibre', unit: 'g' },
  proteinG: { label: 'Protein', unit: 'g' },
};

/** Labels carry at most two decimals; rounding avoids float artefacts such as 4.2000000001. */
const round2 = (v: number) => Math.round(v * 100) / 100;

/** Points = number of thresholds strictly exceeded ("> x" rows of the draft tables). */
export function pointsFor(value: number, thresholds: number[]): { points: number; exceeded: number | null; next: number | null } {
  let points = 0;
  for (const t of thresholds) {
    if (value > t) points += 1;
    else break;
  }
  return {
    points,
    exceeded: points > 0 ? thresholds[points - 1] : null,
    next: points < thresholds.length ? thresholds[points] : null,
  };
}

export function starsFor(finalScore: number, cls: FoodClass, config: InrConfig = INR_CONFIG): number {
  for (const band of config.classes[cls].stars) {
    const aboveMin = band.min === null || finalScore >= band.min;
    const belowMax = band.max === null || finalScore <= band.max;
    if (aboveMin && belowMax) return band.stars;
  }
  // Bands cover all integers; reaching here means a non-integer score fell into a gap.
  throw new Error(`No star band for score ${finalScore} (${cls})`);
}

function emptyResult(status: InrStatus, input: InrInput, reasons: string[], config: InrConfig): InrResult {
  return {
    algorithmVersion: config.version,
    status,
    inrClass: input.inrClass,
    stars: null,
    finalScore: null,
    baselinePoints: null,
    positivePoints: null,
    baseline: [],
    positive: [],
    capRule: null,
    missingCore: [],
    missingPositive: [],
    dataCompleteness: 0,
    reasons,
  };
}

export function computeInr(input: InrInput, config: InrConfig = INR_CONFIG): InrResult {
  if (input.inrClass === 'EXEMPT') {
    return emptyResult('EXEMPT', input, [
      'This product category is exempted from the Indian Nutrition Rating (draft Schedule-IV), so no star rating is assigned.',
    ], config);
  }
  if (input.inrClass === null) {
    return emptyResult('NOT_ELIGIBLE', input, [
      'The product could not be mapped to an INR food category, so the applicable rating table is unknown.',
    ], config);
  }
  if (input.basis === 'UNKNOWN') {
    return emptyResult('BASIS_UNKNOWN', input, [
      'The nutrition values could not be confirmed as per 100 g or per 100 ml, which the INR requires.',
    ], config);
  }

  const cls = input.inrClass;
  const tables = config.classes[cls];
  const baselineFactors = Object.keys(tables.baseline) as NegativeFactor[];
  const positiveFactors = Object.keys(tables.positive) as PositiveFactor[];

  const missingCore = baselineFactors.filter((f) => input[f] === null || input[f] === undefined);
  const corePositive = positiveFactors.filter((f) => f === 'fiberG' || f === 'proteinG');
  const missingPositive = corePositive.filter((f) => input[f] === null || input[f] === undefined);
  const relevant = baselineFactors.length + corePositive.length;
  const dataCompleteness = round2((relevant - missingCore.length - missingPositive.length) / relevant);

  if (missingCore.length > 0) {
    const res = emptyResult('INSUFFICIENT_DATA', input, [
      `A rating cannot be calculated reliably because ${missingCore
        .map((f) => FACTOR_META[f].label.toLowerCase())
        .join(', ')} ${missingCore.length > 1 ? 'are' : 'is'} missing. Missing values are never treated as zero.`,
    ], config);
    res.missingCore = missingCore.map((f) => FACTOR_META[f].label);
    res.missingPositive = missingPositive.map((f) => FACTOR_META[f].label);
    res.dataCompleteness = dataCompleteness;
    return res;
  }

  if (input.isBeverage && (input.energyKcal === 0 || input.sugarsG === 0)) {
    const res = emptyResult('NOT_ELIGIBLE', input, [
      'Under the draft, a beverage without energy and/or sugar is not eligible for an INR star rating.',
    ], config);
    res.dataCompleteness = dataCompleteness;
    return res;
  }

  const baseline: FactorLine<NegativeFactor>[] = baselineFactors.map((f) => {
    const value = round2(input[f] as number);
    const thresholds = tables.baseline[f]!;
    const p = pointsFor(value, thresholds);
    return {
      factor: f,
      ...FACTOR_META[f],
      value,
      points: p.points,
      maxPoints: thresholds.length,
      exceeded: p.exceeded,
      nextThreshold: p.next,
    };
  });
  const baselinePoints = baseline.reduce((s, l) => s + l.points, 0);

  const capSet = baselinePoints <= tables.caps.baselineLimit ? tables.caps.atOrBelow : tables.caps.above;
  const capRule =
    baselinePoints <= tables.caps.baselineLimit
      ? `Baseline ${baselinePoints} <= ${tables.caps.baselineLimit}: higher positive-point caps apply`
      : `Baseline ${baselinePoints} > ${tables.caps.baselineLimit}: reduced positive-point caps apply`;

  const positive: PositiveLine[] = positiveFactors.map((f) => {
    const thresholds = tables.positive[f]!;
    const cap = capSet[f] ?? thresholds.length;
    const raw = input[f];
    if (raw === null || raw === undefined) {
      const isFvNlm = f === 'fruitVegPct' || f === 'nutsLegumesMilletsPct';
      return {
        factor: f,
        ...FACTOR_META[f],
        value: null,
        points: 0,
        rawPoints: 0,
        cap,
        maxPoints: thresholds.length,
        exceeded: null,
        nextThreshold: thresholds[0],
        state: isFvNlm ? 'not_declared' : 'missing',
      };
    }
    const value = round2(raw);
    const p = pointsFor(value, thresholds);
    const points = Math.min(p.points, cap);
    return {
      factor: f,
      ...FACTOR_META[f],
      value,
      points,
      rawPoints: p.points,
      cap,
      maxPoints: thresholds.length,
      exceeded: p.exceeded,
      nextThreshold: p.next,
      state: points > 0 ? 'awarded' : 'zero',
    };
  });
  const positivePoints = positive.reduce((s, l) => s + l.points, 0);
  const finalScore = baselinePoints - positivePoints;
  const stars = starsFor(finalScore, cls, config);

  const reasons: string[] = [];
  if (missingPositive.length > 0) {
    reasons.push(
      `${missingPositive.map((f) => FACTOR_META[f].label).join(' and ')} not reported, so no positive points could be awarded for ${
        missingPositive.length > 1 ? 'them' : 'it'
      }. The true rating may be higher; this rating is partial.`,
    );
  }

  return {
    algorithmVersion: config.version,
    status: missingPositive.length > 0 ? 'PARTIAL' : 'RATED',
    inrClass: cls,
    stars,
    finalScore,
    baselinePoints,
    positivePoints,
    baseline,
    positive,
    capRule,
    missingCore: [],
    missingPositive: missingPositive.map((f) => FACTOR_META[f].label),
    dataCompleteness,
    reasons,
  };
}

/**
 * HFSS indicator as defined in the same draft (regulation 2(ib)): a product is HFSS when
 * energy from total sugar >= 10% of total energy, OR energy from saturated fat >= 10%,
 * OR sodium >= 1 mg per kcal. Uses 4 kcal/g for sugar and 9 kcal/g for fat.
 */
export function hfssCheck(n: {
  energyKcal: number | null;
  sugarsG: number | null;
  saturatedFatG: number | null;
  sodiumMg: number | null;
}): { evaluable: boolean; isHfss: boolean | null; triggers: string[] } {
  const { energyKcal, sugarsG, saturatedFatG, sodiumMg } = n;
  if (energyKcal === null || sugarsG === null || saturatedFatG === null || sodiumMg === null || energyKcal <= 0) {
    return { evaluable: false, isHfss: null, triggers: [] };
  }
  const triggers: string[] = [];
  const sugarShare = (sugarsG * 4) / energyKcal;
  const satShare = (saturatedFatG * 9) / energyKcal;
  const sodiumPerKcal = sodiumMg / energyKcal;
  if (sugarShare >= 0.1) triggers.push(`${Math.round(sugarShare * 100)}% of energy from total sugars (limit < 10%)`);
  if (satShare >= 0.1) triggers.push(`${Math.round(satShare * 100)}% of energy from saturated fat (limit < 10%)`);
  if (sodiumPerKcal >= 1) triggers.push(`${round2(sodiumPerKcal)} mg sodium per kcal (limit < 1 mg/kcal)`);
  return { evaluable: true, isHfss: triggers.length > 0, triggers };
}
