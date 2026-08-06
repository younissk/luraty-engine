/**
 * The data half of a pack: which words exist, and how common they are.
 *
 * @module
 */
export type PackData = {
  /**
   * Words ordered by frequency, most common first, separated by single spaces.
   *
   * A string rather than `{ "de": 1, "la": 2 }` because the POSITION is the rank, so no numbers are
   * stored at all. For 20k words that is roughly 180 KB instead of about 1.5 MB — and on Hermes the
   * object version is a multi-megabyte `JSON.parse` on the main thread before the first frame,
   * doubled if two languages are loaded.
   */
  readonly frequency: string;

  /**
   * Optional surface → canonical map, for languages where affix rules are not enough.
   *
   * ⚠️ **A FORM MAY LIST MORE THAN ONE LEMMA, PRIMARY FIRST — and the list is the honest shape for
   * an unvocalised script.** Written Arabic drops the short vowels, so كتب is *he wrote*, *books*
   * and *he was made to write*, and a table with one column has to pick one of them silently. A
   * single string is still accepted and still means what it always meant; it is the unambiguous
   * case, not a different format.
   *
   * The FIRST entry is what `LanguagePack.key` returns, so a table that grows a second column
   * changes no unit key, no coverage figure and no schedule. The rest are reachable only through
   * `LanguagePack.candidates`, which exists so a reader can be shown what a form *can* be
   * instead of one guess wearing a confident face.
   *
   * Order carries meaning and nothing here sorts it: the pack author states which reading is
   * likeliest, because the engine has no basis on which to decide.
   *
   * Empty arrays, and entries that normalize away to nothing, are dropped — a form left with no
   * usable lemma is treated as absent from the table rather than as a form that keys to "".
   */
  readonly lemmas?: Readonly<Record<string, string | readonly string[]>>;
};
