// The public API of the Luraty engine.
//
// This barrel is the ONLY thing a consumer may import. Everything else under src/ is internal —
// if a caller needs something, export it here deliberately.
//
// ⚠️ Hand-written allowlist. Never `export * from './something'`: a wildcard makes every future
// internal file public by default, and a barrel you cannot narrow is an engine you cannot replace.
//
// Built so far: the state (what the engine believes about a learner and how evidence changes it),
// persistence, language packs, coverage, and planning.

// ── Identifiers ─────────────────────────────────────────────────────────────────────────────────
export type { Day, Direction, UnitKey, UnitParts, Variety } from './model/ids.js';
export { DIRECTIONS, day, parseUnitKey, unitKey, variety } from './model/ids.js';

// ── What the engine believes ────────────────────────────────────────────────────────────────────
// One flat shape per unit, plus a rung ladder. `Learning | Understood | Box` are GONE: under a
// ladder the box is derived (`strength >= KNOWN_AT_STRENGTH`), and storing a derived value is how
// two sources of one truth get out of step.
export type { Prior, Strength, UnitState } from './model/unit.js';
export {
  hasStandingClaim,
  isKnown,
  KNOWN_AT_STRENGTH,
  MAX_STRENGTH,
  STRENGTH_STEP,
} from './model/unit.js';
export type { Profile } from './model/profile.js';

// ── What changes it ─────────────────────────────────────────────────────────────────────────────
// A four-member union on what the LEARNER did — proved it, met it, asked for help, or was said to
// know it. Not on what the exercise was; that rule is why a speaking exercise can be added later
// without the core changing.
export type {
  Claim,
  Evidence,
  EvidenceKind,
  Exposure,
  Help,
  Outcome,
  Retrieval,
} from './model/evidence.js';

// ── Language packs ──────────────────────────────────────────────────────────────────────────────
// The engine knows no language. Everything language-specific arrives through this contract, and a
// pack can be built from a JSON config plus data — so adding a language is not a code change.
export type {
  AffixConfig,
  // Reachable through `PackConfig.compounds` and therefore public whether or not it is named here.
  // An unexported type a consumer must nevertheless fill in is a contract they can only satisfy by
  // guessing at its shape.
  CompoundConfig,
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

// ── Results ─────────────────────────────────────────────────────────────────────────────────────
// The engine's one result type, shared by BOTH doors that take untrusted input: `deserialize`
// (bytes written by an older build) and `createPack` (a config file a human wrote). Neither throws.
//
// Note the asymmetry that the shared type cannot express: `createPack` only ever fails as
// `'malformed'`. The other three kinds are about stored bytes and cannot arise from a pack config.
export type { Decoded, DecodeError, DecodeErrorKind } from './model/wire.js';

// ── Persistence ─────────────────────────────────────────────────────────────────────────────────
// `deserialize` runs at app launch against data written by an older build, so a throw there is a
// learner whose app will not open. It returns a result instead, always.
export { PROFILE_SCHEMA_VERSION } from './model/wire.js';

// ── Coverage ────────────────────────────────────────────────────────────────────────────────────
// How much of a text this learner knows, against the 95–98% band (ADR-0003 invariant 1). The band
// constants are exported because a host has to be able to ask for content long enough to classify:
// the engine cannot fetch anything, so if nobody carries `minTokens` outward, every passage arrives
// too short and the invariant has no purchase on the product.
export type { Band, Coverage, CoverageQuery } from './model/coverage.js';
export { COVERAGE_BAND } from './model/coverage.js';
export { coverage } from './core/coverage.js';

// ── Planning ────────────────────────────────────────────────────────────────────────────────────
// What to do next, plus a DESCRIPTION of the content it needs — the engine cannot fetch anything,
// so the host reads the request and goes and gets it. That is what makes a scheduler testable with
// no database, and why there is no content port here.
export type {
  ContentRequest,
  PlanOptions,
  Reassess,
  Session,
  SessionItem,
  Why,
} from './model/session.js';
export {
  DEFAULT_REVIEW_GAP_DAYS,
  OVER_ASK,
  plan,
  REASSESS_AFTER_DAYS,
  STUCK_AFTER_LAPSES,
} from './core/plan.js';

// ── Reporting ───────────────────────────────────────────────────────────────────────────────────
// The engine stores no history. `summarize` is a fixed-size snapshot the HOST persists and diffs —
// "can she read more than in March?" is a subtraction of two of these. See `Summary` for why the
// log lives on the host's side of the boundary, and for the obligation that creates.
export type { Summary, SummaryScope } from './model/summary.js';
export { summarize } from './core/summary.js';

// ── Operations ──────────────────────────────────────────────────────────────────────────────────
export { advanceTo, createProfile, hasMet, unitState } from './core/profile.js';
export { record } from './core/record.js';
export { deserialize, serialize } from './core/persist.js';

/**
 * The version of this package's public contract.
 *
 * Pinned to `package.json` by `src/boundary.test.ts`, so it cannot drift into a comfortable lie.
 * Bump it in the same commit as any breaking change to the exports above.
 */
export const ENGINE_API_VERSION = '0.4.0';
