import { Text, View } from 'react-native';
import { colors, font, space } from '@/theme';
import type { NutritionValues } from '@/types/api';

const ROWS: Array<{ key: keyof NutritionValues; label: string; unit: string; indent?: boolean; ref?: number }> = [
  { key: 'energyKcal', label: 'Energy', unit: 'kcal' },
  { key: 'fatG', label: 'Total fat', unit: 'g' },
  { key: 'saturatedFatG', label: 'Saturated fat', unit: 'g', indent: true },
  { key: 'transFatG', label: 'Trans fat', unit: 'g', indent: true },
  { key: 'carbohydratesG', label: 'Carbohydrates', unit: 'g' },
  { key: 'sugarsG', label: 'Total sugars', unit: 'g', indent: true },
  { key: 'fiberG', label: 'Dietary fibre', unit: 'g' },
  { key: 'proteinG', label: 'Protein', unit: 'g' },
  { key: 'sodiumMg', label: 'Sodium', unit: 'mg' },
];

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/** Nutrition facts with explicit "not reported" for missing values (never shown as 0). */
export function NutritionTable({ values, basisLabel }: { values: NutritionValues; basisLabel: string }) {
  return (
    <View accessibilityLabel={`Nutrition facts ${basisLabel}`}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingBottom: space.sm, borderBottomWidth: 2, borderColor: colors.text }}>
        <Text style={font.tiny}>NUTRIENT</Text>
        <Text style={font.tiny}>{basisLabel.toUpperCase()}</Text>
      </View>
      {ROWS.map((r) => {
        const v = values[r.key];
        if (r.key === 'transFatG' && v === null) return null;
        return (
          <View key={r.key} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, borderBottomWidth: 1, borderColor: colors.border }}>
            <Text style={[font.body, r.indent && { paddingLeft: space.lg, color: colors.textMuted }]}>{r.label}</Text>
            {v === null ? (
              <Text style={{ color: colors.warning, fontStyle: 'italic', fontSize: 14 }}>not reported</Text>
            ) : (
              <Text style={[font.body, { fontWeight: '700' }]}>
                {fmt(v)} {r.unit}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}
