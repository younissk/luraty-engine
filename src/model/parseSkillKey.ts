/**
 * Read a skill key back into its parts.
 *
 * ⚠️ **THE SIBLING OF `parseUnitKey`, AND SEPARATE ON PURPOSE.** `UnitParts.direction` is a
 * `Direction`, and a skill has none — widening that type would make every existing caller handle a
 * case that cannot happen for the keys they deal with. Two parsers, each total over its own shape.
 *
 * ⚠️ **A HOST USES THIS TO DECIDE WHAT TO DRAW.** The scheduler never calls it; the moment `plan()`
 * asks what kind of unit something is, grammar has its own scheduler again.
 *
 * @module
 */

import { SKILL } from './skillKey.js';
import type { Variety } from './types/variety.js';

export type SkillParts = { readonly variety: Variety; readonly skill: string };

export function parseSkillKey(key: string): SkillParts | undefined {
  const prefix = `${SKILL}:`;
  if (!key.startsWith(prefix)) return undefined;

  const rest = key.slice(prefix.length);
  const colon = rest.indexOf(':');
  if (colon < 0) return undefined;

  const variety = rest.slice(0, colon);
  // Everything after, so a skill id may contain colons freely — the same rule words get.
  const skill = rest.slice(colon + 1);
  if (variety.length === 0 || skill.length === 0) return undefined;

  return { variety: variety as Variety, skill };
}
