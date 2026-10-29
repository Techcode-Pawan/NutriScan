import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import { InrBreakdown } from '@/components/InrBreakdown';
import { NutritionTable } from '@/components/NutritionTable';
import { ProductThumb, productKey } from '@/components/ProductCard';
import { StarRating } from '@/components/StarRating';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { Badge, Button, Card, Notice, Row, Screen, SectionHeader } from '@/components/ui';
import { useFavorites, useProduct, useRecordScan, useToggleFavorite } from '@/hooks/queries';
import { ApiError } from '@/services/api';
import { useAuth } from '@/store/auth';
import { useCompare } from '@/store/compare';
import { colors, font, radius, space } from '@/theme';

export default function ProductScreen() {
  const { key, via } = useLocalSearchParams<{ key: string; via?: 'CAMERA' | 'MANUAL' | 'IMAGE' }>();
  const product = useProduct(key);
  const { token } = useAuth();
  const favorites = useFavorites();
  const toggleFav = useToggleFavorite();
  const recordScan = useRecordScan();
  const compare = useCompare();
  const recorded = useRef(false);

  // Save the scan to history once the product is found (logged-in users only).
  useEffect(() => {
    if (product.data && !recorded.current && token) {
      recorded.current = true;
      recordScan.mutate({ productId: product.data.id, method: via ?? 'SEARCH' });
    }
  }, [product.data, token, via, recordScan]);

  if (product.isLoading) return <LoadingState label="Looking up product..." />;
  if (product.error) {
    const e = product.error as ApiError;
    if (e.code === 'PRODUCT_NOT_FOUND') {
      const barcode = (e.details as { barcode?: string } | undefined)?.barcode ?? key;
      return (
        <Screen>
          <EmptyState
            icon="help-buoy-outline"
            title="Product not in the database"
            message={`No product with barcode ${barcode} is in NutriScan yet. A successful scan does not mean we have data for it, and we never invent nutrition values.`}
          />
          <Button title="Submit this product" icon="add-circle-outline" onPress={() => router.push({ pathname: '/submit', params: { barcode } })} />
          <Button title="Read its nutrition label instead" variant="secondary" icon="document-text-outline" onPress={() => router.push({ pathname: '/label-scan', params: { barcode } })} />
          <Button title="Scan another product" variant="ghost" onPress={() => router.back()} />
        </Screen>
      );
    }
    if (e.code === 'INVALID_BARCODE') {
      return (
        <Screen>
          <EmptyState icon="barcode-outline" title="Invalid barcode" message={e.message} action="Try again" onAction={() => router.back()} />
        </Screen>
      );
    }
    return <ErrorState error={product.error} onRetry={product.refetch} />;
  }
  const p = product.data!;
  const isFav = Boolean(favorites.data?.some((f) => f.product.id === p.id));
  const inr = p.inr;
  const k = productKey(p);
  const inCompare = compare.has(k);

  return (
    <>
      <Stack.Screen options={{ title: p.brand ?? 'Product' }} />
      <Screen>
        <Card>
          <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
            <ProductThumb uri={p.imageUrl} size={84} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={font.h2}>{p.name}</Text>
              <Text style={font.small}>{[p.brand, p.quantity].filter(Boolean).join(' · ')}</Text>
              <Row style={{ flexWrap: 'wrap', marginTop: 4 }}>
                {p.category ? <Badge label={p.category.name} tone="primary" /> : <Badge label="Category not mapped" tone="warning" />}
                {p.isVegetarian === true ? <Badge label="Vegetarian (source data)" tone="primary" /> : p.isVegetarian === false ? <Badge label="Non-vegetarian" tone="danger" /> : null}
                {p.barcode ? <Badge label={p.barcode} /> : <Badge label="No barcode" tone="warning" />}
              </Row>
            </View>
          </Row>
          <Row style={{ flexWrap: 'wrap', marginTop: space.sm }}>
            <Button
              title={isFav ? 'Saved' : 'Save'}
              icon={isFav ? 'heart' : 'heart-outline'}
              variant="secondary"
              style={{ flex: 1 }}
              loading={toggleFav.isPending}
              onPress={() => (token ? toggleFav.mutate({ productId: p.id, isFavorite: isFav }) : router.push('/auth/login'))}
            />
            <Button title={inCompare ? 'In compare' : 'Compare'} icon="git-compare-outline" variant="secondary" style={{ flex: 1 }} onPress={() => compare.toggle({ key: k, name: p.name })} />
          </Row>
          {compare.items.length >= 2 && inCompare ? <Button title={`Compare ${compare.items.length} products`} variant="ghost" onPress={() => router.push('/compare')} /> : null}
        </Card>

        {/* INR rating */}
        <Card>
          <Text style={font.tiny}>INDIAN NUTRITION RATING (FSSAI DRAFT 2022)</Text>
          {inr ? (
            <>
              <StarRating stars={inr.stars} status={inr.status} size={26} />
              <Text style={font.h3}>{inr.explanation.headline}</Text>
              {inr.explanation.summary.map((s, i) => (
                <Text key={i} style={font.body}>
                  {s}
                </Text>
              ))}
              {inr.status === 'PARTIAL' ? <Notice tone="warning" text="Partial rating: a positive nutrient is not reported, so the real rating could be higher. Partial ratings are not used as recommended alternatives." /> : null}
              {inr.hfss.evaluable && inr.hfss.isHfss ? <Notice tone="warning" icon="alert-circle-outline" text={`Meets the draft HFSS (high fat, sugar, salt) definition: ${inr.hfss.triggers.join('; ')}.`} /> : null}
            </>
          ) : (
            <Text style={font.body}>No rating has been computed for this product.</Text>
          )}
        </Card>

        <Row>
          <Button title="Alternatives" icon="swap-horizontal" style={{ flex: 1 }} onPress={() => router.push(`/product/${encodeURIComponent(k)}/alternatives`)} />
          <Button title="Ask" icon="chatbubbles-outline" variant="secondary" style={{ flex: 1 }} onPress={() => router.push(`/product/${encodeURIComponent(k)}/assistant`)} />
        </Row>

        {inr && inr.finalScore !== null ? (
          <Card>
            <SectionHeader title="How the rating was calculated" />
            <InrBreakdown
              baseline={inr.breakdown.baseline}
              positive={inr.breakdown.positive}
              baselinePoints={inr.baselinePoints}
              positivePoints={inr.positivePoints}
              finalScore={inr.finalScore}
              capRule={inr.breakdown.capRule}
            />
          </Card>
        ) : null}

        {inr && (inr.explanation.concerns.length > 0 || inr.explanation.positives.length > 0) ? (
          <Card>
            {inr.explanation.positives.length ? <SectionHeader title="Positive attributes" /> : null}
            {inr.explanation.positives.map((t, i) => (
              <Row key={`p${i}`} style={{ alignItems: 'flex-start' }}>
                <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
                <Text style={[font.body, { flex: 1 }]}>{t}</Text>
              </Row>
            ))}
            {inr.explanation.concerns.length ? <SectionHeader title="Potential concerns" /> : null}
            {inr.explanation.concerns.map((t, i) => (
              <Row key={`c${i}`} style={{ alignItems: 'flex-start' }}>
                <Ionicons name="alert-circle" size={18} color={colors.warning} />
                <Text style={[font.body, { flex: 1 }]}>{t}</Text>
              </Row>
            ))}
          </Card>
        ) : null}

        {p.personal && p.personal.checks.length ? (
          <Card>
            <SectionHeader title="Your preferences" />
            {p.personal.checks.map((c) => (
              <Row key={c.preference} style={{ alignItems: 'flex-start' }}>
                <Ionicons
                  name={c.status === 'meets' ? 'checkmark-circle' : c.status === 'does_not_meet' ? 'close-circle' : 'help-circle'}
                  size={18}
                  color={c.status === 'meets' ? colors.primary : c.status === 'does_not_meet' ? colors.danger : colors.textMuted}
                />
                <Text style={[font.body, { flex: 1 }]}>{c.message}</Text>
              </Row>
            ))}
            {p.personal.ageGroupNote ? <Text style={font.small}>{p.personal.ageGroupNote}</Text> : null}
            <Text style={font.small}>{p.personal.note}</Text>
          </Card>
        ) : null}

        <Card>
          <SectionHeader title="Nutrition facts" />
          {p.nutrition ? (
            <>
              <NutritionTable values={p.nutrition.values} basisLabel={p.nutrition.basisLabel} />
              <Text style={font.small}>
                Data completeness {Math.round(p.nutrition.completeness * 100)}%{p.nutrition.basisNote ? ` · ${p.nutrition.basisNote}` : ''}
              </Text>
            </>
          ) : (
            <Notice tone="warning" text="No nutrition information is available for this product." />
          )}
          {inr?.explanation.missing.length ? inr.explanation.missing.map((m, i) => <Notice key={i} tone="warning" text={m} />) : null}
        </Card>

        <Card>
          <SectionHeader title="Ingredients" />
          <Text style={font.body}>{p.ingredientsText ?? 'No ingredient list is available for this product.'}</Text>
          {p.ingredients.insights.map((i) => (
            <View key={i.code} style={{ backgroundColor: colors.background, borderRadius: radius.md, padding: space.md, gap: 2 }}>
              <Text style={[font.body, { fontWeight: '700' }]}>{i.label}</Text>
              <Text style={font.small}>{i.detail}</Text>
            </View>
          ))}
          {p.ingredients.allergensMentioned.length ? (
            <Text style={font.small}>Allergens named in the list: {p.ingredients.allergensMentioned.join(', ')}. Always check the pack's allergen statement.</Text>
          ) : null}
          {p.ingredientsText ? <Text style={font.small}>{p.ingredients.note}</Text> : null}
        </Card>

        <Card onPress={() => router.push(`/product/${encodeURIComponent(k)}/ml`)} accessibilityLabel="Open experimental ML analysis">
          <Row gap={space.md}>
            <Ionicons name="analytics-outline" size={24} color={colors.purple} />
            <View style={{ flex: 1 }}>
              <Text style={font.h3}>Experimental ML estimate</Text>
              <Text style={font.small}>A separate machine-learning estimate of the Nutri-Score grade. It does not change the INR rating.</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </Row>
        </Card>

        <Card>
          <SectionHeader title="Data source" />
          <Text style={font.body}>{p.source.label}</Text>
          <Text style={font.small}>{p.source.attribution}</Text>
          <Notice tone="info" text={p.source.note} />
          {p.source.qualityFlags.length ? (
            <Row style={{ flexWrap: 'wrap' }}>
              {p.source.qualityFlags.map((f) => (
                <Badge key={f} label={f.replace(/_/g, ' ').replace(/:.*/, '')} />
              ))}
            </Row>
          ) : null}
          {inr ? <Text style={font.small}>{inr.explanation.disclaimer}</Text> : null}
        </Card>

        <Pressable onPress={() => router.push({ pathname: '/submit', params: { barcode: p.barcode ?? '', name: p.name, brand: p.brand ?? '' } })} accessibilityRole="button">
          <Text style={{ color: colors.primary, textAlign: 'center', fontWeight: '600' }}>Data looks wrong? Submit a correction</Text>
        </Pressable>
      </Screen>
    </>
  );
}
