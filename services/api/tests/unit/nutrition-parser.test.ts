import { describe, expect, it } from 'vitest';
import { cleanNumericToken, detectBasis, parseLabelText } from '../../src/modules/ocr/nutrition-parser.js';
import { classifyIntent, numbersAreGrounded } from '../../src/modules/assistant/assistant.service.js';

const LABEL = `NUTRITIONAL INFORMATION
Per 100 g (approx.)
Energy 1975 kJ / 472 kcal
Protein 6.5 g
Carbohydrate 68.0 g
Total Sugars 32.5 g
Added Sugars 30 g
Total Fat 19.O g
Saturated Fat 9.4 g
Trans Fat 0.1 g
Dietary Fibre 1.2 g
Sodium 250 mg
INGREDIENTS: Refined wheat flour (maida), sugar, refined palm oil, cocoa solids (4%), invert sugar syrup, salt.

ALLERGEN: contains wheat`;

describe('nutrition label parser', () => {
  const r = parseLabelText(LABEL);

  it('detects a per-100 g basis', () => {
    expect(r.basis).toBe('PER_100G');
  });
  it('prefers the kcal value when kJ and kcal are both printed', () => {
    expect(r.fields.energyKcal?.value).toBe(472);
  });
  it('reads total sugars, not added sugars', () => {
    expect(r.fields.sugarsG?.value).toBe(32.5);
  });
  it('separates total fat from saturated and trans fat and fixes O->0 with low confidence', () => {
    expect(r.fields.fatG?.value).toBe(19);
    expect(r.fields.fatG?.confidence).toBe('low');
    expect(r.fields.saturatedFatG?.value).toBe(9.4);
    expect(r.fields.transFatG?.value).toBe(0.1);
  });
  it('reads fibre, protein, carbohydrate and sodium in mg', () => {
    expect(r.fields.fiberG?.value).toBe(1.2);
    expect(r.fields.proteinG?.value).toBe(6.5);
    expect(r.fields.carbohydratesG?.value).toBe(68);
    expect(r.fields.sodiumMg?.value).toBe(250);
  });
  it('extracts the ingredient list', () => {
    expect(r.ingredientsText).toMatch(/^Refined wheat flour \(maida\), sugar/);
    expect(r.ingredientsText).not.toMatch(/ALLERGEN/);
  });

  it('converts kJ-only energy and gram sodium, and derives sodium from salt', () => {
    const t = parseLabelText('per 100 g\nEnergy 1000 kJ\nSodium 0.4 g');
    expect(t.fields.energyKcal?.value).toBeCloseTo(239, 0);
    expect(t.fields.sodiumMg?.value).toBe(400);
    const s = parseLabelText('per 100 g\nSalt 1.25 g');
    expect(s.fields.sodiumMg?.value).toBe(500);
    expect(s.fields.sodiumMg?.confidence).toBe('low');
  });

  it('warns when the basis is missing or several columns exist', () => {
    const t = parseLabelText('Energy 120 kcal  60 kcal\nProtein 2 g\nPer serving (30 g)');
    expect(t.basis).toBe('UNKNOWN');
    expect(t.warnings.join(' ')).toMatch(/per 100 g/);
    expect(t.warnings.join(' ')).toMatch(/more than one column/);
  });

  it('flags impossible values instead of fixing them', () => {
    const t = parseLabelText('per 100 g\nCarbohydrate 20 g\nTotal Sugars 45 g');
    expect(t.fields.sugarsG?.confidence).toBe('low');
    expect(t.fields.sugarsG?.notes.join(' ')).toMatch(/exceed carbohydrates/);
  });

  it('detects per 100 ml', () => {
    expect(detectBasis('Nutrition facts per 100 ml').basis).toBe('PER_100ML');
  });
  it('fixes common OCR confusions inside numbers only', () => {
    expect(cleanNumericToken('1O.5 g')).toBe('10.5 g');
    expect(cleanNumericToken('2l.3')).toBe('21.3');
    expect(cleanNumericToken('Protein')).toBe('Protein');
  });
});

describe('assistant safeguards', () => {
  it.each([
    ['Is this safe for my diabetic father?', 'medical'],
    ['Why did this product get this rating?', 'why_rating'],
    ['Which nutrient contributed most to the baseline score?', 'top_contributor'],
    ['What does INS 471 mean?', 'ingredients'],
    ['What information is missing?', 'missing'],
    ['Suggest a healthier alternative', 'alternatives'],
    ['How much sodium does it have?', 'nutrient_value'],
  ] as const)('classifies "%s" as %s', (q, intent) => {
    expect(classifyIntent(q, false)).toBe(intent);
  });
  it('routes to comparison when a second product is selected', () => {
    expect(classifyIntent('Which has less sugar?', true)).toBe('compare');
  });
  it('rejects LLM answers containing numbers that are not in the facts', () => {
    expect(numbersAreGrounded('It has 32.5 g sugar and 2.5 stars.', '{"sugarsG":32.5,"stars":2.5}')).toBe(true);
    expect(numbersAreGrounded('It has 40 g sugar.', '{"sugarsG":32.5}')).toBe(false);
  });
});
