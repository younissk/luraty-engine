import { describe, expect, it } from 'vitest';

import { unitKey, variety, type Day } from '../../src/model/index.js';
import type { PackConfig } from '../../src/model/index.js';
import { germanPack } from '../../src/testing/packs.js';

import { vocabularyOf } from '../../src/core/bulk/index.js';
import { createPack } from '../../src/core/pack.js';
import { plan } from '../../src/core/plan.js';
import { learner } from '../../src/core/learner.js';
import { createProfile } from '../../src/core/profile/index.js';
import { record } from '../../src/core/record/index.js';

/**
 * The defaults, and the two things they are NOT allowed to do.
 *
 * A default is a decision made for someone who was not asked, so each one here carries the
 * measurement or the guarantee that makes it safe — and the cases where a default would be silently
 * wrong are pinned as staying explicit.
 *
 * @module
 */

const DE = variety('de');
const D = (n: number): Day => n as Day;
const WORDS = vocabularyOf(germanPack, 'der die und haus brot mann wasser gehen essen kind');

describe('a pack id must be a legal variety', () => {
  it('rejects a colon-bearing id at the door', () => {
    // ⚠️ A REAL LATENT BUG, not a hypothetical. Before this check, `createPack` accepted `'ar:msa'`
    // while `variety()` rejected the same string — and used as a variety it produced
    // `recognise:ar:msa:سوق`, which `parseUnitKey` reads back as variety `ar`, word `msa:سوق`.
    // A pack that builds, reports healthy, and silently re-addresses every word it owns.
    const built = createPack(
      {
        id: 'ar:msa',
        tokenize: { strategy: 'regex', pattern: '[a-z]+' },
        normalize: [],
        compare: [],
      } as unknown as PackConfig,
      { frequency: 'a b' },
    );
    expect(built.ok).toBe(false);
    if (!built.ok) expect(built.error.message).toContain('legal variety');
  });

  it('brands the id, so `pack.id` can BE the variety', () => {
    // The type is the guarantee that lets `learner()` default without an error channel.
    expect(germanPack.id).toBe('de');
    expect(unitKey('recognise', germanPack.id, 'haus')).toBe(unitKey('recognise', DE, 'haus'));
  });
});

describe('learner() defaults its variety from the pack', () => {
  it('addresses the same units as an explicit variety', () => {
    const implicit = learner(createProfile('de', D(1)), { pack: germanPack }).answer(
      'haus',
      'known',
      D(1),
    );
    const explicit = learner(createProfile('de', D(1)), { pack: germanPack, variety: DE }).answer(
      'haus',
      'known',
      D(1),
    );
    expect(implicit.profile).toEqual(explicit.profile);
    expect(implicit.variety).toBe(DE);
  });

  it('still lets a diglossic host say which variety it means', () => {
    // ⚠️ THE CASE THE DEFAULT MUST NOT SWALLOW. One profile, two varieties, measured separately —
    // if a host ever runs one pack over both, the default would merge her reading and her home
    // dialect into one unit key.
    const levantine = variety('ar-levantine');
    const two = learner(createProfile('ar', D(1)), { pack: germanPack, variety: levantine }).answer(
      'haus',
      'known',
      D(1),
    );
    expect(two.profile.units[unitKey('recognise', levantine, 'haus')]).toBeDefined();
    expect(two.profile.units[unitKey('recognise', germanPack.id, 'haus')]).toBeUndefined();
  });
});

