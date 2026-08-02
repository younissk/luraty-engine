/**
 * Which way the knowledge runs.
 *
 * These are tracked as SEPARATE states for the same word, and that is not a detail — the gap
 * between what a heritage speaker recognises and what they can actually say is the single defining
 * feature of the learner this engine exists for. Collapse the two and you have measured the wrong
 * thing.
 *
 * @module
 */
export type Direction = 'recognise' | 'produce';
