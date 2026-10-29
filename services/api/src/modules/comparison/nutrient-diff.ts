/** Shared nutrient comparison rules used by alternatives and side-by-side comparison. */

export type NutrientKey = 'energyKcal' | 'sugarsG' | 'sodiumMg' | 'saturatedFatG' | 'fatG' | 'fiberG' | 'proteinG' | 'carbohydratesG';

export const NUTRIENTS: Array<{ key: NutrientKey; label: string; unit: string; better: 'lower' | 'higher' | null; minDiff: number }> = [
  { key: 'energyKcal', label: 'Energy', unit: 'kcal', better: 'lower', minDiff: 10 },
  { key: 'sugarsG', label: 'Sugar', unit: 'g', better: 'lower', minDiff: 0.5 },
  { key: 'sodiumMg', label: 'Sodium', unit: 'mg', better: 'lower', minDiff: 20 },
  { key: 'saturatedFatG', label: 'Saturated fat', unit: 'g', better: 'lower', minDiff: 0.3 },
  { key: 'fatG', label: 'Total fat', unit: 'g', better: 'lower', minDiff: 0.5 },
  { key: 'carbohydratesG', label: 'Carbohydrates', unit: 'g', better: null, minDiff: 0.5 },
  { key: 'fiberG', label: 'Fibre', unit: 'g', better: 'higher', minDiff: 0.5 },
  { key: 'proteinG', label: 'Protein', unit: 'g', better: 'higher', minDiff: 0.5 },
];

export type NutritionMap = Partial<Record<NutrientKey, number | null>>;

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/**
 * Returns a meaningful difference only when both values exist and differ by at least an
 * absolute minimum and 10% (so label rounding is not reported as a difference).
 */
export function meaningfulDiff(a: number | null | undefined, b: number | null | undefined, minDiff: number): number | null {
  if (a === null || a === undefined || b === null || b === undefined) return null;
  const d = a - b;
  if (Math.abs(d) < minDiff) return 0;
  if (Math.abs(d) / Math.max(Math.abs(a), Math.abs(b), 1e-9) < 0.1) return 0;
  return d;
}

/** "contains less sugar (12 g vs 32.5 g per 100 g)" style statements for candidate vs reference. */
export function betterStatements(candidate: NutritionMap, reference: NutritionMap, basis: string): Array<{ key: NutrientKey; text: string }> {
  const out: Array<{ key: NutrientKey; text: string }> = [];
  for (const n of NUTRIENTS) {
    if (!n.better) continue;
    const c = candidate[n.key];
    const r = reference[n.key];
    const d = meaningfulDiff(c, r, n.minDiff);
    if (d === null || d === 0) continue;
    const isBetter = n.better === 'lower' ? d < 0 : d > 0;
    if (!isBetter) continue;
    const word = n.better === 'lower' ? 'less' : 'more';
    out.push({ key: n.key, text: `${word} ${n.label.toLowerCase()} (${fmt(c!)} ${n.unit} vs ${fmt(r!)} ${n.unit} ${basis})` });
  }
  return out;
}

export function worseStatements(candidate: NutritionMap, reference: NutritionMap, basis: string): string[] {
  const out: string[] = [];
  for (const n of NUTRIENTS) {
    if (!n.better) continue;
    const d = meaningfulDiff(candidate[n.key], reference[n.key], n.minDiff);
    if (d === null || d === 0) continue;
    const isWorse = n.better === 'lower' ? d > 0 : d < 0;
    if (isWorse) {
      out.push(`${n.better === 'lower' ? 'more' : 'less'} ${n.label.toLowerCase()} (${fmt(candidate[n.key]!)} ${n.unit} vs ${fmt(reference[n.key]!)} ${n.unit} ${basis})`);
    }
  }
  return out;
}
