import type { Coverage, CoverageQuery } from '../model/index.js';
import type { Evidence, Outcome } from '../model/index.js';
import type { Day, Direction, UnitKey, Variety } from '../model/index.js';
import type { LanguagePack } from '../model/index.js';
import type { Profile } from '../model/index.js';
import type { PlanOptions, Session } from '../model/index.js';
import type { Summary, SummaryScope } from '../model/index.js';

import { claimsFor, exposuresFor, keysFor, wordsIn } from './bulk/index.js';
import { coverage } from './coverage.js';
import { serialize } from './persist.js';
import { plan } from './plan.js';
import { advanceTo } from './profile/index.js';
import { record } from './record/index.js';
import { summarize } from './summary/index.js';

/**
 * A fluent handle on one learner, for hosts that would rather not thread four arguments.
 *
 * ⚠️ **ENTIRELY OPTIONAL, AND IT ADDS NO POWER.** Every method here delegates to a function that is
 * still exported and still works exactly as before. If you prefer the free functions, use them; the
 * two styles produce identical profiles and can be mixed in one file.
 *
 * ### Why this exists at all
 *
 * *"Why functional? Why not `profile.plan()`?"* — a fair question, and the answer separates two
 * things that were being conflated.
 *
 * **Purity is load-bearing.** Value-in / value-out is what lets a test fork a learner, diff two
 * profiles, bisect a replay, and simulate four hundred headless learners from a seed. It is the
 * property everything else in this package rests on and it is not negotiable.
 *
 * **Free functions are not.** `profile.plan(...)` returning a new value is equally pure. The default
 * was never justified, and the ceremony it costs is real: a host repeats `direction`, `variety` and
 * `day` at every call site, and the same "turn a word list into evidence" `.map` gets written again
 * and again.
 *
 * So the core stays pure and free-function, and this wraps it.
 *
 * ### The rules it keeps
 *
 * - **Immutable.** Every method that records evidence returns a NEW `Learner`. Nothing mutates.
 * - **`profile` is always reachable**, so you can drop back to the free functions at any moment —
 *   this is a convenience, never a wall.
 * - **No hidden state.** A `Learner` is its profile plus the constants (`pack`, `variety`,
 *   `direction`, `vocabulary`) a host would otherwise pass to every call. It stores nothing about
 *   the learner that the profile does not.
 * - **No I/O.** `save()` returns a string; where it goes is still yours.
 *
 * @module
 */

/** What a {@link Learner} needs besides the profile — the arguments you would otherwise repeat. */
export type LearnerContext = {
  /** The language pack. Only `coverage` and the word helpers use it. */
  readonly pack: LanguagePack;
  /**
   * Which variety these operations address. **Defaults to `pack.id`.**
   *
   * Pack id and variety are the same string in every pack that exists (`de`, `fr`, `ar-msa`), and
   * `createPack` now validates the id as a legal variety — so restating it here was duplication
   * with a live typo hazard: `variety('be')` beside a `de` pack files every unit under an address
   * nothing ever reads, forever and silently.
   *
   * ⚠️ **Pass it explicitly when it genuinely differs.** The case that matters is diglossia: a
   * Levantine-speaking learner reading MSA has one profile with two varieties in it, and if you
   * ever run one pack over both, the default would merge her reading and her home dialect into one
   * unit key — the exact category error the two-variety design exists to prevent.
   */
  readonly variety?: Variety;
  /**
   * Which direction these operations address. Defaults to `'recognise'`.
   *
   * ⚠️ A default here is safe in a way `CoverageQuery.direction` deliberately is not: this is a
   * handle a host constructs and names, so `read` versus `speak` is visible at the call site rather
   * than buried in one argument of one call.
   */
  readonly direction?: Direction;

  /**
   * The pack's own vocabulary, commonest first — usually `vocabularyOf(pack, frequency)`.
   *
   * ⚠️ Supplied by the host rather than read off the pack, because **a `LanguagePack` does not carry
   * its frequency list**. It carries `rank(lemma)`, which answers "how common is this?" and cannot
   * enumerate. That is deliberate: the list is the host's data, and the engine holding a copy of
   * 10,000 words per language is exactly the memory cost `PackData.frequency` being a string avoids.
   *
   * Omit it and `plan()` falls back to the key tiebreak, which sorts alphabetically — deterministic,
   * correct, and a bad lesson. See {@link PlanOptions.priority}.
   */
  readonly vocabulary?: readonly string[];
};

/**
 * One learner, one language, one skill — with the engine's functions hanging off it.
 *
 * Construct with {@link learner}.
 */
