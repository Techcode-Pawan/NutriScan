import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, request } from '@/services/api';
import { useAuth } from '@/store/auth';
import type {
  AlternativesResult,
  AssistantAnswer,
  Category,
  CompareResult,
  FavoriteItem,
  HistoryItem,
  MlResult,
  PageMeta,
  Preferences,
  ProductDetail,
  ProductSummary,
} from '@/types/api';

const enc = encodeURIComponent;

export function useProduct(key: string | undefined) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['product', key, Boolean(token)],
    queryFn: () => api.get<ProductDetail>(`/api/products/${enc(key!)}`),
    enabled: Boolean(key),
    retry: (count, err: any) => count < 2 && !(err?.status >= 400 && err?.status < 500),
  });
}

export function useAlternatives(key: string | undefined, opts: { includePartial: boolean; applyPreferences: boolean }) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['alternatives', key, opts, Boolean(token)],
    queryFn: () =>
      api.get<AlternativesResult>(
        `/api/products/${enc(key!)}/alternatives?limit=10&includePartial=${opts.includePartial}&applyPreferences=${opts.applyPreferences}`,
      ),
    enabled: Boolean(key),
  });
}

export function useMl(key: string | undefined) {
  return useQuery({
    queryKey: ['ml', key],
    queryFn: () => api.get<MlResult>(`/api/products/${enc(key!)}/ml`),
    enabled: Boolean(key),
  });
}

export interface SearchParams {
  q?: string;
  category?: number;
  sort?: string;
  order?: 'asc' | 'desc';
  ratedOnly?: boolean;
}

export function useSearch(params: SearchParams, enabled = true) {
  return useInfiniteQuery({
    queryKey: ['search', params],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const qs = new URLSearchParams({ page: String(pageParam), pageSize: '20' });
      if (params.q) qs.set('q', params.q);
      if (params.category) qs.set('category', String(params.category));
      if (params.sort) qs.set('sort', params.sort);
      if (params.order) qs.set('order', params.order);
      if (params.ratedOnly) qs.set('ratedOnly', 'true');
      const r = await request<ProductSummary[]>(`/api/products/search?${qs}`);
      return { items: r.data, meta: r.meta as PageMeta };
    },
    getNextPageParam: (last) => (last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined),
    enabled,
    placeholderData: keepPreviousData,
  });
}

export function useCategories() {
  return useQuery({ queryKey: ['categories'], queryFn: () => api.get<Category[]>('/api/categories'), staleTime: 10 * 60 * 1000 });
}

export function useCompareQuery(keys: string[]) {
  return useQuery({
    queryKey: ['compare', keys],
    queryFn: () => api.post<CompareResult>('/api/compare', { products: keys }),
    enabled: keys.length >= 2,
  });
}

export function useHistory() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['history'],
    queryFn: () => api.get<HistoryItem[]>('/api/history?pageSize=50'),
    enabled: Boolean(token),
  });
}

export function useFavorites() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['favorites'],
    queryFn: () => api.get<FavoriteItem[]>('/api/favorites'),
    enabled: Boolean(token),
  });
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ productId, isFavorite }: { productId: string; isFavorite: boolean }) =>
      isFavorite ? api.del(`/api/favorites/${enc(productId)}`) : api.post('/api/favorites', { productId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['favorites'] }),
  });
}

export function useRecordScan() {
  const qc = useQueryClient();
  const { token } = useAuth();
  return useMutation({
    mutationFn: async ({ productId, method }: { productId: string; method: HistoryItem['method'] }) => {
      if (!token) return null; // guests: nothing is stored
      return api.post('/api/history', { productId, method });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['history'] }),
  });
}

export function usePreferences() {
  const { token } = useAuth();
  return useQuery({ queryKey: ['preferences'], queryFn: () => api.get<Preferences>('/api/preferences'), enabled: Boolean(token) });
}

export function useSavePreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: Partial<Preferences>) => api.put<Preferences>('/api/preferences', p),
    onSuccess: (data) => {
      qc.setQueryData(['preferences'], data);
      qc.invalidateQueries({ queryKey: ['alternatives'] });
      qc.invalidateQueries({ queryKey: ['product'] });
    },
  });
}

export function useAsk() {
  return useMutation({
    mutationFn: (body: { product: string; question: string; compareWith?: string }) => api.post<AssistantAnswer>('/api/assistant/ask', body, 30000),
  });
}
