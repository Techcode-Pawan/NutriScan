import { mkdirSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { createWorker, type Worker } from 'tesseract.js';
import { env } from '../../config/env.js';
import { API_ROOT } from '../../config/paths.js';
import { AppError } from '../../lib/http.js';
import { parseLabelText } from './nutrition-parser.js';

/**
 * Local OCR with Tesseract (tesseract.js, WebAssembly - no system install required).
 * On first use the English model (eng.traineddata, ~10 MB) is downloaded once from the
 * tesseract.js CDN and cached in services/api/.tesseract-cache. For fully offline use, place
 * eng.traineddata in a folder and set OCR_LANG_PATH to it.
 */

const CACHE = path.join(API_ROOT, '.tesseract-cache');
let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    mkdirSync(CACHE, { recursive: true });
    workerPromise = createWorker('eng', 1, {
      cachePath: CACHE,
      ...(env.OCR_LANG_PATH ? { langPath: env.OCR_LANG_PATH } : {}),
    }).catch((e) => {
      workerPromise = null;
      throw e;
    });
  }
  return workerPromise;
}

export const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** Validates the bytes really are an image of a sane size (not just the declared MIME type). */
export async function validateImage(buffer: Buffer): Promise<sharp.Metadata> {
  let meta: sharp.Metadata;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    throw new AppError(400, 'INVALID_IMAGE', 'The uploaded file is not a readable image.');
  }
  if (!meta.format || !['jpeg', 'png', 'webp'].includes(meta.format)) {
    throw new AppError(400, 'INVALID_IMAGE', 'Only JPEG, PNG or WebP images are supported.');
  }
  if (!meta.width || !meta.height || meta.width < 200 || meta.height < 100) {
    throw new AppError(400, 'IMAGE_TOO_SMALL', 'The image is too small to read. Take a closer, sharper photo of the label.');
  }
  return meta;
}

/** Preprocessing: honour EXIF rotation, grayscale, upscale small text, stretch contrast, sharpen. */
export async function preprocess(buffer: Buffer): Promise<Buffer> {
  const meta = await sharp(buffer).metadata();
  const width = meta.width ?? 1000;
  const targetWidth = width < 1400 ? 1800 : Math.min(width, 2600);
  return sharp(buffer)
    .rotate()
    .resize({ width: targetWidth, withoutEnlargement: false })
    .grayscale()
    .normalise()
    .sharpen()
    .png()
    .toBuffer();
}

export async function runOcr(buffer: Buffer) {
  await validateImage(buffer);
  const processed = await preprocess(buffer);
  let worker: Worker;
  try {
    worker = await getWorker();
  } catch {
    throw new AppError(
      503,
      'OCR_UNAVAILABLE',
      'The OCR engine could not start (its language model may not be downloaded yet). Enter the values manually or see docs/OCR.md.',
    );
  }
  const started = Date.now();
  const { data } = await worker.recognize(processed);
  const text = data.text ?? '';
  const parsed = parseLabelText(text);
  if (text.trim().length < 15) {
    parsed.warnings.unshift('Very little text was recognised. Try a sharper, well-lit photo taken straight on.');
  }
  if ((data.confidence ?? 0) < 60) {
    parsed.warnings.unshift(`Low OCR confidence (${Math.round(data.confidence ?? 0)}%). Check every value carefully.`);
  }
  return {
    engine: 'tesseract.js (eng)',
    ocrConfidence: Math.round(data.confidence ?? 0),
    durationMs: Date.now() - started,
    rawText: text,
    ...parsed,
    reviewRequired: true,
    dataKind: 'ocr_extracted_unverified' as const,
  };
}

export async function shutdownOcr() {
  if (workerPromise) {
    const w = await workerPromise.catch(() => null);
    await w?.terminate();
    workerPromise = null;
  }
}
