/**
 * Plain-language descriptions of common Indian label ingredients and INS additive numbers.
 * Descriptions state what an ingredient is and why it is used; they do not claim harm.
 */
export const GLOSSARY: Array<{ match: RegExp; term: string; description: string }> = [
  { match: /\b(ins|e)\s?322\b|lecithin/i, term: 'INS 322 (lecithin)', description: 'an emulsifier, usually from soy or sunflower, that keeps fat and water mixed.' },
  { match: /\b(ins|e)\s?471\b/i, term: 'INS 471', description: 'mono- and diglycerides of fatty acids, a common emulsifier used for texture.' },
  { match: /\b(ins|e)\s?472e\b/i, term: 'INS 472e', description: 'DATEM, an emulsifier and dough conditioner used in baked goods.' },
  { match: /\b(ins|e)\s?476\b/i, term: 'INS 476', description: 'polyglycerol polyricinoleate (PGPR), an emulsifier used in chocolate to help it flow.' },
  { match: /\b(ins|e)\s?500\b|sodium (bi)?carbonate/i, term: 'INS 500 (sodium carbonates)', description: 'raising agents such as baking soda; they release gas so dough rises. They contribute some sodium.' },
  { match: /\b(ins|e)\s?503\b/i, term: 'INS 503 (ammonium carbonates)', description: 'raising agents used mainly in biscuits; they decompose during baking.' },
  { match: /\b(ins|e)\s?330\b|citric acid/i, term: 'INS 330 (citric acid)', description: 'an acidity regulator that adds tartness and helps preservation.' },
  { match: /\b(ins|e)\s?296\b|malic acid/i, term: 'INS 296 (malic acid)', description: 'an acidity regulator that adds sourness.' },
  { match: /\b(ins|e)\s?211\b|sodium benzoate/i, term: 'INS 211 (sodium benzoate)', description: 'a permitted preservative that limits growth of yeasts and moulds.' },
  { match: /\b(ins|e)\s?202\b|potassium sorbate/i, term: 'INS 202 (potassium sorbate)', description: 'a permitted preservative against moulds and yeasts.' },
  { match: /\b(ins|e)\s?223\b|metabisulphite/i, term: 'INS 223 (sodium metabisulphite)', description: 'a preservative and dough conditioner; people sensitive to sulphites may want to note it.' },
  { match: /\b(ins|e)\s?621\b|monosodium glutamate|\bmsg\b/i, term: 'INS 621 (MSG)', description: 'a flavour enhancer that gives a savoury taste; it contains sodium.' },
  { match: /\b(ins|e)\s?6(27|31|35)\b/i, term: 'INS 627 / 631 / 635', description: 'ribonucleotide flavour enhancers, often used together with MSG in snacks and noodles.' },
  { match: /\b(ins|e)\s?950\b|acesulfame/i, term: 'INS 950 (acesulfame potassium)', description: 'a high-intensity sweetener that adds sweetness without sugar.' },
  { match: /\b(ins|e)\s?951\b|aspartame/i, term: 'INS 951 (aspartame)', description: 'a high-intensity sweetener; labels must warn people with phenylketonuria (PKU).' },
  { match: /\b(ins|e)\s?955\b|sucralose/i, term: 'INS 955 (sucralose)', description: 'a high-intensity sweetener made from sugar that provides almost no energy.' },
  { match: /\b(ins|e)\s?960\b|stevi/i, term: 'INS 960 (steviol glycosides)', description: 'a sweetener extracted from the stevia plant.' },
  { match: /\b(ins|e)\s?412\b|guar gum/i, term: 'INS 412 (guar gum)', description: 'a thickener from guar beans.' },
  { match: /\b(ins|e)\s?415\b|xanthan/i, term: 'INS 415 (xanthan gum)', description: 'a thickener and stabiliser produced by fermentation.' },
  { match: /\b(ins|e)\s?440\b|pectin/i, term: 'INS 440 (pectin)', description: 'a gelling agent from fruit, used in jams and jellies.' },
  { match: /\b(ins|e)\s?1422\b|modified starch/i, term: 'INS 1422 / modified starch', description: 'starch altered to thicken or stabilise foods.' },
  { match: /\b(ins|e)\s?150d?\b|caramel colou?r/i, term: 'INS 150 (caramel colour)', description: 'a brown colouring made by heating sugars.' },
  { match: /\b(ins|e)\s?102\b|tartrazine/i, term: 'INS 102 (tartrazine)', description: 'a permitted synthetic yellow colour.' },
  { match: /\b(ins|e)\s?110\b|sunset yellow/i, term: 'INS 110 (sunset yellow)', description: 'a permitted synthetic orange-yellow colour.' },
  { match: /\b(ins|e)\s?129\b|allura/i, term: 'INS 129 (allura red)', description: 'a permitted synthetic red colour.' },
  { match: /\b(ins|e)\s?133\b|brilliant blue/i, term: 'INS 133 (brilliant blue)', description: 'a permitted synthetic blue colour.' },
  { match: /\b(ins|e)\s?160c\b|paprika/i, term: 'INS 160c (paprika extract)', description: 'a natural red-orange colour from paprika.' },
  { match: /\b(ins|e)\s?341\b/i, term: 'INS 341 (calcium phosphates)', description: 'acidity regulators and raising agents.' },
  { match: /\b(ins|e)\s?450\b/i, term: 'INS 450 (diphosphates)', description: 'raising agents and stabilisers.' },
  { match: /maltodextrin/i, term: 'maltodextrin', description: 'a starch-derived carbohydrate used as a filler or thickener; it is digested like sugar.' },
  { match: /invert sugar|invert syrup/i, term: 'invert sugar syrup', description: 'a liquid sugar (glucose + fructose) used to keep baked goods soft; it counts toward total sugars.' },
  { match: /liquid glucose|glucose syrup/i, term: 'liquid glucose / glucose syrup', description: 'a sugar syrup from starch; it counts toward total sugars.' },
  { match: /palmolein|palm oil/i, term: 'palm oil / palmolein', description: 'a vegetable fat widely used in Indian snacks and biscuits; it is relatively high in saturated fat.' },
  { match: /maida|refined wheat flour/i, term: 'maida (refined wheat flour)', description: 'wheat flour with the bran and germ removed, so it has less fibre than atta.' },
  { match: /\batta\b|whole wheat/i, term: 'atta (whole-wheat flour)', description: 'flour milled from the whole wheat grain, with more fibre than maida.' },
  { match: /hydrolysed|hydrolyzed vegetable protein|\bhvp\b/i, term: 'hydrolysed vegetable protein', description: 'a savoury flavouring made by breaking down plant protein; it often contains salt.' },
  { match: /vanaspati|hydrogenated/i, term: 'vanaspati / hydrogenated fat', description: 'partially hydrogenated vegetable fat; it can contain trans fat, which the label should declare.' },
  { match: /milk solids/i, term: 'milk solids', description: 'the non-water part of milk (protein, lactose, fat), used for taste and texture.' },
];

export function lookupGlossary(text: string): Array<{ term: string; description: string }> {
  const seen = new Set<string>();
  const out: Array<{ term: string; description: string }> = [];
  for (const g of GLOSSARY) {
    if (g.match.test(text) && !seen.has(g.term)) {
      seen.add(g.term);
      out.push({ term: g.term, description: g.description });
    }
  }
  return out;
}
