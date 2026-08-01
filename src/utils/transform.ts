/**
 * Rebuild a string, and **only if something actually changes**.
 *
 * ⚠️ THIS IS THE HOT PATH OF THE WHOLE PACKAGE. It runs once per normalize step per word: 160,000
 * times while `createPack` builds the German pack (10,000 frequency entries plus 15,000 lemma rows,
 * both sides, four steps), and once per token on every screen of text a learner reads. It was
 * measured at 286 ms of a phone's cold start and 7.3 ms per thousand tokens, both under Hermes.
 *
 * Three things it avoids, each of which the obvious `for (const ch of s) out += ch` loop does:
 *
 * 1. **An allocation when nothing changes.** Most words are untouched by most steps — a German lemma
 *    has no punctuation to strip and usually no umlaut to fold — so the common case is now a scan
 *    that returns the input by identity. The old code rebuilt every string four times to arrive back
 *    at what it started with.
 * 2. **A one-character string per character.** `replace` takes a CODE POINT, so the tables are keyed
 *    by number and nothing is materialised unless a substitution actually fires.
 * 3. **Per-character concatenation.** Unchanged runs are copied with one `slice` rather than one
 *    append each.
 *
 * ⚠️ **THE ITERATION IS CODE-POINT-EXACT, and it has to be.** `s.codePointAt(i)` returns the paired
 * value for a surrogate pair and the lone surrogate's own value for an unpaired one, so `size` is 2
 * exactly when `for…of` would have yielded a two-unit character — including for `'👍🏽'`, which is
 * four units and two code points. The cross-runtime fingerprint pushes that string and
 * `'𝔘𝔫𝔦𝔠𝔬𝔡𝔢'` through all eight steps under both Node and Hermes, so a mistake here is a red
 * line rather than a silently different key on a phone.
 *
 * `replace` returns `undefined` to keep the character, `''` to delete it, or a replacement — so a
 * table lookup that misses IS the keep signal and needs no second test.
 *
 * ⚠️ A UTILITY by both clauses: it takes a string and a function and knows nothing about any
 * language or any part of this engine. `normalize/` supplies every replacer. Note that its
 * identity-return optimisation mints PERMANENT equivalent mutants — `changed = false → true` and the
 * early `return s` becoming `if (false)` both survive forever and correctly, because they change the
 * allocation rather than the value. Do not "fix" them.
 *
 * @module
 */
export function transform(s: string, replace: (code: number) => string | undefined): string {
  let out = '';
  /** Index in `s` just past the last character already emitted into `out`. */
  let kept = 0;
  let changed = false;

  for (let i = 0; i < s.length;) {
    const code = s.codePointAt(i);
    if (code === undefined) break;
    const size = code > 0xffff ? 2 : 1;
    const next = replace(code);
    if (next !== undefined) {
      out += s.slice(kept, i) + next;
      kept = i + size;
      changed = true;
    }
    i += size;
  }

  // Identity, not a copy. Every caller either returns this straight out or feeds it to the next step,
  // and `createPack` does it 160,000 times.
  if (!changed) return s;
  return out + s.slice(kept);
}
