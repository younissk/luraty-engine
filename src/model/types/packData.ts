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
   *
   * ⚠️ **A `ReadonlyMap` IS ACCEPTED, AND FOR A LARGE TABLE IT IS THE ONLY SAFE SHAPE.** A plain
   * object holds one own property per row, and **Hermes caps a plain object at 196,607 own
   * properties** — measured, `docs/guides/benchmarking.md`, the same ceiling recorded there for
   * `Profile.units`. Hermes is the runtime React Native ships and the only one where the limit
   * exists, so a pack that crosses it builds fine, tests green on Node, and dies on the device at
   * module load. Arabic reached 192,159 rows and had to be capped by a frequency floor to stay
   * under it (lughaty#206, ADR-0033) before this existed.
   *
   * `createPack` copies either shape into a `Map` anyway, so an object was always a transient that
   * existed to satisfy this type. A pack with more than ~100k rows should build the `Map` directly:
   * no ceiling, one fewer full copy at launch.
   */
  readonly lemmas?:
    | Readonly<Record<string, string | readonly string[]>>
    | ReadonlyMap<string, string | readonly string[]>;
};
