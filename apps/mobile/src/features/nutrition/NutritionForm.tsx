import { Text, View } from 'react-native';
import { Chip, Row, TextField } from '@/components/ui';
import { colors, font, space } from '@/theme';
import type { Basis, OcrFieldKey } from '@/types/api';

export const FORM_FIELDS: Array<{ key: Exclude<OcrFieldKey, 'transFatG'>; label: string; unit: string }> = [
  { key: 'energyKcal', label: 'Energy', unit: 'kcal' },
  { key: 'fatG', label: 'Total fat', unit: 'g' },
  { key: 'saturatedFatG', label: 'Saturated fat', unit: 'g' },
  { key: 'carbohydratesG', label: 'Carbohydrates', unit: 'g' },
  { key: 'sugarsG', label: 'Total sugars', unit: 'g' },
  { key: 'fiberG', label: 'Dietary fibre', unit: 'g' },
  { key: 'proteinG', label: 'Protein', unit: 'g' },
  { key: 'sodiumMg', label: 'Sodium', unit: 'mg' },
];

export type NutritionDraft = Record<(typeof FORM_FIELDS)[number]['key'], string>;
export const emptyDraft = (): NutritionDraft => Object.fromEntries(FORM_FIELDS.map((f) => [f.key, ''])) as NutritionDraft;

/** Parses the form; empty stays null (never 0). Returns field errors for non-numeric input. */
export function parseDraft(d: NutritionDraft): { values: Record<string, number | null>; errors: Record<string, string> } {
  const values: Record<string, number | null> = {};
  const errors: Record<string, string> = {};
  for (const f of FORM_FIELDS) {
    const raw = d[f.key].trim().replace(',', '.');
    if (!raw) {
      values[f.key] = null;
      continue;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) errors[f.key] = 'Enter a positive number';
    else if (f.unit === 'g' && n > 100) errors[f.key] = 'Cannot exceed 100 g per 100';
    else if (f.key === 'energyKcal' && n > 900) errors[f.key] = 'Energy above 900 kcal per 100 is implausible';
    else values[f.key] = n;
  }
  if (values.sugarsG != null && values.carbohydratesG != null && values.sugarsG > values.carbohydratesG) errors.sugarsG = 'Sugars cannot exceed carbohydrates';
  if (values.saturatedFatG != null && values.fatG != null && values.saturatedFatG > values.fatG) errors.saturatedFatG = 'Saturated fat cannot exceed total fat';
  return { values, errors };
}

export function NutritionForm({
  draft,
  onChange,
  basis,
  onBasis,
  errors,
  lowConfidence = {},
}: {
  draft: NutritionDraft;
  onChange: (d: NutritionDraft) => void;
  basis: Basis;
  onBasis: (b: Basis) => void;
  errors: Record<string, string>;
  lowConfidence?: Record<string, string>;
}) {
  return (
    <View style={{ gap: space.md }}>
      <Text style={font.h3}>Values are per</Text>
      <Row>
        <Chip label="100 g" selected={basis === 'PER_100G'} onPress={() => onBasis('PER_100G')} />
        <Chip label="100 ml" selected={basis === 'PER_100ML'} onPress={() => onBasis('PER_100ML')} />
        <Chip label="Not sure" selected={basis === 'UNKNOWN'} onPress={() => onBasis('UNKNOWN')} />
      </Row>
      {basis === 'UNKNOWN' ? <Text style={[font.small, { color: colors.warning }]}>A rating needs per-100 g or per-100 ml values. Per-serving values must be converted first.</Text> : null}
      {FORM_FIELDS.map((f) => (
        <TextField
          key={f.key}
          label={`${f.label} (${f.unit})`}
          value={draft[f.key]}
          onChangeText={(t) => onChange({ ...draft, [f.key]: t })}
          keyboardType="decimal-pad"
          placeholder="leave empty if not on the label"
          error={errors[f.key]}
          hint={lowConfidence[f.key]}
          testID={`field-${f.key}`}
        />
      ))}
    </View>
  );
}
