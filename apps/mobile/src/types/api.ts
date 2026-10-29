export type InrStatus = 'RATED' | 'PARTIAL' | 'INSUFFICIENT_DATA' | 'EXEMPT' | 'NOT_ELIGIBLE' | 'BASIS_UNKNOWN';
export type Basis = 'PER_100G' | 'PER_100ML' | 'UNKNOWN';
export type DataSource = 'OPEN_FOOD_FACTS' | 'LEGACY_CSV' | 'USER_SUBMISSION';

export interface CategoryRef {
  id: number;
  slug: string;
  name: string;
}

export interface ProductSummary {
  id: string;
  barcode: string | null;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  category: CategoryRef | null;
  dataSource: DataSource;
  inr: { status: InrStatus; stars: number | null };
  basis: Basis;
  keyNutrients: { energyKcal: number | null; sugarsG: number | null; sodiumMg: number | null; saturatedFatG: number | null } | null;
}

export interface NutritionValues {
  energyKcal: number | null;
  fatG: number | null;
  saturatedFatG: number | null;
  transFatG: number | null;
  carbohydratesG: number | null;
  sugarsG: number | null;
  fiberG: number | null;
  proteinG: number | null;
  sodiumMg: number | null;
  fruitVegPct: number | null;
  nutsLegumesMilletsPct: number | null;
}

export interface FactorLine {
  factor: string;
  label: string;
  unit: string;
  value: number | null;
  points: number;
  maxPoints: number;
  exceeded: number | null;
  nextThreshold: number | null;
  rawPoints?: number;
  cap?: number;
  state?: 'awarded' | 'zero' | 'missing' | 'not_declared';
}

export interface InrExplanation {
  headline: string;
  summary: string[];
  concerns: string[];
  positives: string[];
  missing: string[];
  calculation: string | null;
  disclaimer: string;
}

export interface ProductDetail extends Omit<ProductSummary, 'inr' | 'category'> {
  subcategory: string | null;
  quantity: string | null;
  isVegetarian: boolean | null;
  ingredientsText: string | null;
  category: (CategoryRef & { inrClass: 'SOLID' | 'LIQUID' | 'EXEMPT' | null; isBeverage: boolean }) | null;
  source: { type: DataSource; label: string; attribution: string; verified: boolean; note: string; reference: string; lastModified: string | null; qualityFlags: string[] };
  nutrition: { basis: Basis; basisLabel: string; basisNote: string | null; values: NutritionValues; completeness: number; missing: string[]; dataKind: string } | null;
  inr: {
    method: 'INR';
    algorithmVersion: string;
    status: InrStatus;
    inrClass: string | null;
    stars: number | null;
    finalScore: number | null;
    baselinePoints: number | null;
    positivePoints: number | null;
    breakdown: { baseline: FactorLine[]; positive: FactorLine[]; capRule: string | null; reasons: string[] };
    explanation: InrExplanation;
    dataCompleteness: number;
    hfss: { evaluable: boolean; isHfss: boolean | null; triggers: string[] };
  } | null;
  ingredients: {
    insights: Array<{ code: string; label: string; detail: string; evidence: string }>;
    allergensMentioned: string[];
    declaredShares: { fruitVegPct: number | null; nutsLegumesMilletsPct: number | null; evidence: string[] };
    note: string;
  };
  personal: { checks: Array<{ preference: string; status: 'meets' | 'does_not_meet' | 'unknown'; message: string }>; ageGroupNote: string | null; note: string } | null;
}

export interface Alternative extends ProductSummary {
  ratingDifference: number;
  preferenceMatch: number;
  matchedPreferences: string[];
  partial: boolean;
  reasons: string[];
  tradeOffs: string[];
  summary: string;
}

export interface AlternativesResult {
  product: ProductSummary;
  criteria: { category: string | null; minimumStars: number | null; includePartial: boolean; preferencesApplied: boolean };
  alternatives: Alternative[];
  totalEligible?: number;
  excluded: { differentBasis: number; nonVegetarian: number; excludedIngredient: number; ingredientsUnknown: number };
  message: string | null;
}

export interface CompareResult {
  comparable: boolean;
  basis: string | null;
  products: Array<ProductSummary & { ingredientsText: string | null; inr: { status: InrStatus; stars: number | null; finalScore: number | null }; ml: { predictedGrade: string; mlIndex: number } | null; dataCompleteness: number }>;
  rows: Array<{ key: string; label: string; unit: string; betterWhen: 'lower' | 'higher' | null; values: Array<number | null>; bestIndexes: number[] }>;
  summary: string[];
}

export interface Category extends CategoryRef {
  inrClass: 'SOLID' | 'LIQUID' | 'EXEMPT' | null;
  isBeverage: boolean;
  description: string | null;
  productCount: number;
  ratedCount: number;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface User {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
  counts?: { scans: number; favorites: number; submissions: number };
}

export interface Preferences {
  lowSugar: boolean;
  lowSodium: boolean;
  lowSaturatedFat: boolean;
  highFiber: boolean;
  highProtein: boolean;
  vegetarian: boolean;
  excludedIngredients: string[];
  ageGroup: 'CHILD' | 'TEEN' | 'ADULT' | 'SENIOR' | null;
}

export interface HistoryItem {
  id: string;
  scannedAt: string;
  method: 'CAMERA' | 'MANUAL' | 'IMAGE' | 'SEARCH';
  product: ProductSummary;
}

export interface FavoriteItem {
  addedAt: string;
  product: ProductSummary;
}

export interface AssistantAnswer {
  answer: string;
  intent: string;
  provider: string;
  grounded: true;
  facts: Array<{ label: string; value: string }>;
  suggestions: string[];
  disclaimer: string;
  note?: string;
}

export interface MlResult {
  status: 'ok' | 'unavailable' | 'insufficient_data';
  reason?: string;
  disclaimer: string;
  referenceGrade?: string | null;
  cached?: boolean;
  prediction?: {
    predictedGrade: string;
    probabilities: Record<string, number>;
    mlIndex: number;
    contributions: Array<{ feature: string; label: string; value: number | string | null; contribution: number }>;
    modelVersion: string;
  };
  model?: {
    modelVersion: string;
    target: string;
    algorithm: string;
    trainedAt: string;
    metrics: { test: { accuracy: number; macro_f1: number; within_one_grade: number; n: number }; majorityClassBaseline: { accuracy: number; macro_f1: number } };
  } | null;
}

export type OcrFieldKey = 'energyKcal' | 'fatG' | 'saturatedFatG' | 'transFatG' | 'carbohydratesG' | 'sugarsG' | 'fiberG' | 'proteinG' | 'sodiumMg';

export interface OcrResult {
  engine: string;
  ocrConfidence: number;
  rawText: string;
  basis: Basis;
  basisEvidence: string | null;
  fields: Partial<Record<OcrFieldKey, { value: number; unit: string; rawLine: string; confidence: 'high' | 'low'; notes: string[] }>>;
  ingredientsText: string | null;
  warnings: string[];
}

export interface AnalyzeResult {
  dataKind: string;
  notice: string;
  category: { slug: string; name: string; inrClass: string | null } | null;
  inr: { status: InrStatus; stars: number | null; finalScore: number | null; baselinePoints: number | null; positivePoints: number | null; explanation: InrExplanation; baseline: FactorLine[]; positive: FactorLine[] };
  ml: MlResult;
}
