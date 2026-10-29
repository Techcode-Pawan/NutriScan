import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { categoryBySlug } from '../../etl/categories.js';
import { declaredShares, ingredientInsights, allergenMentions } from '../../etl/ingredients.js';
import { plausibilityError, type NormalizedNutrition } from '../../etl/normalize.js';
import { AppError, parse } from '../../lib/http.js';
import { ocrLimiter } from '../../middleware/rate-limit.js';
import { predictFeatures } from '../ml/ml.service.js';
import { scoreNutrition } from '../scoring/score-product.js';
import { ALLOWED_MIME, runOcr } from './ocr.service.js';

export const ocrRouter = Router();

export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) cb(null, true);
    else cb(new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Upload a JPEG, PNG or WebP image.'));
  },
});

// POST /api/ocr/label  multipart/form-data, field "image"
ocrRouter.post('/label', ocrLimiter, imageUpload.single('image'), async (req, res) => {
  if (!req.file) throw new AppError(400, 'IMAGE_REQUIRED', 'Attach a photo of the nutrition table or ingredient list in the "image" field.');
  res.json({ data: await runOcr(req.file.buffer) });
});

const nullableNum = z.number().min(0).max(100000).nullable();
export const reviewedNutritionSchema = z.object({
  categorySlug: z.string().max(60).nullable(),
  basis: z.enum(['PER_100G', 'PER_100ML', 'UNKNOWN']),
  energyKcal: nullableNum,
  fatG: nullableNum,
  saturatedFatG: nullableNum,
  carbohydratesG: nullableNum,
  sugarsG: nullableNum,
  fiberG: nullableNum,
  proteinG: nullableNum,
  sodiumMg: nullableNum,
  ingredientsText: z.string().max(4000).nullable().optional(),
  source: z.enum(['ocr', 'manual']).default('ocr'),
});

// POST /api/ocr/analyze - INR (and ML, if available) for user-reviewed values. Nothing is stored.
ocrRouter.post('/analyze', ocrLimiter, async (req, res) => {
  const body = parse(reviewedNutritionSchema, req.body);
  const cat = body.categorySlug ? categoryBySlug(body.categorySlug) : undefined;
  if (body.categorySlug && !cat) throw new AppError(400, 'UNKNOWN_CATEGORY', `Unknown category "${body.categorySlug}".`);
  const shares = declaredShares(body.ingredientsText ?? null);
  const nutrition: NormalizedNutrition = {
    basis: body.basis,
    basisNote: 'Entered or reviewed by the user from a label photo.',
    energyKcal: body.energyKcal,
    fatG: body.fatG,
    saturatedFatG: body.saturatedFatG,
    transFatG: null,
    carbohydratesG: body.carbohydratesG,
    sugarsG: body.sugarsG,
    fiberG: body.fiberG,
    proteinG: body.proteinG,
    sodiumMg: body.sodiumMg,
    fruitVegPct: shares.fruitVegPct,
    nutsLegumesMilletsPct: shares.nutsLegumesMilletsPct,
    extra: null,
  };
  const implausible = plausibilityError(nutrition);
  if (implausible) throw new AppError(422, 'IMPLAUSIBLE_VALUES', `These values are not plausible (${implausible}). Please check them against the label.`);
  const score = scoreNutrition(nutrition, cat ? { inrClass: cat.inrClass, isBeverage: cat.isBeverage } : null);
  const ml = await predictFeatures({
    energyKcal: body.energyKcal,
    fatG: body.fatG,
    saturatedFatG: body.saturatedFatG,
    carbohydratesG: body.carbohydratesG,
    sugarsG: body.sugarsG,
    fiberG: body.fiberG,
    proteinG: body.proteinG,
    sodiumMg: body.sodiumMg,
    isLiquid: body.basis === 'PER_100ML',
    categorySlug: body.categorySlug,
  }).catch(() => ({ status: 'unavailable' as const, reason: 'The ML service could not be reached.' }));
  res.json({
    data: {
      dataKind: body.source === 'ocr' ? 'ocr_extracted_user_reviewed' : 'user_entered',
      notice: 'Based on values you provided; not verified against the product database and not saved.',
      category: cat ? { slug: cat.slug, name: cat.name, inrClass: cat.inrClass } : null,
      inr: { ...score.result, explanation: score.explanation, hfss: score.hfss },
      ingredients: {
        insights: ingredientInsights(body.ingredientsText ?? null),
        allergensMentioned: allergenMentions(body.ingredientsText ?? null),
        declaredShares: shares,
      },
      ml,
    },
  });
});