export type Learner = {
  /** The underlying value. Pass it to any free function; this is never a one-way door. */
  readonly profile: Profile;
  readonly pack: LanguagePack;
  readonly variety: Variety;
  readonly direction: Direction;

  // ── writing ───────────────────────────────────────────────────────────────────────────────────
  /** Fold in evidence you built yourself. The escape hatch: everything else here is sugar over it. */
  record: (evidence: readonly Evidence[]) => Learner;
  /** She was asked, and answered. */
  answer: (word: string, outcome: Outcome, day: Day) => Learner;
  /** The host says she knows these; nobody has checked. The output of a placement. */
  claim: (words: readonly string[], day: Day) => Learner;
  /** She read this text. Mints a unit for every word in it and proves nothing. */
  read: (text: string, day: Day) => Learner;
  /** She tapped the gloss — the most informative thing that happens while reading. */
  help: (word: string, day: Day) => Learner;
  /** Move her forward in time. Refuses to go backwards, like `advanceTo`. */
  on: (day: Day) => Learner;

  // ── reading ───────────────────────────────────────────────────────────────────────────────────
  /**
   * What to practise.
   *
   * `priority` defaults to {@link LearnerContext.vocabulary}, keyed once and cached — the answer
   * almost every host wants, and ten lines to build by hand. Pass your own to override.
   */
  plan: (
    options: Omit<PlanOptions, 'priority'> & { readonly priority?: readonly UnitKey[] },
  ) => Session;
  /** How hard is this text for her? */
  coverage: (text: string, options?: Pick<CoverageQuery, 'ignore'>) => Coverage;
  /** A fixed-size snapshot to persist and diff. Defaults to this skill, not the whole profile. */
  summary: (scope?: SummaryScope) => Summary;
  /** Canonical bytes. Where they go is still yours. */
  save: () => string;
};

/**
 * Wrap a profile.
 *
 * ```ts
 * const words = vocabularyOf(pack, frequency);
 * const anna = learner(createProfile('de', d1), { pack, variety: de, vocabulary: words });
 * const session = anna.claim(words.slice(0, 400), d1).plan({ day: d1, maxItems: 8, maxNew: 3 });
 * ```
 *
 * Cheap: it holds three references and keys the vocabulary lazily, on the first `plan()` that does
 * not supply its own `priority`.
 */
export function learner(profile: Profile, context: LearnerContext): Learner {
  const { pack } = context;
  // No error channel and no throw: `createPack` already rejected an id that is not a legal variety,
  // so `pack.id` is a `Variety` by type and this default cannot fail.
  const variety = context.variety ?? pack.id;
  const direction = context.direction ?? 'recognise';
  const next = (p: Profile): Learner => learner(p, context);

  // Built at most once per handle, and only if a `plan()` call actually needs it. Keying 10,000
  // words is not free, and a host that always passes its own `priority` should never pay for it.
  let priorityCache: readonly UnitKey[] | undefined;
  const defaultPriority = (): readonly UnitKey[] => {
    // ⚠️ The `?? []` here is the one surviving mutant in this file (97.3%), and it is left alive on
    // purpose. Stryker replaces the empty array with a one-element list; `priority` only reorders
    // units that are ALREADY in the profile, so a key matching nothing changes no output. It is an
    // equivalent mutant, and the way to "kill" it would be to assert on the cache rather than on
    // behaviour — a test that pins the implementation and nothing a learner could notice.
    priorityCache ??= keysFor(direction, variety, canonical(context.vocabulary ?? []));
    return priorityCache;
  };

  /**
   * Put a host's words into the pack's canonical form before they become unit keys.
   *
   * ⚠️ **THIS IS THE WHOLE REASON THE HANDLE CARRIES A PACK.** The free functions cannot do it —
   * `keysFor` takes no pack, so its contract is "hand me lemmas" and its callers pass the output of
   * `vocabularyOf`. The facade has the pack, so a host writing the obvious thing must not be
   * silently wrong.
   *
   * And it was. `answer('Schlüssel', …)` wrote to `recognise:de:schlüssel`, while `read()`,
   * `coverage()` and every lemma from `vocabularyOf` address `recognise:de:schluessel` — the German
   * pack transliterates umlauts. Two units, one word, no error, no failing test: the shipped example
   * only ever used words identical to their own keys (`haus`, `verordnung`), so nothing caught it.
   *
   * Safe for already-keyed input because `key` is idempotent — a pack property law
   * (`pack.property.test.ts`), and verified across all 9,981 lemmas of the real German pack.
   */
  const canonical = (words: readonly string[]): readonly string[] => words.map((w) => pack.key(w));

  return {
    profile,
    pack,
    variety,
    direction,

    record: (evidence) => next(record(profile, evidence)),

    answer: (word, outcome, day) =>
      next(
        record(
          profile,
          keysFor(direction, variety, canonical([word])).map((unit) => ({
            kind: 'retrieval',
            unit,
            outcome,
            day,
          })),
        ),
      ),

    claim: (words, day) =>
      next(record(profile, claimsFor(direction, variety, canonical(words), day))),

    read: (text, day) =>
      next(record(profile, exposuresFor(direction, variety, wordsIn(pack, text), day))),

    help: (word, day) =>
      next(
        record(
          profile,
          keysFor(direction, variety, canonical([word])).map((unit) => ({
            kind: 'help',
            unit,
            day,
          })),
        ),
      ),

    on: (day) => next(advanceTo(profile, day)),

    plan: (options) =>
      plan(profile, { ...options, priority: options.priority ?? defaultPriority() }),

    coverage: (text, options) =>
      coverage(profile, pack, { text, variety, direction, ...(options ?? {}) }),

    summary: (scope) =>
      summarize(profile, scope ?? { kind: 'skill', variety, modality: direction }),

    save: () => serialize(profile),
  };
}
