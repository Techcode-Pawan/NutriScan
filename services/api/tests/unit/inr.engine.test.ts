import { describe, expect, it } from 'vitest';
import { INR_CONFIG } from '../../src/modules/scoring/inr.config.js';
import { computeInr, hfssCheck, pointsFor, starsFor, type InrInput } from '../../src/modules/scoring/inr.engine.js';
import { explainInr } from '../../src/modules/scoring/inr.explain.js';

/**
 * Independent transcription of FSSAI draft (13.09.2022) Schedule-III, typed separately from
 * inr.config.ts so that a typo in either place fails these tests.
 * Each array lists the "> x" lower bounds for 1, 2, 3 ... points.
 */
const DRAFT = {
  solid: {
    energyKcal: [80, 160, 240, 320, 400, 480, 560, 640, 720, 800],
    saturatedFatG: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40],
    sugarsG: [4.2, 8.4, 12.6, 16.8, 21, 25.2, 29.4, 33.6, 37.8, 42, 46.2, 50.4, 54.6, 58.8, 63, 67.2, 71.4, 75.6, 79.8, 84],
    sodiumMg: [90, 180, 270, 360, 450, 540, 630, 720, 810, 900, 990, 1080, 1170, 1260, 1350, 1440, 1530, 1620, 1710, 1800, 1890, 1980, 2070, 2160, 2250],
    fruitVegPct: [10, 15, 20, 25, 30, 35, 40, 45, 50, 55],
    nutsLegumesMilletsPct: [10, 15, 20, 25, 30, 35, 40, 45, 50, 55],
    fiberG: [3, 6, 9, 12, 15, 18, 21, 24, 27, 30],
    proteinG: [1.5, 2.0, 2.5, 3.0, 5, 7, 10, 15, 20, 25, 30, 35, 40, 45, 50],
  },
  liquid: {
    energyKcal: [6, 12, 18, 24, 30, 36, 42, 48, 54, 60],
    sugarsG: [0.1, 1.6, 3.1, 4.6, 6.1, 7.6, 9.1, 10.6, 12.1, 13.6],
    fruitVegPct: [5, 10, 15, 20, 25, 30, 35, 40, 45, 55],
    proteinG: [1.5, 2.0, 2.5, 3.0, 5, 7, 10, 15, 20, 25, 30, 35, 40, 45, 50],
  },
} as const;

const solid = (over: Partial<InrInput> = {}): InrInput => ({
  inrClass: 'SOLID',
  basis: 'PER_100G',
  energyKcal: 0,
  saturatedFatG: 0,
  sugarsG: 0,
  sodiumMg: 0,
  fiberG: 0,
  proteinG: 0,
  fruitVegPct: null,
  nutsLegumesMilletsPct: null,
  ...over,
});
const liquid = (over: Partial<InrInput> = {}): InrInput => ({
  ...solid(),
  inrClass: 'LIQUID',
  basis: 'PER_100ML',
  isBeverage: true,
  energyKcal: 1,
  sugarsG: 0.05,
  ...over,
});
const line = (r: ReturnType<typeof computeInr>, f: string) =>
  [...r.baseline, ...r.positive].find((l) => l.factor === f)!;

describe('config matches the draft transcription', () => {
  for (const [cls, tables] of Object.entries(DRAFT)) {
    const cfg = INR_CONFIG.classes[cls === 'solid' ? 'SOLID' : 'LIQUID'];
    for (const [factor, expected] of Object.entries(tables)) {
      it(`${cls} ${factor}`, () => {
        const actual = (cfg.baseline as Record<string, number[]>)[factor] ?? (cfg.positive as Record<string, number[]>)[factor];
        expect(actual).toEqual(expected);
      });
    }
  }
  it('liquid foods have no saturated-fat/sodium baseline and no fibre/NLM positives', () => {
    expect(Object.keys(INR_CONFIG.classes.LIQUID.baseline).sort()).toEqual(['energyKcal', 'sugarsG']);
    expect(Object.keys(INR_CONFIG.classes.LIQUID.positive).sort()).toEqual(['fruitVegPct', 'proteinG']);
  });
});

