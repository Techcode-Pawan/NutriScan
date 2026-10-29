import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useCompare } from '@/store/compare';
import { colors, radius, space } from '@/theme';

/** Floating tray shown when products are selected for comparison. */
export function CompareBar() {
  const { items, clear } = useCompare();
  if (items.length === 0) return null;
  return (
    <View
      style={{
        position: 'absolute',
        left: space.lg,
        right: space.lg,
        bottom: space.lg,
        backgroundColor: colors.primaryDark,
        borderRadius: radius.lg,
        padding: space.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 6,
      }}
    >
      <Text style={{ color: '#fff', flex: 1, fontWeight: '600' }} numberOfLines={1}>
        {items.length} selected{items.length < 2 ? ' · pick one more' : ''}
      </Text>
      <Pressable onPress={clear} accessibilityRole="button" hitSlop={8}>
        <Text style={{ color: colors.primaryLight, fontWeight: '700' }}>Clear</Text>
      </Pressable>
      <Pressable
        onPress={() => router.push('/compare')}
        disabled={items.length < 2}
        accessibilityRole="button"
        accessibilityState={{ disabled: items.length < 2 }}
        style={{ backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.md, opacity: items.length < 2 ? 0.5 : 1 }}
      >
        <Text style={{ color: colors.primaryDark, fontWeight: '800' }}>Compare</Text>
      </Pressable>
    </View>
  );
}
