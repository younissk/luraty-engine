import type { Claim, Exposure } from '../model/index.js';
import { unitKey, type Day, type Direction, type UnitKey, type Variety } from '../model/index.js';
import type { LanguagePack, Lemma } from '../model/index.js';

/**
 * Doing one thing to many words.
 *
 * ⚠️ **THIS MODULE EXISTS BECAUSE THE SAME LOOP WAS HAND-WRITTEN FIVE TIMES.** `vocabularyOf` lived
 * in `testing/` and was never exported, so the identical "split the frequency list, key each word,
 * drop empties, drop duplicates" loop was then rewritten in `testing/demo.ts`, twice in
 * `scripts/learner-body.ts`, and in two pack build scripts. Writing a helper five times and
 * publishing it zero times is the API missing it, not the callers being lazy.
 *
 * Everything here is a pure transform over strings — no I/O, no new concepts, nothing that touches
 * the state model. Each one is the shortest honest way to express something every host does on day
 * one.
 *
 * @module
 */

/**
 * Every distinct canonical word a pack's frequency list contains, **commonest first**.
 *
 * The order is the whole value: it is what a host passes as {@link PlanOptions.priority}, and
 * without it a session of equally-overdue words comes back alphabetically.
 *
 * Two filters, and both matter. **Unkeyable surfaces are dropped** — `key()` can return the empty
 * string (a run of Arabic tatweel is a real example), and `unitKey(d, v, '')` mints an address
 * `parseUnitKey` rejects, so such a unit could never be known or even addressed. **Duplicates are
 * dropped, first occurrence winning** — many surfaces collapse to one lemma, and the earliest
 * position is the honest rank for it.
 */
export function vocabularyOf(pack: LanguagePack, frequency: string): readonly Lemma[] {
  const out: Lemma[] = [];
  const seen = new Set<Lemma>();
  for (const word of frequency.split(/\s+/)) {
    if (word.length === 0) continue;
    const lemma = pack.key(word);
    if (lemma.length === 0 || seen.has(lemma)) continue;
    seen.add(lemma);
    out.push(lemma);
  }
  return out;
}

/**
 * Address a list of words, in one direction and variety.
 *
 * Chiefly for {@link PlanOptions.priority}: `keysFor('recognise', de, vocabularyOf(pack, frequency))`
 * is the whole of the frequency tiebreak a host needs.
 *
 * ⚠️ **Empty words are skipped**, and that is a real guard rather than tidiness. `unitKey(d, v, '')`
 * returns `"recognise:de:"`, which `parseUnitKey` rejects for having no word — and `record` writes
 * whatever key it is handed, so one empty string in a caller's list puts a permanently unaddressable
 * unit in the profile. A review found exactly that reaching `summarize`, where it broke the law that
 * the per-skill scopes partition the whole.
 *
 * Order is preserved and duplicates are NOT removed: `priority` takes the first index it sees, so a
 * caller who wants dedup should use {@link vocabularyOf}, which does it.
 */
export function keysFor(
  direction: Direction,
  v: Variety,
  words: readonly string[],
): readonly UnitKey[] {
  const out: UnitKey[] = [];
  for (const word of words) {
    if (word.length === 0) continue;
    out.push(unitKey(direction, v, word));
  }
  return out;
}

/**
 * Turn the output of a placement into evidence.
 *
 * **The single most common day-one operation**, and until this existed it was a four-field object
 * literal inside a `.map` at every call site.
 *
 * A claim says the host believes she knows this and nobody has checked. It buys no head start on its
 * own — see {@link Claim} — so this cannot inflate anything; what it buys is that day one is not an
 * empty screen, that those words come back labelled `'verify'` rather than `'new'`, and that
 * `coverage()` can say "it depends whether you believe her" instead of confidently reporting 0%.
 */
export function claimsFor(
  direction: Direction,
  v: Variety,
  words: readonly string[],
  day: Day,
): readonly Claim[] {
  return keysFor(direction, v, words).map((unit) => ({ kind: 'claim', unit, day }));
}

/**
 * Everything she met while reading, as evidence that proves nothing.
 *
 * Pass the DISTINCT words of a passage — `vocabularyOf` is not right here, because a passage is text
 * rather than a frequency list; split it with `pack.split` and key each surface.
 *
 * ⚠️ Exposure is the weakest signal the engine has and it is deliberately weaker than it looks: it
 * moves `seen` and `lastSeen` and nothing else. A heritage speaker recognises a word's shape while
 * holding only its domestic sense and will not ask, so if not-asking counted as knowing, the register
 * gap this engine exists to find would be invisible by construction.
 *
 * If she tapped the gloss on a word, that is {@link Help}, not this — and it is the more informative
 * of the two, because it is her telling you she does not have it.
 */
export function exposuresFor(
  direction: Direction,
  v: Variety,
  words: readonly string[],
  day: Day,
): readonly Exposure[] {
  return keysFor(direction, v, words).map((unit) => ({ kind: 'exposure', unit, day }));
}

/**
 * The distinct canonical words of a passage, in first-appearance order.
 *
 * The reading-side counterpart of {@link vocabularyOf}: same dedup and same unkeyable filter, but
 * over real text rather than a frequency list. Feed the result to {@link exposuresFor}.
 */
export function wordsIn(pack: LanguagePack, text: string): readonly Lemma[] {
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
