/**
 * A unit address names a MODALITY, not a direction (ADR-0022).
 *
 * ⚠️ **THE ROUND-TRIP TEST IS THE ONE THAT MATTERS, AND ITS ABSENCE IS WHY THIS ADR EXISTS.** The
 * previous namespace — `skill:` — shipped a hand-cast key that `parseUnitKey` rejected, and
 * `persist` fails the WHOLE profile as malformed when one key does not parse. A learner who did one
 * grammar lesson could never have opened her profile again. The unit test for skills passed happily,
 * because it never round-tripped through serialization. Every modality is round-tripped here.
 *
 * @module
 */

import { describe, expect, it } from 'vitest';

import {
  MODALITIES,
  advanceTo,
  createProfile,
  deserialize,
  isModality,
  isUnitKey,
  parseUnitKey,
  plan,
  record,
  serialize,
  skillKey,
  summarize,
  unitKey,
  variety,
  type Day,
  type UnitKey,
} from '../../src/index.js';

const AR = variety('ar');
// `day()` returns `Day | undefined` — it rejects 0, which is the engine's reserved NEVER.
// Every other suite brands directly for fixtures; same here.
const D = (n: number): Day => n as Day;

describe('the modality union', () => {
  it('carries the two directions plus the four channels a tool needs', () => {
    expect([...MODALITIES]).toEqual([
      'recognise',
      'produce',
      'pronounce',
      'write',
      'hear',
      'skill',
    ]);
  });

  it('accepts every modality and nothing else', () => {
    for (const m of MODALITIES) expect(isModality(m)).toBe(true);
    // ⚠️ Near-misses, because a typo'd modality is the failure this predicate exists to stop: a
    // free-form segment would let a host mint units nothing will ever schedule.
    for (const bad of ['recognize', 'Produce', 'speak', 'listen', 'skills', '', 'pronounce ']) {
      expect(isModality(bad), bad).toBe(false);
    }
  });
});

describe('a key in every modality', () => {
  it('is built by the blessed constructor and read back with the modality intact', () => {
    for (const modality of MODALITIES) {
      const key = unitKey(modality, AR, 'قلب');
      expect(String(key)).toBe(`${modality}:ar:قلب`);
      expect(parseUnitKey(String(key))?.modality).toBe(modality);
      expect(isUnitKey(String(key))).toBe(true);
    }
  });

  it('survives serialize → deserialize, which is what a profile actually does', () => {
    // ⚠️ **THE MANDATORY ONE.** `persist` validates every key on load and fails the whole blob when
    // one does not parse — so an unparseable modality is not a bad row, it is a learner who cannot
    // open the app. Nothing below asserts a count; the assertion is that the keys come back at all.
    let p = createProfile('ar', D(1));
    const keys = MODALITIES.map((m) => unitKey(m, AR, 'قلب'));
    p = record(
      p,
      keys.map((unit) => ({
        kind: 'retrieval' as const,
        unit,
        outcome: 'known' as const,
        day: D(1),
      })),
    );

    const back = deserialize(serialize(p));
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(Object.keys(back.value.units).sort()).toEqual(keys.map(String).sort());
  });

  it('keeps one word in two modalities as two units with independent rungs', () => {
    // ⚠️ The learner model's own claim (ADR-0002), extended from two channels to five: recognising a
    // word says nothing about being able to pronounce it. If these ever shared state, a heritage
    // speaker's whole profile would be a lie.
    const heard = unitKey('hear', AR, 'قلب');
    const said = unitKey('pronounce', AR, 'قلب');
    let p = createProfile('ar', D(1));
    p = record(p, [
      { kind: 'retrieval', unit: heard, outcome: 'known', day: D(1) },
      { kind: 'retrieval', unit: said, outcome: 'unknown', day: D(1) },
    ]);
    expect(p.units[heard]?.strength).toBe(1);
    expect(p.units[said]?.strength).toBe(0);
    expect(p.units[said]?.lapses).toBe(1);
    expect(p.units[heard]?.lapses).toBe(0);
  });

  it('is scheduled by the SAME plan() as a word, in every modality, with no special case', () => {
    // ⚠️ **THE WHOLE CLAIM OF ADR-0022.** If any modality ever needs a branch in the engine, that
    // tool has grown its own scheduler and the two will disagree about what is due.
    for (const modality of MODALITIES) {
      const unit = unitKey(modality, AR, 'قلب');
      let p = createProfile('ar', D(1));
      p = record(p, [{ kind: 'retrieval', unit, outcome: 'known', day: D(1) }]);
      p = advanceTo(p, D(30));
      const session = plan(p, { day: D(30), maxItems: 5 });
      expect(
        session.items.map((i) => String(i.unit)),
        modality,
      ).toContain(String(unit));
    }
  });
});

describe('what the wider parser changed about counting', () => {
  it('now counts a grammar skill in `all`, where it used to be invisible', () => {
    // ⚠️ **A REAL BEHAVIOUR CHANGE, NOT A REFACTOR.** Before ADR-0022 a `skill:` key failed
    // `parseUnitKey`, so `inScope` dropped it from EVERY scope including `'all'` — a learner's
    // grammar did not appear in `Summary.known` at all, and nothing said so.
    const skill = skillKey(AR, 'past-agreement');
    let p = createProfile('ar', D(1));
    p = record(p, [{ kind: 'retrieval', unit: skill, outcome: 'known', day: D(1) }]);
    expect(summarize(p, { kind: 'all' }).units).toBe(1);
    expect(summarize(p, { kind: 'skill', variety: AR, modality: 'skill' }).units).toBe(1);
    // And it is NOT counted as a word she recognises, which is the error the modality slot prevents.
    expect(summarize(p, { kind: 'skill', variety: AR, modality: 'recognise' }).units).toBe(0);
  });

  it('partitions a profile that actually holds every modality', () => {
    // ⚠️ The property-based partition law in `summary.test.ts` draws only recognise/produce keys, so
    // it cannot observe this change at all — a generator that cannot produce the input under test is
    // a green tick about nothing. This is the same law over a profile built to hold all six.
    let p = createProfile('ar', D(1));
    p = record(
      p,
      MODALITIES.map((m) => ({
        kind: 'retrieval' as const,
        unit: unitKey(m, AR, 'قلب'),
        outcome: 'known' as const,
        day: D(1),
      })),
    );
    const all = summarize(p, { kind: 'all' }).units;
    const parts = MODALITIES.map(
      (modality) => summarize(p, { kind: 'skill', variety: AR, modality }).units,
    );
    expect(all).toBe(MODALITIES.length);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(all);
  });

  it('still refuses a key with no word, in every modality', () => {
    // The guard `inScope`'s partition law depends on: `unitKey(m, v, '')` is unaddressable, and
    // `record` writes whatever key it is handed.
    for (const modality of MODALITIES) {
      expect(isUnitKey(`${modality}:ar:`), modality).toBe(false);
      expect(isUnitKey(`${modality}:`), modality).toBe(false);
    }
    expect(isUnitKey('speak:ar:قلب')).toBe(false);
  });
});

describe('the cast that ADR-0022 deleted', () => {
  it('builds a skill key through `unitKey`, so it cannot diverge from every other key', () => {
    const built = skillKey(AR, 'past-agreement');
    const direct: UnitKey = unitKey('skill', AR, 'past-agreement');
    expect(String(built)).toBe(String(direct));
    expect(isUnitKey(String(built))).toBe(true);
  });
});
