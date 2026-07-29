import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { Evidence } from '../model/evidence.js';
import { unitKey, variety, type Day, type UnitKey } from '../model/ids.js';
import type { Profile } from '../model/profile.js';

import { deserialize, serialize } from './persist.js';
import { advanceTo, createProfile } from './profile.js';
import { record } from './record.js';
import { arbEvidence as anyEvidence } from '../testing/evidence.js';

/**
 * Laws about SEQUENCES, which is the class no single-function test can express.
 *
 * Every other test in this package drives one call, or one batch. But `record`, `advanceTo` and —
 * soon — `plan` interleave over a learner's whole history, and a scheduler's genuinely nasty bugs
 * live in that interleaving: record, sleep a day, record the same unit again, sleep thirty days,
 * plan. The fold law does not cover it either, because both of its paths break identically.
 *
 * These are written as an operation sequence rather than fc.commands, because the model here is
 * trivial (a few monotonic counters) and a hand-rolled model would just be a second implementation
 * to keep in sync. What matters is that invariants are checked after EVERY step, so a failure names
 * the operation that broke them rather than the end state.
 *
 * @module
 */

const AR = variety('ar-msa')!;
const LEV = variety('ar-levantine')!;
const WORDS = ['سوق', 'كتاب', 'بيت', 'ماء'];

type Op =
  | { readonly kind: 'record'; readonly evidence: Evidence }
  | { readonly kind: 'advance'; readonly day: Day }
  /** Save and reload mid-run. Asserts persistence is TRANSPARENT, not merely reversible. */
  | { readonly kind: 'restart' };

const arbOp: fc.Arbitrary<Op> = fc.oneof(
  {
    weight: 6,
    arbitrary: fc.record({
      kind: fc.constant('record' as const),
      // Deliberately unordered days. A host syncing an offline queue replays evidence out of order,
      // and that is exactly where time went backwards before.
      evidence: fc.oneof(
        anyEvidence({ variety: AR, words: WORDS, maxDay: 200 }),
        anyEvidence({ variety: LEV, words: WORDS, maxDay: 200 }),
      ),
    }),
  },
  {
    weight: 3,
    arbitrary: fc.record({
      kind: fc.constant('advance' as const),
      day: fc.integer({ min: 0, max: 200 }).map((n) => n as Day),
    }),
  },
  { weight: 1, arbitrary: fc.constant({ kind: 'restart' as const }) },
);

function applyOp(profile: Profile, op: Op): Profile {
  switch (op.kind) {
    case 'record':
      return record(profile, [op.evidence]);
    case 'advance':
      return advanceTo(profile, op.day);
    case 'restart': {
      const back = deserialize(serialize(profile));
      if (!back.ok) throw new Error(`restart lost the profile: ${back.error.message}`);
      return back.value;
    }
  }
}

