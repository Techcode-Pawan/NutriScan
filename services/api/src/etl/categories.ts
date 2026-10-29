import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type InrClassValue = 'SOLID' | 'LIQUID' | 'EXEMPT' | null;

export interface CategoryDef {
  slug: string;
  name: string;
  inrClass: InrClassValue;
  isBeverage: boolean;
  description?: string;
  /** Data-quality guard: lower energy per 100 g signals per-serving / as-prepared values. */
  minPlausibleEnergyKcal?: number;
}

interface MappingFile {
  version: string;
  categories: CategoryDef[];
  offTagRules: Array<{ category: string; tags: string[] }>;
  nameRules: Array<{ category: string; pattern: string }>;
  legacyRules: Array<{ category: string; legacyCategory: string; subcategories?: string[]; namePattern?: string }>;
}

export type CategoryMethod = 'source_tag' | 'legacy_mapping' | 'name_keyword';

const here = path.dirname(fileURLToPath(import.meta.url));
export const MAPPING_PATH = path.resolve(here, '../../../../data/import/category_mapping.json');

let cached: MappingFile | null = null;
export function loadMapping(): MappingFile {
  if (!cached) cached = JSON.parse(readFileSync(MAPPING_PATH, 'utf-8')) as MappingFile;
  return cached;
}

export function categoryBySlug(slug: string): CategoryDef | undefined {
  return loadMapping().categories.find((c) => c.slug === slug);
}

function byName(name: string): string | null {
  for (const rule of loadMapping().nameRules) {
    if (new RegExp(rule.pattern, 'i').test(name)) return rule.category;
  }
  return null;
}

export function resolveOffCategory(tags: string[] | undefined, name: string): { slug: string | null; method: CategoryMethod | null } {
  const tagSet = new Set(tags ?? []);
  for (const rule of loadMapping().offTagRules) {
    if (rule.tags.some((t) => tagSet.has(t))) return { slug: rule.category, method: 'source_tag' };
  }
  const slug = byName(name);
  return { slug, method: slug ? 'name_keyword' : null };
}

export function resolveLegacyCategory(
  legacyCategory: string,
  subcategory: string,
  name: string,
): { slug: string | null; method: CategoryMethod | null } {
  const cat = legacyCategory.trim().toUpperCase();
  const sub = subcategory.trim().toUpperCase();
  for (const rule of loadMapping().legacyRules) {
    if (rule.legacyCategory !== cat) continue;
    if (rule.subcategories && !rule.subcategories.map((s) => s.trim().toUpperCase()).includes(sub)) continue;
    if (rule.namePattern && !new RegExp(rule.namePattern, 'i').test(name)) continue;
    return { slug: rule.category, method: 'legacy_mapping' };
  }
  const slug = byName(name);
  return { slug, method: slug ? 'name_keyword' : null };
}
