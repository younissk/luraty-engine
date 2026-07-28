// The public API of the Luraty engine.
//
// This barrel is the ONLY thing a consumer may import. Everything else under src/ is internal —
// if a caller needs something, export it here deliberately.
//
// ⚠️ Hand-written allowlist. Never `export * from './something'`: a wildcard makes every future
// internal file public by default, and a barrel you cannot narrow is an engine you cannot replace.
//
// Built so far: the state (what the engine believes about a learner and how evidence changes it),
// persistence, language packs, and coverage. Planning — `plan()` — is not built yet.

// ── Identifiers ─────────────────────────────────────────────────────────────────────────────────
export type { Day, Direction, UnitKey, UnitParts, Variety } from './model/ids.js';
export { DIRECTIONS, day, parseUnitKey, unitKey, variety } from './model/ids.js';

// ── What the engine believes ────────────────────────────────────────────────────────────────────
export type { Box, Learning, Understood, UnitState } from './model/unit.js';
export type { Profile } from './model/profile.js';

// ── What changes it ─────────────────────────────────────────────────────────────────────────────
export type { Evidence, Outcome } from './model/evidence.js';

// ── Language packs ──────────────────────────────────────────────────────────────────────────────
// The engine knows no language. Everything language-specific arrives through this contract, and a
// pack can be built from a JSON config plus data — so adding a language is not a code change.
export type {
  AffixConfig,
  LanguagePack,
  Lemma,
  NormalizeStep,
  PackConfig,
  PackData,
  TokenizeConfig,
} from './model/pack.js';
export { createPack } from './core/pack.js';

// Conformance checks for a pack, run against REAL data at load time. No unit test can reach the
// failure this catches — fixtures are hand-written and correct by construction, and the input that
// actually breaks is the 20,000-word file a host loads in production.
export type { PackProblem, PackProblemKind, PackSample } from './core/checkPack.js';
export { checkPack } from './core/checkPack.js';

// ── Persistence ─────────────────────────────────────────────────────────────────────────────────
// `deserialize` returns a result and never throws: it runs at app launch against data written by an
// older build, and a throw there is a learner whose app will not open.
export type { Decoded, DecodeError, DecodeErrorKind } from './model/wire.js';
export { PROFILE_SCHEMA_VERSION } from './model/wire.js';

// ── Coverage ────────────────────────────────────────────────────────────────────────────────────
// How much of a text this learner knows, against the 95–98% band (ADR-0003 invariant 1). The band
// constants are exported because a host has to be able to ask for content long enough to classify:
// the engine cannot fetch anything, so if nobody carries `minTokens` outward, every passage arrives
// too short and the invariant has no purchase on the product.
export type { Band, Coverage, CoverageQuery } from './model/coverage.js';
export { COVERAGE_BAND } from './model/coverage.js';
export { coverage } from './core/coverage.js';

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
export const ENGINE_API_VERSION = '0.2.0';
