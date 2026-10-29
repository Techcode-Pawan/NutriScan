/**
 * Personal context: compares a product's nutrients with the user's stated preferences.
 * This NEVER changes the INR rating. Cut-offs are the nutrient-claim conditions commonly used
 * on labels (Codex / FSSAI Advertising & Claims Regulations, 2018) and are used only to
 * phrase descriptive messages, not to judge suitability for any person.
 */

export interface Preferences {
  lowSugar: boolean;
  lowSodium: boolean;
  lowSaturatedFat: boolean;
  highFiber: boolean;
  highProtein: boolean;
  vegetarian: boolean;
  excludedIngredients: string[];
  ageGroup: 'CHILD' | 'TEEN' | 'ADULT' | 'SENIOR' | null;
}

export const DEFAULT_PREFERENCES: Preferences = {
  lowSugar: false,
  lowSodium: false,
  lowSaturatedFat: false,
  highFiber: false,
  highProtein: false,
  vegetarian: false,
  excludedIngredients: [],
  ageGroup: null,
};

export const CLAIM_CUTOFFS = {
  lowSugar: { solid: 5, liquid: 2.5, unit: 'g', label: "'low sugar'" },
  lowSodium: { solid: 120, liquid: 120, unit: 'mg', label: "'low sodium'" },
  lowSaturatedFat: { solid: 1.5, liquid: 0.75, unit: 'g', label: "'low saturated fat'" },
  highFiber: { solid: 3, liquid: 1.5, unit: 'g', label: "'source of fibre'" },
  /** share of energy from protein */
  highProtein: { share: 0.1, label: "'source of protein'" },
} as const;

export interface PreferenceCheck {
  preference: keyof Preferences;
  status: 'meets' | 'does_not_meet' | 'unknown';
  message: string;
}

interface NutritionValues {
  energyKcal: number | null;
  sugarsG: number | null;
  sodiumMg: number | null;
  saturatedFatG: number | null;
  fiberG: number | null;
  proteinG: number | null;
}

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

