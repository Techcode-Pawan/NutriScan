import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Text, View } from 'react-native';
import { ApiError } from '@/services/api';
import { colors, font, space } from '@/theme';
import { Button, type IconName } from './ui';

export function LoadingState({ label = 'Loading...' }: { label?: string }) {
  return (
    <View style={{ padding: space.xxl, alignItems: 'center', gap: space.md }} accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={font.small}>{label}</Text>
    </View>
  );
}

export function EmptyState({ icon = 'leaf-outline', title, message, action, onAction }: { icon?: IconName; title: string; message?: string; action?: string; onAction?: () => void }) {
  return (
    <View style={{ padding: space.xl, alignItems: 'center', gap: space.sm }}>
      <View style={{ backgroundColor: colors.primarySoft, borderRadius: 40, padding: 16 }}>
        <Ionicons name={icon} size={32} color={colors.primary} />
      </View>
      <Text style={[font.h3, { textAlign: 'center' }]}>{title}</Text>
      {message ? <Text style={[font.small, { textAlign: 'center', maxWidth: 320 }]}>{message}</Text> : null}
      {action && onAction ? <Button title={action} onPress={onAction} variant="secondary" style={{ marginTop: space.sm }} /> : null}
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const e = error instanceof ApiError ? error : null;
  const offline = e?.code === 'NETWORK_ERROR' || e?.code === 'TIMEOUT';
  const dbDown = e?.code === 'DATABASE_UNAVAILABLE';
  return (
    <View style={{ padding: space.xl, alignItems: 'center', gap: space.sm }} accessibilityRole="alert">
      <Ionicons name={offline ? 'cloud-offline-outline' : 'alert-circle-outline'} size={36} color={colors.danger} />
      <Text style={[font.h3, { textAlign: 'center' }]}>{offline ? 'Cannot reach NutriScan' : dbDown ? 'Database unavailable' : 'Something went wrong'}</Text>
      <Text style={[font.small, { textAlign: 'center', maxWidth: 320 }]}>{e?.message ?? 'An unexpected error occurred.'}</Text>
      {onRetry ? <Button title="Try again" icon="refresh" onPress={onRetry} variant="secondary" style={{ marginTop: space.sm }} /> : null}
    </View>
  );
}
