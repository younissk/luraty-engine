import { describe, expect, it } from 'vitest';

import { day, unitKey, variety, type Day, type UnitKey } from '../model/ids.js';
import type { Evidence } from '../model/evidence.js';

import { createProfile, advanceTo, hasMet, unitState } from './profile.js';
import { PROMOTE_AFTER_SUCCESSES, record } from './record.js';

const AR = variety('ar-msa')!;
const D = (n: number): Day => day(n)!;
const suuq: UnitKey = unitKey('recognise', AR, 'سوق');
const suuqProduce: UnitKey = unitKey('produce', AR, 'سوق');

function ev(unit: UnitKey, outcome: 'known' | 'unknown', tested: boolean, d: number): Evidence {
  return { unit, outcome, tested, day: D(d) };
}

const fresh = () => createProfile('ar', D(0));

describe('record', () => {
  it('starts a unit in the learning box when the learner does not know it', () => {
    const p = record(fresh(), [ev(suuq, 'unknown', false, 1)]);
    expect(unitState(p, suuq)).toEqual({ box: 'learning', seen: 1, lastSeen: 1, streak: 0 });
  });

  it('does NOT promote on a passive signal, however many times it is seen', () => {
    // The rule that matters most: meeting a word ten times and never being asked about it is not
    // evidence you know it. A heritage speaker recognises the shape of a word and often has only
    // the domestic sense of it — let this promote and the register gap becomes invisible.
    let p = fresh();
    for (let d = 1; d <= 10; d++) p = record(p, [ev(suuq, 'known', false, d)]);

    const s = unitState(p, suuq);
    expect(s.box).toBe('learning');
    expect(s.seen).toBe(10);
  });

  it('promotes only after consecutive real retrievals', () => {
    let p = fresh();
    for (let i = 0; i < PROMOTE_AFTER_SUCCESSES; i++) {
      p = record(p, [ev(suuq, 'known', true, i + 1)]);
    }
    expect(unitState(p, suuq).box).toBe('understood');
  });

  it('resets the streak on a failure, so near-misses do not accumulate into promotion', () => {
    const p = record(fresh(), [
      ev(suuq, 'known', true, 1),
      ev(suuq, 'unknown', true, 2),
      ev(suuq, 'known', true, 3),
    ]);
    // One success, a failure, one success — never two in a row, so still learning.
    const s = unitState(p, suuq);
    expect(s.box).toBe('learning');
    if (s.box === 'learning') expect(s.streak).toBe(1);
  });

  it('demotes an understood unit that comes back wrong', () => {
    let p = fresh();
    p = record(p, [ev(suuq, 'known', true, 1), ev(suuq, 'known', true, 2)]);
    expect(unitState(p, suuq).box).toBe('understood');

    p = record(p, [ev(suuq, 'unknown', true, 40)]);
    expect(unitState(p, suuq)).toMatchObject({ box: 'learning', streak: 0 });
  });

  it('does not refresh the confirmation date on a passive sighting', () => {
    // Otherwise a unit stays "recently proven" forever just by appearing on screen, and its
    // re-check never comes due.
    let p = fresh();
    p = record(p, [ev(suuq, 'known', true, 1), ev(suuq, 'known', true, 2)]);
    p = record(p, [ev(suuq, 'known', false, 30)]);

    const s = unitState(p, suuq);
    expect(s.box).toBe('understood');
    if (s.box === 'understood') {
      expect(s.confirmedOn).toBe(2);
      expect(s.lastSeen).toBe(30);
    }
  });

  it('tracks recognise and produce as completely separate states', () => {
    // This IS the heritage gap. Collapse the two and the engine measures the wrong thing.
    let p = fresh();
    p = record(p, [ev(suuq, 'known', true, 1), ev(suuq, 'known', true, 2)]);
    p = record(p, [ev(suuqProduce, 'unknown', true, 2)]);

    expect(unitState(p, suuq).box).toBe('understood');
    expect(unitState(p, suuqProduce).box).toBe('learning');
  });

  it('treats an unmet unit as learning-with-nothing-seen, without inventing an entry', () => {
    const p = fresh();
    expect(hasMet(p, suuq)).toBe(false);
    expect(unitState(p, suuq)).toEqual({ box: 'learning', seen: 0, lastSeen: 0, streak: 0 });
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
