import { useMutation } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { ProductThumb } from '@/components/ProductCard';
import { EmptyState } from '@/components/States';
import { Button, Card, Chip, Notice, Row, Screen, SectionHeader, TextField } from '@/components/ui';
import { barcodeProblem } from '@/features/scanner/barcode';
import { emptyDraft, NutritionForm, parseDraft, type NutritionDraft } from '@/features/nutrition/NutritionForm';
import { useCategories } from '@/hooks/queries';
import { api, appendImage, errorMessage } from '@/services/api';
import { font, space } from '@/theme';
import type { Basis } from '@/types/api';

export default function Submit() {
  const params = useLocalSearchParams<{ barcode?: string; name?: string; brand?: string; nutrition?: string; ingredients?: string; basis?: Basis; source?: 'OCR' }>();
  const categories = useCategories();
  const [barcode, setBarcode] = useState(params.barcode ?? '');
  const [name, setName] = useState(params.name ?? '');
  const [brand, setBrand] = useState(params.brand ?? '');
  const [categorySlug, setCategorySlug] = useState<string | null>(null);
  const [ingredients, setIngredients] = useState(params.ingredients ?? '');
  const [basis, setBasis] = useState<Basis>(params.basis ?? 'PER_100G');
  const [draft, setDraft] = useState<NutritionDraft>(() => (params.nutrition ? { ...emptyDraft(), ...JSON.parse(params.nutrition) } : emptyDraft()));
  const [image, setImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = useMutation({
    mutationFn: async () => {
      const { values } = parseDraft(draft);
      const fields = {
        barcode: barcode.trim() || undefined,
        name: name.trim(),
        brand: brand.trim() || undefined,
        categorySlug: categorySlug ?? undefined,
        ingredientsText: ingredients.trim() || undefined,
        source: params.source ?? 'MANUAL',
        nutrition: { basis, ...values },
      };
      const form = new FormData();
      for (const [k, v] of Object.entries(fields)) if (v !== undefined) form.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
      if (image) await appendImage(form, 'image', image);
      return api.upload<{ id: number; status: string; message: string }>('/api/submissions', form);
    },
  });

  const validate = () => {
    const e: Record<string, string> = {};
    if (name.trim().length < 2) e.name = 'Product name is required';
    if (barcode.trim()) {
      const p = barcodeProblem(barcode);
      if (p) e.barcode = p;
    }
    const parsed = parseDraft(draft);
    Object.assign(e, parsed.errors);
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  if (submit.data) {
    return (
      <Screen>
        <EmptyState icon="checkmark-done-circle-outline" title={`Submission #${submit.data.id} received`} message={submit.data.message} />
        <Button title="Back to scanning" onPress={() => router.replace('/(tabs)/scan')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Notice text="Submissions are reviewed before they appear in NutriScan; they are never added to the product database automatically." />
      <Card>
        <TextField label="Barcode (optional)" value={barcode} onChangeText={setBarcode} keyboardType="number-pad" maxLength={14} error={errors.barcode} />
        <TextField label="Product name *" value={name} onChangeText={setName} error={errors.name} testID="name" />
        <TextField label="Brand" value={brand} onChangeText={setBrand} />
        <Text style={font.h3}>Category</Text>
        <Row style={{ flexWrap: 'wrap' }}>
          {categories.data?.map((c) => (
            <Chip key={c.slug} label={c.name} selected={categorySlug === c.slug} onPress={() => setCategorySlug(categorySlug === c.slug ? null : c.slug)} />
          ))}
        </Row>
        <TextField label="Ingredients (optional)" value={ingredients} onChangeText={setIngredients} multiline />
      </Card>
      <Card>
        <SectionHeader title="Nutrition (optional)" />
        {params.source === 'OCR' ? <Notice tone="warning" text="These values were read from your photo. Please check each one against the label." /> : null}
        <NutritionForm draft={draft} onChange={setDraft} basis={basis} onBasis={setBasis} errors={errors} />
      </Card>
      <Card>
        <SectionHeader title="Photo of the pack (optional)" />
        {image ? <ProductThumb uri={image.uri} size={120} /> : null}
        <Button
          title={image ? 'Change photo' : 'Add photo'}
          variant="secondary"
          icon="camera-outline"
          onPress={async () => {
            const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
            if (!r.canceled && r.assets?.[0]) setImage(r.assets[0]);
          }}
        />
        <Text style={font.small}>Photos are re-encoded on the server to remove location data.</Text>
      </Card>
      {submit.error ? <Notice tone="danger" text={errorMessage(submit.error)} /> : null}
      <Button title="Submit for review" icon="send" loading={submit.isPending} onPress={() => validate() && submit.mutate()} testID="submit-product" />
      <Text style={[font.small, { marginBottom: space.xl }]}>Fields marked * are required.</Text>
    </Screen>
  );
}