describe('pointsFor - every threshold boundary', () => {
  for (const [cls, tables] of Object.entries(DRAFT)) {
    for (const [factor, thresholds] of Object.entries(tables)) {
      it(`${cls} ${factor}: value == threshold keeps lower points; just above earns next`, () => {
        (thresholds as readonly number[]).forEach((t: number, i: number) => {
          expect(pointsFor(t, [...thresholds]).points).toBe(i); // "<= t" row
          expect(pointsFor(t + 0.01, [...thresholds]).points).toBe(i + 1); // "> t" row
        });
        expect(pointsFor(0, [...thresholds]).points).toBe(0);
        expect(pointsFor(1e6, [...thresholds]).points).toBe(thresholds.length);
      });
    }
  }
});

describe('star bands', () => {
  const solidExpect: Array<[number, number]> = [
    [-40, 5], [-11, 5], [-10, 4.5], [-7, 4.5], [-6, 4], [-2, 4], [-1, 3.5], [2, 3.5], [3, 3], [6, 3],
    [7, 2.5], [11, 2.5], [12, 2], [15, 2], [16, 1.5], [20, 1.5], [21, 1], [24, 1], [25, 0.5], [70, 0.5],
  ];
  it.each(solidExpect)('solid final score %d -> %d stars (thesis Table 4.7 / draft Table 6)', (score, stars) => {
    expect(starsFor(score, 'SOLID')).toBe(stars);
  });
  const liquidExpect: Array<[number, number]> = [
    [-20, 5], [0, 5], [1, 4.5], [2, 4.5], [3, 4], [4, 4], [5, 3.5], [6, 3.5], [7, 3], [9, 3], [10, 2.5], [12, 2.5],
    [13, 2], [15, 2], [16, 1.5], [18, 1.5], [19, 1], [20, 1], [21, 0.5], [30, 0.5],
  ];
  it.each(liquidExpect)('liquid final score %d -> %d stars (overlaps resolved first-match)', (score, stars) => {
    expect(starsFor(score, 'LIQUID')).toBe(stars);
  });
});

