import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { Evidence } from '../../src/model/index.js';
import { unitKey, variety, type Day, type UnitKey } from '../../src/model/index.js';
import type { Profile } from '../../src/model/index.js';

import { DEFAULT_REVIEW_GAP_DAYS, plan } from '../../src/core/plan.js';
import { deserialize, serialize } from '../../src/core/persist.js';
import { advanceTo, createProfile } from '../../src/core/profile.js';
import { record } from '../../src/core/record.js';
import { isKnown, KNOWN_AT_STRENGTH } from '../../src/model/index.js';

/**
 * Laws for {@link plan}.
 *
 * @module
 */

const V = variety('ar-msa');
const D = (n: number): Day => n as Day;

/** A profile of `size` units with assorted, arbitrary histories. */
const anyProfile = fc
  .array(
    fc.record({
      word: fc.string({ minLength: 1, maxLength: 6, unit: fc.constantFrom(...'abcdefgh') }),
      direction: fc.constantFrom('recognise' as const, 'produce' as const),
      day: fc.nat({ max: 60 }),
      // ⚠️ All four kinds. Without `claim` here, NOTHING in this file would ever see a `'verify'`
      // item, and every law below would be a law about three quarters of the scheduler.
      kind: fc.constantFrom(
        'retrieval' as const,
        'exposure' as const,
        'help' as const,
        'claim' as const,
      ),
      outcome: fc.constantFrom('known' as const, 'unknown' as const),
    }),
    { maxLength: 40 },
  )
  .map((rows): Profile => {
    const evidence: Evidence[] = rows.map((r) => {
      const unit = unitKey(r.direction, V, r.word);
      return r.kind === 'retrieval'
        ? { kind: 'retrieval', unit, outcome: r.outcome, day: D(r.day) }
        : { kind: r.kind, unit, day: D(r.day) };
    });
    return record(createProfile('ar', D(1)), evidence);
  });

// ⚠️ `maxNew` MUST be generated. It is a required option, so omitting it here would not merely
// under-cover the budget — it would make every law below run at one arbitrary setting chosen by
// whoever wrote the file, which is the definition of a vacuous sweep.
const anyOptions = fc.record({
  day: fc.nat({ max: 400 }).map(D),
  maxItems: fc.nat({ max: 30 }),
  maxNew: fc.nat({ max: 30 }),
  reviewGapDays: fc.nat({ max: 10 }),
});

