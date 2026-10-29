import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/lib/prisma.js';
import { FIXTURES, resetDatabase, testBarcode } from './fixtures.js';

const app = createApp();
const api = () => request(app);

async function register(email: string) {
  const res = await api().post('/api/auth/register').send({ email, password: 'Passw0rd!test' });
  expect(res.status).toBe(201);
  return res.body.data.token as string;
}

beforeAll(async () => {
  await resetDatabase();
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe('health and reference data', () => {
  it('reports database ok and ML unavailable (no service in tests)', async () => {
    const res = await api().get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ database: 'ok', ml: { status: 'unavailable' }, assistant: 'deterministic' });
  });
  it('lists categories with product counts', async () => {
    const res = await api().get('/api/categories');
    const biscuits = res.body.data.find((c: { slug: string }) => c.slug === 'biscuits-cookies');
    expect(biscuits).toMatchObject({ productCount: 5, ratedCount: 5, inrClass: 'SOLID' });
  });
  it('exposes the stored INR thresholds that match the engine config', async () => {
    const rows = await prisma.categoryThreshold.count();
    expect(rows).toBe(10 + 25 + 20 + 25 + 10 + 10 + 10 + 15 + 10 + 10 + 10 + 15);
    const res = await api().get('/api/scoring/methodology');
    expect(res.body.data.version).toBe('INR-FSSAI-DRAFT-2022-v1');
  });
});

describe('product lookup', () => {
  it.each([
    [1, 1.5, 'RATED', 18],
    [2, 3, 'RATED', 5],
    [3, 5, 'RATED', -12],
    [4, 3.5, 'RATED', 0],
    [5, 4, 'PARTIAL', -4],
    [6, 1.5, 'RATED', 16],
  ])('fixture %d -> %d stars (%s, final %d)', async (n, stars, status, finalScore) => {
    const res = await api().get(`/api/products/${testBarcode(n)}`);
    expect(res.status).toBe(200);
    expect(res.body.data.inr).toMatchObject({ stars, status, finalScore });
  });
  it('returns nutrition with basis, source and missing fields', async () => {
    const res = await api().get(`/api/products/${testBarcode(5)}`);
    expect(res.body.data.nutrition.basisLabel).toBe('per 100 g');
    expect(res.body.data.nutrition.missing).toContain('Dietary fibre');
    expect(res.body.data.nutrition.values.fiberG).toBeNull();
    expect(res.body.data.source.label).toBe('Open Food Facts');
    expect(res.body.data.inr.explanation.summary.join(' ')).toMatch(/partial/);
  });
  it('rejects an invalid barcode with 400', async () => {
    const res = await api().get('/api/products/2000000000019');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_BARCODE');
  });
  it('returns an honest 404 for a valid but unknown barcode', async () => {
    const res = await api().get(`/api/products/${testBarcode(999)}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({ code: 'PRODUCT_NOT_FOUND', details: { canSubmit: true } });
  });
  it('finds a barcode-less product by id and reports insufficient data', async () => {
    const p = await prisma.product.findUniqueOrThrow({ where: { sourceRef: 'test-legacy:7' } });
    const res = await api().get(`/api/products/${p.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.inr).toMatchObject({ status: 'INSUFFICIENT_DATA', stars: null });
    expect(res.body.data.barcode).toBeNull();
  });
});

describe('search and categories', () => {
  it('searches by name with pagination meta', async () => {
    const res = await api().get('/api/products/search?q=test&pageSize=3');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.meta).toMatchObject({ page: 1, pageSize: 3, total: 7, totalPages: 3 });
  });
  it('searches by brand and escapes LIKE wildcards', async () => {
    expect((await api().get('/api/products/search?q=Test%20Brand')).body.meta.total).toBe(7);
    expect((await api().get('/api/products/search?q=%25')).body.meta.total).toBe(0);
  });
  it('sorts a category by rating, highest first', async () => {
    const res = await api().get('/api/categories/biscuits-cookies/products');
    const stars = res.body.data.map((p: { inr: { stars: number } }) => p.inr.stars);
    expect(stars).toEqual([5, 4, 3.5, 3, 1.5]);
  });
  it('sorts by sugar ascending and validates sort keys', async () => {
    const res = await api().get('/api/products/search?q=test&sort=sugar&order=asc');
    const sugars = res.body.data.map((p: { keyNutrients: { sugarsG: number } }) => p.keyNutrients.sugarsG);
    expect(sugars).toEqual([...sugars].sort((a, b) => a - b));
    expect((await api().get('/api/products/search?sort=price')).status).toBe(400);
  });
});

