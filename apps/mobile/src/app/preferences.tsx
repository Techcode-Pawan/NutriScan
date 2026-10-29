import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { ErrorState, LoadingState } from '@/components/States';
import { Button, Card, Chip, Notice, Row, Screen, SectionHeader, TextField, ToggleRow } from '@/components/ui';
import { usePreferences, useSavePreferences } from '@/hooks/queries';
import { errorMessage } from '@/services/api';
import { font, space } from '@/theme';
import type { Preferences } from '@/types/api';

const AGE: Array<{ v: Preferences['ageGroup']; label: string }> = [
  { v: null, label: 'Prefer not to say' },
  { v: 'CHILD', label: 'Child' },
  { v: 'TEEN', label: 'Teen' },
  { v: 'ADULT', label: 'Adult' },
  { v: 'SENIOR', label: '60+' },
];

export default function PreferencesScreen() {
  const prefs = usePreferences();
  const save = useSavePreferences();
  const [draft, setDraft] = useState<Preferences | null>(null);
  const [newExclusion, setNewExclusion] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (prefs.data && !draft) setDraft(prefs.data);
  }, [prefs.data, draft]);

  if (prefs.isLoading || !draft) return prefs.error ? <ErrorState error={prefs.error} onRetry={prefs.refetch} /> : <LoadingState />;
  const set = (patch: Partial<Preferences>) => {
    setSaved(false);
    setDraft({ ...draft, ...patch });
  };
  const addExclusion = () => {
    const v = newExclusion.trim().toLowerCase();
    if (v.length >= 2 && !draft.excludedIngredients.includes(v) && draft.excludedIngredients.length < 20) set({ excludedIngredients: [...draft.excludedIngredients, v] });
    setNewExclusion('');
  };

  return (
    <Screen>
      <Notice text="Preferences personalise the ranking of alternatives and add notes on product pages. They never change a product's INR rating, and they are not medical advice." />
      <Card>
        <SectionHeader title="Nutrition goals" />
        <ToggleRow label="Lower sugar" value={draft.lowSugar} onChange={(v) => set({ lowSugar: v })} />
        <ToggleRow label="Lower sodium" value={draft.lowSodium} onChange={(v) => set({ lowSodium: v })} />
        <ToggleRow label="Lower saturated fat" value={draft.lowSaturatedFat} onChange={(v) => set({ lowSaturatedFat: v })} />
        <ToggleRow label="Higher fibre" value={draft.highFiber} onChange={(v) => set({ highFiber: v })} />
        <ToggleRow label="Higher protein" value={draft.highProtein} onChange={(v) => set({ highProtein: v })} />
      </Card>
      <Card>
        <SectionHeader title="Diet" />
        <ToggleRow label="Vegetarian" description="Hide alternatives known to be non-vegetarian. Unknown products are still shown, so check the pack's green dot." value={draft.vegetarian} onChange={(v) => set({ vegetarian: v })} />
        <Text style={font.h3}>Excluded ingredients</Text>
        <Text style={font.small}>Alternatives that mention these words in their ingredient list, or that have no ingredient list, are hidden.</Text>
        <Row style={{ flexWrap: 'wrap' }}>
          {draft.excludedIngredients.map((e) => (
            <Chip key={e} label={`${e}  ✕`} selected onPress={() => set({ excludedIngredients: draft.excludedIngredients.filter((x) => x !== e) })} />
          ))}
        </Row>
        <Row style={{ alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}>
            <TextField label="Add ingredient" value={newExclusion} onChangeText={setNewExclusion} placeholder="e.g. palm oil" onSubmitEditing={addExclusion} maxLength={40} />
          </View>
          <Button title="Add" variant="secondary" onPress={addExclusion} />
        </Row>
      </Card>
      <Card>
        <SectionHeader title="Age group (optional)" />
        <Text style={font.small}>Used only to show general WHO guidance text. Not required.</Text>
        <Row style={{ flexWrap: 'wrap', gap: space.sm }}>
          {AGE.map((a) => (
            <Chip key={a.label} label={a.label} selected={draft.ageGroup === a.v} onPress={() => set({ ageGroup: a.v })} />
          ))}
        </Row>
      </Card>
      {save.error ? <Notice tone="danger" text={errorMessage(save.error)} /> : null}
      {saved ? <Notice tone="primary" text="Preferences saved." /> : null}
      <Button
        title="Save preferences"
        icon="save-outline"
        loading={save.isPending}
        onPress={() => save.mutate(draft, { onSuccess: () => setSaved(true) })}
      />
    </Screen>
  );
}
