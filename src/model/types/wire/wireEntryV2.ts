/**
 * One unit, as a `[key, state]` pair.
 *
 * ⚠️ AN ARRAY, NOT AN OBJECT, AND THIS IS LOAD-BEARING.
 *
 * Serialization must be byte-identical for logically identical state, or every replay and golden
 * test becomes randomly flaky — a fresh profile and a saved-then-reloaded one would differ for no
 * reason anyone can see. That means canonical key ordering.
 *
 * An object cannot promise that. JavaScript preserves insertion order for string keys but hoists
 * *integer-like* keys ("0", "42") to the front in numeric order, whatever order you inserted them.
 * Today no unit key can look like an integer, because every key contains colons. That is a property
 * of the current key format, not of JSON, and relying on it means a future key format change
 * silently reintroduces the flakiness.
 *
 * A sorted array of pairs has no such quirk. The ordering is in the data rather than in an engine
 * behaviour we are hoping stays true.
 *
 * @module
 */

import type { WireUnitV2 } from './wireUnitV2.js';

export type WireEntryV2 = readonly [key: string, unit: WireUnitV2];