describe('healthier alternatives (thesis 4.8)', () => {
  it('returns only same-category, strictly higher-rated, fully rated products with reasons', async () => {
    const res = await api().get(`/api/products/${testBarcode(1)}/alternatives`);
    const alts = res.body.data.alternatives;
    expect(alts.map((a: { name: string }) => a.name)).toEqual(['Test Millet Cracker', 'Test Egg Cookie', 'Test Oat Digestive']);
    for (const a of alts) {
      expect(a.inr.stars).toBeGreaterThan(1.5);
      expect(a.reasons[0]).toMatch(/Higher INR rating/);
    }
    expect(alts[0].reasons[1]).toMatch(/less sugar \(2 g vs 32 g per 100 g\)/);
  });
  it('includes partial ratings only when asked', async () => {
    const res = await api().get(`/api/products/${testBarcode(1)}/alternatives?includePartial=true&limit=10`);
    expect(res.body.data.alternatives.map((a: { name: string }) => a.name)).toContain('Test Partial Biscuit');
  });
  it('returns an explanation, not fabricated products, when nothing rates higher', async () => {
    const res = await api().get(`/api/products/${testBarcode(3)}/alternatives`);
    expect(res.body.data.alternatives).toEqual([]);
    expect(res.body.data.message).toMatch(/No product/);
  });
  it('applies vegetarian and excluded-ingredient preferences for a logged-in user', async () => {
    const token = await register('prefs@test.local');
    await api().put('/api/preferences').set('Authorization', `Bearer ${token}`).send({ vegetarian: true, excludedIngredients: ['Palm'] }).expect(200);
    const res = await api().get(`/api/products/${testBarcode(1)}/alternatives`).set('Authorization', `Bearer ${token}`);
    expect(res.body.data.alternatives.map((a: { name: string }) => a.name)).toEqual(['Test Millet Cracker']);
    expect(res.body.data.excluded).toMatchObject({ nonVegetarian: 1, excludedIngredient: 1 });
    // Preferences never change the INR rating itself.
    const detail = await api().get(`/api/products/${testBarcode(1)}`).set('Authorization', `Bearer ${token}`);
    expect(detail.body.data.inr.stars).toBe(1.5);
    expect(detail.body.data.personal.checks.find((c: { preference: string }) => c.preference === 'excludedIngredients').status).toBe('does_not_meet');
  });
});

describe('comparison (thesis 4.9)', () => {
  it('compares two solid products and summarises with evidence', async () => {
    const res = await api().post('/api/compare').send({ products: [testBarcode(1), testBarcode(2)] });
    expect(res.status).toBe(200);
    expect(res.body.data.comparable).toBe(true);
    const sugar = res.body.data.rows.find((r: { key: string }) => r.key === 'sugarsG');
    expect(sugar.values).toEqual([32, 12]);
    expect(sugar.bestIndexes).toEqual([1]);
    expect(res.body.data.summary.join(' ')).toMatch(/Test Oat Digestive has the higher INR rating \(3 stars\)/);
    expect(res.body.data.summary.join(' ')).toMatch(/Test Oat Digestive has less sugar than Test Choco Cream Biscuit \(12 vs 32 g per 100 g\)/);
  });
  it('does not highlight differences across different bases', async () => {
    const res = await api().post('/api/compare').send({ barcodes: [testBarcode(1), testBarcode(6)] });
    expect(res.body.data.comparable).toBe(false);
    expect(res.body.data.rows.every((r: { bestIndexes: number[] }) => r.bestIndexes.length === 0)).toBe(true);
  });
  it('validates the request', async () => {
    expect((await api().post('/api/compare').send({ products: [testBarcode(1)] })).status).toBe(400);
  });
});

