/**
 * How a pack turns text into surface tokens.
 *
 * @module
 */
export type TokenizeConfig = {
  readonly strategy: 'regex';
  /**
   * A character-class pattern matched globally. Not a full regex — a pattern for what counts as a
   * word character, so a pack file cannot smuggle in catastrophic backtracking.
   */
  readonly pattern: string;
};
