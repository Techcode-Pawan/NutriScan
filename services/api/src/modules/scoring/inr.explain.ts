import { INR_CONFIG } from './inr.config.js';
import type { InrResult } from './inr.engine.js';

export interface InrExplanation {
  headline: string;
  summary: string[];
  concerns: string[];
  positives: string[];
  missing: string[];
  calculation: string | null;
  disclaimer: string;
}

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
/** "a", "a and b", "a, b and c" */
export const listJoin = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const INR_DISCLAIMER =
  'Academic implementation of the FSSAI 2022 draft Indian Nutrition Rating. It is not an official FSSAI rating or certification, ' +
  'describes the product\'s nutritional profile only, and is not medical or dietary advice.';

/**
 * Builds a plain-language explanation from the computed result using fixed templates,
 * so the text always agrees with the numbers.
 */
export function explainInr(result: InrResult): InrExplanation {
  const missing = [
    ...result.missingCore.map((m) => `${m} is not reported (required for a rating).`),
    ...result.missingPositive.map((m) => `${m} is not reported (positive points could not be considered).`),
  ];
  const fvNlmUndeclared = result.positive.filter((p) => p.state === 'not_declared').map((p) => p.label);
  if (fvNlmUndeclared.length > 0) {
    missing.push(
      `${fvNlmUndeclared.join(' and ')} percentage not declared in the ingredient list; no positive points awarded for ${
        fvNlmUndeclared.length > 1 ? 'these factors' : 'this factor'
      }.`,
    );
  }

  if (result.stars === null || result.finalScore === null || result.baselinePoints === null) {
    return {
      headline: headlineForStatus(result),
      summary: result.reasons,
      concerns: [],
      positives: [],
      missing,
      calculation: null,
      disclaimer: INR_DISCLAIMER,
    };
  }

  const cls = result.inrClass === 'LIQUID' ? 'LIQUID' : 'SOLID';
  const refs = INR_CONFIG.classes[cls].referenceValues;
  const basis = INR_CONFIG.classes[cls].basis;

  const ranked = [...result.baseline].sort((a, b) => b.points - a.points);
  const drivers = ranked.filter((l) => l.points > 0).slice(0, 2);
  const concerns = ranked
    .filter((l) => l.points > 0)
    .map((l) => {
      const ref = refs[l.factor];
      const refText = ref !== undefined && l.value !== null && l.value > ref ? `, above the draft reference value of ${fmt(ref)} ${l.unit}` : '';
      return `${l.label}: ${fmt(l.value!)} ${l.unit} ${basis} adds ${l.points} of ${l.maxPoints} possible baseline points${refText}.`;
    });

  const positives = result.positive
    .filter((p) => p.points > 0)
    .map((p) => {
      const capped = p.rawPoints > p.points ? ` (capped from ${p.rawPoints} by the positive-point limit)` : '';
      return `${p.label}: ${fmt(p.value!)} ${p.unit} earns ${p.points} positive points${capped}.`;
    });

  const summary: string[] = [];
  if (drivers.length > 0) {
    summary.push(
      `This product's rating is mainly influenced by its ${listJoin(drivers.map((d) => d.label.toLowerCase()))} level${drivers.length > 1 ? 's' : ''} (${drivers.map((d) => `${d.points} pts`).join(', ')}).`,
    );
  } else {
    summary.push('None of the nutrients to limit exceed the lowest INR thresholds, so the baseline score is 0.');
  }
  if (result.positivePoints && result.positivePoints > 0) {
    const best = [...result.positive].sort((a, b) => b.points - a.points).filter((p) => p.points > 0);
    summary.push(
      `${capitalise(listJoin(best.map((p) => p.label.toLowerCase())))} reduce${best.length === 1 ? 's' : ''} the score by ${result.positivePoints} point${
        result.positivePoints === 1 ? '' : 's'
      }.`,
    );
  }
  summary.push(...result.reasons);

  const calculation =
    `Baseline ${result.baseline.map((l) => `${l.label.toLowerCase()} ${l.points}`).join(' + ')} = ${result.baselinePoints}; ` +
    `positive ${result.positive.map((p) => `${p.label.toLowerCase()} ${p.points}`).join(' + ')} = ${result.positivePoints}; ` +
    `final score ${result.baselinePoints} - ${result.positivePoints} = ${result.finalScore} -> ${fmt(result.stars)} stars ` +
    `(${cls === 'LIQUID' ? 'liquid' : 'solid'}-food scale). ${result.capRule ?? ''}`.trim();

  return {
    headline: headlineForStatus(result),
    summary,
    concerns,
    positives,
    missing,
    calculation,
    disclaimer: INR_DISCLAIMER,
  };
}

function headlineForStatus(r: InrResult): string {
  switch (r.status) {
    case 'RATED':
      return `${fmt(r.stars!)} out of 5 stars (INR, ${r.inrClass === 'LIQUID' ? 'liquid' : 'solid'} food)`;
    case 'PARTIAL':
      return `${fmt(r.stars!)} out of 5 stars - partial rating, some positive nutrients not reported`;
    case 'INSUFFICIENT_DATA':
      return 'No rating - essential nutrition values are missing';
    case 'EXEMPT':
      return 'No rating - category exempted from INR';
    case 'NOT_ELIGIBLE':
      return 'No rating - not eligible under the INR draft rules';
    case 'BASIS_UNKNOWN':
      return 'No rating - measurement basis (per 100 g / 100 ml) unknown';
  }
}
