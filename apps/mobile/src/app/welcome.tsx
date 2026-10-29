import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/ui';
import { useAuth } from '@/store/auth';
import { colors, font, radius, space } from '@/theme';

const POINTS: Array<{ icon: 'barcode-outline' | 'star-half-outline' | 'swap-horizontal-outline'; title: string; text: string }> = [
  { icon: 'barcode-outline', title: 'Scan a barcode', text: 'Look up packaged foods from a curated product database.' },
  { icon: 'star-half-outline', title: 'Understand the rating', text: 'See an explainable 0.5–5 star rating based on the FSSAI draft Indian Nutrition Rating.' },
  { icon: 'swap-horizontal-outline', title: 'Find better options', text: 'Get higher-rated alternatives from the same category, with reasons.' },
];

export default function Welcome() {
  const { continueAsGuest } = useAuth();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={{ flex: 1, padding: space.xl, justifyContent: 'space-between' }}>
        <View style={{ gap: space.xl, marginTop: space.xl }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <View style={{ backgroundColor: colors.primary, borderRadius: radius.lg, padding: 12 }}>
              <Ionicons name="leaf" size={30} color="#fff" />
            </View>
            <View>
              <Text style={[font.h1, { fontSize: 30 }]}>NutriScan</Text>
              <Text style={font.small}>Explainable food-label analysis</Text>
            </View>
          </View>
          <Text style={[font.body, { fontSize: 17, lineHeight: 25 }]}>
            Packaged-food labels are hard to read. NutriScan turns a barcode into a clear rating, a plain-language explanation and healthier choices.
          </Text>
          <View style={{ gap: space.lg }}>
            {POINTS.map((p) => (
              <View key={p.title} style={{ flexDirection: 'row', gap: space.md }}>
                <View style={{ backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: 10, alignSelf: 'flex-start' }}>
                  <Ionicons name={p.icon} size={22} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={font.h3}>{p.title}</Text>
                  <Text style={font.small}>{p.text}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
        <View style={{ gap: space.md }}>
          <Button
            title="Start scanning as guest"
            icon="scan"
            onPress={async () => {
              await continueAsGuest();
              router.replace('/(tabs)/scan');
            }}
          />
          <Button title="Create an account" variant="secondary" onPress={() => router.push('/auth/register')} />
          <Button title="I already have an account" variant="ghost" onPress={() => router.push('/auth/login')} />
          <Text style={[font.small, { textAlign: 'center' }]}>NutriScan provides nutrition information, not medical advice.</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
