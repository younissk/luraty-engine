import { describe, expect, it } from 'vitest';

import type { Evidence } from '../model/evidence.js';
import { unitKey, variety, type Day, type UnitKey } from '../model/ids.js';

import { advanceTo, createProfile, unitState } from './profile.js';
import { record } from './record.js';

/**
 * Ninety days of a synthetic learner, driven through the real loop.
 *
 * WHY THIS EXISTS, AND WHY IT WAS WRITTEN BEFORE THE FEATURES.
 *
 * The shape of a unit key and a profile is the one genuinely irreversible decision in this engine:
 * the evidence log is append-only and a profile is a fold over it, so a missing dimension is not a
 * refactor later, it is a migration of somebody's past. The cheapest way to find out that a shape is
 * wrong is to run three months through it before anyone depends on it.
 *
 * Unit tests check a rule at a time. This checks that the rules still make sense in combination,
 * over a stretch long enough for promotion, decay and demotion to actually happen — and it asserts
 * invariants after EVERY day, so a failure names the day it first went wrong rather than the end
 * state.
 *
 * The learner is deterministic. No `Math.random()`: a seeded generator means a failure here is
 * reproducible from the seed alone, which is the entire argument for determinism in the first place.
 */

const AR = variety('ar-msa')!;
const DIALECT = variety('ar-levantine')!;

/** A tiny seeded PRNG (mulberry32). Deterministic, and good enough to shuffle a schedule. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VOCAB = [
  'سوق',
  'كتاب',
  'مدرسة',
  'بيت',
  'ماء',
  'خبز',
  'شارع',
  'مطار',
  'طبيب',
  'قطار',
  'جريدة',
  'حكومة',
];

/**
 * A learner with a plausible shape: strong on the words they grew up hearing, weak on the formal
 * ones. That is the heritage profile — knowledge is lumpy and domain-shaped, not a prefix of a
 * frequency list — and it is the case the engine has to handle without special-casing.
 */
function knowsAlready(word: string): boolean {
  return ['بيت', 'ماء', 'خبز', 'سوق'].includes(word);
}

type Snapshot = { day: number; units: number; understood: number };

function runNinetyDays(seed: number): { history: Snapshot[]; finalUnits: number } {
  const next = rng(seed);
  let profile = createProfile('ar', 0 as Day);
  const history: Snapshot[] = [];

  for (let d = 1; d <= 90; d++) {
    profile = advanceTo(profile, d as Day);

    // A handful of units touched per day, in both directions and both varieties.
    const batch: Evidence[] = [];
    const howMany = 1 + Math.floor(next() * 5);

    for (let i = 0; i < howMany; i++) {
      const word = VOCAB[Math.floor(next() * VOCAB.length)] ?? 'سوق';
      const direction = next() < 0.6 ? 'recognise' : 'produce';
      const v = next() < 0.7 ? AR : DIALECT;
      const key = unitKey(direction, v, word);

      // Reading gives passive signals; drills give real retrievals.
      const tested = next() < 0.5;

      // Producing is harder than recognising, and known-since-childhood words come easier.
      let pKnown = knowsAlready(word) ? 0.85 : 0.35;
      if (direction === 'produce') pKnown -= 0.2;
      const outcome = next() < pKnown ? 'known' : 'unknown';

      batch.push({ unit: key, outcome, tested, day: d as Day });
    }

    profile = record(profile, batch);

    // ── Invariants, checked every single day ────────────────────────────────────────────────────
    for (const [key, state] of Object.entries(profile.units)) {
      expect(state.seen, `${key} seen on day ${String(d)}`).toBeGreaterThan(0);
      expect(state.lastSeen, `${key} lastSeen on day ${String(d)}`).toBeLessThanOrEqual(d);
      if (state.box === 'understood') {
        expect(state.confirmedOn, `${key} confirmedOn on day ${String(d)}`).toBeLessThanOrEqual(d);
      }
    }

    history.push({
      day: d,
      units: Object.keys(profile.units).length,
      understood: Object.values(profile.units).filter((s) => s.box === 'understood').length,
    });
  }

  return { history, finalUnits: Object.keys(profile.units).length };
}

describe('ninety days', () => {
  it('never loses a unit once met', () => {
    const { history } = runNinetyDays(42);
    for (let i = 1; i < history.length; i++) {
      const prev = history[i - 1];
      const curr = history[i];
      if (!prev || !curr) continue;
      expect(curr.units, `unit count shrank on day ${String(curr.day)}`).toBeGreaterThanOrEqual(
        prev.units,
      );
    }
  });

  it('reaches a mix of boxes rather than collapsing to one', () => {
    // A model where everything ends up understood is not modelling anything, and one where nothing
    // does is broken. Both failures look fine in a unit test.
    const { history } = runNinetyDays(42);
    const last = history.at(-1);
    expect(last).toBeDefined();
    if (!last) return;
    expect(last.understood).toBeGreaterThan(0);
    expect(last.understood).toBeLessThan(last.units);
  });

  it('separates the two varieties — MSA progress is not dialect progress', () => {
    // Diglossia, as an assertion. The same word in two varieties is two units, measured apart.
    let profile = createProfile('ar', 0 as Day);
    const msa: UnitKey = unitKey('recognise', AR, 'كتاب');
    const dialect: UnitKey = unitKey('recognise', DIALECT, 'كتاب');

    profile = record(profile, [
      { unit: msa, outcome: 'known', tested: true, day: 1 as Day },
      { unit: msa, outcome: 'known', tested: true, day: 2 as Day },
    ]);

    expect(unitState(profile, msa).box).toBe('understood');
    expect(unitState(profile, dialect).box).toBe('learning');
    expect(unitState(profile, dialect).seen).toBe(0);
  });

  it('is reproducible from the seed', () => {
    // The claim the whole design rests on. If this ever fails, something read a clock or an
    // unseeded random, and every simulation result becomes unfalsifiable.
    expect(runNinetyDays(1234).history).toEqual(runNinetyDays(1234).history);
  });

  it('gives different learners for different seeds', () => {
    // Guards against the opposite failure: a "simulation" that ignores its seed and proves nothing.
    expect(runNinetyDays(1).history).not.toEqual(runNinetyDays(2).history);
  });
});
