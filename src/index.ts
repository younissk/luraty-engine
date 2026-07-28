// The public API of the Luraty engine.
//
// This barrel is the ONLY thing a consumer may import. Everything else under src/ is internal —
// if a caller needs something, export it here deliberately.
//
// ⚠️ Hand-written allowlist. Never `export * from './something'`: a wildcard makes every future
// internal file public by default, and a barrel you cannot narrow is an engine you cannot replace.
//
// Slice 1 of the engine is here: the state. What the engine believes about a learner, and how
// evidence changes it. Planning, coverage and persistence are not built yet.

// ── Identifiers ─────────────────────────────────────────────────────────────────────────────────
export type { Day, Direction, UnitKey, UnitParts, Variety } from './model/ids.js';
export { DIRECTIONS, day, parseUnitKey, unitKey, variety } from './model/ids.js';

// ── What the engine believes ────────────────────────────────────────────────────────────────────
export type { Box, Learning, Understood, UnitState } from './model/unit.js';
export type { Profile } from './model/profile.js';

// ── What changes it ─────────────────────────────────────────────────────────────────────────────
export type { Evidence, Outcome } from './model/evidence.js';

// ── Persistence ─────────────────────────────────────────────────────────────────────────────────
// `deserialize` returns a result and never throws: it runs at app launch against data written by an
// older build, and a throw there is a learner whose app will not open.
export type { Decoded, DecodeError, DecodeErrorKind } from './model/wire.js';
export { PROFILE_SCHEMA_VERSION } from './model/wire.js';

// ── Operations ──────────────────────────────────────────────────────────────────────────────────
export { advanceTo, createProfile, hasMet, unitState } from './core/profile.js';
export { PROMOTE_AFTER_SUCCESSES, record } from './core/record.js';
export { deserialize, serialize } from './core/persist.js';

/**
 * The version of this package's public contract.
 *
 * Pinned to `package.json` by `src/boundary.test.ts`, so it cannot drift into a comfortable lie.
 * Bump it in the same commit as any breaking change to the exports above.
 */
export const ENGINE_API_VERSION = '0.1.0';
