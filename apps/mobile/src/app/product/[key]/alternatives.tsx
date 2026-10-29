import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { CompareBar } from '@/components/CompareBar';
import { ProductCard, productKey } from '@/components/ProductCard';
import { StarRating } from '@/components/StarRating';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { Button, Card, Chip, Notice, Row, Screen } from '@/components/ui';
import { useAlternatives } from '@/hooks/queries';
import { useAuth } from '@/store/auth';
import { colors, font, space } from '@/theme';

export default function Alternatives() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const { token } = useAuth();
  const [includePartial, setIncludePartial] = useState(false);
  const [applyPreferences, setApplyPreferences] = useState(true);
  const q = useAlternatives(key, { includePartial, applyPreferences });

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        {q.isLoading ? <LoadingState label="Finding higher-rated products..." /> : q.error ? <ErrorState error={q.error} onRetry={q.refetch} /> : (
          <>
            <Card>
              <Text style={font.tiny}>ALTERNATIVES FOR</Text>
              <Text style={font.h3}>{q.data!.product.name}</Text>
              <StarRating stars={q.data!.product.inr.stars} status={q.data!.product.inr.status} />
              <Text style={font.small}>
                Same category ({q.data!.criteria.category ?? 'unmapped'}), strictly higher INR rating, reliable data only. Ranked by rating difference, then preference match and data completeness.
              </Text>
            </Card>
            <Row style={{ flexWrap: 'wrap' }}>
              <Chip label="Include partial ratings" selected={includePartial} onPress={() => setIncludePartial(!includePartial)} />
              {token ? <Chip label="Apply my preferences" selected={applyPreferences} onPress={() => setApplyPreferences(!applyPreferences)} /> : null}
            </Row>
            {!token ? <Notice text="Log in and set preferences (e.g. lower sugar, vegetarian) to personalise the ranking. Preferences never change INR ratings." /> : null}
            {q.data!.alternatives.length === 0 ? (
              <EmptyState icon="ribbon-outline" title="No higher-rated alternatives" message={q.data!.message ?? undefined} action="Browse this category" onAction={() => q.data!.product.category && router.push(`/category/${q.data!.product.category.slug}`)} />
            ) : (
              q.data!.alternatives.map((a, i) => (
                <ProductCard
                  key={a.id}
                  product={a}
                  footer={
                    <View style={{ gap: 4 }}>
                      {i === 0 ? <Text style={[font.tiny, { color: colors.primary }]}>BEST MATCH</Text> : null}
                      {a.reasons.map((r, j) => (
                        <Row key={j} style={{ alignItems: 'flex-start' }}>
                          <Ionicons name="checkmark" size={16} color={colors.primary} />
                          <Text style={[font.small, { flex: 1, color: colors.text }]}>{r}</Text>
                        </Row>
                      ))}
                      {a.tradeOffs.map((t, j) => (
                        <Text key={`t${j}`} style={[font.small, { color: colors.warning }]}>
                          {t}
                        </Text>
                      ))}
                      {a.partial ? <Text style={[font.small, { color: colors.warning }]}>Partial rating (a positive nutrient is unreported).</Text> : null}
                      <Button
                        title="Compare side by side"
                        variant="ghost"
                        icon="git-compare-outline"
                        onPress={() => router.push({ pathname: '/compare', params: { keys: `${key},${productKey(a)}` } })}
                      />
                    </View>
                  }
                />
              ))
            )}
            {q.data!.excluded && Object.values(q.data!.excluded).some((v) => v > 0) ? (
              <Text style={font.small}>
                Not shown: {q.data!.excluded.differentBasis} with a different measurement basis, {q.data!.excluded.nonVegetarian} non-vegetarian,{' '}
                {q.data!.excluded.excludedIngredient} containing your excluded ingredients, {q.data!.excluded.ingredientsUnknown} without an ingredient list.
              </Text>
            ) : null}
            <View style={{ height: space.xxl * 2 }} />
          </>
        )}
      </Screen>
      <CompareBar />
    </View>
  );
}
