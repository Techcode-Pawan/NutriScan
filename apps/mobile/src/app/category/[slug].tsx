import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, ScrollView, Text, View } from 'react-native';
import { CompareBar } from '@/components/CompareBar';
import { ProductCard } from '@/components/ProductCard';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { Chip, Notice } from '@/components/ui';
import { useCategories, useSearch } from '@/hooks/queries';
import { colors, font, space } from '@/theme';
import { SORTS } from '@/features/search/sorts';

export default function CategoryScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const categories = useCategories();
  const category = categories.data?.find((c) => c.slug === slug);
  const [sort, setSort] = useState('rating');
  const def = SORTS.find((s) => s.key === sort)!;
  const search = useSearch({ category: category?.id, sort, order: def.order }, Boolean(category));
  const items = useMemo(() => search.data?.pages.flatMap((p) => p.items) ?? [], [search.data]);

  if (categories.isLoading) return <LoadingState />;
  if (categories.error) return <ErrorState error={categories.error} onRetry={categories.refetch} />;
  if (!category) return <EmptyState title="Unknown category" />;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: category.name }} />
      <FlatList
        data={items}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 100 }}
        ListHeaderComponent={
          <View style={{ gap: space.md }}>
            <Text style={font.small}>
              {category.productCount} products · {category.ratedCount} with an INR rating
            </Text>
            {category.inrClass === 'EXEMPT' ? <Notice tone="info" text="This category is exempted from the INR in the FSSAI draft (Schedule IV), so its products are not rated." /> : null}
            {category.inrClass === null ? <Notice tone="info" text="The INR draft does not clearly cover this category as sold, so its products are not rated." /> : null}
            {category.inrClass === 'LIQUID' ? <Notice tone="info" text="Drinks are rated per 100 ml with the liquid-food tables of the INR draft." /> : null}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
              {SORTS.filter((s) => s.key !== 'relevance').map((s) => (
                <Chip key={s.key} label={s.label} selected={sort === s.key} onPress={() => setSort(s.key)} />
              ))}
            </ScrollView>
          </View>
        }
        renderItem={({ item }) => <ProductCard product={item} />}
        ListEmptyComponent={search.isLoading ? <LoadingState /> : search.error ? <ErrorState error={search.error} onRetry={search.refetch} /> : <EmptyState title="No products in this category yet" />}
        onEndReached={() => search.hasNextPage && !search.isFetchingNextPage && search.fetchNextPage()}
        onEndReachedThreshold={0.4}
        ListFooterComponent={search.isFetchingNextPage ? <LoadingState label="Loading more..." /> : undefined}
        style={{ backgroundColor: colors.background }}
      />
      <CompareBar />
    </View>
  );
}
