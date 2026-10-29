import { fireEvent, render, screen } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockParams: Record<string, string> = {};
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    router: { push: (...a: unknown[]) => mockPush(...a), back: jest.fn(), replace: jest.fn(), dismissAll: jest.fn() },
    useLocalSearchParams: () => mockParams,
    useIsFocused: () => true,
    Stack: { Screen: () => null },
    Link: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
  };
});

const mockPermission = { current: null as null | { granted: boolean; canAskAgain: boolean } };
jest.mock('expo-camera', () => ({
  CameraView: () => null,
  scanFromURLAsync: jest.fn(),
  useCameraPermissions: () => [mockPermission.current, jest.fn()],
}));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn(), launchCameraAsync: jest.fn() }));
jest.mock('expo-image', () => ({ Image: () => null }));

const mockProduct = { current: {} as Record<string, unknown> };
jest.mock('@/hooks/queries', () => ({
  useProduct: () => mockProduct.current,
  useFavorites: () => ({ data: [] }),
  useToggleFavorite: () => ({ mutate: jest.fn(), isPending: false }),
  useRecordScan: () => ({ mutate: jest.fn() }),
}));
jest.mock('@/store/auth', () => ({ useAuth: () => ({ token: null, isGuest: true }) }));
jest.mock('@/store/compare', () => ({ useCompare: () => ({ items: [], has: () => false, toggle: jest.fn(), clear: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, SafeAreaProvider: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

import { ApiError } from '@/services/api';
import ProductScreen from '../src/app/product/[key]/index';
import { CameraScanner, ManualEntry } from '@/features/scanner/ScannerViews';

beforeEach(() => {
  mockPush.mockClear();
});

describe('scanner', () => {
  it('asks for camera permission and offers manual entry', async () => {
    mockPermission.current = { granted: false, canAskAgain: true };
    const fallback = jest.fn();
    await render(<CameraScanner onFallback={fallback} />);
    expect(screen.getByText('Camera access needed')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Allow camera' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Enter the barcode manually' }));
    expect(fallback).toHaveBeenCalled();
  });
  it('explains permanently denied permission', async () => {
    mockPermission.current = { granted: false, canAskAgain: false };
    await render(<CameraScanner onFallback={jest.fn()} />);
    expect(screen.getByText(/enable it in your device settings/)).toBeTruthy();
  });
  it('rejects an invalid manual barcode without calling the API', async () => {
    await render(<ManualEntry />);
    await fireEvent.changeText(screen.getByTestId('barcode-input'), '8901719134846');
    await fireEvent.press(screen.getByTestId('lookup'));
    expect(screen.getByText(/check digit does not match/)).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });
  it('opens the product for a valid manual barcode', async () => {
    await render(<ManualEntry />);
    await fireEvent.changeText(screen.getByTestId('barcode-input'), '8901719134845');
    await fireEvent.press(screen.getByTestId('lookup'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/product/[key]', params: { key: '8901719134845', via: 'MANUAL' } });
  });
});

const detail = {
  id: 'cabc123',
  barcode: '2000000000015',
  name: 'Test Choco Cream Biscuit',
  brand: 'Test Brand',
  imageUrl: null,
  dataSource: 'OPEN_FOOD_FACTS',
  basis: 'PER_100G',
  keyNutrients: null,
  subcategory: null,
  quantity: null,
  isVegetarian: true,
  ingredientsText: 'Wheat flour, sugar',
  category: { id: 1, slug: 'biscuits-cookies', name: 'Biscuits & Cookies', inrClass: 'SOLID', isBeverage: false },
  source: { type: 'OPEN_FOOD_FACTS', label: 'Open Food Facts', attribution: 'ODbL', verified: false, note: 'Verify against the pack.', reference: 'off:1', lastModified: null, qualityFlags: [] },
  nutrition: {
    basis: 'PER_100G',
    basisLabel: 'per 100 g',
    basisNote: null,
    values: { energyKcal: 480, fatG: 20, saturatedFatG: 10, transFatG: null, carbohydratesG: 65, sugarsG: 32, fiberG: 1, proteinG: 6, sodiumMg: 200, fruitVegPct: null, nutsLegumesMilletsPct: null },
    completeness: 1,
    missing: [],
    dataKind: 'source_data',
  },
  inr: {
    method: 'INR',
    algorithmVersion: 'INR-FSSAI-DRAFT-2022-v1',
    status: 'RATED',
    inrClass: 'SOLID',
    stars: 1.5,
    finalScore: 18,
    baselinePoints: 23,
    positivePoints: 5,
    breakdown: {
      baseline: [{ factor: 'energyKcal', label: 'Energy', unit: 'kcal', value: 480, points: 5, maxPoints: 10, exceeded: 400, nextThreshold: 480 }],
      positive: [{ factor: 'proteinG', label: 'Protein', unit: 'g', value: 6, points: 5, maxPoints: 15, exceeded: 5, nextThreshold: 7, rawPoints: 5, cap: 7, state: 'awarded' }],
      capRule: 'Baseline 23 > 20: reduced positive-point caps apply',
      reasons: [],
    },
    explanation: { headline: '1.5 out of 5 stars (INR, solid food)', summary: ["This product's rating is mainly influenced by its saturated fat and total sugars levels (9 pts, 7 pts)."], concerns: [], positives: [], missing: [], calculation: 'x', disclaimer: 'Not an official FSSAI rating.' },
    dataCompleteness: 1,
    hfss: { evaluable: true, isHfss: true, triggers: ['27% of energy from total sugars (limit < 10%)'] },
  },
  ingredients: { insights: [], allergensMentioned: ['Wheat / gluten'], declaredShares: { fruitVegPct: null, nutsLegumesMilletsPct: null, evidence: [] }, note: 'Descriptive notes.' },
  personal: null,
};

describe('product details', () => {
  it('renders the INR rating, explanation, breakdown and source', async () => {
    mockParams.key = '2000000000015';
    mockProduct.current = { isLoading: false, error: null, data: detail };
    await render(<ProductScreen />);
    expect(screen.getByText('Test Choco Cream Biscuit')).toBeTruthy();
    expect(screen.getByLabelText('1.5 out of 5 stars')).toBeTruthy();
    expect(screen.getByText(/mainly influenced by its saturated fat/)).toBeTruthy();
    expect(screen.getByText('Final score = 23 − 5 = 18')).toBeTruthy();
    expect(screen.getByText(/draft HFSS/)).toBeTruthy();
    expect(screen.getAllByText('Open Food Facts').length).toBeGreaterThan(0);
  });
  it('navigates to alternatives', async () => {
    mockProduct.current = { isLoading: false, error: null, data: detail };
    await render(<ProductScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Alternatives' }));
    expect(mockPush).toHaveBeenCalledWith('/product/2000000000015/alternatives');
  });
  it('shows an honest not-found state with a submission path', async () => {
    mockProduct.current = { isLoading: false, error: new ApiError(404, 'PRODUCT_NOT_FOUND', 'Not found', { barcode: '2000000009995', canSubmit: true }), data: undefined };
    await render(<ProductScreen />);
    expect(screen.getByText('Product not in the database')).toBeTruthy();
    expect(screen.getByText(/never invent nutrition values/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Submit this product' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/submit', params: { barcode: '2000000009995' } });
  });
  it('shows a retryable error when the server is unreachable', async () => {
    const refetch = jest.fn();
    mockProduct.current = { isLoading: false, error: new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server'), data: undefined, refetch };
    await render(<ProductScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalled();
  });
});
