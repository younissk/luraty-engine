import { describe, expect, it } from 'vitest';

import type { Evidence } from '../model/evidence.js';
import { unitKey, variety, type Day, type UnitKey } from '../model/ids.js';
import { arabicPack } from '../testing/packs.js';

import { coverage } from './coverage.js';
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

/**
 * A hundred running tokens of plausible text, built from the same vocabulary.
 *
 * ⚠️ THE WEIGHTS ARE THE POINT, not decoration. Real text is Zipfian: a few words carry most of the
 * tokens and the tail appears once or twice. That shape is what makes the 95–98% band reachable at
 * all — the band needs 2 to 5 unknown tokens in 100, so the learner's last unknown words have to be
 * RARE ones. Twelve words at eight tokens each would step from 92% straight to 100%, skipping the
 * band entirely, and a test built that way would "prove" the invariant is unsatisfiable when the
 * only thing wrong was the fixture.
 */
const WEIGHTS = [20, 16, 13, 11, 9, 8, 7, 5, 4, 3, 2, 2];

const PASSAGE = VOCAB.flatMap((word, i) =>
  Array.from({ length: WEIGHTS[i] ?? 1 }, () => word),
).join(' ');

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

// ── Is the coverage band reachable at all? ───────────────────────────────────────────────────────
//
// ⚠️ A SECOND SIMULATION, and deliberately not a few more assertions bolted onto the one above.
//
// The learner in `runNinetyDays` has a FIXED success probability — 0.35 on unfamiliar words, 0.85
// on the four they grew up with, unchanged on day 90 from day 1. That was the right fixture for its
// job, which is exercising promotion, demotion and the shape of a unit key over three months. It is
// the wrong fixture for this question, and measurably so: driven for ninety days it peaks at 28%
// known-token coverage and reports `'too-hard'` on every single day. A learner who does not improve
// cannot reach 95%, and asserting reachability against them would be asserting something the model
// was never built to support.
//
// So this one models the missing half: practice raises the odds. Everything else is deliberately
// plain, because the question is narrow — given a learner who improves, is ADR-0003 invariant 1
// SATISFIABLE, or is it a target the product can never hit?
//
// That question is worth its own simulation because no unit test can ask it. Every example in
// `coverage.test.ts` supplies both the text and the profile, so of course it reaches any band it
// asks for. An engine that classifies the band perfectly and is satisfied by nothing would pass
// every one of them.

