/**
 * Rule-based ingredient parsing. Every rule here is explicit and explainable; nothing is
 * labelled harmful because it is unfamiliar. Outputs are descriptive ("contains palm oil").
 */

const FRUIT_VEG = [
  'fruit', 'vegetable', 'veg', 'apple', 'mango', 'orange', 'banana', 'guava', 'grape', 'pineapple', 'pomegranate',
  'lychee', 'litchi', 'berry', 'berries', 'strawberry', 'blueberry', 'cranberry', 'raspberry', 'cherry', 'peach', 'pear',
  'papaya', 'kiwi', 'lemon', 'lime', 'tomato', 'carrot', 'onion', 'spinach', 'beetroot', 'pumpkin', 'peas', 'capsicum',
  'cucumber', 'cabbage', 'cauliflower', 'jamun', 'amla', 'coconut', 'tamarind', 'raisin', 'date', 'fig', 'apricot',
  'watermelon', 'melon', 'plum', 'garlic', 'ginger', 'sweet corn', 'aloe vera', 'jackfruit', 'kokum',
]; // potato, cassava and other starchy tubers are deliberately excluded (conservative assumption)
const NUTS_LEGUMES_MILLETS = [
  'almond', 'cashew', 'pistachio', 'walnut', 'hazelnut', 'peanut', 'groundnut', 'macadamia', 'pecan', 'nut',
  'lentil', 'dal', 'chickpea', 'chana', 'gram', 'besan', 'moong', 'urad', 'masoor', 'rajma', 'kidney bean', 'soy',
  'soya', 'bean', 'legume', 'pulse', 'millet', 'ragi', 'finger millet', 'jowar', 'sorghum', 'bajra', 'pearl millet',
  'foxtail', 'kodo', 'little millet', 'barnyard', 'proso', 'kangni', 'samai', 'kutki', 'makhana', 'fox nut',
];
const EXCLUDE_FROM_FV = /potato|cassava|tapioca|flavou?r|essence|extract|identical|artificial|colou?r/i;
const EXCLUDE_FROM_NLM = /flavou?r|essence|\boil\b|cocoa|lecithin|nutmeg|coconut/i;

const wordRegex = (words: string[]) => new RegExp(String.raw`\b(` + words.join('|') + String.raw`)(e?s)?\b`, 'i');
const FV_RE = wordRegex(FRUIT_VEG);
const NLM_RE = wordRegex(NUTS_LEGUMES_MILLETS);

