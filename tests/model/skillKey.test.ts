/**
 * Grammar skills as units.
 *
 * ⚠️ The assertion that matters most is the LAST one: a skill must be schedulable by the same
 * `plan()` that schedules words, with no special case anywhere. If that ever needs one, grammar has
 * quietly grown its own scheduler.
 *
 * @module
 */

import { describe, expect, it } from 'vitest';
import {
  advanceTo,
  createProfile,
  day,
  isSkill,
  isUnitKey,
  keysFor,
  plan,
  record,
  skillKey,
  variety,
} from '../../src/index.js';

const AR = variety('ar');

describe('skillKey', () => {
  it('keeps the three-part shape every other key has', () => {
    expect(String(skillKey(AR, 'past-agreement'))).toBe('skill:ar:past-agreement');
  });

  it('does not collide with a word that happens to be spelled the same', () => {
    // ⚠️ A learner could meet a word written `past-agreement` in a Latin-script pack. The namespace
    // is what stops her vocabulary and her grammar sharing a row.
    const word = keysFor('recognise', AR, ['past-agreement'])[0];
    expect(String(word)).not.toBe(String(skillKey(AR, 'past-agreement')));
  });

  it('tells a HOST what a key is, which is the only thing that should ask', () => {
    expect(isSkill(skillKey(AR, 'x'))).toBe(true);
    expect(isSkill(keysFor('recognise', AR, ['x'])[0]!)).toBe(false);
  });

  it('is accepted by `isUnitKey`, or a profile holding one could never be loaded', () => {
    // ⚠️ **THE BUG THIS ALMOST SHIPPED WITH.** `persist` validates every key on load and fails the
    // whole blob as malformed when one does not parse. A `skill:` key has no `Direction`, so
    // `parseUnitKey` rejects it by design — without the second arm in `isUnitKey`, a learner who did
    // one grammar lesson could never open her profile again.
    expect(isUnitKey(String(skillKey(AR, 'past-agreement')))).toBe(true);
    expect(isUnitKey('skill:ar:')).toBe(false);
    expect(isUnitKey('skill:')).toBe(false);
  });

  it('is scheduled by the SAME plan() as a word, with no special case', () => {
    // ⚠️ **THE WHOLE CLAIM OF THE FEATURE.** If this ever needs a branch in the engine, grammar has
    // grown its own scheduler and the two will disagree about what is due.
    const skill = skillKey(AR, 'past-agreement');
    let profile = createProfile('ar', day(1));
    profile = record(profile, [{ kind: 'retrieval', unit: skill, outcome: 'known', day: day(1) }]);
    profile = advanceTo(profile, day(30));

    const session = plan(profile, { day: day(30), maxItems: 5 });
    expect(session.items.map((item) => String(item.unit))).toContain(String(skill));
  });
});
