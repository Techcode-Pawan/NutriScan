/** NutriScan design tokens: emerald, white and restrained neutrals (WCAG AA text contrast). */
export const colors = {
  primary: '#047857', // emerald-700: 5.5:1 on white
  primaryDark: '#065F46',
  primaryLight: '#D1FAE5',
  primarySoft: '#ECFDF5',
  accent: '#10B981',
  background: '#F5F7F6',
  surface: '#FFFFFF',
  text: '#10201B',
  textMuted: '#55655F',
  border: '#E1E7E4',
  star: '#F59E0B',
  starEmpty: '#D6DDDA',
  warning: '#B45309',
  warningSoft: '#FEF3C7',
  danger: '#B91C1C',
  dangerSoft: '#FEE2E2',
  info: '#1D4ED8',
  infoSoft: '#DBEAFE',
  purple: '#6D28D9',
  purpleSoft: '#EDE9FE',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 };
export const font = {
  h1: { fontSize: 26, fontWeight: '800' as const, color: colors.text, letterSpacing: -0.3 },
  h2: { fontSize: 20, fontWeight: '700' as const, color: colors.text },
  h3: { fontSize: 16, fontWeight: '700' as const, color: colors.text },
  body: { fontSize: 15, color: colors.text, lineHeight: 21 },
  small: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  tiny: { fontSize: 11, color: colors.textMuted, fontWeight: '600' as const, letterSpacing: 0.4 },
};

/** Colour for an INR star rating (only used together with the numeric value, never alone). */
export function ratingColor(stars: number | null | undefined): string {
  if (stars === null || stars === undefined) return colors.textMuted;
  if (stars >= 4) return colors.primary;
  if (stars >= 2.5) return '#A16207';
  return colors.danger;
}
