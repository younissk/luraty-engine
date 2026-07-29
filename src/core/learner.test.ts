import { describe, expect, it } from 'vitest';

import { unitKey, variety, type Day } from '../model/ids.js';
import { germanPack } from '../testing/packs.js';

import { vocabularyOf } from './bulk.js';
import { coverage } from './coverage.js';
import { learner } from './learner.js';
import { serialize } from './persist.js';
import { plan } from './plan.js';
import { createProfile } from './profile.js';
import { record } from './record.js';
import { summarize } from './summary.js';

/**
 * The fluent handle.
 *
 * ⚠️ **THE LAW THAT MATTERS IS EQUIVALENCE.** The facade must add no power and change no answer — if
 * it can ever produce a profile the free functions could not, it has become a second implementation
 * and the whole argument for it collapses. Every test here checks the two paths agree.
 *
 * @module
 */

const DE = variety('de');
const D = (n: number): Day => n as Day;
const WORDS = vocabularyOf(germanPack, 'der die und haus brot mann wasser gehen');
const ctx = { pack: germanPack, variety: DE, vocabulary: WORDS } as const;

describe('the facade produces exactly what the free functions do', () => {
  it('for a placement', () => {
    const viaFacade = learner(createProfile('de', D(1)), ctx).claim(WORDS, D(1)).profile;
    const viaFree = record(
      createProfile('de', D(1)),
      WORDS.map((w) => ({ kind: 'claim' as const, unit: unitKey('recognise', DE, w), day: D(1) })),
    );
    expect(viaFacade).toEqual(viaFree);
  });

  it('for an answer', () => {
    const viaFacade = learner(createProfile('de', D(1)), ctx).answer('haus', 'known', D(1)).profile;
    const viaFree = record(createProfile('de', D(1)), [
      { kind: 'retrieval', unit: unitKey('recognise', DE, 'haus'), outcome: 'known', day: D(1) },
    ]);
    expect(viaFacade).toEqual(viaFree);
  });

  it('for a session, a coverage reading and a summary', () => {
    const text = 'Der Mann geht aus dem Haus. Die Frau trinkt Wasser und isst Brot heute.';
    const anna = learner(createProfile('de', D(1)), ctx)
      .claim(WORDS, D(1))
      .answer('haus', 'known', D(2));

    const options = { day: D(9), maxItems: 5, maxNew: 2 } as const;
    expect(anna.plan(options)).toEqual(
      plan(anna.profile, { ...options, priority: WORDS.map((w) => unitKey('recognise', DE, w)) }),
    );
    expect(anna.coverage(text)).toEqual(
      coverage(anna.profile, germanPack, { text, variety: DE, direction: 'recognise' }),
    );
    expect(anna.summary()).toEqual(
      summarize(anna.profile, { kind: 'skill', variety: DE, direction: 'recognise' }),
    );
    expect(anna.save()).toBe(serialize(anna.profile));
  });
});

describe('it stays immutable', () => {
  it('returns a new handle and leaves the old one untouched', () => {
    const before = learner(createProfile('de', D(1)), ctx);
    const after = before.claim(WORDS, D(1));
    expect(Object.keys(before.profile.units)).toHaveLength(0);
    expect(Object.keys(after.profile.units).length).toBeGreaterThan(0);
    expect(after).not.toBe(before);
  });

  it('chains without accumulating hidden state', () => {
    // Two paths to the same place: one chain, and two separate steps. A facade that cached anything
    // about the learner would diverge here.
    const chained = learner(createProfile('de', D(1)), ctx)
      .claim(WORDS, D(1))
      .answer('haus', 'known', D(2))
      .on(D(9));
    const stepwise = learner(
      learner(createProfile('de', D(1)), ctx)
        .claim(WORDS, D(1))
        .answer('haus', 'known', D(2)).profile,
      ctx,
    ).on(D(9));
    expect(chained.profile).toEqual(stepwise.profile);
  });
});

describe('the escape hatch', () => {
  it('exposes the raw profile, so nothing here is a one-way door', () => {
    const anna = learner(createProfile('de', D(1)), ctx).claim(WORDS, D(1));
    // Drop back to a free function mid-flow and carry on.
    const viaFree = record(anna.profile, [
      { kind: 'retrieval', unit: unitKey('recognise', DE, 'brot'), outcome: 'unknown', day: D(3) },
    ]);
    expect(learner(viaFree, ctx).summary().claimsRefuted).toBe(1);
  });

  it('defaults `priority` but lets a caller override it', () => {
    const anna = learner(createProfile('de', D(1)), ctx).claim(WORDS, D(1));
    const reversed = [...WORDS].reverse().map((w) => unitKey('recognise', DE, w));
    const options = { day: D(9), maxItems: 3, maxNew: 0 } as const;
    expect(anna.plan({ ...options, priority: reversed }).items[0]?.unit).not.toBe(
      anna.plan(options).items[0]?.unit,
    );
  });

  it('falls back to the key tiebreak when no vocabulary was supplied', () => {
    // Documented behaviour rather than an accident: without an order, equally-due words sort
    // alphabetically. Deterministic, correct, and a bad lesson — hence the docstring telling you so.
    const bare = learner(createProfile('de', D(1)), { pack: germanPack, variety: DE }).claim(
      ['zebra', 'apfel'],
      D(1),
    );
    expect(bare.plan({ day: D(9), maxItems: 2, maxNew: 0 }).items.map((i) => i.unit)).toEqual([
      unitKey('recognise', DE, 'apfel'),
      unitKey('recognise', DE, 'zebra'),
    ]);
  });
});

describe('direction', () => {
  it('addresses the skill the handle was built for, and no other', () => {
    const speak = learner(createProfile('de', D(1)), { ...ctx, direction: 'produce' }).answer(
      'haus',
      'known',
      D(1),
    );
    expect(speak.profile.units[unitKey('produce', DE, 'haus')]).toBeDefined();
    expect(speak.profile.units[unitKey('recognise', DE, 'haus')]).toBeUndefined();
    // And the default summary is scoped to that skill, not blurred across the profile.
    expect(speak.summary().scope).toEqual({ kind: 'skill', variety: DE, direction: 'produce' });
  });
});
