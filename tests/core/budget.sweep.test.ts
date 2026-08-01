import { describe, expect, it } from 'vitest';

import type { Evidence } from '../../src/model/index.js';
import { unitKey, variety, type Day, type UnitKey } from '../../src/model/index.js';

import { plan } from '../../src/core/plan.js';
import { advanceTo, createProfile } from '../../src/core/profile.js';
import { record } from '../../src/core/record.js';
import { summarize } from '../../src/core/summary.js';

/**
 * Sweeping the new-material cap, and confronting ADR-0005 with it.
 *
 * ⚠️ **THIS FILE EXISTS BECAUSE ADR-0005 ALREADY MEASURED SOMETHING THAT LOOKS LIKE THIS AND
 * REJECTED IT.** That ADR ran four designs and three adversarial critiques, two of which said an
 * age-only score starves new material and proposed splitting the session budget. It simulated the
 * split and refuted it — age-only reached 861 words a year against a split budget's 735, and a
 * 25%-fresh reservation collapsed to 10.
 *
 * `maxNew` is a budget split. So either that finding is wrong, or this one is, or they are measuring
 * different things — and shipping without knowing which would be exactly the "grep results that look
 * authoritative" failure the repo warns about.
 *
 * They are measuring different things, and the sweep below shows how. ADR-0005 reserved a **floor**
 * for fresh material, forcing new words in even when review needed the slot. `maxNew` sets a
 * **ceiling**, holding new words out when they would crowd review out. Same axis, opposite ends —
 * and the curve has an interior maximum, so both are right about their own end of it.
 *
 * @module
 */

const V = variety('de');
const D = (n: number): Day => n as Day;
const U = (w: string): UnitKey => unitKey('recognise', V, w);

/** Deterministic draw in [0, 1). */
function draw(n: number): number {
  return ((Math.imul(n ^ 0x9e3779b9, 0x85ebca6b) >>> 0) % 100_000) / 100_000;
}

/**
 * A year of a host that reads.
 *
 * Every day it mints `intro` unmet words by exposure — which is what a reading surface does — then
 * drills whatever `plan()` returns and answers at `accuracy`. Returns how many words she ends up
 * actually knowing.
 */
function knownAfterAYear(intro: number, budget: number, maxNew: number, accuracy: number): number {
  let p = createProfile('de', D(1));
  let minted = 0;
  let tick = 0;

  for (let d = 2; d <= 366; d++) {
    const day = D(d);
    p = advanceTo(p, day);
    p = record(
      p,
      Array.from({ length: intro }, (): Evidence => {
        minted += 1;
        return { kind: 'exposure', unit: U(`w${String(minted)}`), day };
      }),
    );
    const session = plan(p, { day, maxItems: budget, maxNew });
    p = record(
      p,
      session.items.map((item): Evidence => {
        tick += 1;
        return {
          kind: 'retrieval',
          unit: item.unit,
          outcome: draw(tick + d * 7919) < accuracy ? 'known' : 'unknown',
          day,
        };
      }),
    );
  }
  return summarize(p, { kind: 'all' }).known;
}

describe('the new-material cap, swept', () => {
  it('learns NOTHING at all with the cap wide open', () => {
    // ⚠️ THE STRONGEST STATEMENT OF GAP 2, and considerably worse than the one that motivated the
    // fix. "Review got 0% of slots" understates it: with new material taking every slot every day,
    // no word is ever drilled a second time, so nothing ever reaches the known rung.
    //
    // **After a full year of daily practice: zero words known.** Not few — none. This is what the
    // engine did before `maxNew` existed, for any host that mints units while reading.
    expect(knownAfterAYear(20, 20, 20, 0.9)).toBe(0);
  });

  it('learns almost nothing with the cap shut', () => {
    // The other end, and the failure ADR-0005 measured: hold new material out entirely and there is
    // nothing to consolidate. The trickle that survives is the deferred pass filling slots review
    // could not use.
    expect(knownAfterAYear(20, 20, 0, 0.9)).toBeLessThan(100);
  });

  it('has an interior maximum, which is why both ADR-0005 and this change are right', () => {
    // Measured over a year at 20 slots/day, 90% accuracy, host introducing 20 words/day:
    //
    //   maxNew   0     1     2     3     4     5     6     8    10    12    14    16    18    20
    //   known   59   370   637   854  1048  1206  1313  1458  1508  1431  1227   941   529     0
    //
    // A clean inverted U peaking near HALF the session. ADR-0005 was measuring the left-hand slope
    // (a floor that forces fresh material in and starves review); this change is about the
    // right-hand cliff (no ceiling, so nothing is ever revisited). Neither finding generalises to
    // the other end, and neither is wrong.
    const curve = [0, 2, 5, 10, 15, 20].map((maxNew) => knownAfterAYear(20, 20, maxNew, 0.9));
    const peak = Math.max(...curve);
    const peakAt = curve[curve.indexOf(peak)];

    expect(peakAt).toBeGreaterThan(1000);
    // Both extremes are far below the peak — that is what makes it an interior maximum rather than
    // a monotone preference for one end.
    expect(curve[0]).toBeLessThan(peak / 10);
    expect(curve[curve.length - 1]).toBeLessThan(peak / 10);
  });

  it('is flat enough in the middle that the exact value is not load-bearing', () => {
    // The practical claim: a host anywhere between a quarter and three quarters of the session does
    // fine, so `maxNew` is a decision the host can make badly without breaking the product. Only the
    // two extremes are catastrophic, and those are the ones a host reaches by NOT thinking about it.
    const middle = [5, 8, 10, 12].map((maxNew) => knownAfterAYear(20, 20, maxNew, 0.9));
    const best = Math.max(...middle);
    const worst = Math.min(...middle);
    expect(worst).toBeGreaterThan(best * 0.75);
  });

  it('does not depend on how fast the host introduces words', () => {
    // The cap bounds what enters a SESSION, not what the host mints. A host reading twice as much
    // does not learn less — it just has a longer queue of words waiting to be met.
    const slow = knownAfterAYear(5, 20, 5, 0.9);
    const fast = knownAfterAYear(40, 20, 5, 0.9);
    expect(Math.abs(slow - fast)).toBeLessThan(50);
  });
});
