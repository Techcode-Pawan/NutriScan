import { Router } from 'express';
import { z } from 'zod';
import { parse } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';
import { optionalAuth } from '../../middleware/auth.js';
import { assistantLimiter } from '../../middleware/rate-limit.js';
import { getProductOrThrow, loadPreferences } from '../products/product.service.js';
import { ask, suggestionsFor } from './assistant.service.js';
import { getLlmProvider } from './llm/provider.js';

export const assistantRouter = Router();

// GET /api/assistant/status
assistantRouter.get('/status', (_req, res) => {
  const p = getLlmProvider();
  res.json({
    data: {
      mode: p ? 'llm_with_verified_facts' : 'deterministic',
      provider: p?.name ?? 'deterministic',
      note: p
        ? 'Answers are phrased by a language model from database facts; numbers are checked against those facts.'
        : 'No language model is configured; answers are generated from templates and product data.',
    },
  });
});

// GET /api/assistant/suggestions?product=<key>&compareWith=<key>
assistantRouter.get('/suggestions', async (req, res) => {
  const q = parse(z.object({ product: z.string().min(1), compareWith: z.string().optional() }), req.query);
  const { product } = await getProductOrThrow(q.product);
  res.json({ data: suggestionsFor(product, Boolean(q.compareWith)) });
});

// POST /api/assistant/ask { productId|barcode, question, compareWith? }
assistantRouter.post('/ask', assistantLimiter, optionalAuth, async (req, res) => {
  const body = parse(
    z.object({
      product: z.string().trim().min(1, 'product (barcode or id) is required'),
      question: z.string().trim().min(2, 'Ask a question').max(500),
      compareWith: z.string().trim().min(1).optional(),
    }),
    req.body,
  );
  const { product } = await getProductOrThrow(body.product);
  const compareWith = body.compareWith ? (await getProductOrThrow(body.compareWith)).product : null;
  const prefs = await loadPreferences(req.user?.id);
  const answer = await ask({ question: body.question, product, compareWith, prefs });
  // Usage metadata only; the question text is not stored.
  await prisma.assistantQuery
    .create({ data: { userId: req.user?.id ?? null, productId: product.id, intent: answer.intent, provider: answer.provider } })
    .catch(() => undefined);
  res.json({ data: answer });
});
