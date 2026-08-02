import { describe, expect, it } from 'vitest';

import { COVERAGE_BAND } from '../../src/model/index.js';
import type { Evidence } from '../../src/model/index.js';
import { unitKey, variety, type Day, type UnitKey } from '../../src/model/index.js';
import type { Profile } from '../../src/model/index.js';

import { DEFAULT_REVIEW_GAP_DAYS, OVER_ASK, plan } from '../../src/core/plan.js';
import { deserialize, serialize } from '../../src/core/persist.js';
import { advanceTo, createProfile, unitState } from '../../src/core/profile/index.js';
import { record } from '../../src/core/record/index.js';
import { KNOWN_AT_STRENGTH } from '../../src/model/index.js';

/**
 * Examples for {@link plan}.
 *
 * @module
 */

const V = variety('ar-msa');
const D = (n: number): Day => n as Day;
const U = (word: string): UnitKey => unitKey('recognise', V, word);

/** A profile where each word was last PROVEN on the given day. */
function proven(entries: readonly (readonly [string, number])[]): Profile {
  const evidence: Evidence[] = [];
  for (const [word, day] of entries) {
    for (let i = 0; i < KNOWN_AT_STRENGTH; i++) {
      evidence.push({ kind: 'retrieval', unit: U(word), outcome: 'known', day: D(day) });
    }
  }
  return record(createProfile('ar', D(1)), evidence);
}

const words = (session: ReturnType<typeof plan>): string[] =>
  session.items.map((i) => i.unit.replace('recognise:ar-msa:', ''));