describe('the coverage band, as knowledge grows', () => {
  /**
   * The band sequence for a learner who proves the passage's words one at a time, commonest first,
   * and never regresses.
   *
   * No probabilities and no seed, deliberately. The question is whether the band is REACHABLE as a
   * known-token set grows, and a noisy learner would answer it with a number that depends on how
   * the noise was tuned. This answers it with arithmetic.
   */
  function bandsAsWordsAreProven(): readonly string[] {
    let profile = createProfile('ar', 0 as Day);
    const bands: string[] = [];

    for (const word of VOCAB) {
      // ⚠️ `pack.key(word)`, never the raw word. Coverage addresses knowledge by CANONICAL form, so
      // recording against the surface form files the evidence somewhere coverage will never look.
      // Three of these twelve words end in ة, which normalizes to ه — they carry 17 of the 100
      // tokens, and getting this wrong pins the learner at exactly 83% forever.
      const unit = unitKey('recognise', AR, arabicPack.key(word));
      profile = record(profile, [
        { unit, outcome: 'known', tested: true, day: 1 as Day },
        { unit, outcome: 'known', tested: true, day: 2 as Day },
      ]);
      const result = coverage(profile, arabicPack, {
        text: PASSAGE,
        variety: AR,
        direction: 'recognise',
      });
      bands.push(result.kind === 'measured' ? result.band : result.kind);
    }
    return bands;
  }

  it('is reachable, and is entered from below rather than skipped', () => {
    const bands = bandsAsWordsAreProven();

    expect(bands, 'the band is never reached as words are proven').toContain('in-band');
    // Skipping straight from too-hard to too-easy would mean the passage's word weights are too
    // coarse for the band to have any room in them — the failure the Zipfian WEIGHTS above exist to
    // avoid, and the one that would make invariant 1 unsatisfiable on sentence-shaped content.
    expect(bands.indexOf('in-band')).toBeGreaterThan(bands.indexOf('too-hard'));
    expect(bands.lastIndexOf('too-easy')).toBeGreaterThan(bands.indexOf('in-band'));
    // 100 running tokens by construction, so neither degenerate variant may appear. If one does,
    // the fixture drifted and the assertions above stopped meaning anything.
    expect(bands).not.toContain('too-short');
    expect(bands).not.toContain('no-words');
  });

  /**
   * The same question asked of a noisy learner, because the tune-free version above only proves the
   * band is reachable by a monotone one — and nobody is monotone.
   *
   * ⚠️ WHAT THIS MEASURED, and it is worth writing down because the number is uncomfortable. Over
   * ninety days at up to 95% per-item accuracy this learner reaches 100% coverage at its best, and
   * spends **65 of 90 days reporting `'too-hard'`, 9 in band and 16 `'too-easy'`** — swinging from
   * 95 known tokens on day 60 back to 77 by day 90.
   *
   * That oscillation is `PROMOTE_AFTER_SUCCESSES = 2` plus outright demotion on a single failure:
   * at 95% accuracy several of twelve words are sitting back in `learning` at any instant, so the
   * measured known-token set churns far more than the learner's actual knowledge does. A selector
   * driven by it would chase easier and easier text for someone who understands the passage —
   * precisely the product failure this engine exists to avoid, arriving through a number that looks
   * rigorous.
   *
   * `PROMOTE_AFTER_SUCCESSES` is already labelled PROVISIONAL in its own docstring. This is the
   * first measurement that gives it a consequence. It is recorded in ADR-0004 as an open question
   * rather than pinned here as an assertion: a test asserting today's churn would have to be edited
   * by whoever fixes it, which teaches nobody anything. The assertions below are the parts that
   * must hold either way.
   */
  it('reaches the band for a learner who practises, and does not get there smoothly', () => {
    const next = rng(42);
    let profile = createProfile('ar', 0 as Day);
    const bands: string[] = [];
    let best = 0;

    for (let d = 1; d <= 90; d++) {
      profile = advanceTo(profile, d as Day);

      // A short daily session — the evidence supports 15-20 minutes — spent reading, so every item
      // is a `recognise` retrieval in the standard variety.
      const batch: Evidence[] = [];
      for (let i = 0; i < 6; i++) {
        const word = VOCAB[Math.floor(next() * VOCAB.length)] ?? 'سوق';
        const unit = unitKey('recognise', AR, arabicPack.key(word));
        // Practice raises the odds, saturating. `runNinetyDays` deliberately leaves this out, which
        // is exactly why it is the wrong fixture for a question about acquisition.
        const chance = Math.min(
          0.95,
          (knowsAlready(word) ? 0.7 : 0.3) + 0.06 * unitState(profile, unit).seen,
        );
        batch.push({
          unit,
          outcome: next() < chance ? 'known' : 'unknown',
          tested: true,
          day: d as Day,
        });
      }
      profile = record(profile, batch);

      const result = coverage(profile, arabicPack, {
        text: PASSAGE,
        variety: AR,
        direction: 'recognise',
      });
      expect(result.kind).toBe('measured');
      if (result.kind !== 'measured') return;
      best = Math.max(best, result.knownTokens);
      bands.push(result.band);
    }

    // From nothing to essentially the whole passage. A learner who practises daily for three months
    // and does not clear this is not learning, and the fixture would be lying about acquisition.
    expect(best).toBeGreaterThan(90);
    // And they do pass through the band on the way, not around it.
    expect(bands).toContain('too-hard');
    expect(bands).toContain('in-band');
    expect(bands).toContain('too-easy');
  });
});
