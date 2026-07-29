import type { Coverage, CoverageQuery } from '../model/coverage.js';
import type { Evidence, Outcome } from '../model/evidence.js';
import { unitKey, type Day, type Direction, type UnitKey, type Variety } from '../model/ids.js';
import type { LanguagePack } from '../model/pack.js';
import type { Profile } from '../model/profile.js';
import type { PlanOptions, Session } from '../model/session.js';
import type { Summary, SummaryScope } from '../model/summary.js';

import { claimsFor, exposuresFor, keysFor, wordsIn } from './bulk.js';
import { coverage } from './coverage.js';
import { serialize } from './persist.js';
import { plan } from './plan.js';
import { advanceTo } from './profile.js';
import { record } from './record.js';
import { summarize } from './summary.js';

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
  /** Which variety these operations address. */
  readonly variety: Variety;
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
  const { pack, variety } = context;
  const direction = context.direction ?? 'recognise';
  const next = (p: Profile): Learner => learner(p, context);

  // Built at most once per handle, and only if a `plan()` call actually needs it. Keying 10,000
  // words is not free, and a host that always passes its own `priority` should never pay for it.
  let priorityCache: readonly UnitKey[] | undefined;
  const defaultPriority = (): readonly UnitKey[] => {
    priorityCache ??= keysFor(direction, variety, context.vocabulary ?? []);
    return priorityCache;
  };

  return {
    profile,
    pack,
    variety,
    direction,

    record: (evidence) => next(record(profile, evidence)),

    answer: (word, outcome, day) =>
      next(
        record(profile, [
          { kind: 'retrieval', unit: unitKey(direction, variety, word), outcome, day },
        ]),
      ),

    claim: (words, day) => next(record(profile, claimsFor(direction, variety, words, day))),

    read: (text, day) =>
      next(record(profile, exposuresFor(direction, variety, wordsIn(pack, text), day))),

    help: (word, day) =>
      next(record(profile, [{ kind: 'help', unit: unitKey(direction, variety, word), day }])),

    on: (day) => next(advanceTo(profile, day)),

    plan: (options) =>
      plan(profile, { ...options, priority: options.priority ?? defaultPriority() }),

    coverage: (text, options) =>
      coverage(profile, pack, { text, variety, direction, ...(options ?? {}) }),

    summary: (scope) => summarize(profile, scope ?? { kind: 'skill', variety, direction }),

    save: () => serialize(profile),
  };
}
