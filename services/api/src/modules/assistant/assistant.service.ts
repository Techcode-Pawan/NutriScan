import { prisma } from '../../lib/prisma.js';
import { compareProducts } from '../comparison/comparison.service.js';
import { NUTRIENTS, type NutrientKey } from '../comparison/nutrient-diff.js';
import type { Preferences } from '../preferences/preference-context.js';
import { basisLabel, nutritionValues, productDetail, type ProductWithRelations } from '../products/product.service.js';
import { findAlternatives } from '../recommendations/recommendation.service.js';
import type { InrResult } from '../scoring/inr.engine.js';
import type { InrExplanation } from '../scoring/inr.explain.js';
import { listJoin } from '../scoring/inr.explain.js';
import { lookupGlossary } from './glossary.js';
import { getLlmProvider } from './llm/provider.js';

export type Intent =
  | 'medical'
  | 'why_rating'
  | 'top_contributor'
  | 'compare'
  | 'alternatives'
  | 'ingredients'
  | 'missing'
  | 'nutrient_value'
  | 'hfss'
  | 'ml'
  | 'overview';

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

const NUTRIENT_WORDS: Array<[RegExp, NutrientKey]> = [
  [/sugar/i, 'sugarsG'],
  [/sodium|salt/i, 'sodiumMg'],
  [/saturated|sat fat/i, 'saturatedFatG'],
  [/\bfat\b/i, 'fatG'],
  [/fib(re|er)/i, 'fiberG'],
  [/protein/i, 'proteinG'],
  [/calori|energy|kcal/i, 'energyKcal'],
  [/carb/i, 'carbohydratesG'],
];

export function nutrientFromQuestion(q: string): NutrientKey | null {
  for (const [re, key] of NUTRIENT_WORDS) if (re.test(q)) return key;
  return null;
}

/** Rule-based intent routing; order resolves overlaps (e.g. medical questions always first). */
export function classifyIntent(question: string, hasCompareTarget: boolean): Intent {
  const q = question.toLowerCase();
  if (/diabet|pregnan|blood pressure|hypertens|cholesterol level|kidney|heart (disease|patient)|allerg(y|ic) to|safe for (me|my|a )|can (i|my \w+) (eat|have)|cure|disease|medic|doctor|lose weight|weight loss/.test(q)) return 'medical';
  if (/\b(ml|machine learning|model|predict|nutri-?score)\b/.test(q)) return 'ml';
  if (hasCompareTarget || /\bcompare|\bvs\.?\b|versus|which (one|product|has)|difference between/.test(q)) return 'compare';
  if (/alternative|recommend|instead|better option|healthier option|swap|suggest/.test(q)) return 'alternatives';
  if (/contribut|most|biggest|main (reason|factor)|baseline|drives?|driver/.test(q)) return 'top_contributor';
  if (/missing|incomplete|not (available|reported)|unknown|data quality|complete/.test(q)) return 'missing';
  if (/hfss|high (in )?fat,? sugar|junk/.test(q)) return 'hfss';
  if (/ingredient|\bins\b|\be\d{3}\b|additive|what (is|are|does)|mean|contain|maida|palm|emulsifier|preservative|colou?r/.test(q)) return 'ingredients';
  if (/how much|amount|quantity|how many/.test(q) && nutrientFromQuestion(q)) return 'nutrient_value';
  if (/why|rating|stars?|score|rated/.test(q)) return 'why_rating';
  return 'overview';
}

type Detail = ReturnType<typeof productDetail>;

/** Structured facts handed to the LLM - all values come from the database or deterministic services. */
export function buildFacts(d: Detail) {
  const inr = d.inr;
  const breakdown = inr?.breakdown as InrResult | undefined;
  const explanation = inr?.explanation as InrExplanation | undefined;
  return {
    product: {
      name: d.name,
      brand: d.brand,
      category: d.category?.name ?? null,
      basis: d.nutrition?.basisLabel ?? 'unknown',
      nutrition: d.nutrition?.values ?? null,
      missingNutrients: d.nutrition?.missing ?? [],
      ingredients: d.ingredientsText,
      dataSource: d.source.label,
      sourceNote: d.source.note,
      qualityFlags: d.source.qualityFlags,
    },
    inr: inr
      ? {
          status: inr.status,
          stars: inr.stars,
          finalScore: inr.finalScore,
          baselinePoints: inr.baselinePoints,
          positivePoints: inr.positivePoints,
          baseline: breakdown?.baseline?.map((l) => ({ factor: l.label, value: l.value, unit: l.unit, points: l.points, maxPoints: l.maxPoints, exceededThreshold: l.exceeded })) ?? [],
          positive: breakdown?.positive?.map((p) => ({ factor: p.label, value: p.value, unit: p.unit, points: p.points, cap: p.cap, state: p.state })) ?? [],
          capRule: breakdown?.capRule ?? null,
          headline: explanation?.headline ?? null,
          calculation: explanation?.calculation ?? null,
        }
      : null,
    hfss: inr?.hfss ?? null,
    ingredientNotes: d.ingredients.insights.map((i) => `${i.label}: ${i.detail}`),
    allergensMentioned: d.ingredients.allergensMentioned,
  };
}