describe('authentication and authorisation', () => {
  let tokenA: string;
  let tokenB: string;
  beforeAll(async () => {
    tokenA = await register('alice@test.local');
    tokenB = await register('bob@test.local');
  });

  it('stores a bcrypt hash, never the password', async () => {
    const u = await prisma.user.findUniqueOrThrow({ where: { email: 'alice@test.local' } });
    expect(u.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    expect(u.passwordHash).not.toContain('Passw0rd');
  });
  it('rejects duplicate emails and weak passwords', async () => {
    expect((await api().post('/api/auth/register').send({ email: 'alice@test.local', password: 'Passw0rd!test' })).status).toBe(409);
    expect((await api().post('/api/auth/register').send({ email: 'x@test.local', password: 'short' })).status).toBe(400);
  });
  it('logs in and rejects wrong credentials with the same message', async () => {
    const ok = await api().post('/api/auth/login').send({ email: 'ALICE@test.local', password: 'Passw0rd!test' });
    expect(ok.status).toBe(200);
    const wrong = await api().post('/api/auth/login').send({ email: 'alice@test.local', password: 'nope' });
    const unknown = await api().post('/api/auth/login').send({ email: 'nobody@test.local', password: 'nope' });
    expect(wrong.status).toBe(401);
    expect(unknown.body.error.message).toBe(wrong.body.error.message);
  });
  it('protects private endpoints', async () => {
    expect((await api().get('/api/history')).status).toBe(401);
    expect((await api().get('/api/history').set('Authorization', 'Bearer garbage')).status).toBe(401);
  });
  it('keeps history, favourites and preferences per user', async () => {
    const h = await api().post('/api/history').set('Authorization', `Bearer ${tokenA}`).send({ barcode: testBarcode(2), method: 'CAMERA' });
    expect(h.status).toBe(201);
    expect((await api().get('/api/history').set('Authorization', `Bearer ${tokenB}`)).body.data).toHaveLength(0);
    // Bob cannot delete Alice's entry.
    expect((await api().delete(`/api/history/${h.body.data.id}`).set('Authorization', `Bearer ${tokenB}`)).status).toBe(404);
    expect((await api().get('/api/history').set('Authorization', `Bearer ${tokenA}`)).body.data).toHaveLength(1);
  });
  it('invalidates tokens after logout-all', async () => {
    const t = (await api().post('/api/auth/login').send({ email: 'bob@test.local', password: 'Passw0rd!test' })).body.data.token;
    await api().post('/api/auth/logout-all').set('Authorization', `Bearer ${t}`).expect(204);
    expect((await api().get('/api/me').set('Authorization', `Bearer ${t}`)).status).toBe(401);
  });
});

describe('favourites, history and preferences persist', () => {
  let token: string;
  beforeAll(async () => {
    token = await register('carol@test.local');
  });
  it('adds, lists and removes favourites', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    await api().post('/api/favorites').set(auth).send({ barcode: testBarcode(3) }).expect(201);
    await api().post('/api/favorites').set(auth).send({ barcode: testBarcode(3) }).expect(201); // idempotent
    const list = await api().get('/api/favorites').set(auth);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].product.name).toBe('Test Millet Cracker');
    await api().delete(`/api/favorites/${testBarcode(3)}`).set(auth).expect(204);
    expect((await api().get('/api/favorites').set(auth)).body.data).toHaveLength(0);
  });
  it('persists preferences and validates them', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    await api().put('/api/preferences').set(auth).send({ lowSugar: true, highProtein: true, ageGroup: 'ADULT' }).expect(200);
    const res = await api().get('/api/preferences').set(auth);
    expect(res.body.data).toMatchObject({ lowSugar: true, highProtein: true, ageGroup: 'ADULT', vegetarian: false });
    expect((await api().put('/api/preferences').set(auth).send({ ageGroup: 'BABY' })).status).toBe(400);
  });
  it('clears history', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    await api().post('/api/history').set(auth).send({ barcode: testBarcode(1) }).expect(201);
    expect((await api().delete('/api/history').set(auth)).body.data.deleted).toBe(1);
  });
  it('deletes the account and all personal data', async () => {
    const t = await register('dave@test.local');
    const auth = { Authorization: `Bearer ${t}` };
    await api().post('/api/favorites').set(auth).send({ barcode: testBarcode(2) }).expect(201);
    await api().delete('/api/me').set(auth).expect(204);
    expect(await prisma.user.findUnique({ where: { email: 'dave@test.local' } })).toBeNull();
    expect(await prisma.favorite.count({ where: { user: { email: 'dave@test.local' } } })).toBe(0);
  });
});