export function evaluatePreferences(
  prefs: Preferences,
  n: NutritionValues | null,
  product: { isVegetarian: boolean | null; ingredientsText: string | null; isLiquid: boolean },
): PreferenceCheck[] {
  const out: PreferenceCheck[] = [];
  const per = product.isLiquid ? 'per 100 ml' : 'per 100 g';
  const lim = (k: 'lowSugar' | 'lowSodium' | 'lowSaturatedFat') =>
    product.isLiquid ? CLAIM_CUTOFFS[k].liquid : CLAIM_CUTOFFS[k].solid;

  const lower = (key: 'lowSugar' | 'lowSodium' | 'lowSaturatedFat', value: number | null | undefined, label: string) => {
    const c = CLAIM_CUTOFFS[key];
    if (value === null || value === undefined) {
      out.push({ preference: key, status: 'unknown', message: `${label} is not reported, so your "${label.toLowerCase()}" preference cannot be checked.` });
      return;
    }
    const cut = lim(key);
    out.push(
      value <= cut
        ? { preference: key, status: 'meets', message: `${label} ${fmt(value)} ${c.unit} ${per} is within the ${fmt(cut)} ${c.unit} cut-off used for ${c.label} claims.` }
        : { preference: key, status: 'does_not_meet', message: `${label} ${fmt(value)} ${c.unit} ${per} is above the ${fmt(cut)} ${c.unit} cut-off used for ${c.label} claims.` },
    );
  };

  if (prefs.lowSugar) lower('lowSugar', n?.sugarsG, 'Sugar');
  if (prefs.lowSodium) lower('lowSodium', n?.sodiumMg, 'Sodium');
  if (prefs.lowSaturatedFat) lower('lowSaturatedFat', n?.saturatedFatG, 'Saturated fat');
  if (prefs.highFiber) {
    const v = n?.fiberG;
    const cut = product.isLiquid ? CLAIM_CUTOFFS.highFiber.liquid : CLAIM_CUTOFFS.highFiber.solid;
    out.push(
      v === null || v === undefined
        ? { preference: 'highFiber', status: 'unknown', message: 'Fibre is not reported, so your higher-fibre preference cannot be checked.' }
        : v >= cut
          ? { preference: 'highFiber', status: 'meets', message: `Fibre ${fmt(v)} g ${per} meets the ${fmt(cut)} g cut-off used for 'source of fibre' claims.` }
          : { preference: 'highFiber', status: 'does_not_meet', message: `Fibre ${fmt(v)} g ${per} is below the ${fmt(cut)} g cut-off used for 'source of fibre' claims.` },
    );
  }
  if (prefs.highProtein) {
    const p = n?.proteinG;
    const e = n?.energyKcal;
    if (p === null || p === undefined || e === null || e === undefined || e <= 0) {
      out.push({ preference: 'highProtein', status: 'unknown', message: 'Protein or energy is not reported, so your higher-protein preference cannot be checked.' });
    } else {
      const share = (p * 4) / e;
      out.push({
        preference: 'highProtein',
        status: share >= CLAIM_CUTOFFS.highProtein.share ? 'meets' : 'does_not_meet',
        message: `${Math.round(share * 100)}% of this product's energy comes from protein (the 'source of protein' claim condition is at least 10%).`,
      });
    }
  }
  if (prefs.vegetarian) {
    out.push(
      product.isVegetarian === false
        ? { preference: 'vegetarian', status: 'does_not_meet', message: 'The ingredient information indicates a non-vegetarian ingredient.' }
        : product.isVegetarian === true
          ? { preference: 'vegetarian', status: 'meets', message: 'Marked vegetarian in the source data. Always check the green/brown dot on the pack.' }
          : { preference: 'vegetarian', status: 'unknown', message: 'Vegetarian status is not recorded for this product. Check the green/brown dot on the pack.' },
    );
  }
  if (prefs.excludedIngredients.length > 0) {
    if (!product.ingredientsText) {
      out.push({ preference: 'excludedIngredients', status: 'unknown', message: 'No ingredient list is available, so your excluded ingredients cannot be checked.' });
    } else {
      const text = product.ingredientsText.toLowerCase();
      const hits = prefs.excludedIngredients.filter((e) => text.includes(e.toLowerCase()));
      out.push(
        hits.length
          ? { preference: 'excludedIngredients', status: 'does_not_meet', message: `The ingredient list mentions: ${hits.join(', ')}.` }
          : { preference: 'excludedIngredients', status: 'meets', message: 'None of your excluded ingredients appear in the ingredient list.' },
      );
    }
  }
  return out;
}

/** General, non-medical context for an optional age group (WHO population guidance). */
export function ageGroupNote(ageGroup: Preferences['ageGroup'], n: NutritionValues | null): string | null {
  if (!ageGroup) return null;
  const sodiumShare = n?.sodiumMg !== null && n?.sodiumMg !== undefined ? Math.round((n.sodiumMg / 2000) * 100) : null;
  const sodiumText = sodiumShare !== null ? ` 100 g/ml of this product provides about ${sodiumShare}% of the WHO adult sodium limit of 2,000 mg per day.` : '';
  switch (ageGroup) {
    case 'CHILD':
      return `WHO guidance limits free sugars and sodium for children too, with sodium limits adjusted downward for their lower energy needs.${sodiumText} This is general information, not individual advice.`;
    case 'TEEN':
    case 'ADULT':
      return `WHO recommends keeping free sugars below 10% of daily energy and sodium below 2,000 mg per day.${sodiumText} This is general information, not individual advice.`;
    case 'SENIOR':
      return `WHO's sodium guidance (below 2,000 mg per day) applies to older adults as well.${sodiumText} For specific dietary needs, consult a doctor or dietitian.`;
  }
}
