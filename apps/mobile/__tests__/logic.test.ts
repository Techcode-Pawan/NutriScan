import { barcodeProblem, isValidGtin } from '@/features/scanner/barcode';
import { emptyDraft, parseDraft } from '@/features/nutrition/NutritionForm';
import { validateEmail, validatePassword } from '@/components/AuthForm';

describe('barcode validation (mirrors the backend GS1 rules)', () => {
  it('accepts valid EAN-13, EAN-8 and UPC-A codes', () => {
    expect(isValidGtin('8901719134845')).toBe(true);
    expect(isValidGtin('96385074')).toBe(true);
    expect(isValidGtin('036000291452')).toBe(true);
  });
  it('explains what is wrong', () => {
    expect(barcodeProblem('')).toMatch(/Enter the number/);
    expect(barcodeProblem('89017ab')).toMatch(/digits only/);
    expect(barcodeProblem('12345')).toMatch(/8, 12 or 13 digits/);
    expect(barcodeProblem('8901719134846')).toMatch(/check digit/);
    expect(barcodeProblem('8901719134845')).toBeNull();
  });
});

describe('nutrition form parsing', () => {
  it('keeps empty fields as null, never zero', () => {
    const { values, errors } = parseDraft({ ...emptyDraft(), energyKcal: '480', sugarsG: '32,5' });
    expect(values.energyKcal).toBe(480);
    expect(values.sugarsG).toBe(32.5);
    expect(values.fiberG).toBeNull();
    expect(errors).toEqual({});
  });
  it('flags impossible values', () => {
    const { errors } = parseDraft({ ...emptyDraft(), carbohydratesG: '10', sugarsG: '20', fatG: 'abc', energyKcal: '950' });
    expect(errors.sugarsG).toMatch(/exceed carbohydrates/);
    expect(errors.fatG).toMatch(/positive number/);
    expect(errors.energyKcal).toMatch(/implausible/);
  });
});

describe('auth validation', () => {
  it('validates email and password strength', () => {
    expect(validateEmail('a@b.co')).toBeNull();
    expect(validateEmail('not-an-email')).not.toBeNull();
    expect(validatePassword('short1')).toMatch(/8 characters/);
    expect(validatePassword('longpassword')).toMatch(/letter and one number/);
    expect(validatePassword('longpass9')).toBeNull();
  });
});
