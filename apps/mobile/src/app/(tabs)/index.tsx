import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { CompareBar } from '@/components/CompareBar';
import { ProductCard } from '@/components/ProductCard';
import { ErrorState, LoadingState } from '@/components/States';
import { Button, Card, Chip, Notice, Screen, SectionHeader } from '@/components/ui';
import { useCategories, useFavorites, useHistory, useSearch } from '@/hooks/queries';
import { useAuth } from '@/store/auth';
import { colors, font, radius, space } from '@/theme';

const SHORTCUTS = ['biscuits-cookies', 'snacks-namkeen', 'beverages', 'breakfast-cereals', 'chocolates-confectionery', 'noodles-pasta', 'dairy-beverages', 'spreads'];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function Home() {
  const { user, isGuest } = useAuth();
  const [q, setQ] = useState('');
  const categories = useCategories();
  const history = useHistory();
  const favorites = useFavorites();
  // "Top rated" picks are a real database query (highest INR ratings), not hard-coded products.
  const topRated = useSearch({ sort: 'rating', order: 'desc', ratedOnly: true, category: categories.data?.find((c) => c.slug === 'breakfast-cereals')?.id }, Boolean(categories.data));

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <View style={{ gap: 4 }}>
          <Text style={font.h1}>
            {greeting()}
            {user?.displayName ? `, ${user.displayName}` : ''}
          </Text>
          <Text style={font.small}>Scan a pack or search to see its rating and better options.</Text>
        </View>

        <Pressable
          onPress={() => router.push('/(tabs)/scan')}
          accessibilityRole="button"
          accessibilityLabel="Scan a product barcode"
          style={({ pressed }) => ({ backgroundColor: colors.primary, borderRadius: radius.xl, padding: space.xl, flexDirection: 'row', alignItems: 'center', gap: space.lg, opacity: pressed ? 0.9 : 1 })}
        >
          <View style={{ backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: radius.lg, padding: 14 }}>
            <Ionicons name="scan" size={32} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontSize: 19, fontWeight: '800' }}>Scan product</Text>
            <Text style={{ color: colors.primaryLight, marginTop: 2 }}>Camera, manual barcode or photo</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color="#fff" />
        </Pressable>

        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md }}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search products or brands"
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
            onSubmitEditing={() => q.trim() && router.push({ pathname: '/(tabs)/search', params: { q: q.trim() } })}
            style={{ flex: 1, paddingVertical: 12, paddingHorizontal: space.sm, fontSize: 15.5, color: colors.text }}
            accessibilityLabel="Search products"
          />
        </View>

        <SectionHeader title="Categories" action="All" onAction={() => router.push('/(tabs)/search')} />
        {categories.isLoading ? <LoadingState /> : categories.error ? <ErrorState error={categories.error} onRetry={categories.refetch} /> : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
            {SHORTCUTS.map((slug) => categories.data?.find((c) => c.slug === slug)).filter(Boolean).map((c) => (
              <Chip key={c!.slug} label={c!.name} onPress={() => router.push(`/category/${c!.slug}`)} />
            ))}
          </ScrollView>
        )}

        {isGuest ? (
          <Card>
            <Text style={font.h3}>Save your scans and favourites</Text>
            <Text style={font.small}>You are using NutriScan as a guest. Create a free account to keep history, favourites and preferences.</Text>
            <Button title="Create account" variant="secondary" onPress={() => router.push('/auth/register')} />
          </Card>
        ) : (
          <>
            <SectionHeader title="Recently scanned" action={history.data?.length ? 'See all' : undefined} onAction={() => router.push('/history')} />
            {history.isLoading ? <LoadingState /> : history.error ? <ErrorState error={history.error} onRetry={history.refetch} /> : history.data?.length ? (
              history.data.slice(0, 3).map((h) => <ProductCard key={h.id} product={h.product} compact />)
            ) : (
              <Notice text="No scans yet. Scan a barcode to start your history." />
            )}
            {favorites.data?.length ? (
              <>
                <SectionHeader title="Favourites" action="See all" onAction={() => router.push('/(tabs)/saved')} />
                {favorites.data.slice(0, 2).map((f) => <ProductCard key={f.product.id} product={f.product} compact />)}
              </>
            ) : null}
          </>
        )}

        <SectionHeader title="Top-rated breakfast cereals" action="More" onAction={() => router.push('/category/breakfast-cereals')} />
        {topRated.isLoading ? <LoadingState /> : topRated.error ? <ErrorState error={topRated.error} onRetry={topRated.refetch} /> : (
          topRated.data?.pages[0]?.items.slice(0, 3).map((p) => <ProductCard key={p.id} product={p} compact />)
        )}
        <View style={{ height: 60 }} />
      </Screen>
      <CompareBar />
    </View>
  );
}
