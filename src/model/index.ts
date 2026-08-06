// The model — types only, plus the small total functions that construct and read them.
//
// `core/` depends on this; this depends on nothing but `utils/`. That direction never reverses.
//
// ⚠️ ONE DECLARATION PER FILE. Constructors and predicates at the root, one per file named after
// them; types under `types/` (and `types/wire/` for the persisted shapes, which have the opposite
// change policy from everything else); plain values in `constants.ts`, except `LADDER`, which needs
// its own file because a type derives from it. See ADR-0009 in the parent repo.
//
// This barrel is the module's only public face. `core/` imports from here, never from a leaf.
//
// @module

// ── Identifiers ─────────────────────────────────────────────────────────────────────────────────
export { day } from './day.js';
export { isDirection } from './isDirection.js';
export { isModality } from './isModality.js';
export { MODALITIES } from './modalities.js';
export { isUnitKey } from './isUnitKey.js';
export { parseSkillKey, type SkillParts } from './parseSkillKey.js';
export { SKILL, isSkill, skillKey } from './skillKey.js';
export { parseUnitKey } from './parseUnitKey.js';
export { unitKey } from './unitKey.js';
export { variety } from './variety.js';
export type { Brand } from './types/brand.js';
export type { Day } from './types/day.js';
export type { DayOf } from './types/dayOf.js';
export type { Direction } from './types/direction.js';
export type { Modality } from './types/modality.js';
export type { UnitKey } from './types/unitKey.js';
export type { UnitParts } from './types/unitParts.js';
export type { Variety } from './types/variety.js';
export type { VarietyOf } from './types/varietyOf.js';

// ── The unit ────────────────────────────────────────────────────────────────────────────────────
export { clampStrength } from './clampStrength.js';
export { effectiveStrength } from './effectiveStrength.js';
export { hasStandingClaim } from './hasStandingClaim.js';
export { isKnown } from './isKnown.js';
export { LADDER } from './ladder.js';
export { strengthOf } from './strengthOf.js';
export type { Prior } from './types/prior.js';
export type { Strength } from './types/strength.js';
export type { UnitState } from './types/unitState.js';

// ── Evidence ────────────────────────────────────────────────────────────────────────────────────
export type { Claim } from './types/claim.js';
export type { Evidence } from './types/evidence.js';
export type { EvidenceKind } from './types/evidenceKind.js';
export type { Exposure } from './types/exposure.js';
export type { Help } from './types/help.js';
export type { Outcome } from './types/outcome.js';
export type { Retrieval } from './types/retrieval.js';

// ── The profile ─────────────────────────────────────────────────────────────────────────────────
export type { Profile } from './types/profile.js';

// ── Packs ───────────────────────────────────────────────────────────────────────────────────────
export type { AffixConfig } from './types/affixConfig.js';
export type { CompoundConfig } from './types/compoundConfig.js';
export type { LanguagePack } from './types/languagePack.js';
export type { Lemma } from './types/lemma.js';
export type { NormalizeStep } from './types/normalizeStep.js';
export type { PackConfig } from './types/packConfig.js';
export type { PackData } from './types/packData.js';
export type { TokenizeConfig } from './types/tokenizeConfig.js';

// ── Coverage ────────────────────────────────────────────────────────────────────────────────────
export type { Band } from './types/band.js';
export type { Coverage } from './types/coverage.js';
export type { CoverageQuery } from './types/coverageQuery.js';

// ── The session ─────────────────────────────────────────────────────────────────────────────────
export type { ContentRequest } from './types/contentRequest.js';
export type { PlanOptions } from './types/planOptions.js';
export type { Reassess } from './types/reassess.js';
export type { Session } from './types/session.js';
export type { SessionItem } from './types/sessionItem.js';
export type { Why } from './types/why.js';

// ── Reporting ───────────────────────────────────────────────────────────────────────────────────
export type { Summary } from './types/summary.js';
export type { SummaryScope } from './types/summaryScope.js';

// ── The wire ────────────────────────────────────────────────────────────────────────────────────
// The persisted shapes. Opposite change policy from everything above: a copy of these is sitting in
// storage on somebody's phone and can never be recompiled.
export type { Decoded } from './types/wire/decoded.js';
export type { DecodeError } from './types/wire/decodeError.js';
export type { DecodeErrorKind } from './types/wire/decodeErrorKind.js';
export type { WireEntryV1 } from './types/wire/wireEntryV1.js';
export type { WireEntryV2 } from './types/wire/wireEntryV2.js';
export type { WireEntryV3 } from './types/wire/wireEntryV3.js';
export type { WireProfile } from './types/wire/wireProfile.js';
export type { WireProfileV1 } from './types/wire/wireProfileV1.js';
export type { WireProfileV2 } from './types/wire/wireProfileV2.js';
export type { WireProfileV3 } from './types/wire/wireProfileV3.js';
export type { WireProfileV4 } from './types/wire/wireProfileV4.js';
export type { WireProfileV5 } from './types/wire/wireProfileV5.js';
export type { WireRowV4 } from './types/wire/wireRowV4.js';
export type { WireRowV5 } from './types/wire/wireRowV5.js';
export type { WireUnitV1 } from './types/wire/wireUnitV1.js';
export type { WireUnitV2 } from './types/wire/wireUnitV2.js';
export type { WireUnitV3 } from './types/wire/wireUnitV3.js';

// ── Values ──────────────────────────────────────────────────────────────────────────────────────
export {
  COVERAGE_BAND,
  DIRECTIONS,
  KNOWN_AT_STRENGTH,
  MAX_STRENGTH,
  NEVER,
  PROFILE_SCHEMA_VERSION,
  STRENGTH_STEP,
  UNMET,
  WIRE_ROW_V4_LENGTH,
  WIRE_ROW_V5_LENGTH,
} from './constants.js';
