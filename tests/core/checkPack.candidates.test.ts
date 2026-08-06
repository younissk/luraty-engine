import { describe, expect, it } from 'vitest';

import { arabicPack, frenchPack } from '../../src/testing/packs.js';

import { checkPack } from '../../src/core/checkPack.js';

/**
 * The conformance checks that make a multi-column lemma table safe to ship.
 *
 * ⚠️ **NO UNIT TEST CAN STAND IN FOR THESE, WHICH IS THE WHOLE REASON `checkPack` EXISTS.** Fixtures
 * are written correct by construction; the table that breaks these rules is a host's 90,000-row
 * generated file where one row grew a second column in the wrong order, and it arrives at app
 * launch on a phone.
 *
 * Each pack here is deliberately built by overriding a method rather than by feeding `createPack`
 * bad data — `createPack` refuses to produce most of these, which is correct and is exactly why the
 * check has to hold the built pack to the contract rather than trusting the constructor.
 */

const ARABIC_SAMPLE = { text: 'ذهبت إلى السوق مع أخي في الصباح' };
const FRENCH_SAMPLE = { text: "Je vais au marché avec l'automne qui arrive" };

describe('checkPack — candidates', () => {
  it('passes the real packs', () => {
    expect(checkPack(frenchPack, FRENCH_SAMPLE)).toEqual([]);
    expect(checkPack(arabicPack, ARABIC_SAMPLE)).toEqual([]);
  });

  it('passes on a sample whose words ARE ambiguous, which the sample above never was', () => {
    // ⚠️ Measured: `ذهبت إلى السوق مع أخي في الصباح` tokenizes to seven words, every one of which
    // has exactly ONE candidate. So the three checks above only ever ran against single-element
    // lists — `candidates-repeat` and `candidates-not-canonical` cannot fail on a list of one, and
    // the pass case for a genuinely ambiguous pack was unverified. كتب and مدرسة are the fixture's
    // two multi-reading rows.
    expect(checkPack(arabicPack, { text: 'كتب مدرسة في السوق' })).toEqual([]);
    expect(arabicPack.candidates('كتب').length).toBeGreaterThan(1);
    expect(arabicPack.candidates('مدرسة').length).toBeGreaterThan(1);
  });

  it('catches a candidate list that does not lead with the key', () => {
    // The silent failure this check exists for: a reader taps a word, is shown the readings, picks
    // the first — and is credited for a unit `key` never names, so the scheduler goes on treating
    // the word as unmet however often she looks it up. Everything renders and nothing errors.
    const misordered = {
      ...frenchPack,
      candidates: (s: string) => ['zzz', frenchPack.key(s)],
    };
    const problems = checkPack(misordered, FRENCH_SAMPLE);
    expect(problems.map((p) => p.kind)).toContain('candidates-disagree-with-key');
  });

  it('catches an empty candidate list', () => {
    // A tapped word with nothing to show. The contract promises at least the key, and a host that
    // trusts it renders `offered[0]` with no length check.
    const barren = { ...frenchPack, candidates: () => [] };
    const problems = checkPack(barren, FRENCH_SAMPLE);
    expect(problems.map((p) => p.kind)).toContain('candidates-empty');
  });

  it('catches a repeated reading', () => {
    // A learner cannot choose between two identical senses, so offering the choice is worse than
    // not offering one. `createPack` dedupes; a pack that reached the engine another way may not.
    const doubled = {
      ...frenchPack,
      candidates: (s: string) => [frenchPack.key(s), frenchPack.key(s)],
    };
    const problems = checkPack(doubled, FRENCH_SAMPLE);
    expect(problems.map((p) => p.kind)).toContain('candidates-repeat');
  });

  it('catches a second reading that is not canonical', () => {
    // Element zero is covered by the key-stability check. Elements one and beyond are reachable
    // only through a tap, and a drifting one means the learner who picks it is credited under an
    // address no other route to that word produces — one word, two unit keys.
    const drifting = {
      ...frenchPack,
      candidates: (s: string) => [frenchPack.key(s), 'vais'],
    };
    // `vais` keys onward to `aller`, so offering it as a reading is offering a non-canonical form.
    expect(frenchPack.key('vais')).toBe('aller');
    const problems = checkPack(drifting, FRENCH_SAMPLE);
    expect(problems.map((p) => p.kind)).toContain('candidates-not-canonical');
  });

  it('reports each candidate fault once, not once per token', () => {
    // These are properties of the function rather than of the token, so an unbounded report would
    // bury every other problem under thousands of identical lines.
    const barren = { ...frenchPack, candidates: () => [] };
    const problems = checkPack(barren, FRENCH_SAMPLE).filter((p) => p.kind === 'candidates-empty');
    expect(problems).toHaveLength(1);
  });

  it('names the token and both readings, so a human can act on it', () => {
    const misordered = {
      ...arabicPack,
      candidates: (s: string) => ['سوق', arabicPack.key(s)],
    };
    const problem = checkPack(misordered, ARABIC_SAMPLE).find(
      (p) => p.kind === 'candidates-disagree-with-key',
    );
    expect(problem).toBeDefined();
    expect(problem?.message).toContain('سوق');
    expect(problem?.message).toContain(arabicPack.id);
  });
});
