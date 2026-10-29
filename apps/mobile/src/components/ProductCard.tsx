import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useCompare } from '@/store/compare';
import { colors, font, radius, space } from '@/theme';
import type { ProductSummary } from '@/types/api';
import { StarRating } from './StarRating';
import { Badge, Card } from './ui';

export const productKey = (p: { id: string; barcode: string | null }) => p.barcode ?? p.id;

export function ProductThumb({ uri, size = 56 }: { uri: string | null; size?: number }) {
  return uri ? (
    <Image source={{ uri }} style={{ width: size, height: size, borderRadius: radius.md, backgroundColor: colors.background }} contentFit="contain" accessibilityIgnoresInvertColors />
  ) : (
    <View style={{ width: size, height: size, borderRadius: radius.md, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name="nutrition-outline" size={size * 0.45} color={colors.primary} />
    </View>
  );
}

export function ProductCard({ product, footer, compact }: { product: ProductSummary; footer?: React.ReactNode; compact?: boolean }) {
  const compare = useCompare();
  const key = productKey(product);
  const inCompare = compare.has(key);
  const basis = product.basis === 'PER_100ML' ? '100 ml' : '100 g';
  const k = product.keyNutrients;
  return (
    <Card onPress={() => router.push(`/product/${encodeURIComponent(key)}`)} accessibilityLabel={`${product.name}, ${product.inr.stars ?? 'no'} INR stars`}>
      <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
        <ProductThumb uri={product.imageUrl} size={compact ? 44 : 56} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={font.h3} numberOfLines={2}>
            {product.name}
          </Text>
          <Text style={font.small} numberOfLines={1}>
            {[product.brand, product.category?.name].filter(Boolean).join(' · ') || 'Uncategorised'}
          </Text>
          <StarRating stars={product.inr.stars} status={product.inr.status} size={14} />
        </View>
        <Pressable
          onPress={() => compare.toggle({ key, name: product.name })}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={inCompare ? `Remove ${product.name} from comparison` : `Add ${product.name} to comparison`}
        >
          <Ionicons name={inCompare ? 'git-compare' : 'git-compare-outline'} size={22} color={inCompare ? colors.primary : colors.textMuted} />
        </Pressable>
      </View>
      {!compact && k && product.basis !== 'UNKNOWN' ? (
        <Text style={font.small}>
          Per {basis}: {k.energyKcal ?? '-'} kcal · sugar {k.sugarsG ?? '-'} g · sodium {k.sodiumMg ?? '-'} mg
        </Text>
      ) : null}
      {product.dataSource === 'LEGACY_CSV' ? <Badge label="Unverified project data · no barcode" tone="warning" /> : null}
      {footer}
    </Card>
  );
}
