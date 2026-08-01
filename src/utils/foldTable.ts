/**
 * A character → replacement object, as a code-point Map.
 *
 * ⚠️ A Map and not the object literal, for the reason `createPack` uses one for its lemma table:
 * `LATIN_FOLD['constructor']` reaches through the prototype chain and returns a FUNCTION. A single
 * character can never spell `constructor`, so the old `LATIN_FOLD[ch] ?? ch` was safe by accident —
 * and `transform` returns the lookup result directly, which turns "safe by accident" into a
 * character substituted with a function's source text. Keying by number removes the class.
 *
 * @module
 */
export function foldTable(source: Readonly<Record<string, string>>): ReadonlyMap<number, string> {
  const table = new Map<number, string>();
  for (const [ch, to] of Object.entries(source)) {
    const code = ch.codePointAt(0);
    if (code !== undefined) table.set(code, to);
  }
  return table;
}
