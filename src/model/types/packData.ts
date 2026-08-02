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

  /** Optional surface → canonical map, for languages where affix rules are not enough. */
  readonly lemmas?: Readonly<Record<string, string>>;
};
