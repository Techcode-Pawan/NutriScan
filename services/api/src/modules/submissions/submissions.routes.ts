import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Prisma } from '@prisma/client';
import { Router } from 'express';
import sharp from 'sharp';
import { z } from 'zod';
import { UPLOAD_DIR } from '../../config/paths.js';
import { normalizeBarcode } from '../../etl/barcode.js';
import { categoryBySlug } from '../../etl/categories.js';
import { AppError, parse } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';
import { optionalAuth, requireAuth } from '../../middleware/auth.js';
import { submissionLimiter } from '../../middleware/rate-limit.js';
import { imageUpload } from '../ocr/ocr.routes.js';
import { validateImage } from '../ocr/ocr.service.js';

export const submissionsRouter = Router();

const optNum = z.preprocess((v) => (v === '' || v === undefined ? null : v), z.coerce.number().min(0).max(100000).nullable());

const submissionSchema = z.object({
  barcode: z.preprocess((v) => (v === '' ? undefined : v), z.string().trim().max(14).optional()),
  name: z.string().trim().min(2, 'Product name is required').max(200),
  brand: z.string().trim().max(100).optional(),
  categorySlug: z.string().trim().max(60).optional(),
  ingredientsText: z.string().trim().max(4000).optional(),
  notes: z.string().trim().max(1000).optional(),
  source: z.enum(['MANUAL', 'OCR']).default('MANUAL'),
  nutrition: z
    .object({
      basis: z.enum(['PER_100G', 'PER_100ML', 'UNKNOWN']).default('UNKNOWN'),
      energyKcal: optNum.optional(),
      fatG: optNum.optional(),
      saturatedFatG: optNum.optional(),
      carbohydratesG: optNum.optional(),
      sugarsG: optNum.optional(),
      fiberG: optNum.optional(),
      proteinG: optNum.optional(),
      sodiumMg: optNum.optional(),
    })
    .optional(),
});

/** Multipart forms send nested JSON as a string field. */
function bodyFromRequest(body: Record<string, unknown>) {
  const b = { ...body };
  if (typeof b.nutrition === 'string') {
    try {
      b.nutrition = JSON.parse(b.nutrition);
    } catch {
      throw new AppError(400, 'VALIDATION_ERROR', 'nutrition must be valid JSON');
    }
  }
  return b;
}

// POST /api/submissions  (JSON or multipart with optional "image"); guests may submit
submissionsRouter.post('/', submissionLimiter, optionalAuth, imageUpload.single('image'), async (req, res) => {
  const body = parse(submissionSchema, bodyFromRequest(req.body ?? {}));
  let barcode: string | null = null;
  if (body.barcode) {
    const bc = normalizeBarcode(body.barcode);
    if (!bc.valid) throw new AppError(400, 'INVALID_BARCODE', `"${body.barcode}" is not a valid EAN-8, UPC-A or EAN-13 barcode (${bc.reason}).`);
    barcode = bc.gtin;
  }
  if (body.categorySlug && !categoryBySlug(body.categorySlug)) throw new AppError(400, 'UNKNOWN_CATEGORY', `Unknown category "${body.categorySlug}".`);
  const n = body.nutrition;
  if (n?.sugarsG != null && n?.carbohydratesG != null && n.sugarsG > n.carbohydratesG) {
    throw new AppError(422, 'IMPLAUSIBLE_VALUES', 'Sugars cannot exceed carbohydrates. Please check the values.');
  }
  if (n?.saturatedFatG != null && n?.fatG != null && n.saturatedFatG > n.fatG) {
    throw new AppError(422, 'IMPLAUSIBLE_VALUES', 'Saturated fat cannot exceed total fat. Please check the values.');
  }

  let imagePath: string | null = null;
  if (req.file) {
    await validateImage(req.file.buffer);
    const dir = path.join(UPLOAD_DIR, 'submissions');
    mkdirSync(dir, { recursive: true });
    const file = `${randomUUID()}.jpg`;
    // Re-encoding strips EXIF metadata (including GPS location) and neutralises malformed files.
    await sharp(req.file.buffer).rotate().resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 82 }).toFile(path.join(dir, file));
    imagePath = `submissions/${file}`;
  }

  const existing = barcode ? await prisma.product.findUnique({ where: { barcode }, select: { id: true } }) : null;
  const submission = await prisma.productSubmission.create({
    data: {
      userId: req.user?.id ?? null,
      barcode,
      name: body.name,
      brand: body.brand,
      source: body.source,
      imagePath,
      payload: {
        categorySlug: body.categorySlug ?? null,
        ingredientsText: body.ingredientsText ?? null,
        nutrition: n ?? null,
        notes: body.notes ?? null,
        existingProductId: existing?.id ?? null,
      } as Prisma.InputJsonValue,
    },
  });
  res.status(201).json({
    data: {
      id: submission.id,
      status: submission.status,
      submittedAt: submission.submittedAt,
      message: existing
        ? 'Thanks! This barcode already exists, so your submission will be reviewed as a correction.'
        : 'Thanks! Your submission will be reviewed before it appears in NutriScan. It is not added to the product database automatically.',
    },
  });
});

// GET /api/submissions/mine
submissionsRouter.get('/mine', requireAuth, async (req, res) => {
  const rows = await prisma.productSubmission.findMany({
    where: { userId: req.user!.id },
    orderBy: { submittedAt: 'desc' },
    select: { id: true, barcode: true, name: true, brand: true, status: true, reviewerNote: true, submittedAt: true, reviewedAt: true, source: true },
  });
  res.json({ data: rows });
});
