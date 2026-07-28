import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { Evidence } from '../model/evidence.js';
import { unitKey, variety, type Day, type UnitKey } from '../model/ids.js';
import type { Profile } from '../model/profile.js';

import { DEFAULT_REVIEW_GAP_DAYS, plan } from './plan.js';
import { deserialize, serialize } from './persist.js';
import { advanceTo, createProfile } from './profile.js';
import { PROMOTE_AFTER_SUCCESSES, record } from './record.js';

/**
 * Laws for {@link plan}.
 *
 * @module
 */

const V = variety('ar-msa')!;
const D = (n: number): Day => n as Day;

/** A profile of `size` units with assorted, arbitrary histories. */
const anyProfile = fc
  .array(
    fc.record({
      word: fc.string({ minLength: 1, maxLength: 6, unit: fc.constantFrom(...'abcdefgh') }),
      direction: fc.constantFrom('recognise' as const, 'produce' as const),
      day: fc.nat({ max: 60 }),
      tested: fc.boolean(),
      outcome: fc.constantFrom('known' as const, 'unknown' as const),
    }),
    { maxLength: 40 },
  )
  .map((rows): Profile => {
    const evidence: Evidence[] = rows.map((r) => ({
      unit: unitKey(r.direction, V, r.word),
      outcome: r.outcome,
      tested: r.tested,
      day: D(r.day),
    }));
    return record(createProfile('ar', D(0)), evidence);
  });

const anyOptions = fc.record({
  day: fc.nat({ max: 400 }).map(D),
  maxItems: fc.nat({ max: 30 }),
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
          expect(profile.units[item.unit], item.unit).toBeDefined();
          // And every item is genuinely due.
          expect(item.daysWaiting).toBeGreaterThanOrEqual(options.reviewGapDays);
          expect(item.daysWaiting).toBeGreaterThanOrEqual(0);
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
        const opts = { maxItems: 1000, reviewGapDays: DEFAULT_REVIEW_GAP_DAYS };
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
          let profile = createProfile('ar', D(0));
          const pool: UnitKey[] = [];
          for (let i = 0; i < poolSize; i++) {
            const unit = unitKey('recognise', V, `w${String(i)}`);
            pool.push(unit);
            // Proven on day 1, so nothing starts artificially overdue.
            profile = record(profile, [
              { unit, outcome: 'known', tested: true, day: D(1) },
              { unit, outcome: 'known', tested: true, day: D(1) },
            ]);
          }

          const served = new Set<UnitKey>();
          const rotation = Math.ceil(poolSize / take);
          // The gap holds units back for its own duration, so the honest horizon is one rotation
          // plus the gap, not one rotation.
          const horizon = rotation + DEFAULT_REVIEW_GAP_DAYS + 1;

          for (let d = 2; d <= 1 + horizon; d++) {
            profile = advanceTo(profile, D(d));
            const session = plan(profile, { day: D(d), maxItems: take });
            const drills: Evidence[] = [];
            for (const item of session.items) {
              served.add(item.unit);
              for (let i = 0; i < PROMOTE_AFTER_SUCCESSES; i++) {
                drills.push({ unit: item.unit, outcome: 'known', tested: true, day: D(d) });
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
});
