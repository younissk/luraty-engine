import { describe, expect, it } from 'vitest';

import type { Evidence } from '../model/evidence.js';
import { day, unitKey, variety, type Day, type UnitKey } from '../model/ids.js';
import { hasStandingClaim, UNMET } from '../model/unit.js';

import { plan } from './plan.js';
import { deserialize, serialize } from './persist.js';
import { createProfile, unitState } from './profile.js';
import { record } from './record.js';
import { summarize } from './summary.js';

/**
 * Regressions for the defects an adversarial review found after wire v3 landed.
 *
 * ⚠️ **NONE OF THESE WERE CAUGHT BY THE 365 TESTS THAT SHIPPED WITH THE CHANGE.** Five independent
 * reviewers produced 28 candidate findings; 15 survived an independent attempt to refute each one
 * with an executed counter-example. Six of those fifteen were the SAME defect wearing different
 * clothes, which is the more useful fact: one ambiguity, six symptoms, none of them visible from the
 * function where it lived.
 *
 * The ambiguity: `0` meant both "never" and "day zero". `Prior` was deliberately made a discriminated
 * union to dodge exactly that — its docstring argues *"a placement on day 0 of a fresh profile is the
 * NORMAL case, not an edge one"* — and then the identical sentinel was left on `lastAsked` one field
 * away. Reasoning it out for one field and not its neighbour is a very ordinary way to be wrong.
 *
 * @module
 */

const V = variety('de');
const D = (n: number): Day => n as Day;
const U = (word: string): UnitKey => unitKey('recognise', V, word);
const drill = (word: string, outcome: 'known' | 'unknown', d: number): Evidence => ({
  kind: 'retrieval',
  unit: U(word),
  outcome,
  day: D(d),
});

describe('the never-sentinel cannot collide with a real day', () => {
  it('refuses day zero at the constructor', () => {
    // Cast so the return type is `Day` rather than `undefined` — the point is to exercise the
    // RUNTIME guard, which still has to hold for JavaScript callers and for values from storage.
    expect(day(0 as 1)).toBeUndefined();
    expect(day(1)).toBe(1);
  });

  it('does not read a word drilled on the first legal day as never-asked', () => {
    // ⚠️ THE SIX-SYMPTOM DEFECT, in its simplest form. With day 0 legal, a host whose epoch was
    // "days since install" had every install-day retrieval read as never-asked — so a word she had
    // just answered came back labelled `'new'`.
    const p = record(createProfile('de', D(1)), [drill('haus', 'known', 1)]);
    const state = unitState(p, U('haus'));
    expect(state.lastAsked).toBe(1);
    // `review`, not `new` — it was asked AND passed on day one, which is the whole point.
    expect(plan(p, { day: D(2), maxItems: 5, maxNew: 5 }).items[0]?.why).toBe('review');
  });

  it('does not count a claim disproved on day one as still standing', () => {
    // Symptom two: `hasStandingClaim` is `prior.kind === 'claimed' && lastAsked === NEVER`, so under
    // a day-0 epoch a claim tested and FAILED on the install day still read as unchecked — and
    // `coverage()` then counted the disproved word as claimed and flipped the verdict on it.
    const p = record(createProfile('de', D(1)), [
      { kind: 'claim', unit: U('haus'), day: D(1) },
      drill('haus', 'unknown', 1),
    ]);
    expect(hasStandingClaim(unitState(p, U('haus')))).toBe(false);

    const s = summarize(p, { kind: 'all' });
    expect(s.claimsRefuted).toBe(1);
    expect(s.claimsStanding).toBe(0);
  });

  it('gives the same answer at every epoch', () => {
    // ⚠️ THE PROPERTY THE WHOLE FIX EXISTS FOR, and `plan.ts` already names epoch-dependence as a bug
    // class it fixed once before. The same evidence, shifted in time, must produce the same reading.
    const build = (epoch: number) =>
      record(createProfile('de', D(epoch)), [
        { kind: 'claim', unit: U('a'), day: D(epoch) },
        drill('a', 'known', epoch),
        drill('a', 'unknown', epoch + 1),
      ]);

    const early = summarize(build(1), { kind: 'all' });
    const late = summarize(build(20_661), { kind: 'all' });
    expect(early.claimsConfirmed).toBe(late.claimsConfirmed);
    expect(early.claimsStanding).toBe(late.claimsStanding);
    expect(early.claimsRefuted).toBe(late.claimsRefuted);
    expect(early.claimsConfirmed).toBe(1);
  });
});

