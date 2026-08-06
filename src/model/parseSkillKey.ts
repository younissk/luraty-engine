/**
 * Read a skill key back into its parts.
 *
 * ⚠️ **`parseUnitKey` NOW HANDLES SKILL KEYS TOO (ADR-0022), SO THIS IS A CONVENIENCE RATHER THAN A
 * NECESSITY.** It used to be load-bearing: `UnitParts.direction` was a `Direction` and a skill has
 * none, so `parseUnitKey` rejected `skill:` outright and this was the only way to read one. Now the
 * first segment is a `Modality` and both parse. What this still buys is the SHAPE — it returns
 * `{ variety, skill }`, so a caller that has already established it holds a skill does not have to
 * re-check a modality field it knows the value of.
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
