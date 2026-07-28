import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { Evidence } from '../model/evidence.js';
import { unitKey, variety, type Day, type UnitKey } from '../model/ids.js';
import type { Profile } from '../model/profile.js';

import { deserialize, serialize } from './persist.js';
import { advanceTo, createProfile } from './profile.js';
import { record } from './record.js';

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

const arbUnit: fc.Arbitrary<UnitKey> = fc
  .tuple(
    fc.constantFrom('recognise' as const, 'produce' as const),
    fc.constantFrom(AR, LEV),
    fc.constantFrom(...WORDS),
  )
  .map(([dir, v, word]) => unitKey(dir, v, word));

const arbOp: fc.Arbitrary<Op> = fc.oneof(
  {
    weight: 6,
    arbitrary: fc.record({
      kind: fc.constant('record' as const),
      evidence: fc.record({
        unit: arbUnit,
        outcome: fc.constantFrom('known' as const, 'unknown' as const),
        tested: fc.boolean(),
        // Deliberately unordered. A host syncing an offline queue replays evidence out of order, and
        // that is exactly where time went backwards before.
        day: fc.integer({ min: 0, max: 200 }).map((n) => n as Day),
      }),
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
        let profile = createProfile('ar', 0 as Day);
        const lastSeen = new Map<string, number>();
        const confirmed = new Map<string, number>();
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

            if (state.box === 'understood') {
              const prevConfirmed = confirmed.get(key) ?? 0;
              expect(
                state.confirmedOn,
                `${where}: confirmedOn went backwards`,
              ).toBeGreaterThanOrEqual(prevConfirmed);
              confirmed.set(key, state.confirmedOn);
            }
          }
        }
      }),
    );
  });

  it('never forgets a unit it has met, across any sequence', () => {
    fc.assert(
      fc.property(fc.array(arbOp, { maxLength: 60 }), (ops) => {
        let profile = createProfile('ar', 0 as Day);
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
        const withRestarts = ops.reduce(applyOp, createProfile('ar', 0 as Day));
        const withoutRestarts = ops
          .filter((op) => op.kind !== 'restart')
          .reduce(applyOp, createProfile('ar', 0 as Day));
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
          fc.record({
            unit: arbUnit,
            outcome: fc.constantFrom('known' as const, 'unknown' as const),
            tested: fc.boolean(),
            day: fc.integer({ min: 0, max: 200 }).map((n) => n as Day),
          }),
          { maxLength: 30 },
        ),
        (evidence) => {
          const byDay = [...evidence].sort((a, b) => a.day - b.day);
          const forwards = record(createProfile('ar', 0 as Day), byDay);
          const backwards = record(createProfile('ar', 0 as Day), [...byDay].reverse());

          // Timestamps must agree exactly — they are monotonic by construction.
          for (const [key, state] of Object.entries(forwards.units)) {
            const other = backwards.units[key as UnitKey];
            expect(other?.lastSeen, `lastSeen for ${key}`).toBe(state.lastSeen);
            expect(other?.seen, `seen for ${key}`).toBe(state.seen);
          }
        },
      ),
    );
  });
});
