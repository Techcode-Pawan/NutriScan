import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { corsOrigins, env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { generalLimiter } from './middleware/rate-limit.js';
import { assistantRouter } from './modules/assistant/assistant.routes.js';
import { getLlmProvider } from './modules/assistant/llm/provider.js';
import { authRouter, meRouter } from './modules/auth/auth.routes.js';
import { mlRouter } from './modules/ml/ml.routes.js';
import { mlStatus } from './modules/ml/ml.service.js';
import { ocrRouter } from './modules/ocr/ocr.routes.js';
import { categoriesRouter, compareRouter, productsRouter } from './modules/products/products.routes.js';
import { INR_CONFIG } from './modules/scoring/inr.config.js';
import { INR_DISCLAIMER } from './modules/scoring/inr.explain.js';
import { submissionsRouter } from './modules/submissions/submissions.routes.js';
import { favoritesRouter, historyRouter, preferencesRouter } from './modules/users/user-data.routes.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (env.TRUST_PROXY) app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      // Native mobile apps send no Origin header and are allowed; browsers must be on the allow-list.
      origin: (origin, cb) => cb(null, !origin || corsOrigins.includes(origin)),
      credentials: false,
    }),
  );
  app.use(express.json({ limit: '200kb' }));
  app.use('/api', generalLimiter);

  app.get('/api/health', async (_req, res) => {
    let database = 'ok';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'unavailable';
    }
    const ml = await mlStatus();
    res.status(database === 'ok' ? 200 : 503).json({
      data: {
        status: database === 'ok' ? 'ok' : 'degraded',
        database,
        ml: ml.available ? { status: 'ok', modelVersion: ml.model?.modelVersion } : { status: 'unavailable' },
        assistant: getLlmProvider()?.name ?? 'deterministic',
        scoring: INR_CONFIG.version,
        offLiveLookup: env.OFF_LIVE_LOOKUP,
      },
    });
  });

  app.get('/api/scoring/methodology', (_req, res) => {
    res.json({
      data: {
        version: INR_CONFIG.version,
        source: INR_CONFIG.source,
        tables: INR_CONFIG.classes,
        assumptions: INR_CONFIG.assumptions,
        disclaimer: INR_DISCLAIMER,
        formula: 'Final INR score = baseline points (energy + saturated fat + total sugars + sodium) - capped positive points (FV + NLM + fibre + protein)',
      },
    });
  });

  app.get('/api/attribution', (_req, res) => {
    res.json({
      data: {
        openFoodFacts:
          'Product data from Open Food Facts (https://world.openfoodfacts.org), made available under the Open Database License (ODbL 1.0); individual contents under the Database Contents License; images under CC BY-SA.',
        legacyDataset: 'Additional products from the NutriScan student-collected dataset (unverified, no barcodes).',
        scoring: INR_DISCLAIMER,
      },
    });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/me', meRouter);
  app.use('/api/products', productsRouter);
  app.use('/api/categories', categoriesRouter);
  app.use('/api/compare', compareRouter);
  app.use('/api/history', historyRouter);
  app.use('/api/favorites', favoritesRouter);
  app.use('/api/preferences', preferencesRouter);
  app.use('/api/submissions', submissionsRouter);
  app.use('/api/ocr', ocrRouter);
  app.use('/api/ml', mlRouter);
  app.use('/api/assistant', assistantRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
