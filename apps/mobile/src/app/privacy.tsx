import { useQuery } from '@tanstack/react-query';
import { Text } from 'react-native';
import { Card, Screen, SectionHeader } from '@/components/ui';
import { api } from '@/services/api';
import { font } from '@/theme';

export default function Privacy() {
  const attribution = useQuery({ queryKey: ['attribution'], queryFn: () => api.get<{ openFoodFacts: string; legacyDataset: string; scoring: string }>('/api/attribution') });
  return (
    <Screen>
      <Card>
        <SectionHeader title="What NutriScan stores" />
        <Text style={font.body}>• Account: your email, an optional display name and a salted password hash (never the password).</Text>
        <Text style={font.body}>• Your preferences, scan history and favourites - visible only to you.</Text>
        <Text style={font.body}>• Missing-product submissions you send, with photos re-encoded to remove location metadata.</Text>
        <Text style={font.body}>• For assistant questions, only the question type is logged, not the text.</Text>
        <Text style={font.small}>Guests can scan without an account; nothing personal is stored. You can delete your history or your whole account from the Profile tab.</Text>
      </Card>
      <Card>
        <SectionHeader title="How ratings work" />
        <Text style={font.body}>
          The star rating follows the Indian Nutrition Rating proposed in the FSSAI draft notification of September 2022: points for energy, saturated fat, sugar and sodium, minus capped points for fruit/vegetables, nuts/legumes/millets, fibre and protein.
        </Text>
        <Text style={font.small}>{attribution.data?.scoring ?? ''}</Text>
        <Text style={font.body}>
          The experimental ML estimate is separate: a Random Forest that predicts the Open Food Facts Nutri-Score grade. It is labelled experimental and never changes the INR rating.
        </Text>
      </Card>
      <Card>
        <SectionHeader title="Data sources" />
        <Text style={font.body}>{attribution.data?.openFoodFacts ?? 'Open Food Facts (ODbL).'}</Text>
        <Text style={font.body}>{attribution.data?.legacyDataset ?? ''}</Text>
        <Text style={font.small}>Product data may be incomplete or out of date. Always check the label on the pack.</Text>
      </Card>
    </Screen>
  );
}
