/**
 * Reproducible ETL (thesis chapter 3): loads the legacy CSV and the latest Open Food Facts
 * snapshot, validates and normalises every record, removes duplicates, and writes
 *   data/processed/products.jsonl        cleaned records ready for import
 *   data/processed/rejected.jsonl        rejected records with reasons
 *   data/processed/quality_report.json   machine-readable statistics (thesis Table 3.3)
 *   data/processed/quality_report.md     human-readable data-quality report
 *   data/import/sample_products.jsonl    small real-record subset for quick setup and tests
 *
 * Usage: npm run etl [-- --off <snapshot.jsonl>]
 */
import { parse } from 'csv-parse/sync';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '../config/paths.js';
import { categoryBySlug, loadMapping } from '../etl/categories.js';
import {
  completeness,
  dedupe,
  normalizeLegacyRow,
  normalizeOffProduct,
  type LegacyRow,
  type NormalizedProduct,
  type OffProduct,
} from '../etl/normalize.js';
import { scoreNutrition } from '../modules/scoring/score-product.js';

const args = process.argv.slice(2);
const argValue = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

function latestOffSnapshot(): string | null {
  const dir = path.join(DATA_DIR, 'raw', 'off');
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter((f) => /^off_.*\.jsonl$/.test(f) && !f.includes('.ingredients'))
    .sort();
  return files.length ? path.join(dir, files[files.length - 1]) : null;
}

