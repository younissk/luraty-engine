import { describe, expect, it } from 'vitest';

import { day, unitKey, variety, type Day, type UnitKey } from '../model/ids.js';
import type { Evidence } from '../model/evidence.js';

import { createProfile, advanceTo, hasMet, unitState } from './profile.js';
import { record } from './record.js';
import { isKnown, KNOWN_AT_STRENGTH, MAX_STRENGTH, STRENGTH_STEP } from '../model/unit.js';

const AR = variety('ar-msa');
const D = (n: number): Day => day(n)!;
const suuq: UnitKey = unitKey('recognise', AR, 'سوق');
const suuqProduce: UnitKey = unitKey('produce', AR, 'سوق');

/**
 * Build evidence from the v2 vocabulary, so the examples below stay readable.
 *
 * `tested` is no longer a field — it is the choice of VARIANT. Keeping the parameter here maps the
 * old vocabulary onto the new one in one place instead of at forty call sites, and it makes the
 * translation explicit: a passive signal is `exposure` when she read past the word and `help` when
 * she asked. v2 could not tell those apart, which is how a gloss tap came to demote a word she had
 * proven four months earlier.
 */
function ev(unit: UnitKey, outcome: 'known' | 'unknown', tested: boolean, d: number): Evidence {
  if (tested) return { kind: 'retrieval', unit, outcome, day: D(d) };
  return outcome === 'known'
    ? { kind: 'exposure', unit, day: D(d) }
    : { kind: 'help', unit, day: D(d) };
}

const fresh = () => createProfile('ar', D(1));

