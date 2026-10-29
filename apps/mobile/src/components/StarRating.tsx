import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { colors, ratingColor } from '@/theme';
import type { InrStatus } from '@/types/api';

const STATUS_LABEL: Record<InrStatus, string> = {
  RATED: 'INR rating',
  PARTIAL: 'Partial INR rating',
  INSUFFICIENT_DATA: 'Not rated - data missing',
  EXEMPT: 'Not rated - exempt category',
  NOT_ELIGIBLE: 'Not rated - not eligible',
  BASIS_UNKNOWN: 'Not rated - basis unknown',
};
export const statusLabel = (s: InrStatus) => STATUS_LABEL[s];

/** Half-star display for the INR scale (0.5 - 5). Always paired with the number for accessibility. */
export function StarRating({ stars, size = 18, showValue = true, status }: { stars: number | null; size?: number; showValue?: boolean; status?: InrStatus }) {
  if (stars === null) {
    return (
      <Text style={{ color: colors.textMuted, fontSize: size * 0.75, fontWeight: '600' }} accessibilityLabel={status ? STATUS_LABEL[status] : 'No INR rating'}>
        {status ? STATUS_LABEL[status] : 'No INR rating'}
      </Text>
    );
  }
  const icons = [1, 2, 3, 4, 5].map((i) => (stars >= i ? 'star' : stars >= i - 0.5 ? 'star-half' : 'star-outline'));
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${stars} out of 5 stars${status === 'PARTIAL' ? ', partial rating' : ''}`}
    >
      {icons.map((name, i) => (
        <Ionicons key={i} name={name as 'star'} size={size} color={name === 'star-outline' ? colors.starEmpty : colors.star} />
      ))}
      {showValue ? <Text style={{ marginLeft: 6, fontWeight: '800', fontSize: size * 0.85, color: ratingColor(stars) }}>{stars.toFixed(1)}</Text> : null}
    </View>
  );
}