describe('reassessment does not invent a span it cannot know', () => {
  it('says never-measured rather than reporting the host day number', () => {
    // ⚠️ A LEARNER CREATED THIS MORNING WAS TOLD SHE HAD GONE 20,661 DAYS WITHOUT PROVING ANYTHING.
    // With nothing ever proven, `day - NEVER` is the host's raw day NUMBER — the engine stores no
    // epoch, so it has no span to report. Under a Unix-day epoch every profile was permanently past
    // the threshold until its first success.
    const placed = record(createProfile('de', D(20_661)), [
      { kind: 'claim', unit: U('a'), day: D(20_661) },
      { kind: 'claim', unit: U('b'), day: D(20_661) },
    ]);

    const r = plan(placed, { day: D(20_661), maxItems: 5, maxNew: 0 }).reassess;
    expect(r.kind).toBe('never-measured');
    if (r.kind !== 'never-measured') return;
    expect(r.claimsStanding).toBe(2);
    // There is deliberately no `daysSinceProven` on this arm: the type makes the wrong number
    // unrepresentable rather than trusting a caller not to read it.
    expect('daysSinceProven' in r).toBe(false);
  });

  it('reports a real span once something has been proven', () => {
    const p = record(createProfile('de', D(20_661)), [drill('a', 'known', 20_661)]);
    const r = plan(p, { day: D(20_661 + 40), maxItems: 5, maxNew: 0 }).reassess;
    expect(r.kind).toBe('due');
    if (r.kind === 'due') expect(r.daysSinceProven).toBe(40);
  });
});

describe('a session is stable across a save and reload', () => {
  it('sorts `stuck`, so two value-identical profiles agree', () => {
    // ⚠️ `Object.keys` returns insertion order, and `serialize` writes units sorted — so a profile
    // built by replaying evidence and the same profile loaded from storage inserted their units in
    // different orders. `items` was immune (its comparator is total); `stuck` was appended in
    // iteration order and was not.
    let p = createProfile('de', D(1));
    for (let i = 1; i <= 6; i++) p = record(p, [drill('zzz', 'unknown', i)]);
    for (let i = 1; i <= 6; i++) p = record(p, [drill('aaa', 'unknown', i)]);

    const loaded = deserialize(serialize(p));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const options = { day: D(20), maxItems: 5, maxNew: 5 };
    expect(plan(p, options)).toEqual(plan(loaded.value, options));
    expect(plan(p, options).stuck).toEqual([U('aaa'), U('zzz')]);
  });
});

describe('UNMET cannot be corrupted by a host', () => {
  it('is frozen, not merely typed readonly', () => {
    // ⚠️ `unitState()` is on the public barrel and returns the SAME object for every unmet unit, so
    // one mutation would change what "unknown" means for every profile in the process. `readonly`
    // stops the obvious write and not `Object.assign(unitState(p, k), { strength: 6 })`, which
    // typechecks green — the docstring claimed "a frozen shared value" and nothing froze it.
    expect(Object.isFrozen(UNMET)).toBe(true);
    expect(Object.isFrozen(UNMET.prior)).toBe(true);

    const p = createProfile('de', D(1));
    const state = unitState(p, U('never-met'));
    expect(state).toBe(UNMET);
    expect(() => Object.assign(state, { strength: 6 })).toThrow();
    expect(unitState(p, U('another')).strength).toBe(0);
  });
});

describe('summarize partitions the profile exactly', () => {
  it('drops a unit whose key cannot be parsed, from every scope including `all`', () => {
    // ⚠️ `unitKey(d, v, '')` mints `"recognise:de:"`, which `parseUnitKey` rejects for having no
    // word, and `record` writes whatever key it is handed. `'all'` used to count such a unit while
    // no skill scope could see it — so the four skills no longer summed to the whole, and the law
    // in `summary.test.ts` passed only because its generator draws from a non-empty word list.
    const bogus = unitKey('recognise', V, '');
    const p = record(createProfile('de', D(1)), [
      { kind: 'retrieval', unit: bogus, outcome: 'known', day: D(1) },
      drill('hund', 'known', 1),
    ]);

    const all = summarize(p, { kind: 'all' }).units;
    const skill = summarize(p, { kind: 'skill', variety: V, direction: 'recognise' }).units;
    expect(all).toBe(1);
    expect(skill).toBe(1);
    // The unit is still in the profile — `record` does not silently drop evidence — it is simply not
    // counted in a report, because nothing can address it.
    expect(Object.keys(p.units)).toHaveLength(2);
  });
});

describe('the content request agrees with the session it accompanies', () => {
  it('serializes a claimed prior and a high rung, which the v3 golden does not reach', () => {
    // ⚠️ FROZEN_V3 records only retrievals and exposures, so every unit in it has `"prior":null` and
    // a rung of 0, 1 or 2. The `claimed` arm of `priorToWire` and the upper half of the ladder were
    // unpinned by any byte-level assertion — a review confirmed that mutating both survived the full
    // suite. This is the byte assertion that kills them.
    let p = createProfile('de', D(1));
    p = record(p, [{ kind: 'claim', unit: U('a'), day: D(7) }]);
    for (let i = 1; i <= 8; i++) p = record(p, [drill('a', 'known', i)]);

    expect(serialize(p)).toBe(
      '{"v":3,"language":"de","day":1,"units":[' +
        '["recognise:de:a",{"seen":8,"lastSeen":8,"lastAsked":8,"lastProven":8,"prior":7,"strength":6,"lapses":0}]' +
        ']}',
    );

    const back = deserialize(serialize(p));
    expect(back.ok).toBe(true);
    if (back.ok) expect(unitState(back.value, U('a')).prior).toEqual({ kind: 'claimed', on: 7 });
  });
});
