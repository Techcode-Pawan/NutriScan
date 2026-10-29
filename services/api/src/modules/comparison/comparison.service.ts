import { basisLabel, nutritionValues, productSummary, type ProductWithRelations } from '../products/product.service.js';
import { num } from '../scoring/score-product.js';
import { meaningfulDiff, NUTRIENTS } from './nutrient-diff.js';

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/**
 * Thesis section 4.9: aligns two or more products, computes per-nutrient differences and a short
 * evidence-based summary. Differences are highlighted only when the measurement bases match.
 */
export function compareProducts(products: ProductWithRelations[], mlByProduct: Map<string, { predictedGrade: string; mlIndex: number } | null> = new Map()) {
  const bases = new Set(products.map((p) => p.nutrition?.basis ?? 'UNKNOWN'));
  const comparable = bases.size === 1 && !bases.has('UNKNOWN');
  const values = products.map((p) => nutritionValues(p));

  const rows = NUTRIENTS.map((n) => {
    const vals = values.map((v) => (v ? v[n.key] : null));
    let best: number[] = [];
    if (comparable && n.better && vals.filter((v) => v !== null).length >= 2) {
      const present = vals.map((v, i) => ({ v, i })).filter((x) => x.v !== null) as Array<{ v: number; i: number }>;
      const target = n.better === 'lower' ? Math.min(...present.map((x) => x.v)) : Math.max(...present.map((x) => x.v));
      const others = present.filter((x) => x.v !== target);
      // Only highlight when the best value differs meaningfully from at least one other.
      if (others.some((o) => (meaningfulDiff(target, o.v, n.minDiff) ?? 0) !== 0)) best = present.filter((x) => x.v === target).map((x) => x.i);
    }
    return { key: n.key, label: n.label, unit: n.unit, betterWhen: n.better, values: vals, bestIndexes: best };
  });

  const ratings = products.map((p) => num(p.healthScore?.starRating));
  const summary: string[] = [];
  const names = products.map((p) => p.name);
  if (!comparable) {
    summary.push(
      bases.has('UNKNOWN')
        ? 'At least one product has an unknown measurement basis, so nutrient values cannot be compared reliably.'
        : 'These products use different measurement bases (per 100 g vs per 100 ml), so nutrient differences are not highlighted.',
    );
  }
  const rated = ratings.map((r, i) => ({ r, i })).filter((x) => x.r !== null) as Array<{ r: number; i: number }>;
  if (rated.length >= 2) {
    const top = Math.max(...rated.map((x) => x.r));
    const leaders = rated.filter((x) => x.r === top);
    if (leaders.length === rated.length) summary.push(`All rated products have the same INR rating (${top} stars).`);
    else summary.push(`${leaders.map((l) => names[l.i]).join(' and ')} ${leaders.length > 1 ? 'have' : 'has'} the higher INR rating (${top} stars).`);
  } else if (rated.length < products.length) {
    summary.push('Not every product has an INR rating, so the ratings cannot be fully compared.');
  }
  if (comparable && products.length === 2) {
    const [a, b] = values;
    const basis = basisLabel(products[0].nutrition?.basis);
    for (const n of NUTRIENTS) {
      if (!n.better || !a || !b) continue;
      const d = meaningfulDiff(a[n.key], b[n.key], n.minDiff);
      if (d === null || d === 0) continue;
      const lowerName = d < 0 ? names[0] : names[1];
      const higherName = d < 0 ? names[1] : names[0];
      summary.push(
        `${lowerName} has less ${n.label.toLowerCase()} than ${higherName} (${fmt(Math.min(a[n.key]!, b[n.key]!))} vs ${fmt(Math.max(a[n.key]!, b[n.key]!))} ${n.unit} ${basis}).`,
      );
    }
    summary.push('A single nutrient does not make a product healthier overall; consider the whole profile and the INR rating.');
  }

  return {
    comparable,
    basis: comparable ? basisLabel(products[0].nutrition?.basis) : null,
    products: products.map((p, i) => ({
      ...productSummary(p),
      ingredientsText: p.ingredientsText,
      inr: { status: p.healthScore?.status ?? 'INSUFFICIENT_DATA', stars: ratings[i], finalScore: p.healthScore?.finalScore ?? null },
      ml: mlByProduct.get(p.id) ?? null,
      dataCompleteness: p.nutrition?.completeness ?? 0,
    })),
    rows,
    summary,
  };
}