export interface AskInput {
  question: string;
  product: ProductWithRelations;
  compareWith: ProductWithRelations | null;
  prefs: Preferences | null;
}

export interface AssistantAnswer {
  answer: string;
  intent: Intent;
  provider: string;
  grounded: true;
  facts: Array<{ label: string; value: string }>;
  suggestions: string[];
  disclaimer: string;
  note?: string;
}

const DISCLAIMER =
  'NutriScan explains nutrition data and the INR rating; it does not give medical advice or say whether a product is safe for a specific person.';

export async function deterministicAnswer(input: AskInput): Promise<{ text: string; intent: Intent; facts: Array<{ label: string; value: string }> }> {
  const { question, product, compareWith, prefs } = input;
  const d = productDetail(product, prefs);
  const intent = classifyIntent(question, Boolean(compareWith));
  const inr = d.inr;
  const breakdown = inr?.breakdown as InrResult | undefined;
  const expl = inr?.explanation as InrExplanation | undefined;
  const basis = d.nutrition?.basisLabel ?? 'per 100 g';
  const facts: Array<{ label: string; value: string }> = [];
  const lines: string[] = [];
  const ratingLine = () =>
    inr?.stars !== null && inr?.stars !== undefined
      ? `${d.name} has an INR rating of ${fmt(inr.stars)} out of 5 stars (final score ${inr.finalScore}).`
      : `${d.name} does not have an INR star rating: ${expl?.headline ?? 'no score is available'}.`;

  switch (intent) {
    case 'medical':
      lines.push(
        'I can\'t tell you whether a product is safe or suitable for a medical condition, pregnancy, an allergy or a weight-loss plan. Please ask a doctor or registered dietitian.',
        ratingLine(),
      );
      if (d.nutrition?.values) {
        const v = d.nutrition.values;
        const parts = [
          v.sugarsG !== null ? `sugar ${fmt(v.sugarsG)} g` : null,
          v.sodiumMg !== null ? `sodium ${fmt(v.sodiumMg)} mg` : null,
          v.saturatedFatG !== null ? `saturated fat ${fmt(v.saturatedFatG)} g` : null,
        ].filter(Boolean);
        if (parts.length) lines.push(`For reference, it contains ${parts.join(', ')} ${basis}. Allergens named in the ingredient list: ${d.ingredients.allergensMentioned.join(', ') || 'none detected (always check the pack)'}.`);
      }
      break;

    case 'why_rating':
    case 'overview':
      lines.push(ratingLine());
      if (expl) lines.push(...expl.summary);
      if (expl?.calculation) lines.push(`How it was calculated: ${expl.calculation}`);
      if (intent === 'overview' && expl?.concerns.length) lines.push(`Points added: ${expl.concerns.slice(0, 3).join(' ')}`);
      break;

    case 'top_contributor': {
      if (!breakdown?.baseline?.length) {
        lines.push(ratingLine(), 'Without a calculated rating there is no baseline breakdown to examine.');
        break;
      }
      const sorted = [...breakdown.baseline].sort((a, b) => b.points - a.points);
      const top = sorted[0];
      if (top.points === 0) lines.push('None of the nutrients to limit reached the first INR threshold, so every baseline factor scored 0 points.');
      else {
        const ties = sorted.filter((l) => l.points === top.points);
        lines.push(
          `${listJoin(ties.map((t) => t.label))} contribute${ties.length > 1 ? '' : 's'} the most to the baseline score with ${
            ties.length > 1 ? `${top.points} points each` : `${top.points} of ${top.maxPoints} possible points`
          }` +
            `${ties.length === 1 && top.exceeded !== null ? `: ${fmt(top.value!)} ${top.unit} ${basis} is above the ${fmt(top.exceeded)} ${top.unit} threshold for that many points` : ''}.`,
        );
        lines.push(`Full baseline: ${sorted.map((l) => `${l.label} ${l.points} pts (${fmt(l.value!)} ${l.unit})`).join(', ')} = ${breakdown.baselinePoints} points.`);
      }
      break;
    }

    case 'compare': {
      if (!compareWith) {
        lines.push('Choose a second product to compare with (use "Compare" on the product page), then ask again.');
        break;
      }
      const cmp = compareProducts([product, compareWith]);
      const nutrient = nutrientFromQuestion(question);
      if (nutrient && cmp.comparable) {
        const row = cmp.rows.find((r) => r.key === nutrient)!;
        const [a, b] = row.values;
        if (a === null || b === null) lines.push(`${row.label} is not reported for ${a === null ? product.name : compareWith.name}, so I can't compare it.`);
        else if (a === b) lines.push(`Both products contain the same amount of ${row.label.toLowerCase()} (${fmt(a)} ${row.unit} ${cmp.basis}).`);
        else {
          const less = a < b ? product.name : compareWith.name;
          lines.push(`${less} has less ${row.label.toLowerCase()}: ${fmt(Math.min(a, b))} vs ${fmt(Math.max(a, b))} ${row.unit} ${cmp.basis}.`);
        }
      }
      lines.push(...cmp.summary);
      break;
    }

    case 'alternatives': {
      const alt = await findAlternatives(product, prefs, { limit: 3, includePartial: false, applyPreferences: true });
      if (compareWith) {
        const match = alt.alternatives.find((a) => a.id === compareWith.id);
        if (match) lines.push(`${match.name} was recommended because: ${match.reasons.join('; ')}.`, ...match.tradeOffs);
        else lines.push(`${compareWith.name} is not among the higher-rated alternatives for ${product.name} with your current settings.`);
      } else if (alt.alternatives.length) {
        lines.push(`Higher-rated alternatives in ${product.category?.name ?? 'the same category'}:`);
        for (const a of alt.alternatives) lines.push(`- ${a.name}${a.brand ? ` (${a.brand})` : ''}: ${a.reasons.join('; ')}.`);
      } else lines.push(alt.message ?? 'No higher-rated alternatives were found.');
      break;
    }

    case 'ingredients': {
      if (!d.ingredientsText) {
        lines.push('This product has no ingredient list in the database, so I can\'t explain its ingredients. Check the pack.');
        break;
      }
      const asked = lookupGlossary(question);
      const found = asked.length ? asked : lookupGlossary(d.ingredientsText).slice(0, 6);
      if (found.length) {
        lines.push(asked.length ? 'Here is what that means:' : 'Some ingredients on this label:');
        for (const g of found) lines.push(`- ${g.term}: ${g.description}`);
      }
      if (d.ingredients.insights.length) lines.push(`Ingredient notes: ${d.ingredients.insights.map((i) => i.label.toLowerCase()).join(', ')}.`);
      if (d.ingredients.allergensMentioned.length) lines.push(`Allergens named in the list: ${d.ingredients.allergensMentioned.join(', ')} (check the pack's allergen statement).`);
      lines.push('These notes are descriptive and do not mean an ingredient is unsafe.');
      break;
    }

    case 'missing': {
      const miss = expl?.missing ?? [];
      if (miss.length || d.nutrition?.missing.length) {
        lines.push(`Missing information for ${d.name}:`);
        for (const m of d.nutrition?.missing ?? []) lines.push(`- ${m} is not reported.`);
        for (const m of miss.filter((x) => /not declared/.test(x))) lines.push(`- ${m}`);
      } else lines.push('All the nutrients NutriScan uses are reported for this product.');
      if (d.nutrition?.basisNote) lines.push(`Measurement basis: ${d.nutrition.basisNote}`);
      if (!d.ingredientsText) lines.push('- No ingredient list is available.');
      lines.push(`Source: ${d.source.label}. ${d.source.note}`);
      break;
    }

    case 'nutrient_value': {
      const key = nutrientFromQuestion(question)!;
      const meta = NUTRIENTS.find((n) => n.key === key)!;
      const v = d.nutrition?.values?.[key] ?? null;
      if (v === null) lines.push(`${meta.label} is not reported for ${d.name}.`);
      else {
        lines.push(`${d.name} contains ${fmt(v)} ${meta.unit} ${meta.label.toLowerCase()} ${basis}.`);
        const ln = breakdown?.baseline?.find((l) => l.factor === key) ?? breakdown?.positive?.find((l) => l.factor === key);
        if (ln) lines.push(`In the INR calculation this gives ${ln.points} ${breakdown!.baseline.includes(ln as never) ? 'baseline' : 'positive'} points.`);
      }
      break;
    }

    case 'hfss': {
      const h = d.inr?.hfss;
      if (!h?.evaluable) lines.push('The draft HFSS criteria cannot be checked because energy, sugar, saturated fat or sodium is missing.');
      else if (h.isHfss) lines.push(`Under the draft FSSAI HFSS definition this product would be classed as HFSS because of: ${h.triggers.join('; ')}.`);
      else lines.push('This product does not meet any of the draft FSSAI HFSS criteria.');
      break;
    }

    case 'ml': {
      const pred = await prisma.mlPrediction.findFirst({ where: { productId: product.id }, orderBy: { createdAt: 'desc' } });
      lines.push(
        pred
          ? `The experimental ML model estimates a Nutri-Score grade of ${pred.predictedGrade.toUpperCase()} (index ${Math.round(pred.mlIndex)}/100). This is separate from the INR rating and is not a validation of it.`
          : 'No experimental ML estimate is stored for this product yet. Open the "ML analysis" view to request one (it requires the ML service to be running).',
      );
      lines.push(ratingLine());
      break;
    }
  }

  if (d.nutrition?.values) {
    for (const [k, label, unit] of [['energyKcal', 'Energy', 'kcal'], ['sugarsG', 'Sugar', 'g'], ['saturatedFatG', 'Saturated fat', 'g'], ['sodiumMg', 'Sodium', 'mg']] as const) {
      const v = d.nutrition.values[k];
      if (v !== null) facts.push({ label, value: `${fmt(v)} ${unit} ${basis}` });
    }
  }
  if (inr) facts.push({ label: 'INR', value: inr.stars !== null ? `${fmt(inr.stars)} stars (${inr.status})` : inr.status });
  facts.push({ label: 'Source', value: d.source.label });
  return { text: lines.join('\n'), intent, facts };
}

