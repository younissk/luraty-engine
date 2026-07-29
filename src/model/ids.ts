/**
 * Identifiers, and the one shape in the engine that is genuinely hard to change later.
 *
 * Everything else here is code, and code is cheap to rewrite. A unit key is different: the evidence
 * log is append-only and a profile is a fold over it, so the key format is baked into history the
 * moment a real learner records anything. Changing it later is not a refactor, it is a migration of
 * somebody's past.
 *
 * @module
 */

declare const BRAND: unique symbol;

/**
 * Nominal typing at zero runtime cost — a branded string is still a string at run time, but the
 * compiler refuses to swap one brand for another.
 */
type Brand<T, N extends string> = T & { readonly [BRAND]: N };

/**
 * Which way the knowledge runs.
 *
 * These are tracked as SEPARATE states for the same word, and that is not a detail — the gap
 * between what a heritage speaker recognises and what they can actually say is the single defining
 * feature of the learner this engine exists for. Collapse the two and you have measured the wrong
 * thing.
 */
export type Direction = 'recognise' | 'produce';

/** All directions, for iteration. Derived from the union so the two cannot drift apart. */
export const DIRECTIONS: readonly Direction[] = ['recognise', 'produce'];

/**
 * A language variety, opaque to the engine.
 *
 * The engine never interprets this — `'fr'`, `'ar-msa'` and `'ar-levantine'` are all just strings
 * it carries around. That is what keeps the engine language-agnostic.
 *
 * It is part of the unit key rather than only the profile because a diglossic language keeps two
 * varieties in play at once: the dialect a learner speaks at home and the standard they read. They
 * are related but different systems and must be measured separately.
 */
export type Variety = Brand<string, 'Variety'>;

/**
 * A day number. Whole days since an epoch the host chooses, **starting at 1**.
 *
 * A day and not a timestamp, deliberately. Everything this engine schedules happens at day
 * granularity, and a number that cannot express "3:47pm" is a number nobody can accidentally make
 * a decision depend on the time of day.
 *
 * ⚠️ **DAY 0 IS RESERVED AND IS NOT A LEGAL DAY.** Zero is the "never" sentinel for every date the
 * engine stores — `lastSeen`, `lastAsked`, `lastProven`, and the day a claim was made — because a
 * max-fold needs an identity element and `0` is it.
 *
 * That works only if no *real* day can also be zero, and it was measured not to. A host whose epoch
 * is "days since install" naturally starts at 0, and then a word asked on the install day reads as
 * NEVER ASKED: `plan()` labels it `'new'` instead of `'review'`, a claim disproved that day still
 * counts as standing, and `summarize()` files it under the wrong bucket. Six separate defects, one
 * ambiguity — and all of them invisible to a host that picked the obvious epoch.
 *
 * `Prior` avoided this by being a discriminated union rather than a sentinel. Making every date a
 * union would cost far more than it buys; reserving one integer costs a sentence. So the constructor
 * refuses `0`, and a host that wants "days since install" starts counting at 1.
 */
export type Day = Brand<number, 'Day'>;

/**
 * The address of one piece of knowledge: `direction:variety:word`.
 *
 * ⚠️ The word comes LAST on purpose. Parsing takes the first two segments and treats the entire
 * remainder as the word, so a word containing a colon cannot corrupt the key. Put the word in the
 * middle and some language, somewhere, eventually breaks the parser.
 */
export type UnitKey = Brand<string, 'UnitKey'>;

/** The checked shape of a unit key, before branding. */
type UnitKeyShape = `${Direction}:${string}`;

/**
 * Build a {@link Variety}. Returns `undefined` rather than throwing — the caller supplies this, so
 * it is untrusted input.
 *
 * Rejects colons because the unit key uses them as separators, and rejects empty strings because a
 * nameless variety makes every key ambiguous.
 */
export function variety(id: string): Variety | undefined {
  if (id.length === 0 || id.includes(':')) return undefined;
  return id as Variety;
}

/**
 * Build a {@link Day}. Rejects negatives, non-integers, and **zero**.
 *
 * Zero is the never-sentinel — see {@link Day}. Rejecting it here is what makes that sentinel
 * unambiguous, and it is the same discipline as {@link unitKey} being the only blessed constructor:
 * the check has to live somewhere a caller cannot skip.
 */
export function day(n: number): Day | undefined {
  if (!Number.isInteger(n) || n < NEVER + 1) return undefined;
  return n as Day;
}

/**
 * The day that means "never".
 *
 * Exported so that nothing reimplements `=== 0` and so the meaning is greppable. It is deliberately
 * NOT constructible through {@link day} — that function rejects it, which is the whole point.
 */
export const NEVER = 0 as Day;

/**
 * Build a {@link UnitKey}.
 *
 * ⚠️ Two steps, not one. The assignment to `UnitKeyShape` is where the template literal actually
 * checks anything; `as` on its own is a promise rather than a check, so a one-step
 * `` return `${d}:${v}` as UnitKey `` would compile clean with a whole segment missing. This is the
 * single blessed constructor — it should be the only `as UnitKey` in the package.
 */
export function unitKey(direction: Direction, v: Variety, word: string): UnitKey {
  const shape: UnitKeyShape = `${direction}:${v}:${word}`;
  return shape as UnitKey;
}

/** The parts of a unit key. */
export type UnitParts = {
  readonly direction: Direction;
  readonly variety: Variety;
  readonly word: string;
};

function isDirection(s: string): s is Direction {
  return s === 'recognise' || s === 'produce';
}

/**
 * Take a unit key apart. Returns `undefined` for anything malformed — this runs against persisted
 * data, which is the one place the engine cannot assume its own invariants held.
 */
export function parseUnitKey(key: string): UnitParts | undefined {
  const firstColon = key.indexOf(':');
  if (firstColon < 0) return undefined;
  const secondColon = key.indexOf(':', firstColon + 1);
  if (secondColon < 0) return undefined;

  const direction = key.slice(0, firstColon);
  const varietyPart = key.slice(firstColon + 1, secondColon);
  // Everything after the second colon, so a word may contain colons freely.
  const word = key.slice(secondColon + 1);

  if (!isDirection(direction)) return undefined;
  if (varietyPart.length === 0 || word.length === 0) return undefined;

  return { direction, variety: varietyPart as Variety, word };
}

/**
 * Is this string a well-formed unit key?
 *
 * The narrowing form of {@link parseUnitKey}, for the caller that only needs the yes/no — chiefly
 * `deserialize`, which must reject a bad key from storage rather than take it apart.
 *
 * ⚠️ It exists so that {@link unitKey} stays **the only `as UnitKey` in the package**. Without it a
 * decoder that has just checked a key still has to cast to use it, and a cast is a promise rather
 * than a check — the exact thing the two-step constructor above was written to avoid. A type
 * predicate carries the proof into the type system instead.
 */
export function isUnitKey(key: string): key is UnitKey {
  return parseUnitKey(key) !== undefined;
}
