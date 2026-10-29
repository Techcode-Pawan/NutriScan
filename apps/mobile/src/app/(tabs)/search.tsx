import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, ScrollView, Text, TextInput, View } from 'react-native';
import { CompareBar } from '@/components/CompareBar';
import { ProductCard } from '@/components/ProductCard';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { Chip } from '@/components/ui';
import { SORTS } from '@/features/search/sorts';
import { useCategories, useSearch } from '@/hooks/queries';
import { colors, font, radius, space } from '@/theme';


function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function Search() {
  const params = useLocalSearchParams<{ q?: string }>();
  const [text, setText] = useState(params.q ?? '');
  const [category, setCategory] = useState<number | undefined>();
  const [sort, setSort] = useState('relevance');
  const [ratedOnly, setRatedOnly] = useState(false);
  const q = useDebounced(text.trim());
  const categories = useCategories();

  useEffect(() => {
    if (params.q) setText(params.q);
  }, [params.q]);

  const sortDef = SORTS.find((s) => s.key === sort)!;
  const active = Boolean(q || category);
  const search = useSearch({ q: q || undefined, category, sort: sort === 'relevance' && !q ? 'rating' : sort, order: sortDef.order, ratedOnly }, active);
  const items = useMemo(() => search.data?.pages.flatMap((p) => p.items) ?? [], [search.data]);
  const total = search.data?.pages[0]?.meta.total ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ padding: space.lg, gap: space.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderColor: colors.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background, borderRadius: radius.md, paddingHorizontal: space.md }}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Product name, brand or barcode"
            placeholderTextColor={colors.textMuted}
            style={{ flex: 1, paddingVertical: 11, paddingHorizontal: space.sm, fontSize: 15.5, color: colors.text }}
            accessibilityLabel="Search products"
            autoCorrect={false}
            returnKeyType="search"
          />
          {text ? <Ionicons name="close-circle" size={18} color={colors.textMuted} onPress={() => setText('')} accessibilityLabel="Clear search" /> : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
          <Chip label="All categories" selected={!category} onPress={() => setCategory(undefined)} />
          {categories.data
            ?.filter((c) => c.productCount > 0)
            .map((c) => (
              <Chip key={c.id} label={`${c.name} (${c.productCount})`} selected={category === c.id} onPress={() => setCategory(category === c.id ? undefined : c.id)} />
            ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
          <Chip label="Rated only" icon="star" selected={ratedOnly} onPress={() => setRatedOnly(!ratedOnly)} />
          {SORTS.map((s) => (
            <Chip key={s.key} label={s.label} selected={sort === s.key} onPress={() => setSort(s.key)} />
          ))}
        </ScrollView>
      </View>

      {!active ? (
        <EmptyState icon="search" title="Search the product database" message="Type a product or brand name, or pick a category to browse products sorted by INR rating." />
      ) : search.isLoading ? (
        <LoadingState label="Searching..." />
      ) : search.error ? (
        <ErrorState error={search.error} onRetry={search.refetch} />
      ) : items.length === 0 ? (
        <EmptyState icon="file-tray-outline" title="No products found" message="Try a different spelling, a brand name, or remove filters. Missing a product? Scan it and submit it for review." />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 100 }}
          ListHeaderComponent={<Text style={font.small}>{total} product{total === 1 ? '' : 's'}</Text>}
          renderItem={({ item }) => <ProductCard product={item} />}
          onEndReached={() => search.hasNextPage && !search.isFetchingNextPage && search.fetchNextPage()}
          onEndReachedThreshold={0.4}
          ListFooterComponent={search.isFetchingNextPage ? <LoadingState label="Loading more..." /> : undefined}
        />
      )}
      <CompareBar />
    </View>
  );
}