describe('record', () => {
  it('starts a unit at rung zero when the learner asks for help with it', () => {
    // `ev(..., 'unknown', false, ...)` is a gloss tap: she met the word and asked. It mints the unit,
    // costs a rung it does not have, and proves nothing.
    const p = record(fresh(), [ev(suuq, 'unknown', false, 1)]);
    expect(unitState(p, suuq)).toEqual({
      seen: 1,
      lastSeen: 1,
      // Asking is not being asked, so the scheduling anchor stays at NEVER.
      lastAsked: 0,
      // Failing is not proving. The trust anchor stays at NEVER too.
      lastProven: 0,
      prior: { kind: 'none' },
      strength: 0,
      lapses: 0,
    });
  });

  it('does NOT promote on a passive signal, however many times it is seen', () => {
    // The rule that matters most: meeting a word ten times and never being asked about it is not
    // evidence you know it. A heritage speaker recognises the shape of a word and often has only
    // the domestic sense of it — let this promote and the register gap becomes invisible.
    let p = fresh();
    for (let d = 1; d <= 10; d++) p = record(p, [ev(suuq, 'known', false, d)]);

    const s = unitState(p, suuq);
    expect(isKnown(s)).toBe(false);
    expect(s.strength).toBe(0);
    expect(s.seen).toBe(10);
  });

  it('reaches the known rung only after consecutive real retrievals', () => {
    let p = fresh();
    for (let i = 0; i < KNOWN_AT_STRENGTH; i++) {
      p = record(p, [ev(suuq, 'known', true, i + 1)]);
    }
    expect(isKnown(unitState(p, suuq))).toBe(true);
  });

  it('costs two rungs for a failure, so near-misses do not accumulate into knowing', () => {
    const p = record(fresh(), [
      ev(suuq, 'known', true, 1),
      ev(suuq, 'unknown', true, 2),
      ev(suuq, 'known', true, 3),
    ]);
    // +1, then −2 flooring at 0, then +1. One rung — not known.
    const s = unitState(p, suuq);
    expect(s.strength).toBe(1);
    expect(isKnown(s)).toBe(false);
    expect(s.lapses).toBe(0);
  });

  it('does not erase months of proof on one wrong answer', () => {
    // ⚠️ THE v2 BEHAVIOUR THIS DELIBERATELY REVERSES, and the reason gap 3 existed. v2 demoted an
    // understood unit outright on a single failure while promotion took two consecutive successes.
    // That asymmetry has no floor: measured over 720 simulated days the known count settled at
    // `accuracy x pool` and never climbed, so a month of work made the number go DOWN.
    //
    // Nothing is permanently known — enough misses still take a unit below the line, and the test
    // below proves it — but one slip no longer costs everything.
    let p = fresh();
    for (let d = 1; d <= 6; d++) p = record(p, [ev(suuq, 'known', true, d)]);
    expect(unitState(p, suuq).strength).toBe(MAX_STRENGTH);

    p = record(p, [ev(suuq, 'unknown', true, 40)]);
    const s = unitState(p, suuq);
    expect(s.strength).toBe(MAX_STRENGTH - STRENGTH_STEP.missRetrieval);
    expect(isKnown(s)).toBe(true);
    expect(s.lapses).toBe(1);
  });

  it('still falls out of known after enough failures — nothing is permanent', () => {
    let p = fresh();
    for (let d = 1; d <= 6; d++) p = record(p, [ev(suuq, 'known', true, d)]);
    for (let d = 40; d <= 42; d++) p = record(p, [ev(suuq, 'unknown', true, d)]);
    const s = unitState(p, suuq);
    expect(s.strength).toBe(0);
    expect(isKnown(s)).toBe(false);
    expect(s.lapses).toBe(3);
  });

  it('does not demote on a gloss tap — the v2 bug this variant exists to make unwritable', () => {
    // ⚠️ A REGRESSION TEST FOR A BUG THAT SHIPPED. In v2's `applyOne` the `outcome === 'unknown'`
    // branch was tested BEFORE the `!tested` check, so `{ tested: false, outcome: 'unknown' }` — a
    // learner tapping a gloss while reading — demoted an understood unit outright and zeroed its
    // streak. Four months of proof, erased by a tap, with no test covering it.
    //
    // Asking for help is a real negative signal and a WEAKER one than failing a retrieval. It costs
    // one rung and is not a lapse: she did the right thing.
    let p = fresh();
    for (let d = 1; d <= 6; d++) p = record(p, [ev(suuq, 'known', true, d)]);
    p = record(p, [{ kind: 'help', unit: suuq, day: D(30) }]);

    const s = unitState(p, suuq);
    expect(s.strength).toBe(MAX_STRENGTH - STRENGTH_STEP.missHelp);
    expect(isKnown(s)).toBe(true);
    expect(s.lapses).toBe(0);
    // And it is not an ask, so the scheduler has no more reason to consider the word attended to
    // than if she had read straight past it.
    expect(s.lastAsked).toBe(6);
  });

  it('does not refresh the proof date on a passive sighting', () => {
    // Otherwise a unit stays "recently proven" forever just by appearing on screen, and its
    // re-check never comes due.
    let p = fresh();
    p = record(p, [ev(suuq, 'known', true, 1), ev(suuq, 'known', true, 2)]);
    p = record(p, [ev(suuq, 'known', false, 30)]);

    const s = unitState(p, suuq);
    expect(isKnown(s)).toBe(true);
    expect(s.lastProven).toBe(2);
    expect(s.lastAsked).toBe(2);
    expect(s.lastSeen).toBe(30);
  });

  it('tracks recognise and produce as completely separate states', () => {
    // This IS the heritage gap. Collapse the two and the engine measures the wrong thing.
    let p = fresh();
    p = record(p, [ev(suuq, 'known', true, 1), ev(suuq, 'known', true, 2)]);
    p = record(p, [ev(suuqProduce, 'unknown', true, 2)]);

    expect(isKnown(unitState(p, suuq))).toBe(true);
    expect(isKnown(unitState(p, suuqProduce))).toBe(false);
  });

  it('treats an unmet unit as everything-zero, without inventing an entry', () => {
    const p = fresh();
    expect(hasMet(p, suuq)).toBe(false);
    expect(unitState(p, suuq)).toEqual({
      seen: 0,
      lastSeen: 0,
      lastAsked: 0,
      lastProven: 0,
      prior: { kind: 'none' },
      strength: 0,
      lapses: 0,
    });
  });

  it('does not mutate the profile it was given', () => {
    const before = record(fresh(), [ev(suuq, 'known', true, 1)]);
    const snapshot = JSON.stringify(before);
    record(before, [ev(suuq, 'known', true, 2)]);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('returns the same profile for empty evidence', () => {
    const p = fresh();
    expect(record(p, [])).toBe(p);
  });

  it('records evidence dated in the past without moving the learner forward', () => {
    // A host syncing an offline queue replays old evidence. That must not rewind or advance `day`.
    const p = advanceTo(fresh(), D(10));
    const after = record(p, [ev(suuq, 'known', true, 3)]);
    expect(after.day).toBe(10);
    expect(unitState(after, suuq).lastSeen).toBe(3);
  });
});

describe('advanceTo', () => {
  it('moves the day forward', () => {
    expect(advanceTo(fresh(), D(5)).day).toBe(5);
  });

  it('refuses to go backwards rather than throwing', () => {
    // A device clock that jumps back (timezone, manual correction, a phone that was off) must not
    // corrupt history, and must certainly not crash the app.
    const p = advanceTo(fresh(), D(10));
    expect(advanceTo(p, D(3))).toBe(p);
  });
});

describe('lastProven — the scheduler anchor', () => {
  /** The one anchor, now that `confirmedOn` and `lastProven` have stopped being two names for it. */
  function provenOn(p: ReturnType<typeof fresh>, key = suuq): number {
    return unitState(p, key).lastProven;
  }

  it('does not move on passive exposure', () => {
    // The whole reason the field exists. `lastSeen` is refreshed by reading a word and not asking
    // what it means; scheduling on that would push every word in today's reading to the back of the
    // drill queue — exactly the words the learner is currently meeting.
    const p = record(fresh(), [
      { kind: 'exposure', unit: suuq, day: D(9) },
      { kind: 'exposure', unit: suuq, day: D(10) },
    ]);
    const s = unitState(p, suuq);
    expect(isKnown(s)).toBe(false);
    expect(s.lastSeen).toBe(10);
    expect(s.lastProven).toBe(0);
    // And exposure is not an ask either, so the scheduling anchor stays at NEVER too.
    expect(s.lastAsked).toBe(0);
  });

  it('does not move on a failed retrieval', () => {
    // A learner who just got this wrong should meet it again soon, not be told they have practised
    // it. Parking the anchor makes that fall out of the arithmetic instead of needing a rule.
    const p = record(fresh(), [
      { kind: 'retrieval', unit: suuq, outcome: 'known', day: D(3) },
      { kind: 'retrieval', unit: suuq, outcome: 'unknown', day: D(20) },
    ]);
    expect(provenOn(p)).toBe(3);
  });

  it('moves only on a successful retrieval', () => {
    expect(
      provenOn(record(fresh(), [{ kind: 'retrieval', unit: suuq, outcome: 'known', day: D(7) }])),
    ).toBe(7);
  });

  it('is independent of the order evidence arrives in', () => {
    // ⚠️ THE PROPERTY THAT DECIDED THE SEED VALUE. A host syncing an offline queue replays evidence
    // out of order. Seeding `lastProven` from the minting item's day would make the result depend on
    // which item `record` happened to meet first — so the same three facts would produce two
    // different profiles, and the fold law this function's contract rests on would be false.
    //
    // Zero is the identity element of the `later()` fold, which is what makes max commutative here.
    const forwards: Evidence[] = [
      { kind: 'exposure', unit: suuq, day: D(50) },
      { kind: 'retrieval', unit: suuq, outcome: 'known', day: D(3) },
    ];
    const backwards = [forwards[1]!, forwards[0]!];

    expect(provenOn(record(fresh(), forwards))).toBe(3);
    expect(provenOn(record(fresh(), backwards))).toBe(3);
  });

  it('survives demotion carrying the day it was actually proven', () => {
    // Demoted from understood, the unit keeps the real answer to "when was this last proven?".
    // Stamping today would record a FAILURE as proof and park the unit at the back of the queue
    // precisely when it needs drilling; zeroing it would discard a fact the engine had.
    const p = record(fresh(), [
      { kind: 'retrieval', unit: suuq, outcome: 'known', day: D(4) },
      { kind: 'retrieval', unit: suuq, outcome: 'known', day: D(6) },
      { kind: 'retrieval', unit: suuq, outcome: 'unknown', day: D(30) },
    ]);
    const s = unitState(p, suuq);
    expect(s.lastProven).toBe(6);
    // The scheduling anchor DID move, and that separation is the leech fix: she was asked on day 30,
    // so the queue treats the word as handled even though it was not proven.
    expect(s.lastAsked).toBe(30);
  });

  it('is monotonic, so a late-arriving old success cannot rewind it', () => {
    const p = record(fresh(), [
      { kind: 'retrieval', unit: suuq, outcome: 'known', day: D(40) },
      { kind: 'retrieval', unit: suuq, outcome: 'known', day: D(3) },
    ]);
    // Every anchor is a max-fold, so a late-arriving day-3 success cannot rewind a day-40 one.
    const s = unitState(p, suuq);
    expect(isKnown(s)).toBe(true);
    expect(s.lastProven).toBe(40);
    expect(s.lastAsked).toBe(40);
  });

  it('records a claim without touching anything a measurement owns', () => {
    // ⚠️ THE PROPERTY THAT MAKES RE-PLACEMENT SAFE WITH NO EXTRA RULE. A claim writes to a field no
    // retrieval writes, so it is structurally incapable of overwriting a measurement — and the two
    // orders below converge because they touch disjoint fields.
    const proven: Evidence = { kind: 'retrieval', unit: suuq, outcome: 'known', day: D(3) };
    const claim: Evidence = { kind: 'claim', unit: suuq, day: D(5) };

    const a = record(fresh(), [proven, claim]);
    const b = record(fresh(), [claim, proven]);
    expect(a).toEqual(b);

    const s = unitState(a, suuq);
    expect(s.prior).toEqual({ kind: 'claimed', on: 5 });
    expect(s.lastProven).toBe(3);
    // A claim is not an encounter: nobody met anything, the host asserted something.
    expect(s.seen).toBe(1);
    // And it buys no head start — one proof is one rung, claimed or not.
    expect(s.strength).toBe(1);
  });

  it('folds a re-claim to the LATER day, so re-placing cannot rewind the anchor', () => {
    // `prior.on` is a max-fold like every date here. A learner re-placed at month six must not have
    // her claims dated back to month one — the claim date is the scheduling anchor for anything
    // still unchecked, so rewinding it would make a fresh placement look maximally overdue.
    const forwards = record(fresh(), [
      { kind: 'claim', unit: suuq, day: D(5) },
      { kind: 'claim', unit: suuq, day: D(40) },
    ]);
    const backwards = record(fresh(), [
      { kind: 'claim', unit: suuq, day: D(40) },
      { kind: 'claim', unit: suuq, day: D(5) },
    ]);
    expect(unitState(forwards, suuq).prior).toEqual({ kind: 'claimed', on: 40 });
    expect(unitState(backwards, suuq).prior).toEqual({ kind: 'claimed', on: 40 });
    // Still not an encounter, however many times it is claimed.
    expect(unitState(forwards, suuq).seen).toBe(0);
  });

  it('keeps a claim after it has been refuted, which is what makes the count reportable', () => {
    // `prior` is never cleared. That is what lets `summarize()` answer the sentence a heritage
    // speaker actually wants — "of the words you said you knew, N did not hold" — from present
    // state alone, with no history stored anywhere.
    const p = record(fresh(), [
      { kind: 'claim', unit: suuq, day: D(1) },
      { kind: 'retrieval', unit: suuq, outcome: 'unknown', day: D(9) },
    ]);
    const s = unitState(p, suuq);
    expect(s.prior).toEqual({ kind: 'claimed', on: 1 });
    expect(s.lastAsked).toBe(9);
    expect(s.lastProven).toBe(0);
  });
});
