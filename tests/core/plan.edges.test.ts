import { describe, expect, it } from 'vitest';

import type { Evidence } from '../../src/model/index.js';
import { unitKey, variety, type Day, type UnitKey } from '../../src/model/index.js';

import { OVER_ASK, plan, REASSESS_AFTER_DAYS, STUCK_AFTER_LAPSES } from '../../src/core/plan.js';
import { createProfile } from '../../src/core/profile/index.js';
import { record } from '../../src/core/record/index.js';

/**
 * The corners of `plan()` that the example and property suites reach only by accident.
 *
 * ⚠️ **EVERY TEST HERE WAS WRITTEN TO KILL A SPECIFIC SURVIVING MUTANT.** The first full mutation
 * run after wire v3 scored `plan.ts` at **80.5%** with 30 survivors, down from 88% before the
 * change — the new code (the deferred pass, the claim anchor, the two reporting counters) was
 * under-pinned, and nothing else in the suite said so.
 *
 * They cluster in one place for one reason: most of the new behaviour is only OBSERVABLE under a
 * condition the ordinary tests do not set up. The deferred pass needs the cap to actually bind AND
 * spare capacity to exist. `reassess.claimsStanding` needs the trigger to be due AND a standing
 * claim to exist. A boundary constant needs a fixture sitting exactly on it. Absent that, the code
 * runs and its result is never looked at.
 *
 * @module
 */

const V = variety('de');
const D = (n: number): Day => n as Day;
const U = (word: string): UnitKey => unitKey('recognise', V, word);
const claim = (word: string, day: number): Evidence => ({
  kind: 'claim',
  unit: U(word),
  day: D(day),
});
const drill = (word: string, outcome: 'known' | 'unknown', day: number): Evidence => ({
  kind: 'retrieval',
  unit: U(word),
  outcome,
  day: D(day),
});

describe('the deferred pass', () => {
  it('brings back capped new material, in comparator order, to fill spare slots', () => {
    // ⚠️ THE CLUSTER OF NINE SURVIVORS. This path only runs when the cap BINDS and capacity REMAINS,
    // and no other test set both up at once — so every mutant inside the second loop lived.
    //
    // Three new words, one review, a session of four, and a cap of one. Pass one takes the review
    // and one new word; the other two new words are deferred and then fill the remaining slots.
    let p = record(createProfile('de', D(1)), [drill('rev', 'known', 1), drill('rev', 'known', 2)]);
    p = record(p, [
      { kind: 'exposure', unit: U('anew'), day: D(3) },
      { kind: 'exposure', unit: U('bnew'), day: D(3) },
      { kind: 'exposure', unit: U('cnew'), day: D(3) },
    ]);

    const session = plan(p, { day: D(20), maxItems: 4, maxNew: 1 });

    // Full despite the cap — the cap must never shorten a session.
    expect(session.items).toHaveLength(4);
    expect(session.items.filter((i) => i.why === 'new')).toHaveLength(3);

    // ⚠️ AND IN COMPARATOR ORDER. The obvious implementation appends deferred items at the END,
    // which puts a new word after a review it outranks. Every unit here has never been attended
    // except `rev`, so the three new ones lead, alphabetically, and `rev` comes last.
    expect(session.items.map((i) => i.unit)).toEqual([U('anew'), U('bnew'), U('cnew'), U('rev')]);
  });

  it('does not re-admit a unit the first pass already took', () => {
    // Kills the `selected[i] === true` guard mutants: dropping it lets the second loop count an
    // already-chosen item again, so `taken` inflates and the session comes back short.
    let p = createProfile('de', D(1));
    p = record(
      p,
      ['a', 'b', 'c', 'd'].map((w) => ({ kind: 'exposure' as const, unit: U(w), day: D(2) })),
    );

    const session = plan(p, { day: D(10), maxItems: 4, maxNew: 2 });
    expect(session.items).toHaveLength(4);
    expect(new Set(session.items.map((i) => i.unit)).size).toBe(4);
  });

  it('stops at the limit rather than overfilling from the deferred queue', () => {
    // Kills the `taken >= limit` break in the second loop.
    let p = createProfile('de', D(1));
    p = record(
      p,
      Array.from({ length: 10 }, (_, i) => ({
        kind: 'exposure' as const,
        unit: U(`w${String(i)}`),
        day: D(2),
      })),
    );
    expect(plan(p, { day: D(10), maxItems: 3, maxNew: 0 }).items).toHaveLength(3);
  });

  it('never defers anything that is not new', () => {
    // Kills the `item.why !== 'new'` guard: without it, review and verify items enter the deferred
    // queue and can be admitted twice.
    let p = record(createProfile('de', D(1)), [claim('claimed', 1)]);
    p = record(p, [drill('rev', 'known', 1), drill('rev', 'known', 2)]);

    const session = plan(p, { day: D(30), maxItems: 5, maxNew: 0 });
    expect(session.items.map((i) => i.why).sort()).toEqual(['review', 'verify']);
    expect(new Set(session.items.map((i) => i.unit)).size).toBe(2);
  });
});

