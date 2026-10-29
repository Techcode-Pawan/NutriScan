import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Text } from 'react-native';
import { confirm } from '@/components/confirm';
import { ProductCard } from '@/components/ProductCard';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { Button, Screen } from '@/components/ui';
import { useHistory } from '@/hooks/queries';
import { api } from '@/services/api';
import { useAuth } from '@/store/auth';
import { font } from '@/theme';


const METHOD: Record<string, string> = { CAMERA: 'Camera scan', MANUAL: 'Manual entry', IMAGE: 'Photo', SEARCH: 'Opened from search' };

export default function History() {
  const { token } = useAuth();
  const history = useHistory();
  const qc = useQueryClient();
  const clear = useMutation({ mutationFn: () => api.del('/api/history'), onSuccess: () => qc.invalidateQueries({ queryKey: ['history'] }) });
  const remove = useMutation({ mutationFn: (id: string) => api.del(`/api/history/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['history'] }) });

  if (!token) {
    return (
      <Screen>
        <EmptyState icon="time-outline" title="Log in to keep a history" message="Guests can scan freely; nothing is stored. Create an account to keep your scans." action="Log in" onAction={() => router.push('/auth/login')} />
      </Screen>
    );
  }
  if (history.isLoading) return <LoadingState />;
  if (history.error) return <ErrorState error={history.error} onRetry={history.refetch} />;
  const items = history.data ?? [];
  return (
    <Screen>
      {items.length === 0 ? (
        <EmptyState icon="time-outline" title="No scans yet" message="Products you scan or open will appear here." action="Scan a product" onAction={() => router.push('/(tabs)/scan')} />
      ) : (
        <>
          {items.map((h) => (
            <ProductCard
              key={h.id}
              product={h.product}
              footer={
                <>
                  <Text style={font.small}>
                    {METHOD[h.method]} · {new Date(h.scannedAt).toLocaleString()}
                  </Text>
                  <Button title="Remove" variant="ghost" icon="trash-outline" onPress={() => remove.mutate(h.id)} />
                </>
              }
            />
          ))}
          <Button title="Clear all history" variant="danger" icon="trash" loading={clear.isPending} onPress={() => confirm('Clear history?', 'This permanently deletes your scan history.', () => clear.mutate())} />
        </>
      )}
    </Screen>
  );
}