describe('sequences', () => {
  it('never lets a unit travel backwards in time', () => {
    // The bug this was written for: a late-arriving day-3 item rewound a unit last seen on day 40,
    // so a unit proven yesterday reported itself last proven 37 days ago. Nothing errored, and it
    // would have stayed invisible until plan() did interval arithmetic — surfacing much later as a
    // scheduling bug traced to a commit months earlier.
    fc.assert(
      fc.property(fc.array(arbOp, { maxLength: 60 }), (ops) => {
        let profile = createProfile('ar', 1 as Day);
        const lastSeen = new Map<string, number>();
        const confirmed = new Map<string, number>();
        const asked = new Map<string, number>();
        const seen = new Map<string, number>();

        for (const [i, op] of ops.entries()) {
          profile = applyOp(profile, op);

          for (const [key, state] of Object.entries(profile.units)) {
            const where = `op ${String(i)} (${op.kind}), unit ${key}`;

            const prevSeen = seen.get(key) ?? 0;
            expect(state.seen, `${where}: seen went backwards`).toBeGreaterThanOrEqual(prevSeen);
            seen.set(key, state.seen);

            const prevLast = lastSeen.get(key) ?? 0;
            expect(state.lastSeen, `${where}: lastSeen went backwards`).toBeGreaterThanOrEqual(
              prevLast,
            );
            lastSeen.set(key, state.lastSeen);

            // ⚠️ CHECKED UNCONDITIONALLY NOW. v2 could only assert this on the `understood` arm,
            // because `confirmedOn` did not exist on the other one — so a proven-then-demoted unit's
            // anchor was unwatched for exactly the stretch where rewinding it would matter most.
            // The flat shape means every unit carries the anchor at all times, so every unit is
            // checked at every step.
            const prevProven = confirmed.get(key) ?? 0;
            expect(state.lastProven, `${where}: lastProven went backwards`).toBeGreaterThanOrEqual(
              prevProven,
            );
            confirmed.set(key, state.lastProven);

            const prevAsked = asked.get(key) ?? 0;
            expect(state.lastAsked, `${where}: lastAsked went backwards`).toBeGreaterThanOrEqual(
              prevAsked,
            );
            asked.set(key, state.lastAsked);
          }
        }
      }),
    );
  });

  it('never forgets a unit it has met, across any sequence', () => {
    fc.assert(
      fc.property(fc.array(arbOp, { maxLength: 60 }), (ops) => {
        let profile = createProfile('ar', 1 as Day);
        const met = new Set<string>();
        for (const op of ops) {
          profile = applyOp(profile, op);
          for (const key of met) {
            expect(key in profile.units, `lost ${key}`).toBe(true);
          }
          for (const key of Object.keys(profile.units)) met.add(key);
        }
      }),
    );
  });

  it('closing and reopening the app changes nothing', () => {
    // Restart-equivalence: a learner who shuts the app every night must end up exactly where one
    // who never closes it does. Persistence being reversible (the round-trip law) is weaker than
    // persistence being TRANSPARENT — a reloaded profile must also behave identically from then on,
    // which only a mid-sequence reload can show.
    fc.assert(
      fc.property(fc.array(arbOp, { maxLength: 50 }), (ops) => {
        const withRestarts = ops.reduce(applyOp, createProfile('ar', 1 as Day));
        const withoutRestarts = ops
          .filter((op) => op.kind !== 'restart')
          .reduce(applyOp, createProfile('ar', 1 as Day));
        expect(withRestarts).toEqual(withoutRestarts);
      }),
    );
  });

  it('reaches the same state regardless of the order evidence arrives in', () => {
    // A sync queue makes no ordering promise. If shuffling delivery changes the outcome, then two
    // learners who did identical work get different schedules because one of them had worse
    // connectivity.
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            anyEvidence({ variety: AR, words: WORDS, maxDay: 200 }),
            anyEvidence({ variety: LEV, words: WORDS, maxDay: 200 }),
          ),
          { maxLength: 30 },
        ),
        (evidence) => {
          const byDay = [...evidence].sort((a, b) => a.day - b.day);
          const forwards = record(createProfile('ar', 1 as Day), byDay);
          const backwards = record(createProfile('ar', 1 as Day), [...byDay].reverse());

          // ⚠️ EVERY MAX-FOLD AND EVERY COUNTER, not just two of them.
          //
          // Before v3 this law checked `lastSeen` and `seen` alone. That was adequate when the only
          // other state was a box and a streak; it stopped being adequate the moment `coverage()`
          // began reading a rung, because a saturating ladder is exactly the kind of thing that
          // could quietly become order-dependent in a way nothing asserted. Widened deliberately.
          for (const [key, state] of Object.entries(forwards.units)) {
            const other = backwards.units[key as UnitKey];
            expect(other?.seen, `seen for ${key}`).toBe(state.seen);
            expect(other?.lastSeen, `lastSeen for ${key}`).toBe(state.lastSeen);
            expect(other?.lastAsked, `lastAsked for ${key}`).toBe(state.lastAsked);
            expect(other?.lastProven, `lastProven for ${key}`).toBe(state.lastProven);
            expect(other?.prior, `prior for ${key}`).toEqual(state.prior);
          }
        },
      ),
    );
  });

  it('is order-dependent in the ledger, and ONLY in the ledger', () => {
    // ⚠️ THIS LAW EXISTS TO STATE A LIMITATION HONESTLY, not to prove something works.
    //
    // A saturating walk does not commute: from rung 0, a miss then a hit ends at 1, while a hit then
    // a miss ends at 0. So `strength` and `lapses` genuinely depend on delivery order, and no
    // amount of care in `record` changes that. This is not new — v2's `streak` and `box` were
    // order-dependent in exactly the same way — but it became LOAD-BEARING when `coverage()` started
    // reading the rung.
    //
    // The commuting alternative was considered and rejected: storing `proved` and `failed` counts
    // and deriving a rung from the ratio commutes perfectly and can never forget, so a word proven
    // 400 times and now failing half the time would read at the ceiling for months.
    //
    // Two things follow, and both are stated in `record`'s contract and in the client guide: a host
    // draining an offline queue should sort by day first, and the repair path is a re-fold from the
    // evidence log — which is why keeping that log is a host obligation rather than a nicety.
    const unit = unitKey('recognise', AR, 'سوق');
    const hit = { kind: 'retrieval' as const, unit, outcome: 'known' as const, day: 1 as Day };
    const miss = { kind: 'retrieval' as const, unit, outcome: 'unknown' as const, day: 1 as Day };

    const missFirst = record(createProfile('ar', 1 as Day), [miss, hit]);
    const hitFirst = record(createProfile('ar', 1 as Day), [hit, miss]);

    expect(missFirst.units[unit]?.strength).toBe(1);
    expect(hitFirst.units[unit]?.strength).toBe(0);
    // The dates, which is what the law above covers, agree exactly either way.
    expect(missFirst.units[unit]?.lastAsked).toBe(hitFirst.units[unit]?.lastAsked);
    expect(missFirst.units[unit]?.lastProven).toBe(hitFirst.units[unit]?.lastProven);
  });
});
