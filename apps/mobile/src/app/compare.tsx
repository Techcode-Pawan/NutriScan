import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { StarRating } from '@/components/StarRating';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { Button, Card, Notice, Screen, SectionHeader } from '@/components/ui';
import { useCompareQuery } from '@/hooks/queries';
import { useCompare } from '@/store/compare';
import { colors, font, space } from '@/theme';

const fmt = (v: number | null) => (v === null ? '—' : Number.isInteger(v) ? String(v) : v.toFixed(1));
const COL = 150;

export default function Compare() {
  const params = useLocalSearchParams<{ keys?: string }>();
  const tray = useCompare();
  const keys = params.keys ? params.keys.split(',').filter(Boolean) : tray.items.map((i) => i.key);
  const q = useCompareQuery(keys);

  if (keys.length < 2) {
    return (
      <Screen>
        <EmptyState icon="git-compare-outline" title="Pick at least two products" message="Use the compare icon on product cards or the Compare button on a product page." action="Search products" onAction={() => router.push('/(tabs)/search')} />
      </Screen>
    );
  }
  if (q.isLoading) return <LoadingState label="Comparing..." />;
  if (q.error) return <ErrorState error={q.error} onRetry={q.refetch} />;
  const d = q.data!;

  return (
    <Screen>
      <Card>
        <SectionHeader title="Summary" />
        {d.summary.map((s, i) => (
          <Text key={i} style={font.body}>
            • {s}
          </Text>
        ))}
        {!d.comparable ? <Notice tone="warning" text="Values are shown but differences are not highlighted because the measurement bases differ or are unknown." /> : <Text style={font.small}>All values {d.basis}. Highlighted = more favourable for that nutrient.</Text>}
      </Card>

      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View style={{ backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border }}>
          <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: colors.border }}>
            <View style={{ width: 120, padding: space.md }} />
            {d.products.map((p) => (
              <View key={p.id} style={{ width: COL, padding: space.md, gap: 4 }}>
                <Text style={[font.body, { fontWeight: '700' }]} numberOfLines={3} onPress={() => router.push(`/product/${encodeURIComponent(p.barcode ?? p.id)}`)}>
                  {p.name}
                </Text>
                <Text style={font.small} numberOfLines={1}>
                  {p.brand ?? ''}
                </Text>
                <Text style={font.small} numberOfLines={1}>
                  {p.category?.name ?? 'No category'}
                </Text>
              </View>
            ))}
          </View>
          <Row label="INR rating">
            {d.products.map((p) => (
              <View key={p.id} style={{ width: COL, padding: space.md }}>
                <StarRating stars={p.inr.stars} status={p.inr.status} size={13} />
              </View>
            ))}
          </Row>
          <Row label="ML estimate (exp.)">
            {d.products.map((p) => (
              <Text key={p.id} style={[font.small, { width: COL, padding: space.md }]}>
                {p.ml ? `Grade ${p.ml.predictedGrade.toUpperCase()} · ${Math.round(p.ml.mlIndex)}` : 'not computed'}
              </Text>
            ))}
          </Row>
          {d.rows.map((r) => (
            <Row key={r.key} label={`${r.label} (${r.unit})`}>
              {r.values.map((v, i) => {
                const best = r.bestIndexes.includes(i);
                return (
                  <Text
                    key={i}
                    style={[font.body, { width: COL, padding: space.md, fontWeight: best ? '800' : '400', color: v === null ? colors.warning : best ? colors.primary : colors.text, backgroundColor: best ? colors.primarySoft : undefined }]}
                    accessibilityLabel={`${r.label} ${v === null ? 'not reported' : v}${best ? ', most favourable' : ''}`}
                  >
                    {v === null ? 'not reported' : fmt(v)}
                  </Text>
                );
              })}
            </Row>
          ))}
          <Row label="Data completeness">
            {d.products.map((p) => (
              <Text key={p.id} style={[font.small, { width: COL, padding: space.md }]}>
                {Math.round(p.dataCompleteness * 100)}%
              </Text>
            ))}
          </Row>
          <Row label="Ingredients">
            {d.products.map((p) => (
              <Text key={p.id} style={[font.small, { width: COL, padding: space.md }]} numberOfLines={8}>
                {p.ingredientsText ?? 'not available'}
              </Text>
            ))}
          </Row>
        </View>
      </ScrollView>
      {!params.keys ? <Button title="Clear comparison" variant="ghost" onPress={() => { tray.clear(); router.back(); }} /> : null}
    </Screen>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: colors.border, alignItems: 'center' }}>
      <Text style={[font.small, { width: 120, padding: space.md, fontWeight: '700', color: colors.text }]}>{label}</Text>
      {children}
    </View>
  );
}