function readJsonl<T>(file: string): T[] {
  return readFileSync(file, 'utf-8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as T);
}

const pct = (n: number, d: number) => (d === 0 ? '0%' : `${((n / d) * 100).toFixed(1)}%`);

function main() {
  const csvPath = argValue('--csv') ?? path.join(DATA_DIR, 'raw', 'packaged_foods_india.csv');
  const offPath = argValue('--off') ?? latestOffSnapshot();
  const outDir = path.join(DATA_DIR, 'processed');
  mkdirSync(outDir, { recursive: true });

  const rejected: Array<{ source: string; sourceRef: string; reason: string }> = [];

  // ---- Legacy CSV -----------------------------------------------------------------------
  const csvRows = parse(readFileSync(csvPath), { columns: true, bom: true, skip_empty_lines: true, relax_column_count: true }) as LegacyRow[];
  const legacyOk: NormalizedProduct[] = [];
  for (const row of csvRows) {
    const r = normalizeLegacyRow(row);
    if (r.ok) legacyOk.push(r.product);
    else rejected.push({ source: 'LEGACY_CSV', sourceRef: r.sourceRef, reason: r.reason });
  }
  const legacyDedup = dedupe(legacyOk, (p) => `${p.name.toLowerCase()}|${(p.brand ?? '').toLowerCase()}`);
  for (const d of legacyDedup.dropped) rejected.push({ source: 'LEGACY_CSV', sourceRef: d.sourceRef, reason: `duplicate of ${d.keptRef}` });

  // ---- Open Food Facts ------------------------------------------------------------------
  let offRaw: OffProduct[] = [];
  let offMeta: unknown = null;
  let enrichedCount = 0;
  const offOk: NormalizedProduct[] = [];
  if (offPath && existsSync(offPath)) {
    offRaw = readJsonl<OffProduct>(offPath);
    const metaPath = offPath.replace('.jsonl', '.meta.json');
    if (existsSync(metaPath)) offMeta = JSON.parse(readFileSync(metaPath, 'utf-8'));
    const enrichPath = offPath.replace('.jsonl', '.ingredients.jsonl');
    const enrich = new Map<string, { ingredients_text: string | null; image_front_small_url: string | null }>();
    if (existsSync(enrichPath)) {
      for (const e of readJsonl<{ code: string; ingredients_text: string | null; image_front_small_url: string | null }>(enrichPath)) {
        enrich.set(String(e.code), e);
      }
    }
    for (const p of offRaw) {
      const e = enrich.get(String(p.code));
      if (e) {
        enrichedCount += 1;
        p.ingredients_text = p.ingredients_text ?? e.ingredients_text;
        p.image_front_small_url = p.image_front_small_url ?? e.image_front_small_url;
      }
      const r = normalizeOffProduct(p);
      if (r.ok) offOk.push(r.product);
      else rejected.push({ source: 'OPEN_FOOD_FACTS', sourceRef: r.sourceRef, reason: r.reason });
    }
  } else {
    console.warn('No Open Food Facts snapshot found; run `python etl/fetch_off.py` first. Continuing with the CSV only.');
  }
  const offDedup = dedupe(offOk, (p) => p.barcode!);
  for (const d of offDedup.dropped) rejected.push({ source: 'OPEN_FOOD_FACTS', sourceRef: d.sourceRef, reason: `duplicate barcode, kept ${d.keptRef}` });

  const products = [...offDedup.kept, ...legacyDedup.kept];

  // ---- Statistics (thesis Table 3.3) --------------------------------------------------------
  const statusCounts: Record<string, number> = {};
  const byCategory: Record<string, { total: number; rated: number }> = {};
  const flagCounts: Record<string, number> = {};
  const fieldMissing: Record<string, number> = {};
  for (const p of products) {
    const cat = p.categorySlug ? categoryBySlug(p.categorySlug) : undefined;
    const s = scoreNutrition(p.nutrition, cat ? { inrClass: cat.inrClass, isBeverage: cat.isBeverage } : null);
    statusCounts[s.result.status] = (statusCounts[s.result.status] ?? 0) + 1;
    const key = p.categorySlug ?? '(unmapped)';
    byCategory[key] ??= { total: 0, rated: 0 };
    byCategory[key].total += 1;
    if (s.result.stars !== null) byCategory[key].rated += 1;
    for (const f of p.qualityFlags) {
      const base = f.split(':')[0];
      flagCounts[base] = (flagCounts[base] ?? 0) + 1;
    }
    for (const [k, v] of Object.entries(p.nutrition)) if (v === null) fieldMissing[k] = (fieldMissing[k] ?? 0) + 1;
  }

  const rawTotal = csvRows.length + offRaw.length;
  const barcodeRejected = rejected.filter((r) => r.reason.startsWith('invalid barcode')).length;
  const dupes = rejected.filter((r) => r.reason.startsWith('duplicate')).length;
  const implausible = rejected.filter((r) => r.reason.startsWith('implausible')).length;
  const noName = rejected.filter((r) => r.reason === 'no usable name').length;
  const mapped = products.filter((p) => p.categorySlug).length;
  const full = statusCounts.RATED ?? 0;
  const partial = statusCounts.PARTIAL ?? 0;
  const noScore = products.length - full - partial;

  const report = {
    generatedAt: new Date().toISOString(),
    mappingVersion: loadMapping().version,
    sources: {
      legacyCsv: { file: path.relative(DATA_DIR, csvPath), rows: csvRows.length, kept: legacyDedup.kept.length },
      openFoodFacts: offPath
        ? { file: path.relative(DATA_DIR, offPath), rows: offRaw.length, kept: offDedup.kept.length, ingredientsEnriched: enrichedCount, meta: offMeta }
        : null,
    },
    table3_3: {
      rawRecords: rawTotal,
      afterBarcodeValidationAndDedup: rawTotal - barcodeRejected - dupes - noName,
      afterPlausibilityChecks: products.length,
      mappedToPrimaryCategory: mapped,
      allCoreNutrients_fullScore: full,
      fibreOrProteinMissing_partialScore: partial,
      noScore,
    },
    rejections: { invalidBarcode: barcodeRejected, duplicates: dupes, implausible, noUsableName: noName, total: rejected.length },
    inrStatus: statusCounts,
    byCategory,
    qualityFlags: flagCounts,
    missingFieldCounts: fieldMissing,
    averageCompleteness: Number((products.reduce((s, p) => s + completeness(p.nutrition), 0) / Math.max(products.length, 1)).toFixed(3)),
  };

  writeFileSync(path.join(outDir, 'products.jsonl'), products.map((p) => JSON.stringify(p)).join('\n') + '\n');
  writeFileSync(path.join(outDir, 'rejected.jsonl'), rejected.map((r) => JSON.stringify(r)).join('\n') + '\n');
  writeFileSync(path.join(outDir, 'quality_report.json'), JSON.stringify(report, null, 2));
  writeFileSync(path.join(outDir, 'quality_report.md'), renderMarkdown(report, products.length));

  // ---- Sample development dataset: real records, a few per category --------------------
  const sample: NormalizedProduct[] = [];
  const perCat = new Map<string, number>();
  for (const p of [...offDedup.kept].sort((a, b) => a.sourceRef.localeCompare(b.sourceRef))) {
    const key = p.categorySlug ?? 'none';
    if ((perCat.get(key) ?? 0) >= 4 || p.categorySlug === null) continue;
    perCat.set(key, (perCat.get(key) ?? 0) + 1);
    sample.push(p);
  }
  sample.push(...legacyDedup.kept.slice(0, 12));
  mkdirSync(path.join(DATA_DIR, 'import'), { recursive: true });
  writeFileSync(path.join(DATA_DIR, 'import', 'sample_products.jsonl'), sample.map((p) => JSON.stringify(p)).join('\n') + '\n');

  console.log(JSON.stringify(report.table3_3, null, 2));
  console.log(`rejected ${rejected.length}; wrote ${products.length} products and ${sample.length} sample records`);

  function renderMarkdown(r: typeof report, total: number): string {
    const t = r.table3_3;
    const lines = [
      '# NutriScan data-quality report',
      '',
      `Generated ${r.generatedAt} by \`npm run etl\` (category mapping version ${r.mappingVersion}).`,
      '',
      '## Summary (thesis Table 3.3)',
      '',
      '| Measure | Value |',
      '|---|---|',
      `| Raw records (CSV + OFF snapshot) | ${t.rawRecords} |`,
      `| Records after barcode validation and de-duplication | ${t.afterBarcodeValidationAndDedup} |`,
      `| Records after plausibility checks | ${t.afterPlausibilityChecks} |`,
      `| Records mapped to a primary category | ${t.mappedToPrimaryCategory} (${pct(t.mappedToPrimaryCategory, total)}) |`,
      `| Records with all core nutrients (full INR score) | ${t.allCoreNutrients_fullScore} (${pct(t.allCoreNutrients_fullScore, total)}) |`,
      `| Records with fibre or protein missing (partial score) | ${t.fibreOrProteinMissing_partialScore} (${pct(t.fibreOrProteinMissing_partialScore, total)}) |`,
      `| Records without a score (missing data, exempt, unmapped, basis unknown) | ${t.noScore} (${pct(t.noScore, total)}) |`,
      '',
      '## Sources',
      '',
      `* Legacy CSV \`${r.sources.legacyCsv.file}\`: ${r.sources.legacyCsv.rows} rows, ${r.sources.legacyCsv.kept} kept. Student-collected, provenance largely unrecorded, **no barcodes**; every record is flagged \`unverified_source\`.`,
      r.sources.openFoodFacts
        ? `* Open Food Facts snapshot \`${r.sources.openFoodFacts.file}\`: ${r.sources.openFoodFacts.rows} rows, ${r.sources.openFoodFacts.kept} kept, ${r.sources.openFoodFacts.ingredientsEnriched} enriched with ingredient text. Licence: ODbL 1.0 / DbCL 1.0 (images CC BY-SA). © Open Food Facts contributors.`
        : '* Open Food Facts snapshot: not present.',
      '',
      '## Rejections',
      '',
      `Invalid barcode: ${r.rejections.invalidBarcode} · duplicates: ${r.rejections.duplicates} · implausible values: ${r.rejections.implausible} · no usable name: ${r.rejections.noUsableName}. Details in \`rejected.jsonl\`.`,
      '',
      '## INR status distribution',
      '',
      '| Status | Products |',
      '|---|---|',
      ...Object.entries(r.inrStatus).map(([k, v]) => `| ${k} | ${v} |`),
      '',
      '## By category',
      '',
      '| Category | Products | With star rating |',
      '|---|---|---|',
      ...Object.entries(r.byCategory)
        .sort((a, b) => b[1].total - a[1].total)
        .map(([k, v]) => `| ${k} | ${v.total} | ${v.rated} |`),
      '',
      '## Quality flags',
      '',
      '| Flag | Records |',
      '|---|---|',
      ...Object.entries(r.qualityFlags)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `| \`${k}\` | ${v} |`),
      '',
      '## Missing values per field (kept as NULL, never imputed)',
      '',
      '| Field | Missing |',
      '|---|---|',
      ...Object.entries(r.missingFieldCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `| ${k} | ${v} |`),
      '',
      `Average nutrition completeness: ${r.averageCompleteness}.`,
      '',
      'This dataset has **not been independently verified** against physical labels.',
      '',
    ];
    return lines.join('\n');
  }
}

main();
