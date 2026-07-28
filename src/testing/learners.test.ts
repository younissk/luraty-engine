import { describe, expect, it } from 'vitest';

import { coverage } from '../core/coverage.js';
import { plan } from '../core/plan.js';
import { unitKey, variety, type Day } from '../model/ids.js';

import {
  beginner,
  classroomLearner,
  heritageSpeaker,
  learner,
  rustySpeaker,
  silentReader,
  vocabularyOf,
} from './learners.js';
import { createPack } from '../core/pack.js';
import { fixtures, germanPack } from './packs.js';

/**
 * The simulated learners, checked for the properties they claim to have.
 *
 * A fixture that does not have the shape it says it has is worse than no fixture: every simulation
 * built on it then measures something other than what its name says.
 *
 * @module
 */

const V = variety('de')!;
const D = (n: number): Day => n as Day;
const opts = { variety: V, day: D(200), frequency: fixtures.germanData.frequency };

function counts(profile: ReturnType<typeof learner>) {
  let recognise = 0;
  let produce = 0;
  let met = 0;
  for (const [key, state] of Object.entries(profile.units)) {
    if (state.box === 'understood') {
      if (key.startsWith('produce:')) produce++;
      else recognise++;
    } else met++;
  }
  return { recognise, produce, met };
}

describe('learner archetypes', () => {
  it('is deterministic — same seed, same learner', () => {
    const a = heritageSpeaker(germanPack, { ...opts, seed: 42 });
    const b = heritageSpeaker(germanPack, { ...opts, seed: 42 });
    expect(a).toEqual(b);
  });

  it('gives different learners for different seeds', () => {
    expect(heritageSpeaker(germanPack, { ...opts, seed: 1 })).not.toEqual(
      heritageSpeaker(germanPack, { ...opts, seed: 2 }),
    );
  });

  it('gives the heritage speaker a large recognition–production gap', () => {
    // THE defining property. If this ever stops holding, every simulation of the target user is
    // silently measuring a classroom learner instead.
    const c = counts(heritageSpeaker(germanPack, { ...opts, seed: 42 }));
    expect(c.recognise).toBeGreaterThan(c.produce * 1.5);
  });

  it('gives the heritage speaker HOLES, not a clean prefix', () => {
    // The other defining property: knowledge acquired at home is lumpy. A learner whose known set
    // is a prefix of the frequency list is a classroom learner wearing the wrong name.
    const vocab = vocabularyOf(germanPack, fixtures.germanData.frequency);
    const profile = heritageSpeaker(germanPack, { ...opts, seed: 42 });
    const knows = (lemma: string) =>
      profile.units[unitKey('recognise', V, lemma)]?.box === 'understood';

    // Somewhere in the common half there is a word they do NOT know…
    const commonHalf = vocab.slice(0, Math.floor(vocab.length / 2));
    expect(
      commonHalf.some((l) => !knows(l)),
      'no holes in common vocabulary',
    ).toBe(true);
    // …and somewhere in the rare half there is one they DO.
    const rareHalf = vocab.slice(Math.floor(vocab.length / 2));
    expect(
      rareHalf.some((l) => knows(l)),
      'no knowledge past the frontier',
    ).toBe(true);
  });

  it('gives the classroom learner a clean prefix and a narrow gap', () => {
    // The contrast case, asserted — so "the heritage profile is different" is checkable rather
    // than a sentence in an ADR.
    const vocab = vocabularyOf(germanPack, fixtures.germanData.frequency);
    const profile = classroomLearner(germanPack, { ...opts, seed: 42, words: 100 });
    const knows = (lemma: string) =>
      profile.units[unitKey('recognise', V, lemma)]?.box === 'understood';

    expect(vocab.slice(0, 100).every(knows), 'a gap inside the prefix').toBe(true);
    expect(vocab.slice(120, 200).some(knows), 'knowledge past the prefix').toBe(false);

    const c = counts(profile);
    expect(c.produce).toBeGreaterThan(c.recognise * 0.5);
  });

  it('reads the two archetypes as genuinely different difficulty on the same text', () => {
    // The payoff: one passage, two learners, two verdicts — with no engine change.
    const text = fixtures.germanData.frequency.split(/\s+/).slice(0, 120).join(' ');
    const q = { text, variety: V, direction: 'recognise' as const };

    const heritage = coverage(heritageSpeaker(germanPack, { ...opts, seed: 42 }), germanPack, q);
    const novice = coverage(
      classroomLearner(germanPack, { ...opts, seed: 42, words: 30 }),
      germanPack,
      q,
    );

    expect(heritage.kind).toBe('measured');
    expect(novice.kind).toBe('measured');
    if (heritage.kind !== 'measured' || novice.kind !== 'measured') return;
    expect(heritage.knownTokens).toBeGreaterThan(novice.knownTokens);
  });

  it('starts a beginner with nothing, which is what every learner gets today', () => {
    // No placement exists, so this is not just an archetype — it is the ONLY state a real learner
    // can be created in. The comment is the finding.
    const profile = beginner(germanPack, opts);
    expect(Object.keys(profile.units)).toHaveLength(0);
    expect(plan(profile, { day: D(200), maxItems: 10 }).items).toHaveLength(0);
  });

  it('spreads last-proven days rather than stamping them all the same', () => {
    // A learner whose every word was proven on one day is a fixture, not a learner — and a
    // scheduler tested against one has never had to choose between two units.
    //
    // Asserted over the PROFILE, not over a session: `plan` returns the top N by wait, and with
    // hundreds of words spread across thirty days the oldest day alone fills a session. A first
    // draft of this test checked the session and failed for that reason — the fixture was right.
    const profile = heritageSpeaker(germanPack, { ...opts, seed: 42 });
    const proven = new Set<number>();
    for (const state of Object.values(profile.units)) {
      proven.add(state.box === 'understood' ? state.confirmedOn : state.lastProven);
    }
    expect(proven.size).toBeGreaterThan(5);

    // And the scheduler really does see a range to choose from.
    const spread = new Set(
      plan(profile, { day: D(200), maxItems: 500 }).items.map((i) => i.daysWaiting),
    );
    expect(spread.size).toBeGreaterThan(5);
  });

  it('gives the heritage speaker REGISTER-shaped holes, not random ones', () => {
    // ⚠️ THE PROPERTY THAT MAKES THIS ARCHETYPE THE RIGHT LEARNER RATHER THAN A WORSE ONE.
    //
    // ADR-0002 says the gaps are domain-shaped: they know the kitchen and the street, not the form
    // and the contract. Random holes would produce someone merely weaker than a classroom learner;
    // the register penalty is what makes them DIFFERENT. If this stops holding, every simulation of
    // the target user is quietly measuring a generic intermediate.
    // A purpose-built vocabulary rather than the shipped fixture: that one holds 130 words and only
    // three of them carry a formal suffix, which is far too few to measure a RATE against.
    const formalWords = [
      'regierung',
      'bildung',
      'meinung',
      'richtung',
      'ordnung',
      'leistung',
      'haltung',
      'freiheit',
      'sicherheit',
      'wahrheit',
      'krankheit',
      'gelegenheit',
      'moeglichkeit',
      'faehigkeit',
      'einigkeit',
      'schwierigkeit',
      'nation',
      'situation',
      'position',
      'reaktion',
      'produktion',
      'gesellschaft',
      'wissenschaft',
      'freundschaft',
      'ereignis',
      'ergebnis',
    ];
    const plainWords = [
      'haus',
      'brot',
      'wasser',
      'kind',
      'mann',
      'frau',
      'hand',
      'kopf',
      'tisch',
      'stuhl',
      'baum',
      'blume',
      'hund',
      'katze',
      'milch',
      'kaese',
      'apfel',
      'gehen',
      'essen',
      'trinken',
      'sehen',
      'geben',
      'nehmen',
      'kaufen',
      'kochen',
      'lesen',
    ];
    const built = createPack(fixtures.germanConfig, {
      frequency: [...formalWords, ...plainWords].join(' '),
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const testPack = built.value;
    const frequency = [...formalWords, ...plainWords].join(' ');

    // Averaged over seeds: one seed is a coin flip, and the claim is about the DISTRIBUTION.
    let formalKnown = 0;
    let plainKnown = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const p = heritageSpeaker(testPack, { ...opts, seed, frequency });
      const knows = (l: string) => p.units[unitKey('recognise', V, l)]?.box === 'understood';
      formalKnown += formalWords.filter(knows).length;
      plainKnown += plainWords.filter(knows).length;
    }
    const formalRate = formalKnown / (30 * formalWords.length);
    const plainRate = plainKnown / (30 * plainWords.length);
    expect(formalRate, `formal ${String(formalRate)} vs plain ${String(plainRate)}`).toBeLessThan(
      plainRate,
    );
  });

  it('gives the silent reader an extreme gap and the classroom learner a narrow one', () => {
    // The two ends of the axis the product is built on, asserted against each other rather than
    // against a magic number — so the test survives any retuning of the archetypes themselves.
    const gap = (profile: ReturnType<typeof learner>) => {
      const c = counts(profile);
      return c.recognise === 0 ? 0 : (c.recognise - c.produce) / c.recognise;
    };

    const silent = gap(silentReader(germanPack, { ...opts, seed: 42 }));
    const heritage = gap(heritageSpeaker(germanPack, { ...opts, seed: 42 }));
    const classroom = gap(classroomLearner(germanPack, { ...opts, seed: 42, words: 100 }));

    expect(silent).toBeGreaterThan(heritage);
    expect(heritage).toBeGreaterThan(classroom);
  });

  it('makes the rusty speaker overdue rather than ignorant', () => {
    // The distinguishing shape is not a smaller vocabulary — it is knowledge proven LONG ago. This
    // is the archetype that stresses selection instead of measurement, and it is the one that
    // would expose a scheduler which cannot cope with everything being due at once.
    // Day 5000 so neither learner's back-dating hits the day-0 floor — at day 200 both simply
    // clamp there and the two are indistinguishable, which is what a first draft of this measured.
    const far = { ...opts, day: D(5000) };
    const rusty = rustySpeaker(germanPack, { ...far, seed: 42, yearsAway: 8 });
    const fresh = heritageSpeaker(germanPack, { ...far, seed: 42 });

    const meanWait = (profile: ReturnType<typeof learner>) => {
      const items = plan(profile, { day: D(5000), maxItems: 100000 }).items;
      return items.reduce((sum, i) => sum + i.daysWaiting, 0) / Math.max(items.length, 1);
    };

    // Mean, not max: max saturates at the epoch for any learner with one never-proven unit.
    expect(meanWait(rusty)).toBeGreaterThan(meanWait(fresh));
    // …and they still know a lot. Rusty is not beginner.
    expect(counts(rusty).recognise).toBeGreaterThan(10);
  });
});
