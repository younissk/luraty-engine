import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { Coverage } from '../model/coverage.js';
import type { Evidence } from '../model/evidence.js';
import { unitKey, variety, type Day, type Variety } from '../model/ids.js';
import type { LanguagePack, Lemma } from '../model/pack.js';
import type { Profile } from '../model/profile.js';
import { anyText, passageFor, textFor } from '../testing/alphabets.js';
import { arabicPack, frenchPack } from '../testing/packs.js';

import { coverage } from './coverage.js';
import { createProfile } from './profile.js';
import { PROMOTE_AFTER_SUCCESSES, record } from './record.js';

/**
 * Laws for {@link coverage}.
 *
 * @module
 */

const D = (n: number): Day => n as Day;

const PACKS: readonly { readonly pack: LanguagePack; readonly variety: Variety }[] = [
  { pack: frenchPack, variety: variety('fr')! },
  { pack: arabicPack, variety: variety('ar-msa')! },
];

/** The counts, flattened across the union, so a law can state one thing about every variant. */
function counts(result: Coverage): {
  running: number;
  known: number;
  unknown: number;
  unkeyable: number;
  lemmas: readonly Lemma[];
} {
  if (result.kind === 'no-words') {
    return { running: 0, known: 0, unknown: 0, unkeyable: result.unkeyableTokens, lemmas: [] };
  }
  return {
    running: result.runningTokens,
    known: result.knownTokens,
    unknown: result.unknownTokens,
    unkeyable: result.unkeyableTokens,
    lemmas: result.unknownLemmas,
  };
}

/** Every distinct keyable lemma in a text, in first-appearance order. */
function lemmasOf(pack: LanguagePack, text: string): readonly Lemma[] {
  const out: Lemma[] = [];
  const seen = new Set<Lemma>();
  for (const surface of pack.split(text)) {
    const lemma = pack.key(surface);
    if (lemma.length === 0 || seen.has(lemma)) continue;
    seen.add(lemma);
    out.push(lemma);
  }
  return out;
}

function knowing(v: Variety, lemmas: readonly Lemma[], language: string): Profile {
  const evidence: Evidence[] = [];
  for (const lemma of lemmas) {
    const unit = unitKey('recognise', v, lemma);
    for (let i = 0; i < PROMOTE_AFTER_SUCCESSES; i++) {
      evidence.push({ unit, outcome: 'known', tested: true, day: D(0) });
    }
  }
  return record(createProfile(language, D(0)), evidence);
}

