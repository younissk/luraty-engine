import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { anyText, textFor } from '../../src/testing/alphabets.js';
import { arabicPack, fixtures, frenchPack } from '../../src/testing/packs.js';
import { createPack } from '../../src/core/pack.js';
import type { LanguagePack } from '../../src/model/index.js';

/**
 * The laws `candidates` promises.
 *
 * These are what let a host render the list without a length check and credit the learner's pick
 * without re-deriving anything. A pack that breaks one of them does not crash — it offers a reading
 * the engine will not address, and the learner's own answer is filed against a word she did not
 * choose.
 *
 * ⚠️ **THE FILE IS IN TWO HALVES, AND THE FIRST HALF ALONE WAS VACUOUS.** Measured: `textFor` over
 * the shipped fixtures produced **0 multi-candidate forms in 100,000 samples per pack**, because
 * neither real pack has ambiguous rows in the words a random generator lands on. Every law was
 * therefore only ever run against the one-element fall-through, where *never empty* is
 * `[x].length >= 1`, *at most once* is `new Set([x]).size === 1`, and *leads with key* is
 * `[key(s)][0] === key(s)` — three tautologies over an array literal. That is the exact failure
 * `src/testing/alphabets.ts` exists to prevent, one level up: the generator could reach the code but
 * not the BRANCH.
 *
 * So the second half builds a pack that is ambiguous everywhere and generates from its own keys,
 * and it carries a **vacuity guard** that fails if the multi-candidate branch was never observed —
 * the pattern `coverage.property.test.ts` sets for exactly this.
 */

const PACKS = [
  ['french', frenchPack],
  ['arabic', arabicPack],
] as const;

describe.each(PACKS)('%s pack — candidate laws', (_name, pack) => {
  it('never returns an empty list', () => {
    fc.assert(
      fc.property(textFor(pack.id), (s) => {
        expect(pack.candidates(s).length).toBeGreaterThanOrEqual(1);
      }),
    );
  });

  it('leads with exactly what key returns', () => {
    fc.assert(
      fc.property(textFor(pack.id), (s) => {
        expect(pack.candidates(s)[0]).toBe(pack.key(s));
      }),
    );
  });

  it('is total: strings out for any input, and never throws', () => {
    // `anyText` reaches code point 1,114,111 — astral-plane characters and lone surrogates. This is
    // the one law in this half that carries information the single-candidate branch cannot fake.
    fc.assert(
      fc.property(anyText, (s) => {
        const offered = pack.candidates(s);
        expect(Array.isArray(offered)).toBe(true);
        for (const reading of offered) expect(typeof reading).toBe('string');
      }),
    );
  });

  it('is stable: asking twice gives the same answer', () => {
    // A shared mutable regex made `split` order-dependent once. Nothing here should be able to.
    fc.assert(
      fc.property(textFor(pack.id), (s) => {
        expect(pack.candidates(s)).toEqual(pack.candidates(s));
      }),
    );
  });
});

// ── The half that actually reaches the branch ───────────────────────────────────────────────────

/**
 * An Arabic pack where most forms are genuinely ambiguous.
 *
 * ⚠️ **AMBIGUOUS ROWS OF DIFFERENT LENGTHS, INCLUDING ONE-ELEMENT ONES.** A table where every row
 * had two readings would make "at most once" and "leads with key" pass for a `candidates` that
 * ignored its argument and returned a constant pair. Mixing the arities is what makes the laws
 * discriminate.
 */
const AMBIGUOUS_ROWS: Record<string, readonly string[]> = {
  كتب: ['كتب', 'كتاب'],
  مدرسة: ['مدرسة', 'مدرس'],
  عامل: ['عامل', 'عمل', 'معمل'],
  سوق: ['سوق'],
  بيت: ['بيت', 'بيوت'],
  ولد: ['ولد', 'ميلاد', 'والد'],
};

const ambiguousBuild = createPack(fixtures.arabicConfig, {
  ...fixtures.arabicData,
  frequency: `${fixtures.arabicData.frequency} كتاب مدرس عمل معمل بيوت ميلاد والد`,
  lemmas: AMBIGUOUS_ROWS,
});
// ⚠️ Throws at module load, unlike `testing/packs.ts`, and that is fine HERE: this fixture is built
// from literals in this file, so a failure is a broken test rather than a mutant breaking the pack
// under audit. The `build()` helper defers precisely because a throw at import scores a mutant as
// SURVIVED, and nothing in this file is on the mutation lane's critical path.
if (!ambiguousBuild.ok) throw new Error(`fixture pack failed: ${ambiguousBuild.error.message}`);
const ambiguous: LanguagePack = ambiguousBuild.value;

/** Text built from the table's own surfaces, so the multi-candidate branch is reached constantly. */
const ambiguousText = fc
  .array(fc.constantFrom(...Object.keys(AMBIGUOUS_ROWS), 'zzq', 'في'), {
    minLength: 1,
    maxLength: 12,
  })
  .map((words) => words.join(' '));

describe('candidate laws, on a pack that is actually ambiguous', () => {
  /** Counts what the run observed, so the guard below can refuse a vacuous pass. */
  let sawMulti = 0;
  let sawSingle = 0;

  it('holds every law at once, on forms with more than one reading', () => {
    fc.assert(
      fc.property(ambiguousText, (text) => {
        for (const token of ambiguous.split(text)) {
          const offered = ambiguous.candidates(token);
          if (offered.length > 1) sawMulti += 1;
          else sawSingle += 1;

          // Never empty.
          expect(offered.length).toBeGreaterThanOrEqual(1);
          // Leads with the key — the invariant every caller reads element zero on.
          expect(offered[0]).toBe(ambiguous.key(token));
          // No reading offered twice; a learner cannot choose between two identical senses.
          expect(new Set(offered).size).toBe(offered.length);
          // Every reading is canonical, so any pick is a stable address.
          for (const reading of offered) expect(ambiguous.key(reading)).toBe(reading);
        }
      }),
    );
  });

  it('actually reached both branches — the guard against a vacuous pass', () => {
    // ⚠️ **THIS IS THE ASSERTION THE FIRST HALF OF THIS FILE DID NOT HAVE, AND ITS ABSENCE MADE FIVE
    // LAWS TAUTOLOGIES.** It names what was missed rather than printing two sets: establishing
    // "which arm never ran" after the fact cost 150 repeat runs the last time this happened here.
    expect(
      sawMulti,
      `no multi-candidate form was ever generated — every law above ran only against the ` +
        `single-candidate fall-through and proved nothing (${String(sawSingle)} single-candidate ` +
        `tokens seen)`,
    ).toBeGreaterThan(0);
    expect(
      sawSingle,
      `no single-candidate form was ever generated — the laws never saw the ordinary case`,
    ).toBeGreaterThan(0);
  });
});
