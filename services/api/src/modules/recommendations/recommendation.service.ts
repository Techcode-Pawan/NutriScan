import { prisma } from '../../lib/prisma.js';
import { betterStatements, worseStatements, type NutrientKey } from '../comparison/nutrient-diff.js';
import type { Preferences } from '../preferences/preference-context.js';
import { basisLabel, nutritionValues, productInclude, productSummary, type ProductWithRelations } from '../products/product.service.js';
import { num } from '../scoring/score-product.js';

const PREF_NUTRIENT: Partial<Record<keyof Preferences, NutrientKey>> = {
  lowSugar: 'sugarsG',
  lowSodium: 'sodiumMg',
  lowSaturatedFat: 'saturatedFatG',
  highFiber: 'fiberG',
  highProtein: 'proteinG',
};

export interface AlternativeOptions {
  limit: number;
  includePartial: boolean;
  applyPreferences: boolean;
}

/**
 * Thesis section 4.8: same primary category, reliable ratings only, user preferences/exclusions
 * applied, strictly higher INR star rating, ranked by rating difference with preference match and
 * data completeness as tie-breakers. Every alternative carries the reasons it rates better.
 */
export async function findAlternatives(product: ProductWithRelations, prefs: Preferences | null, opts: AlternativeOptions) {
  const scannedStars = num(product.healthScore?.starRating);
  const base = {
    product: productSummary(product),
    criteria: {
      category: product.category?.name ?? null,
      minimumStars: scannedStars,
      includePartial: opts.includePartial,
      preferencesApplied: Boolean(prefs && opts.applyPreferences),
    },
  };

  if (!product.category) {
    return { ...base, alternatives: [], excluded: emptyExcluded(), message: 'This product has no mapped category, so same-category alternatives cannot be identified.' };
  }
  if (scannedStars === null) {
    return {
      ...base,
      alternatives: [],
      excluded: emptyExcluded(),
      message: 'This product has no INR star rating, so "higher-rated" alternatives cannot be determined. Browse the category sorted by rating instead.',
    };
  }

  const statuses = opts.includePartial ? (['RATED', 'PARTIAL'] as const) : (['RATED'] as const);
  // Single indexed query: same category, strictly higher stored rating (thesis 4.8 step 2, 3, 5).
  const candidates = await prisma.product.findMany({
    where: {
      categoryId: product.categoryId,
      id: { not: product.id },
      healthScore: { status: { in: [...statuses] }, starRating: { gt: scannedStars } },
    },
    include: productInclude,
    take: 500,
  });

  const excluded = emptyExcluded();
  const ref = nutritionValues(product) ?? {};
  const basis = basisLabel(product.nutrition?.basis);
  const usePrefs = prefs && opts.applyPreferences ? prefs : null;

  const ranked = candidates
    .filter((c) => {
      // Comparable basis only: never compare per-100 g with per-100 ml values.
      if (c.nutrition?.basis !== product.nutrition?.basis) {
        excluded.differentBasis += 1;
        return false;
      }
      if (usePrefs?.vegetarian && c.isVegetarian === false) {
        excluded.nonVegetarian += 1;
        return false;
      }
      if (usePrefs && usePrefs.excludedIngredients.length > 0) {
        if (!c.ingredientsText) {
          excluded.ingredientsUnknown += 1;
          return false;
        }
        const text = c.ingredientsText.toLowerCase();
        if (usePrefs.excludedIngredients.some((e) => text.includes(e.toLowerCase()))) {
          excluded.excludedIngredient += 1;
          return false;
        }
      }
      return true;
    })
    .map((c) => {
      const cn = nutritionValues(c) ?? {};
      const stars = num(c.healthScore!.starRating)!;
      const better = betterStatements(cn, ref, basis);
      let preferenceMatch = 0;
      const prefNotes: string[] = [];
      if (usePrefs) {
        for (const [pref, key] of Object.entries(PREF_NUTRIENT) as Array<[keyof Preferences, NutrientKey]>) {
          if (usePrefs[pref] && better.some((b) => b.key === key)) {
            preferenceMatch += 1;
            prefNotes.push(pref);
          }
        }
      }
      const reasons = [`Higher INR rating (${stars} vs ${scannedStars} stars)`];
      if (better.length) reasons.push(`Contains ${better.map((b) => b.text).join(', ')}`);
      const tradeOffs = worseStatements(cn, ref, basis);
      return {
        ...productSummary(c),
        ratingDifference: stars - scannedStars,
        preferenceMatch,
        matchedPreferences: prefNotes,
        dataCompleteness: c.healthScore!.dataCompleteness,
        partial: c.healthScore!.status === 'PARTIAL',
        reasons,
        tradeOffs: tradeOffs.length ? [`Note: it has ${tradeOffs.join(', ')}`] : [],
        summary: `${c.name} has a higher INR rating${better.length ? ` and contains ${better.map((b) => b.text.split(' (')[0]).join(', ')}` : ''} than ${product.name}.`,
        finalScore: c.healthScore!.finalScore,
      };
    })
    .sort(
      (a, b) =>
        b.ratingDifference - a.ratingDifference ||
        b.preferenceMatch - a.preferenceMatch ||
        b.dataCompleteness - a.dataCompleteness ||
        (a.finalScore ?? 0) - (b.finalScore ?? 0) ||
        a.name.localeCompare(b.name),
    );

  const alternatives = ranked.slice(0, opts.limit);
  return {
    ...base,
    alternatives,
    totalEligible: ranked.length,
    excluded,
    message: alternatives.length
      ? null
      : `No product in "${product.category.name}" with reliable data has a higher INR rating than this one${usePrefs ? ' after applying your preferences' : ''}.`,
  };
}

function emptyExcluded() {
  return { differentBasis: 0, nonVegetarian: 0, excludedIngredient: 0, ingredientsUnknown: 0 };
}