describe('the attendance anchor', () => {
  it('takes the LATER of the ask and the claim', () => {
    // Kills the `attendedOn` conditional and comparison mutants. A unit can be both claimed and
    // asked, and only a fixture where the two differ — in both directions — pins which wins.
    const askedLater = record(createProfile('de', D(1)), [
      claim('x', 5),
      drill('x', 'unknown', 20),
    ]);
    expect(plan(askedLater, { day: D(30), maxItems: 1, maxNew: 1 }).items[0]?.daysWaiting).toBe(10);

    const claimedLater = record(createProfile('de', D(1)), [
      drill('y', 'unknown', 5),
      claim('y', 20),
    ]);
    expect(plan(claimedLater, { day: D(30), maxItems: 1, maxNew: 1 }).items[0]?.daysWaiting).toBe(
      10,
    );
  });

  it('uses the claim date, not the epoch, for a never-asked claimed unit', () => {
    // Kills the `: (1 as Day)` fallback mutant and the `'claimed'` string literal. If a standing
    // claim fell back to 0, every placed word would report the full span since the epoch — which is
    // exactly the sentinel confusion `Prior` was made a union to avoid.
    const p = record(createProfile('de', D(1)), [claim('x', 12)]);
    const item = plan(p, { day: D(30), maxItems: 1, maxNew: 1 }).items[0];
    expect(item?.daysWaiting).toBe(18);
    expect(item?.why).toBe('verify');
  });
});

describe('the reporting counters', () => {
  it('counts standing claims onto a due reassessment', () => {
    // Kills the five mutants on `if (why === 'verify') claimsStanding += 1`. The counter is only
    // ever READ on the `'due'` arm, so a fixture that is not due can never observe it.
    let p = record(createProfile('de', D(1)), [claim('a', 1), claim('b', 1), claim('c', 1)]);
    p = record(p, [drill('a', 'known', 2)]);

    const due = plan(p, { day: D(200), maxItems: 2, maxNew: 0 }).reassess;
    expect(due.kind).toBe('due');
    if (due.kind !== 'due') return;
    // `a` was asked, so it is no longer standing. Two remain.
    expect(due.claimsStanding).toBe(2);
  });

  it('reports a word as stuck exactly at the threshold, not one either side', () => {
    // Kills the `>=` mutant on the lapse check.
    let p = createProfile('de', D(1));
    for (let i = 1; i <= STUCK_AFTER_LAPSES - 1; i++) p = record(p, [drill('bad', 'unknown', i)]);
    expect(plan(p, { day: D(50), maxItems: 5, maxNew: 5 }).stuck).toEqual([]);

    p = record(p, [drill('bad', 'unknown', STUCK_AFTER_LAPSES)]);
    expect(plan(p, { day: D(50), maxItems: 5, maxNew: 5 }).stuck).toEqual([U('bad')]);
  });

  it('goes due exactly on the threshold day', () => {
    // Kills the `>=` mutant on the reassessment check. One day either side of the boundary.
    const p = record(createProfile('de', D(1)), [drill('x', 'known', 10)]);

    const dayBefore = plan(p, {
      day: D(10 + REASSESS_AFTER_DAYS - 1),
      maxItems: 1,
      maxNew: 0,
    }).reassess;
    expect(dayBefore.kind).toBe('not-due');
    if (dayBefore.kind === 'not-due') expect(dayBefore.daysUntil).toBe(1);

    expect(
      plan(p, { day: D(10 + REASSESS_AFTER_DAYS), maxItems: 1, maxNew: 0 }).reassess.kind,
    ).toBe('due');
  });

  it('tracks the latest proof across the whole profile, not the last one it happened to visit', () => {
    // Kills the `>` mutant on `lastProvenAnywhere`. Two units proven on different days, with the
    // LATER one earlier in key order — so a comparator that took the last visited would be wrong.
    const p = record(createProfile('de', D(1)), [drill('a', 'known', 40), drill('z', 'known', 5)]);
    const r = plan(p, { day: D(80), maxItems: 2, maxNew: 0 }).reassess;
    expect(r.kind).toBe('due');
    // 80 − 40, not 80 − 5. Taking the last unit visited in key order would give 75.
    if (r.kind === 'due') expect(r.daysSinceProven).toBe(40);
  });
});

