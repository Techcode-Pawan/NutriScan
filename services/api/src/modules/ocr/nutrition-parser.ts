/**
 * Turns OCR text from a nutrition table / ingredient list into structured, *unverified* values.
 * Every value carries its raw source line and a confidence flag; the client must show these in
 * an editable review form. Nothing parsed here is written to the product database.
 */

export type FieldKey = 'energyKcal' | 'fatG' | 'saturatedFatG' | 'transFatG' | 'carbohydratesG' | 'sugarsG' | 'fiberG' | 'proteinG' | 'sodiumMg';

export interface ParsedField {
  value: number;
  unit: string;
  rawLine: string;
  confidence: 'high' | 'low';
  notes: string[];
}

export interface ParsedLabel {
  basis: 'PER_100G' | 'PER_100ML' | 'UNKNOWN';
  basisEvidence: string | null;
  fields: Partial<Record<FieldKey, ParsedField>>;
  ingredientsText: string | null;
  warnings: string[];
  unparsedLines: string[];
}

interface Rule {
  key: FieldKey;
  re: RegExp;
  exclude?: RegExp;
  unit: 'kcal' | 'g' | 'mg';
}

// Order matters: specific rows (saturated, trans, added/total sugars) before generic ones.
const RULES: Rule[] = [
  { key: 'energyKcal', re: /\b(energy|calories|calorific value|energy value)\b/i, unit: 'kcal' },
  { key: 'saturatedFatG', re: /\b(saturated|sat\.?)\s*(fat|fatty acids)?\b/i, exclude: /\bun\s*saturated|mono|poly/i, unit: 'g' },
  { key: 'transFatG', re: /\btrans\b/i, unit: 'g' },
  { key: 'fatG', re: /\b(total\s+fat|fat\s*,?\s*total|^\s*fat\b|\bfats?\b)/i, exclude: /saturated|trans|mono|poly|unsat/i, unit: 'g' },
  { key: 'sugarsG', re: /\b(total\s+sugars?|sugars?)\b/i, exclude: /added|free\b|alcohol/i, unit: 'g' },
  { key: 'carbohydratesG', re: /\bcarbo\s*hydrates?|\bcarbs?\b|\bcarbohydrate\b/i, unit: 'g' },
  { key: 'fiberG', re: /\b(dietary\s+)?fib(re|er)\b/i, unit: 'g' },
  { key: 'proteinG', re: /\bproteins?\b/i, unit: 'g' },
  { key: 'sodiumMg', re: /\bsodium\b/i, unit: 'mg' },
];

/** Fixes common OCR confusions inside numeric tokens only. */
export function cleanNumericToken(token: string): string {
  return token
    .replace(/[Oo](?=[\d.,])|(?<=[\d.,])[Oo]/g, '0')
    .replace(/(?<=\d)[lI|](?=[\d.,])|^[lI|](?=[.,]?\d)/g, '1')
    .replace(/(?<=\d),(?=\d{1,2}\b)/g, '.');
}

const NUMBER = /(<\s*)?(\d+(?:[.,]\d+)?)\s*(kcal|kj|mg|g|gm|gms|%)?/gi;

function numbersIn(line: string): Array<{ value: number; unit: string | null; lessThan: boolean; raw: string }> {
  const cleaned = cleanNumericToken(line);
  const out: Array<{ value: number; unit: string | null; lessThan: boolean; raw: string }> = [];
  for (const m of cleaned.matchAll(NUMBER)) {
    const value = Number(m[2].replace(',', '.'));
    if (!Number.isFinite(value)) continue;
    out.push({ value, unit: m[3]?.toLowerCase() ?? null, lessThan: Boolean(m[1]), raw: m[0] });
  }
  return out;
}

export function detectBasis(text: string): { basis: ParsedLabel['basis']; evidence: string | null } {
  const ml = text.match(/per\s*100\s*m\s*l|\/\s*100\s*ml|100\s*ml/i);
  const g = text.match(/per\s*100\s*g|\/\s*100\s*g|100\s*g\b|100\s*gm/i);
  if (g && !ml) return { basis: 'PER_100G', evidence: g[0] };
  if (ml && !g) return { basis: 'PER_100ML', evidence: ml[0] };
  if (g && ml) return { basis: 'UNKNOWN', evidence: `${g[0]} / ${ml[0]}` };
  return { basis: 'UNKNOWN', evidence: null };
}