describe('missing-product submissions', () => {
  it('accepts a guest submission without adding it to the product database', async () => {
    const before = await prisma.product.count();
    const res = await api()
      .post('/api/submissions')
      .send({ barcode: testBarcode(500), name: 'New Snack', brand: 'Somebrand', nutrition: { basis: 'PER_100G', energyKcal: 500, sugarsG: 5 } });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('PENDING');
    expect(await prisma.product.count()).toBe(before);
  });
  it('validates barcode, required fields and plausibility', async () => {
    expect((await api().post('/api/submissions').send({ barcode: '2000000000019', name: 'X product' })).body.error.code).toBe('INVALID_BARCODE');
    expect((await api().post('/api/submissions').send({ brand: 'no name' })).status).toBe(400);
    expect((await api().post('/api/submissions').send({ name: 'Weird', nutrition: { carbohydratesG: 10, sugarsG: 20 } })).status).toBe(422);
  });
});

describe('OCR review analysis, ML and assistant', () => {
  it('scores user-reviewed values without saving them', async () => {
    const res = await api()
      .post('/api/ocr/analyze')
      .send({ categorySlug: 'biscuits-cookies', basis: 'PER_100G', energyKcal: 300, fatG: 10, saturatedFatG: 3.5, carbohydratesG: 50, sugarsG: 5, fiberG: 4, proteinG: 8, sodiumMg: 400 });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ dataKind: 'ocr_extracted_user_reviewed', inr: { stars: 3, finalScore: 4, baselinePoints: 11, positivePoints: 7 } });
    expect(res.body.data.ml.status).toBe('unavailable');
  });
  it('rejects implausible reviewed values', async () => {
    const res = await api().post('/api/ocr/analyze').send({ categorySlug: null, basis: 'PER_100G', energyKcal: 950, fatG: null, saturatedFatG: null, carbohydratesG: null, sugarsG: null, fiberG: null, proteinG: null, sodiumMg: null });
    expect(res.status).toBe(422);
  });
  it('requires an image for OCR', async () => {
    expect((await api().post('/api/ocr/label')).status).toBe(400);
  });
  it('reports the ML estimate as unavailable rather than inventing one', async () => {
    const res = await api().get(`/api/products/${testBarcode(1)}/ml`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('unavailable');
  });
  it('answers from database facts without an LLM', async () => {
    const res = await api().post('/api/assistant/ask').send({ product: testBarcode(1), question: 'Why did this product get this rating?' });
    expect(res.body.data).toMatchObject({ intent: 'why_rating', provider: 'deterministic', grounded: true });
    expect(res.body.data.answer).toMatch(/1.5 out of 5 stars \(final score 18\)/);
  });
  it('compares on a nutrient when a second product is given', async () => {
    const res = await api().post('/api/assistant/ask').send({ product: testBarcode(1), compareWith: testBarcode(2), question: 'Which has less sugar?' });
    expect(res.body.data.answer).toMatch(/Test Oat Digestive has less sugar: 12 vs 32 g per 100 g/);
  });
  it('declines medical questions', async () => {
    const res = await api().post('/api/assistant/ask').send({ product: testBarcode(1), question: 'Is this safe for my diabetic mother?' });
    expect(res.body.data.intent).toBe('medical');
    expect(res.body.data.answer).toMatch(/can't tell you whether a product is safe/);
  });
});

describe('end-to-end scan workflow', () => {
  it('lookup -> nutrition -> INR -> alternatives -> compare -> history', async () => {
    const token = await register('e2e@test.local');
    const auth = { Authorization: `Bearer ${token}` };
    const barcode = testBarcode(1);
    const fixture = FIXTURES[0];

    const product = await api().get(`/api/products/${barcode}`).set(auth).expect(200);
    expect(product.body.data.name).toBe(fixture.name);
    expect(product.body.data.nutrition.values.sugarsG).toBe(fixture.nutrition.sugarsG);
    expect(product.body.data.inr.stars).toBe(1.5);

    const alts = await api().get(`/api/products/${barcode}/alternatives`).set(auth).expect(200);
    const best = alts.body.data.alternatives[0];
    expect(best.inr.stars).toBeGreaterThan(1.5);

    const cmp = await api().post('/api/compare').set(auth).send({ products: [barcode, best.id] }).expect(200);
    expect(cmp.body.data.products.map((p: { name: string }) => p.name)).toEqual([fixture.name, best.name]);

    await api().post('/api/history').set(auth).send({ barcode, method: 'CAMERA' }).expect(201);
    const history = await api().get('/api/history').set(auth).expect(200);
    expect(history.body.data[0]).toMatchObject({ method: 'CAMERA', product: { barcode } });
  });
});
