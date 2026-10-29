import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { CompareBar } from '@/components/CompareBar';
import { ProductCard, productKey } from '@/components/ProductCard';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { Button, Row, Screen } from '@/components/ui';
import { useFavorites, useToggleFavorite } from '@/hooks/queries';
import { useAuth } from '@/store/auth';
import { useCompare } from '@/store/compare';
import { font } from '@/theme';

export default function Saved() {
  const { token } = useAuth();
  const favorites = useFavorites();
  const toggle = useToggleFavorite();
  const compare = useCompare();

  if (!token) {
    return (
      <Screen>
        <EmptyState icon="heart-outline" title="Save products you like" message="Log in to keep favourites across sessions and compare them later." action="Log in" onAction={() => router.push('/auth/login')} />
      </Screen>
    );
  }
  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <Button title="Scan history" icon="time-outline" variant="secondary" onPress={() => router.push('/history')} />
        {favorites.isLoading ? <LoadingState /> : favorites.error ? <ErrorState error={favorites.error} onRetry={favorites.refetch} /> : favorites.data!.length === 0 ? (
          <EmptyState icon="heart-outline" title="No favourites yet" message="Tap Save on a product page to add it here." />
        ) : (
          favorites.data!.map((f) => (
            <ProductCard
              key={f.product.id}
              product={f.product}
              footer={
                <>
                  <Text style={font.small}>Saved {new Date(f.addedAt).toLocaleDateString()}</Text>
                  <Row>
                    <Button title="Compare" variant="ghost" icon="git-compare-outline" onPress={() => compare.toggle({ key: productKey(f.product), name: f.product.name })} style={{ flex: 1 }} />
                    <Button title="Remove" variant="ghost" icon="heart-dislike-outline" onPress={() => toggle.mutate({ productId: f.product.id, isFavorite: true })} style={{ flex: 1 }} />
                  </Row>
                </>
              }
            />
          ))
        )}
        <View style={{ height: 70 }} />
      </Screen>
      <CompareBar />
    </View>
  );
}
