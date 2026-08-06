import { describe, expect, it } from 'vitest';

import type { PackData } from '../../src/model/index.js';
import { arabicPack, fixtures, frenchPack } from '../../src/testing/packs.js';

import { createPack } from '../../src/core/pack.js';

/**
 * `candidates` — what a surface form could be, as opposed to what it keys to.
 *
 * The fifth pack function, and the one the engine itself never calls. It exists so a host rendering
 * help can show a reader every word a form might be, instead of one guess wearing a confident face.
 * See `LanguagePack.candidates` for why that is a different question from `key`'s.
 */

describe('candidates', () => {
  it('leads with the key, so the primary reading and the unit address are one thing', () => {
    // The whole safety argument for a multi-column lemma table. Everything in the engine reads
    // `key`; a host that renders `candidates` and credits the learner's pick reads element zero for
    // the ordinary case, so a pack growing a second column moves no unit key and no schedule.
    for (const word of ['كتب', 'مدرسة', 'سوق', 'الكتاب', 'zzq']) {
      expect(arabicPack.candidates(word)[0]).toBe(arabicPack.key(word));
    }
  });

  it('offers both readings of an unvocalised form', () => {
    // كتب on the page is كَتَبَ (he wrote) and كُتُب (books). One string, two words.
    expect(arabicPack.candidates('كتب')).toEqual(['كتب', 'كتاب']);
  });

  it('offers exactly one reading for a form the table does not call ambiguous', () => {
    // ⚠️ ONE ELEMENT MEANS UNAMBIGUOUS, AND IT MEANS UNKNOWN, AND LENGTH ALONE CANNOT TELL THEM
    // APART. سوق is in the frequency list, `zzq` is not, and both come back as a single candidate.
    // A caller that needs the difference asks `rank`, which is the function whose job it is.
    expect(arabicPack.candidates('سوق')).toEqual(['سوق']);
    expect(arabicPack.candidates('zzq')).toHaveLength(1);
    expect(arabicPack.rank('سوق')).toBeDefined();
    expect(arabicPack.rank(arabicPack.key('zzq'))).toBeUndefined();
  });

  it('reads a plain string entry exactly as it always did', () => {
    // The old shape is not a legacy path being tolerated — it is the unambiguous case. French has
    // no multi-lemma rows at all and must be untouched by any of this.
    expect(frenchPack.key('vais')).toBe('aller');
    expect(frenchPack.candidates('vais')).toEqual(['aller']);
  });

  it('normalizes every candidate, not only the first', () => {
    // The half-fix that would look right and be wrong: normalize the primary because `key` returns
    // it, leave the rest raw. A learner picking the second reading is then credited for an address
    // no other route to that word ever produces — `zählen` beside `zaehlen`, forever, silently.
    const built = createPack(fixtures.germanConfig, {
      ...fixtures.germanData,
      lemmas: { ...fixtures.germanData.lemmas, zählt: ['zählen', 'zahlen'] },
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.value.candidates('zählt')).toEqual(['zaehlen', 'zahlen']);
  });

  it('drops a repeat that only appears after normalizing', () => {
    // Two spellings of one lemma are one reading. Left in, a reader is asked to choose between two
    // identical senses, which is worse than not offering the choice. In an unvocalised script this
    // is the ordinary case rather than an author's slip: كَتَبَ and كتب are one row written twice.
    const built = createPack(fixtures.arabicConfig, {
      ...fixtures.arabicData,
      lemmas: { كتب: ['كَتَبَ', 'كتب', 'كتاب'] },
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.value.candidates('كتب')).toEqual(['كتب', 'كتاب']);
  });

  it('treats a row whose candidates all normalize away as a row that is not there', () => {
    // Not as a form that keys to the empty string. A tatweel is a typographic stretch rather than a
    // letter, so it strips to nothing; mapping the form onto "" would file it under a unit key
    // naming no word — which renders as a blank meaning and schedules as a real one.
    const built = createPack(fixtures.arabicConfig, {
      ...fixtures.arabicData,
      lemmas: { سوق: ['ـ', ''] },
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.value.key('سوق')).toBe('سوق');
    expect(built.value.candidates('سوق')).toEqual(['سوق']);
  });

  it('promotes the next reading when the FIRST one is unusable — and that moves the key', () => {
    // ⚠️ **THE ONE CASE WHERE "A SECOND COLUMN MOVES NO UNIT KEY" IS NOT TRUE, PINNED SO IT IS A
    // DECISION RATHER THAN AN ACCIDENT.** A tatweel or a null in column one of a generated
    // 90,000-row table drops out, the next reading becomes the primary, and `key` therefore returns
    // a different word than the same row would have given with one column. `checkPack` cannot see
    // it — `candidates[0]` still equals `key`, because they read the same array.
    //
    // Promotion is the right behaviour: the row still names a real word and discarding it would
    // lose data. What is NOT acceptable is it being silent, which is what this assertion is for.
    const built = createPack(fixtures.arabicConfig, {
      ...fixtures.arabicData,
      lemmas: { كتب: ['ـ', 'كتاب'] },
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.value.key('كتب')).toBe('كتاب');
    expect(built.value.candidates('كتب')).toEqual(['كتاب']);
  });

  it('treats an empty list the same way', () => {
    const built = createPack(fixtures.arabicConfig, {
      ...fixtures.arabicData,
      lemmas: { سوق: [] },
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.value.candidates('سوق')).toEqual(['سوق']);
  });

  it('ignores a non-string sitting in the list, rather than rendering it', () => {
    // A lemma table is generated data from a pipeline in another repository. The declared type is a
    // claim about intent; this is a check on what is actually in memory — the same argument every
    // other field in `createPack` is widened and checked for.
    const built = createPack(fixtures.arabicConfig, {
      ...fixtures.arabicData,
      lemmas: { كتب: ['كتب', null, 7, 'كتاب'] },
    } as unknown as PackData);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.value.candidates('كتب')).toEqual(['كتب', 'كتاب']);
  });

  it('never returns an empty list, whatever it is handed', () => {
    // The contract a caller renders against without a length check.
    for (const word of ['', ' ', 'ـ', '؟', ' ', '\uD800']) {
      expect(arabicPack.candidates(word).length).toBeGreaterThanOrEqual(1);
    }
  });

  it('keeps the author order rather than sorting it', () => {
    // Order is the pack's statement about which reading is likeliest, and the engine has no basis
    // on which to second-guess it. Sorting would silently promote whichever lemma collates first.
    const built = createPack(fixtures.arabicConfig, {
      ...fixtures.arabicData,
      lemmas: { كتب: ['كتاب', 'كتب'] },
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.value.candidates('كتب')).toEqual(['كتاب', 'كتب']);
    // And the primary moved with it, because `key` reads element zero.
    expect(built.value.key('كتب')).toBe('كتاب');
  });

  it('lets the first row win a duplicate surface, as every other table in the pack does', () => {
    const built = createPack(fixtures.arabicConfig, {
      ...fixtures.arabicData,
      // Two rows normalizing to the same surface. The second is the author's second thought.
      lemmas: { كَتَب: ['كتب', 'كتاب'], كتب: ['مدرس'] },
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.value.candidates('كتب')).toEqual(['كتب', 'كتاب']);
  });
});
