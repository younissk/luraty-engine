import { describe, expect, it } from 'vitest';

import { unitKey, variety, type Day } from '../../src/model/index.js';
import { germanPack } from '../../src/testing/packs.js';

import { vocabularyOf } from '../../src/core/bulk/index.js';
import { coverage } from '../../src/core/coverage.js';
import { learner } from '../../src/core/learner.js';
import { serialize } from '../../src/core/persist.js';
import { plan } from '../../src/core/plan.js';
import { createProfile } from '../../src/core/profile/index.js';
import { record } from '../../src/core/record/index.js';
import { summarize } from '../../src/core/summary/index.js';

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
      summarize(anna.profile, { kind: 'skill', variety: DE, modality: 'recognise' }),
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

describe('the handle canonicalises words through its pack', () => {
  it('addresses the same unit whether the host types the surface form or the lemma', () => {
    // ⚠️ A REAL SILENT DEFECT, found by driving the demo by hand rather than by any test. The German
    // pack transliterates umlauts, so `key('Schlüssel')` is `'schluessel'`. Before this, `answer()`
    // branded the raw string and wrote `recognise:de:schlüssel`, while `read()`, `coverage()` and
    // every lemma out of `vocabularyOf` addressed `recognise:de:schluessel`.
    //
    // Two units for one word, no error, no failing test — because the shipped example only ever used
    // words that happen to equal their own keys (`haus`, `verordnung`).
    const surface = learner(createProfile('de', D(1)), ctx).answer('HAUS', 'known', D(1));
    const lemma = learner(createProfile('de', D(1)), ctx).answer('haus', 'known', D(1));
    expect(surface.profile).toEqual(lemma.profile);
    expect(surface.profile.units[unitKey('recognise', DE, 'haus')]).toBeDefined();
    expect(Object.keys(surface.profile.units)).toHaveLength(1);
  });

  it('agrees with what read() and coverage() address', () => {
    // The three paths that all name the same word must land on one key. `read()` always keyed
    // through the pack; the other two did not, and that disagreement was invisible.
    const viaAnswer = learner(createProfile('de', D(1)), ctx).answer('Haus', 'known', D(1));
    const viaRead = learner(createProfile('de', D(1)), ctx).read('Haus', D(1));
    const viaClaim = learner(createProfile('de', D(1)), ctx).claim(['Haus'], D(1));
    expect(Object.keys(viaAnswer.profile.units)).toEqual(Object.keys(viaRead.profile.units));
    expect(Object.keys(viaClaim.profile.units)).toEqual(Object.keys(viaRead.profile.units));
  });

  it('is a no-op on already-keyed input, so the free-function equivalence still holds', () => {
    // Keying is only safe to do here because `key` is idempotent — a pack property law. If it were
    // not, this facade would quietly disagree with `record` + `claimsFor` for every caller who
    // correctly passed lemmas.
    const viaFacade = learner(createProfile('de', D(1)), ctx).claim(WORDS, D(1)).profile;
    const viaFree = record(
      createProfile('de', D(1)),
      WORDS.map((w) => ({ kind: 'claim' as const, unit: unitKey('recognise', DE, w), day: D(1) })),
    );
    expect(viaFacade).toEqual(viaFree);
  });

  it('drops a word the pack cannot key, rather than minting an unaddressable unit', () => {
    // `keysFor`'s empty guard, now reached from `answer` and `help` too. A unit keyed `"recognise:de:"`
    // is one no scope in `summarize` can see and no `parseUnitKey` accepts.
    const punctuation = learner(createProfile('de', D(1)), ctx).answer('!!!', 'known', D(1));
    expect(Object.keys(punctuation.profile.units)).toHaveLength(0);
  });
});

describe('help() — the method the mutation lane found nobody called', () => {
  // ⚠️ EVERY MUTANT IN `help` WAS `NoCoverage`, and `help: () => undefined` SURVIVED. The whole
  // method could be deleted and all 432 tests stayed green. It reached the barrel, the docs and an
  // end-to-end example without one engine test ever invoking it.
  const proven = (): ReturnType<typeof learner> =>
    learner(createProfile('de', D(1)), ctx)
      .answer('haus', 'known', D(1))
      .answer('haus', 'known', D(2))
      .answer('haus', 'known', D(3));

  it('costs no rung at all, and stamps the anchor that earns priority', () => {
    // ⚠️ INVERTED 2026-08-02 (ADR-0012). This asserted `3 -> 2`: a tap cost one rung. The evidence
    // says a gloss tap is the most productive thing a learner does while reading, so it now costs
    // nothing and instead moves the word toward the front of tomorrow's queue.
    const before = proven();
    const after = before.help('haus', D(4));
    const key = unitKey('recognise', DE, 'haus');
    expect(before.profile.units[key]?.strength).toBe(3);
    expect(after.profile.units[key]?.strength).toBe(3);
    expect(after.profile.units[key]?.lastHelped).toBe(4);
  });

  it('is not a lapse — asking for the gloss is the right thing to do', () => {
    // The distinction wire v3 exists to draw: tapping a gloss is information, not failure. If this
    // ever counts as a lapse, `stuck` starts naming words the learner was simply careful about.
    const after = proven().help('haus', D(4));
    expect(after.profile.units[unitKey('recognise', DE, 'haus')]?.lapses).toBe(0);
  });

  it('matches the free-function path exactly', () => {
    const viaFacade = proven().help('haus', D(4)).profile;
    const viaFree = record(proven().profile, [
      { kind: 'help', unit: unitKey('recognise', DE, 'haus'), day: D(4) },
    ]);
    expect(viaFacade).toEqual(viaFree);
  });

  it('canonicalises its word like the other writers', () => {
    expect(proven().help('HAUS', D(4)).profile).toEqual(proven().help('haus', D(4)).profile);
  });
});

describe('coverage() forwards the options it is given', () => {
  it('honours `ignore`, which a dropped-options bug would silently disable', () => {
    // ⚠️ `...(options ?? {})` mutated to `...(options && {})` SURVIVED: with options PRESENT that
    // spreads `{}` and throws the caller's query away. Nothing here passed options, so nothing saw
    // it — and `ignore` silently stopping work is not a crash, it is names counted as unknown words,
    // which drags a passage from in-band to too-hard and quietly makes every reading harder.
    const text = 'Anna geht aus dem Haus. Anna trinkt Wasser und Anna isst Brot heute in Berlin.';
    const anna = learner(createProfile('de', D(1)), ctx).claim(WORDS, D(1));

    const withIgnore = anna.coverage(text, { ignore: ['Anna'] });
    const without = anna.coverage(text);
    expect(withIgnore).not.toEqual(without);
    expect(withIgnore).toEqual(
      coverage(anna.profile, germanPack, {
        text,
        variety: DE,
        direction: 'recognise',
        ignore: ['Anna'],
      }),
    );
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
    expect(speak.summary().scope).toEqual({ kind: 'skill', variety: DE, modality: 'produce' });
  });
});
