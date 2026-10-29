import { useMutation } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform, Text } from 'react-native';
import { InrBreakdown } from '@/components/InrBreakdown';
import { StarRating } from '@/components/StarRating';
import { Badge, Button, Card, Chip, Notice, Row, Screen, SectionHeader, TextField } from '@/components/ui';
import { emptyDraft, FORM_FIELDS, NutritionForm, parseDraft, type NutritionDraft } from '@/features/nutrition/NutritionForm';
import { useCategories } from '@/hooks/queries';
import { api, appendImage, errorMessage } from '@/services/api';
import { colors, font } from '@/theme';
import type { AnalyzeResult, Basis, OcrResult } from '@/types/api';

/** OCR workflow: photo -> text extraction -> editable review -> analysis (nothing is stored). */
export default function LabelScan() {
  const { barcode } = useLocalSearchParams<{ barcode?: string }>();
  const categories = useCategories();
  const [ocr, setOcr] = useState<OcrResult | null>(null);
  const [draft, setDraft] = useState<NutritionDraft>(emptyDraft());
  const [basis, setBasis] = useState<Basis>('PER_100G');
  const [ingredients, setIngredients] = useState('');
  const [categorySlug, setCategorySlug] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showRaw, setShowRaw] = useState(false);

  const extract = useMutation({
    mutationFn: async (asset: ImagePicker.ImagePickerAsset) => {
      const form = new FormData();
      await appendImage(form, 'image', asset);
      return api.upload<OcrResult>('/api/ocr/label', form, 90000);
    },
    onSuccess: (r) => {
      setOcr(r);
      setBasis(r.basis === 'UNKNOWN' ? 'UNKNOWN' : r.basis);
      const d = emptyDraft();
      for (const f of FORM_FIELDS) if (r.fields[f.key]) d[f.key] = String(r.fields[f.key]!.value);
      setDraft(d);
      setIngredients(r.ingredientsText ?? '');
    },
  });
  const analyze = useMutation({
    mutationFn: (body: object) => api.post<AnalyzeResult>('/api/ocr/analyze', body, 30000),
  });

  const pick = async (camera: boolean) => {
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.9 };
    if (camera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return;
    }
    const r = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (!r.canceled && r.assets?.[0]) {
      analyze.reset();
      extract.mutate(r.assets[0]);
    }
  };

  const runAnalysis = () => {
    const { values, errors: e } = parseDraft(draft);
    setErrors(e);
    if (Object.keys(e).length) return;
    analyze.mutate({ categorySlug, basis, ...values, ingredientsText: ingredients || null, source: ocr ? 'ocr' : 'manual' });
  };

  const lowConfidence: Record<string, string> = {};
  if (ocr) {
    for (const f of FORM_FIELDS) {
      const field = ocr.fields[f.key];
      if (field?.confidence === 'low') lowConfidence[f.key] = `Check this value: ${field.notes.join(' ')}`;
      else if (field) lowConfidence[f.key] = `Read from: "${field.rawLine}"`;
    }
  }

  return (
    <Screen>
      <Notice text="Take a sharp, well-lit photo of the nutrition table (and ingredient list). OCR can misread numbers, so you will review every value before analysis." />
      <Row>
        {Platform.OS !== 'web' ? <Button title="Take photo" icon="camera" style={{ flex: 1 }} onPress={() => pick(true)} loading={extract.isPending} /> : null}
        <Button title="Choose photo" icon="images-outline" variant="secondary" style={{ flex: 1 }} onPress={() => pick(false)} loading={extract.isPending} />
      </Row>
      {extract.isPending ? <Notice text="Reading the label... the first run can take a little longer while the OCR model loads." /> : null}
      {extract.error ? <Notice tone="danger" text={`${errorMessage(extract.error)} You can still type the values below.`} /> : null}

      {ocr ? (
        <Card>
          <Row style={{ flexWrap: 'wrap' }}>
            <Badge label={`OCR confidence ${ocr.ocrConfidence}%`} tone={ocr.ocrConfidence >= 75 ? 'primary' : 'warning'} />
            <Badge label={`${Object.keys(ocr.fields).length} values found`} tone="info" />
          </Row>
          {ocr.warnings.map((w, i) => (
            <Notice key={i} tone="warning" text={w} />
          ))}
          <Button title={showRaw ? 'Hide recognised text' : 'Show recognised text'} variant="ghost" onPress={() => setShowRaw(!showRaw)} />
          {showRaw ? <Text style={[font.small, { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }]}>{ocr.rawText}</Text> : null}
        </Card>
      ) : null}

      <Card>
        <SectionHeader title={ocr ? 'Review extracted values' : 'Or enter values manually'} />
        <NutritionForm draft={draft} onChange={setDraft} basis={basis} onBasis={setBasis} errors={errors} lowConfidence={lowConfidence} />
        <TextField label="Ingredients" value={ingredients} onChangeText={setIngredients} multiline />
        <Text style={font.h3}>Category (decides which INR table applies)</Text>
        <Row style={{ flexWrap: 'wrap' }}>
          {categories.data?.map((c) => (
            <Chip key={c.slug} label={c.name} selected={categorySlug === c.slug} onPress={() => setCategorySlug(categorySlug === c.slug ? null : c.slug)} />
          ))}
        </Row>
        <Button title="Analyse these values" icon="analytics-outline" onPress={runAnalysis} loading={analyze.isPending} testID="analyze" />
      </Card>

      {analyze.error ? <Notice tone="danger" text={errorMessage(analyze.error)} /> : null}
      {analyze.data ? (
        <Card>
          <Badge label={analyze.data.dataKind === 'user_entered' ? 'User-entered values' : 'OCR-extracted, user-reviewed values'} tone="warning" />
          <Text style={font.small}>{analyze.data.notice}</Text>
          <StarRating stars={analyze.data.inr.stars} status={analyze.data.inr.status} size={24} />
          <Text style={font.h3}>{analyze.data.inr.explanation.headline}</Text>
          {analyze.data.inr.explanation.summary.map((s, i) => (
            <Text key={i} style={font.body}>
              {s}
            </Text>
          ))}
          {analyze.data.inr.finalScore !== null ? (
            <InrBreakdown baseline={analyze.data.inr.baseline} positive={analyze.data.inr.positive} baselinePoints={analyze.data.inr.baselinePoints} positivePoints={analyze.data.inr.positivePoints} finalScore={analyze.data.inr.finalScore} capRule={null} />
          ) : null}
          {analyze.data.ml.status === 'ok' && analyze.data.ml.prediction ? (
            <Text style={[font.small, { color: colors.purple }]}>
              Experimental ML estimate: Nutri-Score grade {analyze.data.ml.prediction.predictedGrade.toUpperCase()} (separate from the INR rating).
            </Text>
          ) : null}
          <Button
            title="Submit this product for review"
            variant="secondary"
            icon="add-circle-outline"
            onPress={() =>
              router.push({ pathname: '/submit', params: { barcode: barcode ?? '', nutrition: JSON.stringify(draft), ingredients, basis, source: ocr ? 'OCR' : undefined } })
            }
          />
        </Card>
      ) : null}
    </Screen>
  );
}
