import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { StarRating } from '@/components/StarRating';
import { ErrorState, LoadingState } from '@/components/States';
import { Badge, Card, Notice, Row, Screen, SectionHeader } from '@/components/ui';
import { useMl, useProduct } from '@/hooks/queries';
import { colors, font, radius, space } from '@/theme';

const GRADES = ['a', 'b', 'c', 'd', 'e'];
const GRADE_COLOR: Record<string, string> = { a: '#047857', b: '#65A30D', c: '#CA8A04', d: '#EA580C', e: '#B91C1C' };

export default function MlScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const ml = useMl(key);
  const product = useProduct(key);

  if (ml.isLoading) return <LoadingState label="Requesting the experimental estimate..." />;
  if (ml.error) return <ErrorState error={ml.error} onRetry={ml.refetch} />;
  const r = ml.data!;

  return (
    <Screen>
      <Notice tone="warning" icon="flask-outline" text={r.disclaimer} />
      {product.data?.inr ? (
        <Card>
          <Text style={font.tiny}>OFFICIAL RATING IN NUTRISCAN (UNCHANGED BY ML)</Text>
          <StarRating stars={product.data.inr.stars} status={product.data.inr.status} />
        </Card>
      ) : null}

      {r.status !== 'ok' ? (
        <Card>
          <Text style={font.h3}>{r.status === 'unavailable' ? 'ML estimate unavailable' : 'Not enough data for an estimate'}</Text>
          <Text style={font.body}>{r.reason}</Text>
          {r.status === 'unavailable' ? <Text style={font.small}>The INR rating and every other feature keep working without the ML service.</Text> : null}
        </Card>
      ) : (
        <>
          <Card>
            <Text style={font.tiny}>ESTIMATED NUTRI-SCORE GRADE (EXPERIMENTAL)</Text>
            <Row gap={space.lg}>
              <View style={{ width: 72, height: 72, borderRadius: radius.lg, backgroundColor: GRADE_COLOR[r.prediction!.predictedGrade], alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 36, fontWeight: '900' }}>{r.prediction!.predictedGrade.toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={font.h3}>ML index {Math.round(r.prediction!.mlIndex)} / 100</Text>
                <Text style={font.small}>Expected value of the predicted grade probabilities (A = 100 … E = 0).</Text>
                {r.referenceGrade ? <Badge label={`Open Food Facts reference grade: ${String(r.referenceGrade).toUpperCase()}`} tone="info" /> : null}
              </View>
            </Row>
            {GRADES.map((g) => {
              const p = r.prediction!.probabilities[g] ?? 0;
              return (
                <Row key={g} accessibilityLabel={`Grade ${g.toUpperCase()} probability ${Math.round(p * 100)} percent`}>
                  <Text style={[font.body, { width: 20, fontWeight: '700' }]}>{g.toUpperCase()}</Text>
                  <View style={{ flex: 1, height: 10, backgroundColor: colors.background, borderRadius: radius.pill, overflow: 'hidden' }}>
                    <View style={{ width: `${p * 100}%`, height: '100%', backgroundColor: GRADE_COLOR[g] }} />
                  </View>
                  <Text style={[font.small, { width: 42, textAlign: 'right' }]}>{Math.round(p * 100)}%</Text>
                </Row>
              );
            })}
            {r.referenceGrade ? <Text style={font.small}>This product may have been part of the training data, so agreement with its reference grade is not evidence of accuracy.</Text> : null}
          </Card>

          <Card>
            <SectionHeader title="What influenced the estimate" />
            <Text style={font.small}>SHAP contributions toward the predicted grade. They show what the model relied on, not what causes a food to be healthy.</Text>
            {r.prediction!.contributions.map((c) => (
              <Row key={c.feature}>
                <Text style={[font.body, { flex: 1 }]}>
                  {c.label}
                  {c.value !== null && c.value !== undefined ? ` (${c.value})` : ''}
                </Text>
                <Text style={[font.body, { fontWeight: '700', color: c.contribution >= 0 ? colors.primary : colors.danger }]}>
                  {c.contribution >= 0 ? '+' : ''}
                  {c.contribution.toFixed(3)}
                </Text>
              </Row>
            ))}
          </Card>

          {r.model ? (
            <Card>
              <SectionHeader title="Model" />
              <Text style={font.small}>Version {r.model.modelVersion}</Text>
              <Text style={font.small}>{r.model.algorithm}</Text>
              <Text style={font.small}>Target: {r.model.target}</Text>
              <Text style={font.body}>
                Held-out test set ({r.model.metrics.test.n} products): accuracy {r.model.metrics.test.accuracy.toFixed(3)}, macro-F1 {r.model.metrics.test.macro_f1.toFixed(3)}, within one grade{' '}
                {r.model.metrics.test.within_one_grade.toFixed(3)}. Majority-class baseline accuracy {r.model.metrics.majorityClassBaseline.accuracy.toFixed(3)}.
              </Text>
              <Text style={font.small}>These metrics measure agreement with Open Food Facts grades, not nutritional or medical validity.</Text>
            </Card>
          ) : null}
        </>
      )}
    </Screen>
  );
}