describe.each(PACKS)('coverage laws — $pack.id', ({ pack, variety: v }) => {
  const query = (text: string) => ({ text, variety: v, direction: 'recognise' as const });
  const empty = createProfile(pack.id, D(0));

  // ── P0 ────────────────────────────────────────────────────────────────────────────────────────
  it('never throws, on anything at all', () => {
    // `anyText` reaches code point 1,114,111. Robustness only — a behaviour law fed pure noise
    // passes for the wrong reason.
    fc.assert(
      fc.property(anyText, (text) => {
        coverage(empty, pack, query(text));
      }),
    );
  });

  // ── P1 ────────────────────────────────────────────────────────────────────────────────────────
  it('accounts for every token exactly once', () => {
    fc.assert(
      fc.property(textFor(pack.id), fc.array(fc.nat()), (text, picks) => {
        const lemmas = lemmasOf(pack, text);
        // Know an arbitrary subset, so the law is not only exercised at 0% and 100%.
        const known = picks.map((n) => lemmas[n % Math.max(lemmas.length, 1)]).filter((l) => l);
        const profile = knowing(v, known as readonly Lemma[], pack.id);

        const c = counts(coverage(profile, pack, query(text)));

        // No third bucket: unkeyable tokens are excluded from `running` by definition.
        expect(c.known + c.unknown).toBe(c.running);
        // And nothing the tokenizer produced is unaccounted for.
        expect(c.running + c.unkeyable).toBe(pack.split(text).length);
        expect(c.known).toBeGreaterThanOrEqual(0);
        expect(c.known).toBeLessThanOrEqual(c.running);
        // A TYPE count can never exceed the token count it summarises.
        expect(c.lemmas.length).toBeLessThanOrEqual(c.unknown);
        // The list is distinct.
        expect(new Set(c.lemmas).size).toBe(c.lemmas.length);
      }),
    );
  });

  // ── P2 ────────────────────────────────────────────────────────────────────────────────────────
  it('is monotone in knowledge — proving words can only raise coverage', () => {
    // Catches a swapped known/unknown assignment, and demotion logic leaking into what must be a
    // read-only measurement. An example test misses this class whenever the hand-built fixture was
    // written under the same flipped assumption as the code.
    fc.assert(
      fc.property(textFor(pack.id), fc.nat(), (text, n) => {
        const lemmas = lemmasOf(pack, text);
        const before = counts(coverage(empty, pack, query(text)));

        const promoted = lemmas.slice(0, n % (lemmas.length + 1));
        const after = counts(coverage(knowing(v, promoted, pack.id), pack, query(text)));

        expect(after.running).toBe(before.running);
        expect(after.known).toBeGreaterThanOrEqual(before.known);
        expect(after.unknown).toBeLessThanOrEqual(before.unknown);
      }),
    );
  });

  // ── P3 ────────────────────────────────────────────────────────────────────────────────────────
  it('pools by concatenation — counts add exactly', () => {
    // This is the documented way to measure several passages together, so it is pinned as a law.
    // It also guards `split`'s `lastIndex` reset: a shared stateful regex would make results depend
    // on call order, and this law is where that shows up.
    //
    // The trap it forecloses needs no floating point to bite: 19/20 and 49/50 POOL to 68/70
    // (0.9714) but AVERAGE to 0.965, and the band verdict flips on the difference. There is no
    // `fraction` field precisely so nobody can average two of them.
    fc.assert(
      fc.property(textFor(pack.id), textFor(pack.id), fc.nat(), (a, b, n) => {
        const lemmas = [...lemmasOf(pack, a), ...lemmasOf(pack, b)];
        const profile = knowing(v, lemmas.slice(0, n % (lemmas.length + 1)), pack.id);

        const ca = counts(coverage(profile, pack, query(a)));
        const cb = counts(coverage(profile, pack, query(b)));
        const both = counts(coverage(profile, pack, query(`${a} ${b}`)));

        expect(both.running).toBe(ca.running + cb.running);
        expect(both.known).toBe(ca.known + cb.known);
        expect(both.unknown).toBe(ca.unknown + cb.unknown);
        expect(both.unkeyable).toBe(ca.unkeyable + cb.unkeyable);
        // The lemma LIST is a union rather than a sum, because it is de-duplicated.
        expect(new Set(both.lemmas)).toEqual(new Set([...ca.lemmas, ...cb.lemmas]));
      }),
    );
  });

  // ── P4 ────────────────────────────────────────────────────────────────────────────────────────
  it('reaches all three bands — the vacuity guard', () => {
    // ⚠️ THE MOST IMPORTANT TEST IN THIS FILE, and it asserts something about the TESTS.
    //
    // Every law above uses `textFor`, which is an unbounded `fc.string` and therefore generates
    // short text almost always — so the band classifier is never reached and every band law would
    // be green and vacuous. That is the ten-Arabic-laws failure repeating one layer up.
    //
    // This law uses `passageFor`, which guarantees a token count, and then asserts that all three
    // arms were actually observed. If the generator ever stops producing real passages, THIS test
    // fails rather than the band laws quietly passing.
    const observed = new Set<string>();

    fc.assert(
      fc.property(passageFor(pack.id, 100), fc.nat({ max: 100 }), (text, unknownWanted) => {
        const lemmas = lemmasOf(pack, text);
        // Randomly generated words are all distinct types in practice, so knowing all but `k` of
        // them puts roughly `k` unknown tokens in a 100-token passage — which sweeps the whole
        // range from 0% to 100% unknown across the run.
        const keep = Math.max(lemmas.length - unknownWanted, 0);
        const result = coverage(knowing(v, lemmas.slice(0, keep), pack.id), pack, query(text));

        expect(result.kind).toBe('measured');
        if (result.kind !== 'measured') return;
        expect(result.runningTokens).toBe(100);
        observed.add(result.band);
      }),
    );

    expect(observed).toEqual(new Set(['too-hard', 'in-band', 'too-easy']));
  });
});
