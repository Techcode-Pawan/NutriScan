import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '@/store/auth';
import { CompareProvider } from '@/store/compare';
import { colors } from '@/theme';

export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 60 * 1000, retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <CompareProvider>
            <StatusBar style="dark" />
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: colors.surface },
                headerTintColor: colors.primary,
                headerTitleStyle: { color: colors.text, fontWeight: '700' },
                contentStyle: { backgroundColor: colors.background },
                headerShadowVisible: false,
              }}
            >
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="welcome" options={{ headerShown: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="auth/login" options={{ title: 'Log in' }} />
              <Stack.Screen name="auth/register" options={{ title: 'Create account' }} />
              <Stack.Screen name="product/[key]/index" options={{ title: 'Product' }} />
              <Stack.Screen name="product/[key]/alternatives" options={{ title: 'Healthier alternatives' }} />
              <Stack.Screen name="product/[key]/ml" options={{ title: 'ML analysis (experimental)' }} />
              <Stack.Screen name="product/[key]/assistant" options={{ title: 'Ask about this product' }} />
              <Stack.Screen name="compare" options={{ title: 'Compare products' }} />
              <Stack.Screen name="history" options={{ title: 'Scan history' }} />
              <Stack.Screen name="preferences" options={{ title: 'Preferences' }} />
              <Stack.Screen name="submit" options={{ title: 'Submit a product' }} />
              <Stack.Screen name="label-scan" options={{ title: 'Read a label' }} />
              <Stack.Screen name="category/[slug]" options={{ title: 'Category' }} />
              <Stack.Screen name="privacy" options={{ title: 'Privacy & data' }} />
            </Stack>
          </CompareProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
