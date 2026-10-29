import path from 'node:path';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { shutdownOcr } from '../../src/modules/ocr/ocr.service.js';

/**
 * Real OCR through Tesseract. Opt-in (RUN_OCR_TESTS=1) because the first run downloads the
 * English language model (~10 MB) and recognition takes a few seconds.
 */
describe.skipIf(!process.env.RUN_OCR_TESTS)('OCR pipeline (real Tesseract)', () => {
  afterAll(async () => {
    await shutdownOcr();
  });

  it('extracts nutrition values and ingredients from a label image', async () => {
    const res = await request(createApp())
      .post('/api/ocr/label')
      .attach('image', path.join(import.meta.dirname, '../fixtures/sample-label.jpg'));
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.basis).toBe('PER_100G');
    expect(d.fields.energyKcal.value).toBe(472);
    expect(d.fields.sugarsG.value).toBe(32.5);
    expect(d.fields.saturatedFatG.value).toBe(9.4);
    expect(d.fields.sodiumMg.value).toBe(250);
    expect(d.ingredientsText).toMatch(/Refined wheat flour/);
    expect(d.reviewRequired).toBe(true);
  }, 120000);

  it('rejects files that are not images', async () => {
    const res = await request(createApp()).post('/api/ocr/label').attach('image', Buffer.from('not an image'), { filename: 'x.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_IMAGE');
  });
});
