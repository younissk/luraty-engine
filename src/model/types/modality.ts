/**
 * Which channel a piece of knowledge is held in — the first segment of a unit key.
 *
 * Derived from {@link MODALITIES} so the value and the type cannot drift. Writing the union by hand
 * beside the array is two statements of one fact, and the day someone adds a seventh only one of
 * them moves.
 *
 * ⚠️ **A WORD IS ONE UNIT PER MODALITY, WITH ITS OWN RUNG.** `recognise:ar:قلب` and
 * `pronounce:ar:قلب` are different addresses that know nothing about each other. That is the
 * learner model's own claim (ADR-0002) — unevenness is the normal case — extended from two channels
 * to five.
 *
 * ⚠️ **{@link Direction} IS THE NARROW SIBLING, NOT A LEGACY NAME.** `recognise | produce` is what
 * `coverage()`, `summarize()`'s per-skill scope and the estimate model mean, because the
 * recognise/produce gap is the measured thing. A `Direction` is assignable to a `Modality`; the
 * reverse is not, and that asymmetry is doing real work — it is what stops
 * `coverage({ direction: 'pronounce' })` compiling.
 *
 * @module
 */

import type { MODALITIES } from '../modalities.js';

export type Modality = (typeof MODALITIES)[number];