export function suggestionsFor(product: { name: string }, hasCompare: boolean): string[] {
  return [
    `Why did ${product.name} get this rating?`,
    'Which nutrient contributed most to the baseline score?',
    'What information is missing for this product?',
    'What do the listed ingredients mean?',
    'What are healthier alternatives?',
    ...(hasCompare ? ['Which product has less sugar?', 'How do these two products compare?'] : []),
  ];
}

/** Every number in the LLM answer must already appear in the facts, draft or question. */
export function numbersAreGrounded(answer: string, sources: string): boolean {
  const norm = (s: string) => String(Number(s));
  const allowed = new Set((sources.match(/\d+(?:\.\d+)?/g) ?? []).map(norm));
  const used = (answer.match(/\d+(?:\.\d+)?/g) ?? []).map(norm);
  return used.every((n) => allowed.has(n));
}

const SYSTEM_PROMPT = `You are NutriScan's product assistant. Answer the user's question about a packaged food using ONLY the JSON facts and the draft answer provided.
Rules:
- Use only numbers that appear in the facts or draft. Never calculate, change or estimate a rating or score.
- The INR rating comes from a rule-based engine; explain it, never override it.
- Do not give medical advice, diagnoses, or say a product is safe or unsafe for a specific person.
- Do not call an ingredient harmful because it is unfamiliar.
- If the facts do not contain the answer, say what is missing.
- Reply in 2-6 short sentences or bullet points, plain language, no headings.`;