describe('maxNew defaults to half the session', () => {
  it('matches an explicit floor(maxItems / 2)', () => {
    const p = record(
      createProfile('de', D(1)),
      WORDS.map((w) => ({
        kind: 'exposure' as const,
        unit: unitKey('recognise', DE, w),
        day: D(1),
      })),
    );
    for (const maxItems of [4, 5, 8, 12, 20]) {
      const implicit = plan(p, { day: D(9), maxItems });
      const explicit = plan(p, { day: D(9), maxItems, maxNew: Math.floor(maxItems / 2) });
      expect(implicit, `maxItems ${String(maxItems)}`).toEqual(explicit);
    }
  });

  it('leaves the cliff exactly where it was', () => {
    // ⚠️ THE DEFAULT DOES NOT REMOVE THE FOOTGUN, and pretending otherwise would be the dangerous
    // half. `maxNew === maxItems` is still catastrophic — a legal explicit number, and the most
    // natural thing to type when asked "how many new units may be introduced" for a full session.
    // Measured: a year of daily practice at that setting ends with the learner knowing ZERO words,
    // because no word is ever drilled a second time.
    //
    // What the default fixes is the OMISSION, which used to be a compile error and is now the peak.
    // The year-long measurement behind that number lives in `budget.sweep.test.ts`.
    //
    // ⚠️ The cap only BINDS when maintenance work exists — a session with nothing but new material
    // fills up regardless, which is the documented soft-cap behaviour and not the cliff. So this
    // fixture has both: five proven words due for review, and five never-met ones.
    let p = createProfile('de', D(1));
    const proven = WORDS.slice(0, 5);
    const fresh = WORDS.slice(5);
    p = record(
      p,
      proven.flatMap((w) => [
        {
          kind: 'retrieval' as const,
          unit: unitKey('recognise', DE, w),
          outcome: 'known' as const,
          day: D(1),
        },
        {
          kind: 'retrieval' as const,
          unit: unitKey('recognise', DE, w),
          outcome: 'known' as const,
          day: D(1),
        },
      ]),
    );
    p = record(
      p,
      fresh.map((w) => ({
        kind: 'exposure' as const,
        unit: unitKey('recognise', DE, w),
        day: D(1),
      })),
    );

    const defaulted = plan(p, { day: D(9), maxItems: 6 });
    const cliff = plan(p, { day: D(9), maxItems: 6, maxNew: 6 });
    expect(defaulted.items.filter((i) => i.why === 'new')).toHaveLength(3);
    expect(defaulted.items.filter((i) => i.why !== 'new')).toHaveLength(3);
    // At the cliff, maintenance gets nothing — which compounded over a year is the zero.
    expect(cliff.items.filter((i) => i.why === 'new')).toHaveLength(5);
  });
});

describe('a motivated learner, on one day', () => {
  it('gets more by recording and planning again — never by moving the day', () => {
    // ⚠️ `maxItems` IS PER CALL, NOT PER DAY. The engine has no notion of a daily budget, so "give
    // me more" is: record what she just did, call plan again. It dries up on its own, because
    // answering sets `lastAsked = today` and the unit drops out of the queue.
    //
    // Do NOT advance the day to unlock more. That tells the engine a night of sleep happened, which
    // is precisely what every interval in here is a claim about.
    let anna = learner(createProfile('de', D(1)), { pack: germanPack, vocabulary: WORDS }).claim(
      WORDS,
      D(1),
    );
    let rounds = 0;
    let served = 0;
    for (;;) {
      const s = anna.plan({ day: D(1), maxItems: 4 });
      if (s.items.length === 0) break;
      rounds += 1;
      served += s.items.length;
      for (const item of s.items) {
        anna = anna.record([{ kind: 'retrieval', unit: item.unit, outcome: 'known', day: D(1) }]);
      }
      expect(rounds, 'should terminate').toBeLessThan(20);
    }
    expect(served).toBe(WORDS.length);
    expect(rounds).toBeGreaterThan(1);
    // And once the pool is exhausted for today, it stays exhausted for today.
    expect(anna.plan({ day: D(1), maxItems: 4 }).items).toEqual([]);
  });
});

describe('read() is the intake path', () => {
  it('is how words enter the profile at all', () => {
    // Worth a test because it LOOKS inert: exposure moves `seen` and `lastSeen` and nothing that
    // schedules or is trusted. What it actually does is mint the unit — and `plan()` iterates the
    // profile, so without it there is nothing to schedule.
    const empty = learner(createProfile('de', D(1)), { pack: germanPack, vocabulary: WORDS });
    expect(empty.plan({ day: D(1), maxItems: 10 }).items).toEqual([]);

    const afterReading = empty.read('Der Mann trinkt Wasser und isst Brot.', D(1));
    const session = afterReading.plan({ day: D(1), maxItems: 10 });
    expect(session.items.length).toBeGreaterThan(0);
    expect(session.items.every((i) => i.why === 'new')).toBe(true);

    // But it proves nothing: every unit it minted is at rung 0, never asked, never proven.
    for (const state of Object.values(afterReading.profile.units)) {
      expect(state.seen).toBe(1);
      expect(state.lastAsked).toBe(0);
      expect(state.lastProven).toBe(0);
      expect(state.strength).toBe(0);
    }
    expect(afterReading.summary().known).toBe(0);
  });
});
