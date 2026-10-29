export type NumericFlag = 'less_than_value' | 'decimal_comma' | 'invalid_number';

/**
 * Parses a nutrient cell from a source file. Missing stays null (never 0).
 * "<1" is stored at its upper bound and flagged; "7,65" is read as 7.65.
 */
export function parseNutrient(raw: unknown): { value: number | null; flag: NumericFlag | null } {
  if (raw === null || raw === undefined) return { value: null, flag: null };
  if (typeof raw === 'number') return Number.isFinite(raw) ? { value: raw, flag: null } : { value: null, flag: 'invalid_number' };
  let s = String(raw).trim();
  if (s === '' || /^(n\/?a|na|-|nil|null|none)$/i.test(s)) return { value: null, flag: null };
  let flag: NumericFlag | null = null;
  if (s.startsWith('<')) {
    flag = 'less_than_value';
    s = s.slice(1).trim();
  }
  if (/^\d+,\d+$/.test(s)) {
    s = s.replace(',', '.');
    flag = flag ?? 'decimal_comma';
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return { value: null, flag: 'invalid_number' };
  return { value: Number(s), flag };
}

export const round = (v: number | null, dp = 2): number | null =>
  v === null ? null : Math.round(v * 10 ** dp) / 10 ** dp;
