import { Ionicons } from '@expo/vector-icons';
import { CameraView, scanFromURLAsync, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { router, useIsFocused } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Linking, Platform, Text, View } from 'react-native';
import { Button, Card, Chip, Notice, Row, Screen, TextField } from '@/components/ui';
import { barcodeProblem, PRODUCT_BARCODE_TYPES } from '@/features/scanner/barcode';
import { colors, font, radius, space } from '@/theme';

type Mode = 'camera' | 'manual' | 'image';

export function openProduct(code: string, method: 'CAMERA' | 'MANUAL' | 'IMAGE') {
  router.push({ pathname: '/product/[key]', params: { key: code, via: method } });
}

export function ScanScreen() {
  const [mode, setMode] = useState<Mode>('camera');
  return (
    <Screen>
      <Row style={{ flexWrap: 'wrap' }}>
        <Chip label="Camera" icon="camera-outline" selected={mode === 'camera'} onPress={() => setMode('camera')} />
        <Chip label="Enter barcode" icon="keypad-outline" selected={mode === 'manual'} onPress={() => setMode('manual')} />
        <Chip label="Barcode photo" icon="image-outline" selected={mode === 'image'} onPress={() => setMode('image')} />
      </Row>
      {mode === 'camera' ? <CameraScanner onFallback={() => setMode('manual')} /> : mode === 'manual' ? <ManualEntry /> : <ImageScan onFallback={() => setMode('manual')} />}
      <Card onPress={() => router.push('/label-scan')} accessibilityLabel="Read a nutrition label with OCR">
        <Row gap={space.md}>
          <Ionicons name="document-text-outline" size={26} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={font.h3}>No barcode or not in the database?</Text>
            <Text style={font.small}>Photograph the nutrition table and ingredient list. You can review every value before analysis.</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Row>
      </Card>
    </Screen>
  );
}

export function CameraScanner({ onFallback }: { onFallback: () => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const focused = useIsFocused();
  const [status, setStatus] = useState<string>('Point the camera at the barcode on the pack.');
  const [error, setError] = useState<string | null>(null);
  const handled = useRef(false);

  const onScanned = useCallback((result: BarcodeScanningResult) => {
    if (handled.current) return;
    const problem = barcodeProblem(result.data);
    if (problem) {
      setError(`Scanned "${result.data}" (${result.type}), but ${problem.charAt(0).toLowerCase()}${problem.slice(1)}`);
      return;
    }
    handled.current = true;
    setError(null);
    setStatus(`Barcode ${result.data} detected. Looking it up...`);
    openProduct(result.data, 'CAMERA');
    // Allow another scan when the user comes back to this screen.
    setTimeout(() => {
      handled.current = false;
      setStatus('Point the camera at the barcode on the pack.');
    }, 1500);
  }, []);

  if (!permission) {
    return <Notice text="Checking camera permission..." />;
  }
  if (!permission.granted) {
    return (
      <Card>
        <Ionicons name="camera-outline" size={32} color={colors.primary} />
        <Text style={font.h3}>Camera access needed</Text>
        <Text style={font.small}>
          NutriScan uses the camera only to read barcodes. {permission.canAskAgain ? '' : 'Permission was denied; enable it in your device settings.'}
        </Text>
        {permission.canAskAgain ? (
          <Button title="Allow camera" icon="camera" onPress={requestPermission} testID="allow-camera" />
        ) : (
          Platform.OS !== 'web' && <Button title="Open settings" icon="settings-outline" onPress={() => Linking.openSettings()} />
        )}
        <Button title="Enter the barcode manually" variant="ghost" onPress={onFallback} />
      </Card>
    );
  }
  return (
    <View style={{ gap: space.md }}>
      <View style={{ borderRadius: radius.xl, overflow: 'hidden', height: 340, backgroundColor: '#000' }}>
        {focused ? (
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: [...PRODUCT_BARCODE_TYPES] }}
            onBarcodeScanned={onScanned}
            onMountError={() => setError('The camera could not start. Use manual entry or a barcode photo instead.')}
          />
        ) : null}
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: '78%', height: 140, borderWidth: 3, borderColor: colors.accent, borderRadius: radius.lg }} />
        </View>
      </View>
      <Notice text={status} tone="primary" icon="scan-outline" />
      {error ? <Notice text={error} tone="warning" /> : null}
    </View>
  );
}

export function ManualEntry() {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    const p = barcodeProblem(code);
    setError(p);
    if (!p) openProduct(code.replace(/\s|-/g, ''), 'MANUAL');
  };
  return (
    <Card>
      <TextField
        label="Barcode number"
        value={code}
        onChangeText={(t) => {
          setCode(t);
          setError(null);
        }}
        keyboardType="number-pad"
        placeholder="e.g. 8901719134845"
        maxLength={14}
        error={error}
        testID="barcode-input"
        onSubmitEditing={submit}
      />
      <Button title="Look up product" icon="search" onPress={submit} testID="lookup" />
    </Card>
  );
}

function ImageScan({ onFallback }: { onFallback: () => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const pick = async () => {
    setMessage(null);
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (res.canceled || !res.assets?.[0]) return;
    setBusy(true);
    try {
      const results = await scanFromURLAsync(res.assets[0].uri, [...PRODUCT_BARCODE_TYPES]);
      const valid = results.find((r) => !barcodeProblem(r.data));
      if (valid) openProduct(valid.data, 'IMAGE');
      else setMessage(results.length ? `Found "${results[0].data}", which is not a valid product barcode.` : 'No product barcode was found in this photo. Crop closer to the barcode or enter the number manually.');
    } catch {
      setMessage('This device cannot decode barcodes from photos. Please enter the number manually.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <Text style={font.h3}>Decode a barcode from a photo</Text>
      <Text style={font.small}>Choose a clear, close-up photo of the barcode. Decoding happens on your device.</Text>
      <Button title="Choose photo" icon="images-outline" onPress={pick} loading={busy} />
      {message ? <Notice text={message} tone="warning" /> : null}
      <Button title="Enter the barcode manually" variant="ghost" onPress={onFallback} />
    </Card>
  );
}