describe('plan laws', () => {
  it('never throws, whatever the profile and options', () => {
    fc.assert(
      fc.property(anyProfile, anyOptions, (profile, options) => {
        plan(profile, options);
      }),
    );
  });

  it('returns only real, due units — and never more than asked for', () => {
    fc.assert(
      fc.property(anyProfile, anyOptions, (profile, options) => {
        const session = plan(profile, options);

        expect(session.items.length).toBeLessThanOrEqual(options.maxItems);
        expect(session.day).toBe(options.day);

        for (const item of session.items) {
          // Every item is a unit the learner has actually met. A scheduler inventing keys would
          // hand the host an exercise for a word that is not in this learner's history at all.
          const state = profile.units[item.unit];
          expect(state, item.unit).toBeDefined();
          expect(item.daysWaiting).toBeGreaterThanOrEqual(0);

          // And every item is genuinely due — but "due" has two arms, because `reviewGapDays` is
          // the wait a KNOWN unit serves between reviews. A unit below the known rung is still being
          // acquired and may come back the next day. Stated as a disjunction rather than dropped:
          // the gap must still bind everything it covers, or the law would pass for a scheduler
          // that ignored spacing entirely.
          if (state !== undefined && isKnown(state)) {
            expect(item.daysWaiting, item.unit).toBeGreaterThanOrEqual(options.reviewGapDays);
          }
        }

        // Distinct: one unit cannot fill two slots in one session.
        const keys = session.items.map((i) => i.unit);
        expect(new Set(keys).size).toBe(keys.length);
      }),
    );
  });

  it('orders by a total comparator, so the result cannot depend on input order', () => {
    fc.assert(
      fc.property(anyProfile, anyOptions, (profile, options) => {
        const items = plan(profile, options).items;
        for (let i = 1; i < items.length; i++) {
          const prev = items[i - 1]!;
          const curr = items[i]!;
          // Longest wait first; ties broken by key, which is unique — so there is no pair the
          // comparator returns 0 for, and an unstable `Array.prototype.sort` has nothing to be
          // unstable about.
          const ordered =
            prev.daysWaiting > curr.daysWaiting ||
            (prev.daysWaiting === curr.daysWaiting && prev.unit < curr.unit);
          expect(ordered, `${prev.unit} before ${curr.unit}`).toBe(true);
        }
      }),
    );
  });

  it('gives the same session before and after a save/load cycle', () => {
    // As a law rather than one example. `Object.keys` order differs between a profile built by
    // replaying evidence and the same profile loaded from storage, so a scheduler reading the map's
    // own order would silently change a learner's session at every app restart.
    fc.assert(
      fc.property(anyProfile, anyOptions, (profile, options) => {
        const loaded = deserialize(serialize(profile));
        expect(loaded.ok).toBe(true);
        if (!loaded.ok) return;
        expect(plan(loaded.value, options)).toEqual(plan(profile, options));
      }),
    );
  });

  it('is monotone in the day — waiting longer never removes work', () => {
    fc.assert(
      fc.property(anyProfile, fc.nat({ max: 200 }), fc.nat({ max: 50 }), (profile, day, extra) => {
        // ⚠️ `maxNew` is generated OFF the extremes on purpose. The cap is the one thing in v3 that
        // could break this law — if a capped new item were dropped rather than deferred, more
        // elapsed days could move units between buckets and SHRINK the session. The deferred pass
        // is what keeps `items.length === min(maxItems, due)` at every setting, and this law is
        // where that would show.
        const opts = { maxItems: 1000, maxNew: 3, reviewGapDays: DEFAULT_REVIEW_GAP_DAYS };
        const today = plan(profile, { ...opts, day: D(day) }).items.length;
        const later = plan(profile, { ...opts, day: D(day + extra) }).items.length;
        // Nothing is recorded in between, so every unit's wait only grows.
        expect(later).toBeGreaterThanOrEqual(today);
      }),
    );
  });

  it('starves nothing — every unit in the pool is reached within one rotation', () => {
    // ⚠️ THE LAW THAT DECIDES WHETHER CUMULATIVE REVIEW ACTUALLY WORKS.
    //
    // ADR-0003 invariant 2 says nothing ever graduates out of the pool. That is cheap to satisfy on
    // paper — just never delete anything — and worthless if the scheduler then serves the same head
    // of the queue forever while the tail is never seen again. A starving scheduler passes every
    // example test in the file next door, because examples supply small profiles.
    //
    // The bound is arithmetic rather than a guess: serving a unit resets its anchor to today while
    // every unserved unit gains a day, so the unserved set strictly dominates from the next day on.
    // With a pool of P and `take` per day, every unit is reached within ceil(P / take) days.
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 40 }),
        fc.integer({ min: 1, max: 8 }),
        (poolSize, take) => {
          let profile = createProfile('ar', D(1));
          const pool: UnitKey[] = [];
          for (let i = 0; i < poolSize; i++) {
            const unit = unitKey('recognise', V, `w${String(i)}`);
            pool.push(unit);
            // Proven on day 1, so nothing starts artificially overdue.
            profile = record(profile, [
              { kind: 'retrieval', unit, outcome: 'known', day: D(1) },
              { kind: 'retrieval', unit, outcome: 'known', day: D(1) },
            ]);
          }

          const served = new Set<UnitKey>();
          const rotation = Math.ceil(poolSize / take);
          // The gap holds units back for its own duration, so the honest horizon is one rotation
          // plus the gap, not one rotation.
          const horizon = rotation + DEFAULT_REVIEW_GAP_DAYS + 1;

          for (let d = 2; d <= 1 + horizon; d++) {
            profile = advanceTo(profile, D(d));
            // Everything in this pool has been proven, so nothing is `'new'` and the cap is inert
            // here — set high deliberately, so a starvation failure can never be blamed on it.
            const session = plan(profile, { day: D(d), maxItems: take, maxNew: take });
            const drills: Evidence[] = [];
            for (const item of session.items) {
              served.add(item.unit);
              for (let i = 0; i < KNOWN_AT_STRENGTH; i++) {
                drills.push({ kind: 'retrieval', unit: item.unit, outcome: 'known', day: D(d) });
              }
            }
            profile = record(profile, drills);
          }

          const missed = pool.filter((u) => !served.has(u));
          expect(missed, `starved after ${String(horizon)} days`).toEqual([]);
        },
      ),
    );
  });

  it('reserves maintenance at least the slots the cap held back', () => {
    // ⚠️ THE EXACT GUARANTEE, arrived at only after fast-check refuted two weaker-looking
    // statements of it. Both earlier attempts were the kind of law that reads true and is not:
    //
    //   "introduced <= maxNew"                — false. With nothing but new material due, the
    //                                           deferred pass fills the session rather than
    //                                           handing back an empty one.
    //   "maintenance === min(maxItems, due)"  — false. New material legitimately outranks review
    //                                           in the comparator, and the cap ENTITLES it to up
    //                                           to `maxNew` slots.
    //
    // What is actually true is the anti-starvation property, and it is the one the measurement
    // asked for: `maxItems - maxNew` slots are reserved for maintenance, and maintenance takes
    // them whenever it has the work. That alone forbids the 0%-of-slots-forever failure.
    fc.assert(
      fc.property(anyProfile, anyOptions, (profile, options) => {
        const session = plan(profile, options);
        const maintenance = session.items.filter((i) => i.why !== 'new').length;
        const everything = plan(profile, { ...options, maxItems: 10_000, maxNew: 10_000 }).items;
        const maintenanceDue = everything.filter((i) => i.why !== 'new').length;

        const reserved = options.maxItems - Math.min(options.maxNew, options.maxItems);
        expect(maintenance).toBeGreaterThanOrEqual(Math.min(reserved, maintenanceDue));
        // And it can never exceed what was actually available.
        expect(maintenance).toBeLessThanOrEqual(Math.min(options.maxItems, maintenanceDue));
      }),
    );
  });

  it('goes over the cap only once maintenance has run out', () => {
    // The other half. Exceeding `maxNew` is legitimate ONLY into slots nothing else could fill —
    // if any maintenance work was left on the table, going over the cap is precisely the bug this
    // option exists to prevent.
    fc.assert(
      fc.property(anyProfile, anyOptions, (profile, options) => {
        const session = plan(profile, options);
        const introduced = session.items.filter((i) => i.why === 'new').length;
        if (introduced <= options.maxNew) return;
        const everything = plan(profile, { ...options, maxItems: 10_000, maxNew: 10_000 }).items;
        const maintenanceDue = everything.filter((i) => i.why !== 'new').length;
        const maintenance = session.items.filter((i) => i.why !== 'new').length;
        expect(maintenance).toBe(maintenanceDue);
      }),
    );
  });

  it('asks for the new material it could not supply, and never more than the cap', () => {
    fc.assert(
      fc.property(anyProfile, anyOptions, (profile, options) => {
        const session = plan(profile, options);
        const introduced = session.items.filter((i) => i.why === 'new').length;
        const want = session.content.newUnitsWanted;
        expect(want).toBeGreaterThanOrEqual(0);
        // The engine asks for exactly the shortfall: what the cap allowed minus what the profile
        // could fill. On a fresh profile that is the whole cap, which is the engine saying "I need
        // vocabulary, not a scheduler" instead of returning an empty session with no explanation.
        expect(want).toBe(Math.max(0, Math.min(options.maxNew, options.maxItems) - introduced));
        // And it never asks for more than it could show.
        expect(want).toBeLessThanOrEqual(options.maxItems);
      }),
    );
  });

  it('labels every item with a `why` that matches its state', () => {
    fc.assert(
      fc.property(anyProfile, anyOptions, (profile, options) => {
        for (const item of plan(profile, options).items) {
          const state = profile.units[item.unit];
          expect(state).toBeDefined();
          if (state === undefined) return;
          const expected =
            state.lastAsked === 0
              ? state.prior.kind === 'claimed'
                ? 'verify'
                : 'new'
              : state.lastProven === 0
                ? 'relearn'
                : 'review';
          expect(item.why, item.unit).toBe(expected);
        }
      }),
    );
  });
});
