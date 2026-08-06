/**
 * What a `Summary` covers.
 *
 * A union rather than two optional fields, so that "I am blurring MSA and my home dialect into one
 * number" is something the caller had to type. It is the same discipline that gives
 * `CoverageQuery.direction` no default: for a diglossic learner those are two systems, and one
 * number across them is a category error rather than a convenience.
 *
 * ⚠️ **THE SCOPE KEYS ON `modality`, NOT `direction` (ADR-0022), AND THE PARTITION LAW IS WHY.**
 * `summarize` promises that the per-skill scopes partition the profile exactly — nothing
 * double-counted, nothing dropped. Once `parseUnitKey` accepts every modality, a `skill:` or
 * `pronounce:` unit is counted by `'all'`; if this still asked for a `Direction`, no per-skill scope
 * could ever match one and the law would break silently, understating the parts against the whole.
 *
 * ⚠️ **IT IS ALSO THE PRIMITIVE THE PER-MODALITY DIAGNOSIS NEEDS** (lughaty#166):
 * `summarize(profile, { kind: 'skill', modality: 'produce', variety: ar })` against the same for
 * `'recognise'` is the recognise-4,100 / produce-640 comparison, with no new function.
 *
 * @module
 */

import type { Modality } from './modality.js';
import type { Variety } from './variety.js';

export type SummaryScope =
  | { readonly kind: 'all' }
  | { readonly kind: 'skill'; readonly variety: Variety; readonly modality: Modality };
