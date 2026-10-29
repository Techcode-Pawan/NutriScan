import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { Button, Card, Notice, Row, Screen, SectionHeader } from '@/components/ui';
import { api, API_URL } from '@/services/api';
import { useAuth } from '@/store/auth';
import { colors, font, space } from '@/theme';
import { confirm } from '@/components/confirm';

function LinkRow({ icon, label, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void }) {
  return (
    <Card onPress={onPress} accessibilityLabel={label}>
      <Row gap={space.md}>
        <Ionicons name={icon} size={22} color={colors.primary} />
        <Text style={[font.body, { flex: 1 }]}>{label}</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Row>
    </Card>
  );
}

export default function Profile() {
  const { user, isGuest, logout } = useAuth();
  const health = useQuery({ queryKey: ['health'], queryFn: () => api.get<{ status: string; database: string; ml: { status: string }; assistant: string }>('/api/health') });
  const del = useMutation({
    mutationFn: () => api.del('/api/me'),
    onSuccess: async () => {
      await logout();
      router.replace('/welcome');
    },
  });

  return (
    <Screen>
      <Card>
        <Row gap={space.md}>
          <Ionicons name="person-circle" size={48} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={font.h2}>{isGuest ? 'Guest' : user?.displayName ?? 'NutriScan user'}</Text>
            <Text style={font.small}>{isGuest ? 'Scans are not saved while you are a guest.' : user?.email}</Text>
          </View>
        </Row>
        {isGuest ? (
          <Row>
            <Button title="Log in" style={{ flex: 1 }} onPress={() => router.push('/auth/login')} />
            <Button title="Sign up" variant="secondary" style={{ flex: 1 }} onPress={() => router.push('/auth/register')} />
          </Row>
        ) : user?.counts ? (
          <Text style={font.small}>
            {user.counts.scans} scans · {user.counts.favorites} favourites · {user.counts.submissions} submissions
          </Text>
        ) : null}
      </Card>

      <SectionHeader title="Settings" />
      <LinkRow icon="options-outline" label="Nutrition preferences" onPress={() => router.push(isGuest ? '/auth/login' : '/preferences')} />
      <LinkRow icon="time-outline" label="Scan history" onPress={() => router.push('/history')} />
      <LinkRow icon="add-circle-outline" label="Submit a missing product" onPress={() => router.push('/submit')} />
      <LinkRow icon="shield-checkmark-outline" label="Privacy, data sources & methodology" onPress={() => router.push('/privacy')} />

      <SectionHeader title="Service status" />
      <Card>
        {health.data ? (
          <>
            <Text style={font.small}>Server: {API_URL}</Text>
            <Text style={font.small}>Database: {health.data.database}</Text>
            <Text style={font.small}>Experimental ML service: {health.data.ml.status}</Text>
            <Text style={font.small}>Assistant: {health.data.assistant === 'deterministic' ? 'verified templates (no LLM configured)' : health.data.assistant}</Text>
          </>
        ) : health.error ? (
          <Notice tone="danger" text={`Cannot reach ${API_URL}. Check the API address in apps/mobile/.env.`} />
        ) : (
          <Text style={font.small}>Checking...</Text>
        )}
      </Card>

      {!isGuest ? (
        <>
          <Button title="Log out" icon="log-out-outline" variant="secondary" onPress={async () => { await logout(); router.replace('/welcome'); }} />
          <Button
            title="Delete my account and data"
            icon="trash-outline"
            variant="danger"
            loading={del.isPending}
            onPress={() => confirm('Delete account?', 'This permanently deletes your account, preferences, scan history and favourites.', () => del.mutate())}
          />
          {del.error ? <Notice tone="danger" text="Could not delete the account. Please try again." /> : null}
        </>
      ) : null}
      <Text style={[font.small, { textAlign: 'center' }]}>NutriScan is an academic project. It is not an FSSAI-certified rating and does not give medical advice.</Text>
    </Screen>
  );
}