/** Pieces like "Mango Pulp (20%)", "Almonds 12%" or "Fruit juice concentrate (12.5 %)". */
const PERCENT_PIECE = /([A-Za-z][A-Za-z \-&/']{1,48}?)\s*[([]?\s*(\d{1,3}(?:\.\d+)?)\s*%\s*[)\]]?/g;

export interface DeclaredShares {
  fruitVegPct: number | null;
  nutsLegumesMilletsPct: number | null;
  evidence: string[];
}

/**
 * Sums declared percentages of qualifying ingredients. Returns null for a factor when no
 * percentage is declared for it (the INR engine then reports it as "not declared").
 */
export function declaredShares(ingredients: string | null | undefined): DeclaredShares {
  if (!ingredients) return { fruitVegPct: null, nutsLegumesMilletsPct: null, evidence: [] };
  let fv = 0;
  let nlm = 0;
  let fvFound = false;
  let nlmFound = false;
  const evidence: string[] = [];
  if (/100\s*%\s*(pure\s+)?(fruit|juice|natural juice)/i.test(ingredients)) {
    return { fruitVegPct: 100, nutsLegumesMilletsPct: null, evidence: ['declared 100% fruit/juice'] };
  }
  for (const m of ingredients.matchAll(PERCENT_PIECE)) {
    const name = m[1].trim();
    const pct = Number(m[2]);
    if (!(pct > 0 && pct <= 100)) continue;
    if (NLM_RE.test(name) && !EXCLUDE_FROM_NLM.test(name)) {
      nlm += pct;
      nlmFound = true;
      evidence.push(`${name} ${pct}% (nuts/legumes/millets)`);
    } else if (FV_RE.test(name) && !EXCLUDE_FROM_FV.test(name)) {
      fv += pct;
      fvFound = true;
      evidence.push(`${name} ${pct}% (fruit/vegetable)`);
    }
  }
  return {
    fruitVegPct: fvFound ? Math.min(100, Math.round(fv * 100) / 100) : null,
    nutsLegumesMilletsPct: nlmFound ? Math.min(100, Math.round(nlm * 100) / 100) : null,
    evidence,
  };
}

const NON_VEG = /\b(chicken|mutton|lamb|pork|beef|bacon|ham|prawns?|shrimps?|fish|tuna|salmon|anchov(y|ies)|crab|meat|gelatine?|lard|tallow)\b|\begg(s)?\b(?!less)|egg (white|yolk|powder)/i;

/** Returns false when a non-vegetarian ingredient is named, otherwise null (unknown). Never infers true. */
export function nonVegetarianEvidence(text: string | null | undefined): string | null {
  if (!text) return null;
  if (/eggless|egg-free|no egg/i.test(text) && !/egg (white|yolk|powder)/i.test(text)) {
    const withoutEggless = text.replace(/eggless|egg-free|no egg/gi, '');
    const m = withoutEggless.match(NON_VEG);
    return m ? m[0] : null;
  }
  const m = text.match(NON_VEG);
  return m ? m[0] : null;
}

export interface IngredientInsight {
  code: string;
  label: string;
  detail: string;
  evidence: string;
}

const INSIGHT_RULES: Array<{ code: string; label: string; re: RegExp; detail: string }> = [
  { code: 'added_sugars', label: 'Added sugars', re: /\b(sugar|glucose syrup|invert sugar|dextrose|fructose|corn syrup|maltodextrin|liquid glucose|jaggery|honey)\b/i, detail: 'The ingredient list names one or more added sugars or sugar syrups.' },
  { code: 'sweeteners', label: 'Non-sugar sweeteners', re: /sucralose|aspartame|acesulfame|saccharin|steviol|stevia|\b(INS|E)\s?(950|951|954|955|960)\b/i, detail: 'Contains high-intensity sweeteners; these are permitted additives and add sweetness without sugar.' },
  { code: 'palm_oil', label: 'Palm oil', re: /palm(olein| oil|\s?kernel)/i, detail: 'Contains palm oil or palmolein, a fat relatively high in saturated fatty acids.' },
  { code: 'hydrogenated_fat', label: 'Hydrogenated / interesterified fat', re: /hydrogenated|vanaspati|interesterified/i, detail: 'Partially hydrogenated fats can be a source of trans fat; check the trans-fat value on the label.' },
  { code: 'refined_flour', label: 'Refined wheat flour (maida)', re: /refined wheat flour|maida/i, detail: 'Refined flour has less fibre than whole-wheat flour (atta).' },
  { code: 'whole_grain', label: 'Whole grains / millets', re: /whole wheat|atta|whole grain|oats|ragi|jowar|bajra|millet|brown rice/i, detail: 'Lists whole grains or millets.' },
  { code: 'synthetic_colours', label: 'Synthetic food colours', re: /\b(INS|E)\s?(102|110|122|124|129|133)\b|tartrazine|sunset yellow|carmoisine|ponceau|allura red|brilliant blue/i, detail: 'Contains permitted synthetic colours.' },
  { code: 'msg', label: 'Flavour enhancer (MSG)', re: /monosodium glutamate|\b(INS|E)\s?621\b/i, detail: 'Contains monosodium glutamate, a permitted flavour enhancer that adds sodium.' },
];

export function ingredientInsights(ingredients: string | null | undefined): IngredientInsight[] {
  if (!ingredients) return [];
  const out: IngredientInsight[] = [];
  for (const r of INSIGHT_RULES) {
    const m = ingredients.match(r.re);
    if (m) out.push({ code: r.code, label: r.label, detail: r.detail, evidence: m[0] });
  }
  return out;
}

const ALLERGENS: Array<[string, RegExp]> = [
  ['Milk', /\b(milk|whey|casein|butter|cream|cheese|lactose|khoa|ghee|paneer)\b/i],
  ['Wheat / gluten', /\b(wheat|maida|atta|semolina|suji|rava|barley|rye|gluten)\b/i],
  ['Soy', /\bsoy(a)?\b|soy lecithin/i],
  ['Peanut', /\b(peanut|groundnut)s?\b/i],
  ['Tree nuts', /\b(almond|cashew|pistachio|walnut|hazelnut|pecan|macadamia)s?\b/i],
  ['Egg', /\begg(s)?\b(?!less)/i],
  ['Sesame', /\b(sesame|til)\b/i],
  ['Fish / shellfish', /\b(fish|prawn|shrimp|crab|anchovy)\b/i],
];

/** Allergens named in the ingredient text (not a substitute for the label's allergen declaration). */
export function allergenMentions(ingredients: string | null | undefined): string[] {
  if (!ingredients) return [];
  return ALLERGENS.filter(([, re]) => re.test(ingredients)).map(([name]) => name);
}

export function containsExcluded(ingredients: string | null | undefined, exclusions: string[]): string[] {
  if (!ingredients) return [];
  const text = ingredients.toLowerCase();
  return exclusions.filter((e) => e.trim() && text.includes(e.trim().toLowerCase()));
}
