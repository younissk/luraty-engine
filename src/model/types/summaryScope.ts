/**
 * What a `Summary` covers.
 *
 * A union rather than two optional fields, so that "I am blurring MSA and my home dialect into one
 * number" is something the caller had to type. It is the same discipline that gives
 * `CoverageQuery.direction` no default: for a diglossic learner those are two systems, and one
 * number across them is a category error rather than a convenience.
 *
 * @module
 */

import type { Direction } from './direction.js';
import type { Variety } from './variety.js';

export type SummaryScope =
  | { readonly kind: 'all' }
  | { readonly kind: 'skill'; readonly variety: Variety; readonly direction: Direction };
