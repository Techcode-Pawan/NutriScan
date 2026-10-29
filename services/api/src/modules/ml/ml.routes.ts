import { Router } from 'express';
import { z } from 'zod';
import { parse } from '../../lib/http.js';
import { ML_DISCLAIMER, mlStatus, predictFeatures } from './ml.service.js';

export const mlRouter = Router();

// GET /api/ml/status - model availability, version and the metrics measured at training time
mlRouter.get('/status', async (_req, res) => {
  const s = await mlStatus();
  res.json({ data: { ...s, disclaimer: ML_DISCLAIMER } });
});

const n = z.number().min(0).max(100000).nullable();
// POST /api/ml/predict - ad-hoc estimate for nutrition values (e.g. from OCR review)
mlRouter.post('/predict', async (req, res) => {
  const body = parse(
    z.object({
      energyKcal: n,
      fatG: n,
      saturatedFatG: n,
      carbohydratesG: n,
      sugarsG: n,
      fiberG: n,
      proteinG: n,
      sodiumMg: n,
      isLiquid: z.boolean().default(false),
      categorySlug: z.string().max(60).nullable().default(null),
    }),
    req.body,
  );
  res.json({ data: await predictFeatures(body) });
});