export function parseLabelText(text: string): ParsedLabel {
  const warnings: string[] = [];
  const fields: ParsedLabel['fields'] = {};
  const unparsed: string[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const { basis, evidence } = detectBasis(text);
  if (basis === 'UNKNOWN') {
    warnings.push(
      evidence
        ? 'Both per 100 g and per 100 ml appear in the text; please confirm the measurement basis.'
        : 'Could not find "per 100 g" or "per 100 ml" in the image. Please confirm the measurement basis; per-serving values must be converted.',
    );
  }
  const multiColumn = /per\s*serv|serving|\bRDA\b|%\s*RDA|% ?DV/i.test(text);
  if (multiColumn) warnings.push('The table seems to have more than one column (per 100 and per serving / %RDA). The first number on each row was used; please check it is the per-100 value.');

  // Ingredient list: from "Ingredients" up to a blank-ish delimiter or nutrition header.
  let ingredientsText: string | null = null;
  const ingMatch = text.match(/ingredients?\s*[:\-]\s*([\s\S]+?)(?:\n\s*\n|nutrition|nutritional|allergen|contains\s*:|$)/i);
  if (ingMatch) ingredientsText = ingMatch[1].replace(/\s+/g, ' ').trim().replace(/\.$/, '') || null;

  for (const line of lines) {
    if (/^ingredients?/i.test(line)) continue;
    const rule = RULES.find((r) => r.re.test(line) && !(r.exclude && r.exclude.test(line)));
    if (!rule) {
      if (/\d/.test(line)) unparsed.push(line);
      continue;
    }
    if (fields[rule.key]) continue; // keep the first matching row
    const nums = numbersIn(line.replace(rule.re, ' '));
    if (nums.length === 0) {
      unparsed.push(line);
      continue;
    }
    const notes: string[] = [];
    let confidence: ParsedField['confidence'] = 'high';
    let pick = nums[0];
    let value = pick.value;
    let unit: string = rule.unit;

    if (rule.key === 'energyKcal') {
      const kcal = nums.find((n) => n.unit === 'kcal');
      const kj = nums.find((n) => n.unit === 'kj');
      if (kcal) {
        pick = kcal;
        value = kcal.value;
      } else if (kj || /\bkj\b/i.test(line)) {
        value = Math.round(((kj ?? pick).value / 4.184) * 10) / 10;
        notes.push(`Converted ${(kj ?? pick).value} kJ to kcal (1 kcal = 4.184 kJ).`);
      } else {
        notes.push('Unit not visible; assumed kcal.');
        confidence = 'low';
      }
    } else if (rule.key === 'sodiumMg') {
      if (pick.unit === 'g' || pick.unit === 'gm' || pick.unit === 'gms') {
        value = pick.value * 1000;
        notes.push(`Converted ${pick.value} g to mg.`);
      } else if (!pick.unit) {
        notes.push('Unit not visible; assumed mg.');
        confidence = 'low';
      }
    } else if (pick.unit === 'mg') {
      value = pick.value / 1000;
      notes.push(`Converted ${pick.value} mg to g.`);
    }
    if (pick.lessThan) {
      notes.push(`Label shows "< ${pick.value}"; the upper bound is used.`);
      confidence = 'low';
    }
    if (nums.length > 1 && rule.key !== 'energyKcal') notes.push(`Other numbers on this line: ${nums.slice(1).map((n) => n.raw).join(', ')}.`);
    if (cleanNumericToken(line) !== line) {
      notes.push('Corrected likely OCR character confusions (O/0, l/1, comma/decimal).');
      confidence = 'low';
    }
    fields[rule.key] = { value: Math.round(value * 100) / 100, unit, rawLine: line, confidence, notes };
  }

  // Salt-only labels: derive sodium (sodium = salt / 2.5).
  if (!fields.sodiumMg) {
    const saltLine = lines.find((l) => /\bsalt\b/i.test(l) && /\d/.test(l));
    if (saltLine) {
      const n = numbersIn(saltLine.replace(/salt/i, ' '))[0];
      if (n) {
        const grams = n.unit === 'mg' ? n.value / 1000 : n.value;
        fields.sodiumMg = {
          value: Math.round((grams / 2.5) * 1000 * 10) / 10,
          unit: 'mg',
          rawLine: saltLine,
          confidence: 'low',
          notes: [`Derived from salt ${n.value} ${n.unit ?? 'g'} (sodium = salt / 2.5).`],
        };
      }
    }
  }

  // Cross-field sanity checks: flag rather than fix.
  const f = fields;
  const flag = (k: FieldKey, msg: string) => {
    if (f[k]) {
      f[k]!.confidence = 'low';
      f[k]!.notes.push(msg);
    }
  };
  if (f.sugarsG && f.carbohydratesG && f.sugarsG.value > f.carbohydratesG.value) flag('sugarsG', 'Sugars exceed carbohydrates - check both values.');
  if (f.saturatedFatG && f.fatG && f.saturatedFatG.value > f.fatG.value) flag('saturatedFatG', 'Saturated fat exceeds total fat - check both values.');
  if (f.energyKcal && f.energyKcal.value > 900) flag('energyKcal', 'Energy above 900 kcal per 100 is implausible.');
  for (const k of ['fatG', 'saturatedFatG', 'carbohydratesG', 'sugarsG', 'fiberG', 'proteinG'] as const) {
    if (f[k] && f[k]!.value > 100) flag(k, 'More than 100 g per 100 is impossible - likely an OCR error.');
  }
  const missing = RULES.map((r) => r.key).filter((k) => !fields[k] && k !== 'transFatG');
  if (missing.length) warnings.push(`Not found in the image: ${missing.join(', ')}. Enter them manually if they are on the label.`);

  return { basis, basisEvidence: evidence, fields, ingredientsText, warnings, unparsedLines: unparsed.slice(0, 20) };
}