describe('the content request', () => {
  it('over-asks in proportion, so the cap is not smuggled past by naming spares', () => {
    // Kills the `maxItems * OVER_ASK` arithmetic mutant. `units` may exceed `maxItems`, but the new
    // material inside it must scale by the same factor — otherwise a host taking the first N it can
    // build would introduce more new words than the cap allows.
    let p = createProfile('de', D(1));
    p = record(
      p,
      Array.from({ length: 60 }, (_, i) => ({
        kind: 'exposure' as const,
        unit: U(`w${String(i).padStart(2, '0')}`),
        day: D(2),
      })),
    );
    const session = plan(p, { day: D(10), maxItems: 4, maxNew: 2 });
    expect(session.items).toHaveLength(4);
    // ⚠️ NOT `4 * OVER_ASK`. Every unit here is new, so the SCALED cap binds first: the engine will
    // name at most `maxNew * OVER_ASK` new words however many spares it was asked for. Naming twelve
    // when the extended cap is six would smuggle new material past the budget through the back door,
    // since a host is told it may build any of them.
    expect(session.content.units).toHaveLength(2 * OVER_ASK);
    expect(session.content.units.slice(0, 4)).toEqual(session.items.map((i) => i.unit));
  });

  it('names the session first, so any prefix of `content.units` matches it', () => {
    // ⚠️ A REAL DEFECT, CAUGHT IN REVIEW. `ContentRequest.units` promises that "a host takes the
    // first maxItems it can actually build". The first implementation re-ran the selection with both
    // limits multiplied by OVER_ASK — and because new material scores the maximum possible wait, the
    // scaled cap admitted `maxNew * OVER_ASK` new words BEFORE any review was reachable.
    //
    // Measured on this fixture at maxItems 20 / maxNew 5: the session was 5 new and 15 review, while
    // the first 20 NAMED units were 15 new and 5 review. A host following the documented contract
    // would have run a session the engine never chose.
    let p = createProfile('de', D(1));
    p = record(
      p,
      Array.from({ length: 60 }, (_, i) => ({
        kind: 'exposure' as const,
        unit: U(`new${String(i).padStart(2, '0')}`),
        day: D(29),
      })),
    );
    p = record(
      p,
      Array.from({ length: 100 }, (_, i) => `old${String(i).padStart(3, '0')}`).flatMap(
        (w): Evidence[] => [drill(w, 'known', 1), drill(w, 'known', 1)],
      ),
    );

    const session = plan(p, { day: D(30), maxItems: 20, maxNew: 5 });
    expect(session.items.filter((i) => i.why === 'new')).toHaveLength(5);

    const prefix = session.content.units.slice(0, session.items.length);
    expect(prefix).toEqual(session.items.map((i) => i.unit));
  });

  it('treats an absent priority list as an empty one', () => {
    // Kills the `?? []` array-declaration mutant: a non-empty default would give some unit a
    // priority index it never earned, silently reordering ties.
    let p = createProfile('de', D(1));
    p = record(
      p,
      ['b', 'a'].map((w) => ({ kind: 'exposure' as const, unit: U(w), day: D(2) })),
    );

    const withoutPriority = plan(p, { day: D(10), maxItems: 2, maxNew: 2 });
    const withEmpty = plan(p, { day: D(10), maxItems: 2, maxNew: 2, priority: [] });
    expect(withoutPriority).toEqual(withEmpty);
    // Both fall back to the key tiebreak, which is alphabetical.
    expect(withoutPriority.items.map((i) => i.unit)).toEqual([U('a'), U('b')]);
  });

  it('reports an empty stuck list rather than omitting it', () => {
    // Kills the `stuck: UnitKey[] = []` array-declaration mutant.
    const p = record(createProfile('de', D(1)), [drill('x', 'known', 1)]);
    expect(plan(p, { day: D(10), maxItems: 1, maxNew: 0 }).stuck).toEqual([]);
  });
});