export async function ask(input: AskInput): Promise<AssistantAnswer> {
  const det = await deterministicAnswer(input);
  const provider = getLlmProvider();
  const base: AssistantAnswer = {
    answer: det.text,
    intent: det.intent,
    provider: 'deterministic',
    grounded: true,
    facts: det.facts,
    suggestions: suggestionsFor(input.product, Boolean(input.compareWith)),
    disclaimer: DISCLAIMER,
  };
  // Medical questions always get the fixed, cautious answer.
  if (!provider || det.intent === 'medical') return base;

  const facts = buildFacts(productDetail(input.product, input.prefs));
  const compareFacts = input.compareWith ? buildFacts(productDetail(input.compareWith, input.prefs)) : null;
  const payload = JSON.stringify({ facts, compareWith: compareFacts });
  const user = `FACTS:\n${payload}\n\nDRAFT ANSWER (correct, deterministic):\n${det.text}\n\nQUESTION:\n${input.question}`;
  try {
    const text = await provider.complete({ system: SYSTEM_PROMPT, user });
    if (!numbersAreGrounded(text, payload + det.text + input.question)) {
      return { ...base, note: 'The language model answer contained numbers not found in the product data, so the verified answer is shown instead.' };
    }
    return { ...base, answer: text, provider: provider.name };
  } catch {
    return { ...base, note: 'The language-model provider is unavailable; showing the verified answer generated from product data.' };
  }
}

export { basisLabel, nutritionValues };