describe('computeInr - worked examples', () => {
  it('reproduces the thesis illustrative example (baseline 11, positive 7, final 4 -> 3 stars)', () => {
    const r = computeInr(solid({ energyKcal: 300, saturatedFatG: 3.5, sugarsG: 5, sodiumMg: 400, fiberG: 4, proteinG: 8 }));
    expect(line(r, 'energyKcal').points).toBe(3);
    expect(line(r, 'saturatedFatG').points).toBe(3);
    expect(line(r, 'sugarsG').points).toBe(1);
    expect(line(r, 'sodiumMg').points).toBe(4);
    expect(r.baselinePoints).toBe(11);
    expect(line(r, 'fiberG').points).toBe(1);
    expect(line(r, 'proteinG').points).toBe(6);
    expect(r.positivePoints).toBe(7);
    expect(r.finalScore).toBe(4);
    expect(r.stars).toBe(3);
    expect(r.status).toBe('RATED');
  });

  it('scores a real dataset row (Parle Hide & Seek, CSV S.No 1) with reduced caps', () => {
    const r = computeInr(solid({ energyKcal: 479, saturatedFatG: 9.4, sugarsG: 32.5, sodiumMg: 114, fiberG: 0, proteinG: 5.9 }));
    // energy >400 -> 5, sat fat >9 -> 9, sugars >29.4 -> 7, sodium >90 -> 1
    expect(r.baselinePoints).toBe(22);
    expect(r.capRule).toMatch(/> 20/);
    expect(line(r, 'proteinG').points).toBe(5); // >5 g -> 5, under cap 7
    expect(r.finalScore).toBe(17);
    expect(r.stars).toBe(1.5);
  });

  it('caps protein at 7 and fibre/FV/NLM at 5 when solid baseline > 20', () => {
    const r = computeInr(solid({ energyKcal: 900, saturatedFatG: 13, sugarsG: 0, sodiumMg: 0, proteinG: 60, fiberG: 40, fruitVegPct: 80, nutsLegumesMilletsPct: 80 }));
    expect(r.baselinePoints).toBe(21);
    const p = line(r, 'proteinG') as any;
    expect(p.rawPoints).toBe(15);
    expect(p.points).toBe(7);
    expect(line(r, 'fiberG').points).toBe(5);
    expect(line(r, 'fruitVegPct').points).toBe(5);
    expect(line(r, 'nutsLegumesMilletsPct').points).toBe(5);
    expect(r.finalScore).toBe(21 - 22);
  });

  it('keeps full caps at baseline exactly 20', () => {
    const r = computeInr(solid({ energyKcal: 900, saturatedFatG: 11, sugarsG: 0, sodiumMg: 0, proteinG: 60 }));
    expect(r.baselinePoints).toBe(20);
    expect(line(r, 'proteinG').points).toBe(15);
  });

  it('produces negative final scores and 5 stars for high-positive products', () => {
    const r = computeInr(solid({ energyKcal: 50, saturatedFatG: 0.5, sugarsG: 2, sodiumMg: 50, fiberG: 31, proteinG: 51, fruitVegPct: 60, nutsLegumesMilletsPct: 60 }));
    expect(r.baselinePoints).toBe(0);
    expect(r.positivePoints).toBe(10 + 10 + 10 + 15);
    expect(r.finalScore).toBe(-45);
    expect(r.stars).toBe(5);
  });

  it('handles extreme values by saturating at the table maximum', () => {
    const r = computeInr(solid({ energyKcal: 5000, saturatedFatG: 100, sugarsG: 100, sodiumMg: 100000, fiberG: 0, proteinG: 0 }));
    expect(r.baselinePoints).toBe(10 + 25 + 20 + 25);
    expect(r.stars).toBe(0.5);
  });

  it('is not fooled by floating-point noise at a boundary', () => {
    const r = computeInr(solid({ sugarsG: 4.2000000001 }));
    expect(line(r, 'sugarsG').points).toBe(0);
  });

  it('scores liquids with the Category-II tables and caps (baseline > 10)', () => {
    // 100% mixed fruit juice style: 56 kcal, 13 g sugar per 100 ml, 85% fruit
    const r = computeInr(liquid({ energyKcal: 56, sugarsG: 13, fruitVegPct: 85, proteinG: 0.4, saturatedFatG: null, sodiumMg: null, fiberG: null }));
    expect(line(r, 'energyKcal').points).toBe(9);
    expect(line(r, 'sugarsG').points).toBe(9);
    expect(r.baselinePoints).toBe(18);
    const fv = line(r, 'fruitVegPct') as any;
    expect(fv.rawPoints).toBe(10);
    expect(fv.points).toBe(5);
    expect(r.finalScore).toBe(13);
    expect(r.stars).toBe(2);
    // sat fat, sodium and fibre are not liquid factors, so their absence is not "missing"
    expect(r.status).toBe('RATED');
  });

  it('uses higher liquid caps at baseline <= 10', () => {
    const r = computeInr(liquid({ energyKcal: 30, sugarsG: 3, proteinG: 51, fruitVegPct: 60 }));
    expect(r.baselinePoints).toBe(4 + 2);
    expect(line(r, 'proteinG').points).toBe(15);
    expect(line(r, 'fruitVegPct').points).toBe(10);
    expect(r.stars).toBe(5);
  });
});

