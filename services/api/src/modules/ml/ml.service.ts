import type { Prisma } from '@prisma/client';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { nutritionValues, type ProductWithRelations } from '../products/product.service.js';

/**
 * Client for the Python inference service (ml/inference/server.py). The ML estimate is an
 * EXPERIMENTAL prediction of the Open Food Facts Nutri-Score grade; it is stored separately from
 * the INR rating and never used to decide "higher-rated" alternatives. If the service is down or
 * no model is trained, callers receive status "unavailable" and everything else keeps working.
 */

export const ML_DISCLAIMER =
  'Experimental machine-learning estimate of the Nutri-Score grade that Open Food Facts computes. It is not the INR rating, ' +
  'not an independent validation of it, and not a medical or nutritional assessment. Model accuracy is reported on held-out data only.';

export interface MlFeatures {
  energyKcal: number | null;
  fatG: number | null;
  saturatedFatG: number | null;
  carbohydratesG: number | null;
  sugarsG: number | null;
  fiberG: number | null;
  proteinG: number | null;
  sodiumMg: number | null;
  isLiquid: boolean;
  categorySlug: string | null;
}

interface ServicePrediction {
  predictedGrade: string;
  probabilities: Record<string, number>;
  mlIndex: number;
  contributions: Array<{ feature: string; label: string; value: number | string | null; contribution: number }>;
  modelVersion: string;
}

interface ModelInfo {
  modelVersion: string;
  target: string;
  algorithm: string;
  metrics: Record<string, unknown>;
  config: Record<string, unknown>;
  trainedAt: string;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.ML_TIMEOUT_MS);
  try {
    const res = await fetch(`${env.ML_SERVICE_URL}${path}`, { ...init, signal: controller.signal, headers: { 'Content-Type': 'application/json' } });
    if (!res.ok) throw new Error(`ML service responded ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

let registered: string | null = null;

export async function mlStatus(): Promise<{ available: boolean; model: ModelInfo | null; reason?: string }> {
  try {
    const model = await call<ModelInfo>('/model');
    if (registered !== model.modelVersion) {
      await prisma.mlModelVersion.upsert({
        where: { version: model.modelVersion },
        create: {
          version: model.modelVersion,
          target: model.target,
          algorithm: model.algorithm,
          metrics: model.metrics as Prisma.InputJsonValue,
          config: model.config as Prisma.InputJsonValue,
          trainedAt: new Date(model.trainedAt),
        },
        update: { metrics: model.metrics as Prisma.InputJsonValue, config: model.config as Prisma.InputJsonValue },
      });
      registered = model.modelVersion;
    }
    return { available: true, model };
  } catch (e) {
    return { available: false, model: null, reason: 'The ML service is not running or no trained model is available.' };
  }
}

export function featuresFor(n: ReturnType<typeof nutritionValues>, isLiquid: boolean, categorySlug: string | null): MlFeatures | null {
  if (!n) return null;
  return {
    energyKcal: n.energyKcal,
    fatG: n.fatG,
    saturatedFatG: n.saturatedFatG,
    carbohydratesG: n.carbohydratesG,
    sugarsG: n.sugarsG,
    fiberG: n.fiberG,
    proteinG: n.proteinG,
    sodiumMg: n.sodiumMg,
    isLiquid,
    categorySlug,
  };
}

/** Minimum inputs for a meaningful estimate; fewer than this and the model would mostly guess. */
export function missingForMl(f: MlFeatures | null): string[] {
  if (!f) return ['nutrition facts'];
  const req: Array<[keyof MlFeatures, string]> = [
    ['energyKcal', 'energy'],
    ['sugarsG', 'sugars'],
    ['saturatedFatG', 'saturated fat'],
    ['sodiumMg', 'sodium'],
  ];
  return req.filter(([k]) => f[k] === null).map(([, l]) => l);
}

export async function predictFeatures(features: MlFeatures) {
  const status = await mlStatus();
  if (!status.available) return { status: 'unavailable' as const, reason: status.reason, disclaimer: ML_DISCLAIMER };
  const missing = missingForMl(features);
  if (missing.length) {
    return { status: 'insufficient_data' as const, reason: `The model needs ${missing.join(', ')}.`, disclaimer: ML_DISCLAIMER };
  }
  const [pred] = await call<ServicePrediction[]>('/predict', { method: 'POST', body: JSON.stringify({ items: [features] }) });
  return { status: 'ok' as const, prediction: pred, model: status.model, disclaimer: ML_DISCLAIMER };
}

export async function getMlPrediction(product: ProductWithRelations) {
  const status = await mlStatus();
  if (!status.available || !status.model) {
    return { status: 'unavailable' as const, reason: status.reason, disclaimer: ML_DISCLAIMER };
  }
  const version = status.model.modelVersion;
  const cached = await prisma.mlPrediction.findUnique({ where: { productId_modelVersion: { productId: product.id, modelVersion: version } } });
  if (cached) {
    return {
      status: 'ok' as const,
      prediction: {
        predictedGrade: cached.predictedGrade,
        probabilities: cached.probabilities,
        mlIndex: cached.mlIndex,
        contributions: cached.explanation,
        modelVersion: version,
      },
      model: status.model,
      referenceGrade: (product.referenceLabels as Record<string, unknown> | null)?.nutriscoreGrade ?? null,
      cached: true,
      disclaimer: ML_DISCLAIMER,
    };
  }
  if (product.nutrition?.basis === 'UNKNOWN') {
    return { status: 'insufficient_data' as const, reason: 'The measurement basis of this product is unknown.', disclaimer: ML_DISCLAIMER };
  }
  const features = featuresFor(nutritionValues(product), product.nutrition?.basis === 'PER_100ML', product.category?.slug ?? null);
  const result = await predictFeatures(features!);
  if (result.status !== 'ok') return result;
  const p = result.prediction;
  await prisma.mlPrediction.upsert({
    where: { productId_modelVersion: { productId: product.id, modelVersion: version } },
    create: {
      productId: product.id,
      modelVersion: version,
      predictedGrade: p.predictedGrade,
      mlIndex: p.mlIndex,
      probabilities: p.probabilities,
      explanation: p.contributions as unknown as Prisma.InputJsonValue,
    },
    update: {},
  });
  return {
    ...result,
    referenceGrade: (product.referenceLabels as Record<string, unknown> | null)?.nutriscoreGrade ?? null,
    cached: false,
  };
}