describe('plan', () => {
  it('drills the longest-waiting units first', () => {
    const p = proven([
      ['fresh', 20],
      ['stale', 1],
      ['middling', 10],
    ]);
    expect(words(plan(p, { day: D(30), maxItems: 3, maxNew: 3 }))).toEqual([
      'stale',
      'middling',
      'fresh',
    ]);
  });

  it('reports the wait it selected on, so a host can explain itself', () => {
    // A learner asking "why am I seeing this again?" deserves an answer, and comparison against
    // your own past is what the evidence says counters the intermediate plateau feeling.
    const session = plan(proven([['x', 4]]), { day: D(30), maxItems: 5, maxNew: 5 });
    expect(session.items[0]?.daysWaiting).toBe(26);
  });

  it('puts a never-proven unit ahead of everything', () => {
    // ⚠️ No special case anywhere in plan() produces this — a never-proven unit carries an anchor of
    // 0, so it reports the full span since the epoch, which is the largest possible wait. If someone
    // later "fixes" the anchor to the day the unit was met, this is the test that fails.
    let p = proven([['old', 1]]);
    p = record(p, [{ kind: 'help', unit: U('brandnew'), day: D(29) }]);
    expect(words(plan(p, { day: D(30), maxItems: 2, maxNew: 2 }))[0]).toBe('brandnew');
  });

  // ── The gap applies only to units that have been PROVEN ──────────────────────────────────────
  // Regression. The gap check used to run on every unit, and a never-proven unit scores `day - 0`.
  // So with a young epoch that score is small and the unit was filtered out entirely: a beginner
  // started at day 0 got EMPTY sessions on days 1 and 2, while the identical profile started at
  // day 2000 got its items immediately. `runDemo` printed those rows as "—" and nothing failed.
  it('drills a never-proven unit immediately, whatever epoch the host chose', () => {
    const met = (start: number): Profile =>
      record(createProfile('ar', D(start)), [
        { kind: 'help', unit: U('fresh'), day: D(start + 1) },
      ]);

    for (const start of [0, 1, 2, 2000]) {
      const session = plan(met(start), { day: D(start + 1), maxItems: 5, maxNew: 5 });
      expect(words(session)).toEqual(['fresh']);
    }
  });

  it('makes the session independent of the host epoch', () => {
    // The stronger statement: shifting a whole profile through time must not change WHAT is drilled.
    // The bug above was exactly a violation of this, visible only near day 0.
    const at = (start: number): string[] => {
      let p = record(createProfile('ar', D(start)), [
        { kind: 'help', unit: U('fresh'), day: D(start + 1) },
        { kind: 'retrieval', unit: U('known'), outcome: 'known', day: D(start + 1) },
        { kind: 'retrieval', unit: U('known'), outcome: 'known', day: D(start + 1) },
      ]);
      p = advanceTo(p, D(start + 2));
      return words(plan(p, { day: D(start + 2), maxItems: 5, maxNew: 5 }));
    };
    expect(at(0)).toEqual(at(500));
    expect(at(0)).toEqual(['fresh']); // proven yesterday is still inside the gap
  });

  it('still holds a proven unit back even when its proof day is early', () => {
    // The other side of the fix: `neverProven` must key off the SENTINEL, not off a small number.
    // A unit proven on day 1 in a day-1 epoch is proven, and the gap applies to it.
    const p = proven([['x', 1]]);
    expect(plan(p, { day: D(2), maxItems: 5, maxNew: 5 }).items).toHaveLength(0);
    expect(plan(p, { day: D(4), maxItems: 5, maxNew: 5 }).items).toHaveLength(1);
  });

  it('deprioritises a KNOWN word the learner read today, without excusing it', () => {
    // ⚠️ THIS TEST INVERTED ON 2026-08-02, DELIBERATELY. It used to assert that exposure changed
    // nothing at all, on the reasoning that scheduling on `lastSeen` would push the words in
    // today's passage to the BACK of the queue — exactly the words being met now.
    //
    // That reasoning survives, and it is why `engagedOn` credits KNOWN units only; the companion
    // test below pins it. What changed is the premise for maintenance. Measured over a simulated
    // year (`tools/quran/src/simulate.ts`): a learner holding 4,000 words needed ~40 drills a DAY
    // just to break even, because drills were the only thing circulating and reading contributed
    // nothing the scheduler could see. For a graded-reading product that is backwards.
    //
    // So a sighting now buys a known word some PRIORITY — it sorts behind words she has not met —
    // and buys it no exemption whatever. See `EXPOSURE_CREDIT_DAYS`.
    const before = plan(proven([['x', 1]]), { day: D(30), maxItems: 5, maxNew: 5 });
    const p = record(proven([['x', 1]]), [{ kind: 'exposure', unit: U('x'), day: D(30) }]);
    const after = plan(p, { day: D(30), maxItems: 5, maxNew: 5 });

    // Still due — reading can defer a review and can never cancel one.
    expect(after.items).toHaveLength(before.items.length);
    // But it reports as far less overdue, which is what moves it down the queue.
    expect(after.items[0]?.daysWaiting).toBeLessThan(before.items[0]?.daysWaiting ?? 0);
    // And nothing about what she has PROVEN moved. Only a retrieval can do that.
    expect(unitState(p, U('x')).strength).toBe(unitState(proven([['x', 1]]), U('x')).strength);
  });

  it('does NOT deprioritise a word she is still acquiring, however often she reads it', () => {
    // ⚠️ THE ORIGINAL REASONING, kept and now load-bearing. The words in today's passage are the
    // words she is acquiring; a weak one needs the drill MORE than the rest of the queue, not less.
    // Crediting exposure here would push exactly the right words to the back.
    const weak = record(createProfile('ar', D(1)), [
      { kind: 'retrieval', unit: U('x'), outcome: 'known', day: D(1) },
    ]);
    const before = plan(weak, { day: D(30), maxItems: 5, maxNew: 5 });
    const read = record(weak, [{ kind: 'exposure', unit: U('x'), day: D(30) }]);
    expect(plan(read, { day: D(30), maxItems: 5, maxNew: 5 }).items).toEqual(before.items);
  });

  it('cannot hold a known word out of rotation by reading it every day', () => {
    // ⚠️ THE STARVATION GUARD. The gap check runs on the STRICT anchor, so however small the
    // reported wait becomes, the unit stays eligible and is picked the moment the budget reaches it.
    let p = proven([['x', 1]]);
    for (let d = 2; d <= 40; d++) {
      p = record(p, [{ kind: 'exposure', unit: U('x'), day: D(d) }]);
    }
    // It is the only unit, so nothing can outrank it — and it is still there.
    expect(plan(p, { day: D(40), maxItems: 5, maxNew: 5 }).items).toHaveLength(1);
  });

  it('brings a failed unit back soon, and then lets it LEAVE', () => {
    // ⚠️ THIS TEST INVERTED IN v3, DELIBERATELY, AND IT IS THE LEECH FIX.
    //
    // v2 asserted `daysWaiting: 20` here — the anchor was `lastProven`, and failing does not prove
    // anything, so a word she never gets right accumulates wait forever and is pinned at the head of
    // the queue. That reads as a virtue ("a word she just got wrong belongs at the front") and it is
    // not: measured on a pool of 210 with ten always-failed words at 20 slots a day, those ten took
    // **44% of every slot** over 60 days, against a 4.8% fair share. She spends her sessions on the
    // handful of words that are not working and never sees the other two hundred.
    //
    // v3 anchors on `lastAsked`, which moves on every retrieval whatever the outcome. The failed
    // word is still due immediately — it is below the known rung, so the gap does not apply to it —
    // but its wait RESETS, so tomorrow it competes on equal terms instead of outranking everything.
    let p = proven([['x', 10]]);
    p = record(p, [{ kind: 'retrieval', unit: U('x'), outcome: 'unknown', day: D(30) }]);

    const sameDay = plan(p, { day: D(30), maxItems: 5, maxNew: 5 });
    expect(words(sameDay)).toEqual(['x']);
    // Asked today, so nothing is owed yet — where v2 reported 20 and climbing.
    expect(sameDay.items[0]?.daysWaiting).toBe(0);
    // `review`, not `relearn` — this word HAS been proven before, she just missed it today.
    // `relearn` is reserved for a word asked at least once and never once right, which is a
    // genuinely different situation: acquisition that has not landed, rather than a lapse.
    expect(sameDay.items[0]?.why).toBe('review');

    // And it comes back the next day, because acquisition is not gated by the review gap.
    expect(words(plan(p, { day: D(31), maxItems: 5, maxNew: 5 }))).toEqual(['x']);
  });

  it('does not let a word she keeps failing monopolise the queue', () => {
    // The same fix stated as an outcome rather than a mechanism, on the shape that actually bit:
    // one broken word against a healthy pool. Under v2 the failing word's wait grew without bound
    // and it took a slot every single day, forever.
    const healthy: [string, number][] = Array.from({ length: 8 }, (_, i) => [`w${String(i)}`, 1]);
    let p = proven([['bad', 1], ...healthy]);
    let badSlots = 0;
    let total = 0;

    for (let d = 2; d <= 40; d++) {
      const session = plan(p, { day: D(d), maxItems: 2, maxNew: 2 });
      for (const item of session.items) {
        total += 1;
        if (item.unit === U('bad')) badSlots += 1;
      }
      p = record(
        p,
        session.items.map((item) => ({
          kind: 'retrieval' as const,
          unit: item.unit,
          outcome: item.unit === U('bad') ? ('unknown' as const) : ('known' as const),
          day: D(d),
        })),
      );
    }

    // Fair share of a nine-word pool is ~11%. v2 gave this word every slot it could take.
    expect(badSlots / total, `${String(badSlots)}/${String(total)}`).toBeLessThan(0.25);
    expect(badSlots).toBeGreaterThan(0);
  });

  // ── The spacing gap ───────────────────────────────────────────────────────────────────────────
  it('holds a recently proven unit back for the gap, inclusive at the edge', () => {
    const p = proven([['x', 10]]);
    const at = (day: number, gap?: number) =>
      plan(p, {
        day: D(day),
        maxItems: 5,
        maxNew: 5,
        ...(gap === undefined ? {} : { reviewGapDays: gap }),
      }).items.length;

    expect(at(10)).toBe(0); // proven today
    expect(at(12)).toBe(0); // 2 days — still inside the default gap of 3
    expect(at(13)).toBe(1); // 3 days — due. The boundary is CLOSED.
    expect(at(11, 1)).toBe(1); // a host may set its own gap
    expect(at(10, 0)).toBe(1); // gap 0 means always due
  });

  it('defaults the gap rather than requiring one', () => {
    const p = proven([['x', 10]]);
    const withDefault = plan(p, { day: D(10 + DEFAULT_REVIEW_GAP_DAYS), maxItems: 5, maxNew: 5 });
    const explicit = plan(p, {
      day: D(10 + DEFAULT_REVIEW_GAP_DAYS),
      maxItems: 5,
      maxNew: 5,
      reviewGapDays: DEFAULT_REVIEW_GAP_DAYS,
    });
    expect(withDefault).toEqual(explicit);
    expect(withDefault.items).toHaveLength(1);
  });

  // ── Determinism ───────────────────────────────────────────────────────────────────────────────
  it('gives the same session before and after a save/load cycle', () => {
    // ⚠️ THE BUG THIS FILE EXISTS FOR, and it is invisible without a round-trip.
    //
    // `Object.keys` returns insertion order. A profile built by replaying evidence inserts in
    // EVIDENCE order; the same profile loaded from storage inserts in SORTED order, because
    // `serialize` writes its units sorted. So a plan() that read the map's own order would hand a
    // learner one session before an app restart and a different one after — and both would look
    // entirely plausible. Verified: the two key orders really do differ.
    const p = proven([
      ['zebra', 5],
      ['apple', 5],
      ['mango', 5],
      ['kiwi', 5],
    ]);
    const loaded = deserialize(serialize(p));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    // The premise, asserted so this test cannot pass because the orders happened to match.
    expect(Object.keys(p.units)).not.toEqual(Object.keys(loaded.value.units));

    const opts = { day: D(30), maxItems: 2, maxNew: 2 } as const;
    expect(plan(p, opts)).toEqual(plan(loaded.value, opts));
  });

  it('breaks ties by key, ascending', () => {
    // Every unit here has waited exactly the same number of days, so the ENTIRE ordering is the
    // tiebreak. Without this, a comparator that returns a constant for ties looks correct in every
    // other test — the pre-sorted key order would mask it.
    const p = proven([
      ['zebra', 5],
      ['apple', 5],
      ['mango', 5],
      ['kiwi', 5],
    ]);
    expect(words(plan(p, { day: D(30), maxItems: 4, maxNew: 4 }))).toEqual([
      'apple',
      'kiwi',
      'mango',
      'zebra',
    ]);
  });

  it('is a pure function of its inputs', () => {
    const p = proven([
      ['a', 1],
      ['b', 2],
    ]);
    const opts = { day: D(30), maxItems: 2, maxNew: 2 } as const;
    expect(plan(p, opts)).toEqual(plan(p, opts));
  });

  // ── Content request ───────────────────────────────────────────────────────────────────────────
  it('carries the coverage floor outward', () => {
    // ⚠️ The engine cannot fetch content. If nobody tells the host how long a passage must be, it
    // supplies nine-word sentences forever and the 95–98% band is unsatisfiable by construction —
    // silently, because every short measurement comes back "too short to classify".
    expect(plan(proven([]), { day: D(1), maxItems: 5, maxNew: 5 }).content.minPassageTokens).toBe(
      COVERAGE_BAND.minTokens,
    );
  });

  it('names more units than the session uses', () => {
    // A host without an exercise for one word should lose that word, not shorten the session.
    const p = proven(Array.from({ length: 30 }, (_, i) => [`w${String(i)}`, 1] as const));
    const session = plan(p, { day: D(30), maxItems: 4, maxNew: 4 });
    expect(session.items).toHaveLength(4);
    expect(session.content.units).toHaveLength(4 * OVER_ASK);
    // …and the spares are the next-best ones, in the same order.
    expect(session.content.units.slice(0, 4)).toEqual(session.items.map((i) => i.unit));
  });

  // ── Degenerate inputs ─────────────────────────────────────────────────────────────────────────
  it('handles a learner who has met nothing', () => {
    const session = plan(createProfile('ar', D(1)), { day: D(1), maxItems: 10, maxNew: 10 });
    expect(session.items).toEqual([]);
    expect(session.content.units).toEqual([]);
    // The content request still carries the floor — a beginner reads too.
    expect(session.content.minPassageTokens).toBe(COVERAGE_BAND.minTokens);
  });

  it('handles nothing being due', () => {
    expect(plan(proven([['x', 30]]), { day: D(30), maxItems: 10, maxNew: 10 }).items).toEqual([]);
  });

  it('clamps a nonsensical maxItems instead of throwing', () => {
    // `options` comes from the host's own code, not from storage, so it is not a trust boundary —
    // but crashing an app over a bad number is never the right answer either. Matches `advanceTo`'s
    // refusal to throw on a backwards clock.
    const p = proven([
      ['a', 1],
      ['b', 1],
      ['c', 1],
    ]);
    const at = (n: number) => plan(p, { day: D(30), maxItems: n, maxNew: n }).items.length;
    expect(at(0)).toBe(0);
    expect(at(-5)).toBe(0);
    expect(at(2.7)).toBe(2);
    expect(at(Number.NaN)).toBe(0);
    expect(at(1e9)).toBe(3);
  });

  it('clamps a nonsensical gap too', () => {
    const p = proven([['x', 10]]);
    expect(plan(p, { day: D(11), maxItems: 5, maxNew: 5, reviewGapDays: -3 }).items).toHaveLength(
      1,
    );
    expect(
      plan(p, { day: D(11), maxItems: 5, maxNew: 5, reviewGapDays: Number.NaN }).items,
    ).toHaveLength(0);
  });

  it('survives a day behind the profile without inventing negative waits', () => {
    // A device clock that jumps backwards, or a host planning for a day it has already passed. A
    // negative wait would sort a unit as if it were fresher than one proven today.
    const session = plan(proven([['x', 20]]), {
      day: D(5),
      maxItems: 5,
      maxNew: 5,
      reviewGapDays: 0,
    });
    expect(session.items[0]?.daysWaiting).toBe(0);
  });

  it('handles a very long absence without special-casing it', () => {
    const session = plan(proven([['x', 1]]), { day: D(401), maxItems: 5, maxNew: 5 });
    expect(session.items[0]?.daysWaiting).toBe(400);
  });

  it('separates directions and varieties, because they are separate knowledge', () => {
    const other = variety('ar-levantine');
    let p = createProfile('ar', D(1));
    p = record(p, [
      { kind: 'retrieval', unit: unitKey('recognise', V, 'سوق'), outcome: 'known', day: D(1) },
      { kind: 'retrieval', unit: unitKey('produce', V, 'سوق'), outcome: 'known', day: D(1) },
      { kind: 'retrieval', unit: unitKey('recognise', other, 'سوق'), outcome: 'known', day: D(1) },
    ]);
    // Three units for one word, and the scheduler treats them as three.
    expect(plan(p, { day: D(30), maxItems: 10, maxNew: 10 }).items).toHaveLength(3);
  });

  // ── The priority tiebreak ─────────────────────────────────────────────────────────────────────
  it('uses the caller priority when two units have waited the same', () => {
    // ⚠️ Ties are the NORMAL case, not an edge case: a learner who was placed, or who read a
    // passage, acquires hundreds of units on one day and every one carries the same anchor forever.
    // Without a priority the key tiebreak sorts them alphabetically, which is deterministic,
    // correct, and a bad lesson.
    const p = proven([
      ['zebra', 5],
      ['apple', 5],
      ['mango', 5],
    ]);
    // Commonest first — what a host would pass from its frequency-ordered pack.
    const priority = [U('mango'), U('zebra'), U('apple')];
    expect(words(plan(p, { day: D(30), maxItems: 3, maxNew: 3, priority }))).toEqual([
      'mango',
      'zebra',
      'apple',
    ]);
  });

  it('never lets priority override how long a unit has waited', () => {
    // Priority breaks TIES. It must not promote a fresh unit over an overdue one, or the spacing
    // rule stops meaning anything and a host could starve its own review queue by mistake.
    const p = proven([
      ['fresh', 25],
      ['stale', 1],
    ]);
    const priority = [U('fresh'), U('stale')];
    expect(words(plan(p, { day: D(30), maxItems: 2, maxNew: 2, priority }))).toEqual([
      'stale',
      'fresh',
    ]);
  });

  it('sorts unlisted units after every listed one', () => {
    const p = proven([
      ['aaa', 5],
      ['bbb', 5],
      ['zzz', 5],
    ]);
    // Only `zzz` is named, so it leads and the rest fall back to the key order behind it.
    expect(words(plan(p, { day: D(30), maxItems: 3, maxNew: 3, priority: [U('zzz')] }))).toEqual([
      'zzz',
      'aaa',
      'bbb',
    ]);
  });

  it('is still deterministic across a save/load cycle with a priority', () => {
    const p = proven([
      ['zebra', 5],
      ['apple', 5],
      ['mango', 5],
      ['kiwi', 5],
    ]);
    const loaded = deserialize(serialize(p));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const opts = { day: D(30), maxItems: 3, maxNew: 3, priority: [U('mango'), U('kiwi')] } as const;
    expect(plan(p, opts)).toEqual(plan(loaded.value, opts));
  });

  it('ignores a duplicate in the priority list rather than letting it win twice', () => {
    const p = proven([
      ['aaa', 5],
      ['bbb', 5],
    ]);
    // First mention wins, matching how the pack's own frequency list resolves duplicates.
    expect(
      words(
        plan(p, { day: D(30), maxItems: 2, maxNew: 2, priority: [U('bbb'), U('aaa'), U('bbb')] }),
      ),
    ).toEqual(['bbb', 'aaa']);
  });
});