describe('computeInr - eligibility and missing data', () => {
  it('does not rate exempt categories', () => {
    const r = computeInr(solid({ inrClass: 'EXEMPT' }));
    expect(r.status).toBe('EXEMPT');
    expect(r.stars).toBeNull();
  });
  it('does not rate unmapped categories', () => {
    expect(computeInr(solid({ inrClass: null })).status).toBe('NOT_ELIGIBLE');
  });
  it('does not rate when the measurement basis is unknown', () => {
    expect(computeInr(solid({ basis: 'UNKNOWN' })).status).toBe('BASIS_UNKNOWN');
  });
  it.each(['energyKcal', 'saturatedFatG', 'sugarsG', 'sodiumMg'] as const)('refuses to rate a solid with missing %s', (f) => {
    const r = computeInr(solid({ [f]: null }));
    expect(r.status).toBe('INSUFFICIENT_DATA');
    expect(r.stars).toBeNull();
    expect(r.finalScore).toBeNull();
    expect(r.missingCore.length).toBe(1);
  });
  it('refuses to rate a liquid with missing sugars', () => {
    expect(computeInr(liquid({ sugarsG: null })).status).toBe('INSUFFICIENT_DATA');
  });
  it('marks the rating PARTIAL when fibre or protein is missing, awarding 0 for it', () => {
    const r = computeInr(solid({ energyKcal: 300, fiberG: null, proteinG: 8 }));
    expect(r.status).toBe('PARTIAL');
    expect(r.missingPositive).toEqual(['Dietary fibre']);
    expect(line(r, 'fiberG').points).toBe(0);
    expect(r.stars).not.toBeNull();
    expect(r.dataCompleteness).toBeCloseTo(5 / 6, 2);
  });
  it('treats undeclared FV/NLM as not declared without making the rating partial', () => {
    const r = computeInr(solid());
    expect(r.status).toBe('RATED');
    expect((line(r, 'fruitVegPct') as any).state).toBe('not_declared');
    expect(explainInr(r).missing.join(' ')).toMatch(/not declared/);
  });
  it('applies the beverage proviso: no energy or no sugar -> not eligible', () => {
    expect(computeInr(liquid({ energyKcal: 0, sugarsG: 0 })).status).toBe('NOT_ELIGIBLE');
    expect(computeInr(liquid({ energyKcal: 20, sugarsG: 0 })).status).toBe('NOT_ELIGIBLE');
    expect(computeInr(liquid({ energyKcal: 20, sugarsG: 4 })).status).toBe('RATED');
  });
  it('does not apply the beverage proviso to solid foods', () => {
    expect(computeInr(solid({ sugarsG: 0 })).status).toBe('RATED');
  });
});

describe('explanations', () => {
  it('names the main drivers and shows the calculation', () => {
    const r = computeInr(solid({ energyKcal: 479, saturatedFatG: 9.4, sugarsG: 32.5, sodiumMg: 114, fiberG: 0, proteinG: 5.9 }));
    const e = explainInr(r);
    expect(e.summary[0]).toMatch(/saturated fat and total sugars/);
    expect(e.calculation).toMatch(/final score 22 - 5 = 17 -> 1.5 stars/);
    expect(e.concerns.some((c) => c.includes('above the draft reference value of 5 g'))).toBe(true);
  });
  it('explains why no rating was given', () => {
    const e = explainInr(computeInr(solid({ sodiumMg: null })));
    expect(e.headline).toMatch(/No rating/);
    expect(e.summary[0]).toMatch(/sodium is missing/);
    expect(e.calculation).toBeNull();
  });
});

describe('HFSS indicator (draft regulation 2(ib))', () => {
  it('flags sugar share >= 10% of energy', () => {
    const r = hfssCheck({ energyKcal: 400, sugarsG: 10, saturatedFatG: 0, sodiumMg: 0 });
    expect(r.isHfss).toBe(true);
  });
  it('does not flag below every limit', () => {
    const r = hfssCheck({ energyKcal: 400, sugarsG: 9.9, saturatedFatG: 4.4, sodiumMg: 399 });
    expect(r.isHfss).toBe(false);
  });
  it('flags sodium >= 1 mg/kcal', () => {
    expect(hfssCheck({ energyKcal: 100, sugarsG: 0, saturatedFatG: 0, sodiumMg: 100 }).isHfss).toBe(true);
  });
  it('is not evaluable with missing values', () => {
    expect(hfssCheck({ energyKcal: 100, sugarsG: null, saturatedFatG: 0, sodiumMg: 0 }).evaluable).toBe(false);
  });
});
