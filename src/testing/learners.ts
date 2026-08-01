import { record } from '../core/record.js';
import { createProfile } from '../core/profile.js';
import type { Evidence } from '../model/index.js';
import { unitKey, type Day, type Variety } from '../model/index.js';
import type { LanguagePack, Lemma } from '../model/index.js';
import type { Profile } from '../model/index.js';
import { KNOWN_AT_STRENGTH } from '../model/index.js';
import { vocabularyOf } from '../core/bulk.js';

/**
 * Building learners to simulate against.
 *
 * ⚠️ A TESTING UTILITY, not part of the public API, and the distinction is load-bearing. The
 * `recognises` / `produces` / `met` fields FABRICATE a history — they invent retrievals that never
 * happened so a profile comes out the far end looking like a particular person. That is exactly
 * right for a simulation and exactly wrong for a product.
 *
 * ⚠️ **`claims` is the exception, and it is no longer a fabrication.** A `{kind: 'claim'}` is the
 * real shape of the fact a placement hands over, so a profile built from claims alone is one a
 * product can honestly produce. Until v3 there was no such path — the only way prior knowledge could
 * enter was by inventing retrievals, and this module's docstring said so and called the gap
 * measurable. It is now closed, and the two kinds of seeding sit side by side here precisely so the
 * difference stays visible: `recognises` says "pretend she proved this", `claims` says "she says she
 * knows this and nobody has checked".
 *
 * Everything here is deterministic: same spec, same profile, every time. A simulation you cannot
 * reproduce is an anecdote.
 *
 * @module
 */

/** A tiny seeded PRNG (mulberry32), so a learner is reproducible from a number. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type LearnerSpec = {
  readonly language: string;
  readonly variety: Variety;
  /** The day the profile is "as of". Proven words are back-dated relative to this. */
  readonly day: Day;
  /** Lemmas the learner can recognise — proven, in the `understood` box. */
  readonly recognises?: readonly Lemma[];
  /** Lemmas the learner can also produce. Normally a subset of `recognises`, never enforced. */
  readonly produces?: readonly Lemma[];
  /** Lemmas met but never proven — the learning frontier, with a real `seen` count and rung 0. */
  readonly met?: readonly Lemma[];
  /**
   * Lemmas the host CLAIMS she knows, with nobody having checked — the output of a placement.
   *
   * Unlike the fields above this fabricates nothing: it records exactly the evidence a real
   * placement produces. A claimed unit is not known, is worth `'verify'` rather than `'new'` in a
   * session, and turns `coverage()` on a text full of them into `'unverified'`.
   */
  readonly claims?: readonly Lemma[];
  /**
   * Spread the last-proven days over this many days back, so the profile is not uniformly fresh.
   *
   * A learner whose every word was proven on the same day is not a learner, it is a fixture — and
   * a scheduler tested against one has never had to choose between two units.
   */
  readonly spreadOverDays?: number;
  readonly seed?: number;
};

/**
 * Build a profile from a declarative description of what a learner knows.
 *
 * The evidence is synthesised, not real. See the module note.
 */
export function learner(spec: LearnerSpec): Profile {
  const next = rng(spec.seed ?? 1);
  const spread = Math.max(1, spec.spreadOverDays ?? 30);
  const evidence: Evidence[] = [];

  /** A day in the past, far enough back that the unit is due but not uniformly so. */
  const backdate = (): Day => Math.max(0, spec.day - 1 - Math.floor(next() * spread)) as Day;

  for (const lemma of spec.recognises ?? []) {
    const unit = unitKey('recognise', spec.variety, lemma);
    const day = backdate();
    // Exactly enough proofs to reach the known rung, and no more. Driving these to the ceiling would
    // manufacture a robustness no real learner has earned and would make every simulation of
    // forgetting start from the wrong place.
    for (let i = 0; i < KNOWN_AT_STRENGTH; i++) {
      evidence.push({ kind: 'retrieval', unit, outcome: 'known', day });
    }
  }

  for (const lemma of spec.produces ?? []) {
    const unit = unitKey('produce', spec.variety, lemma);
    const day = backdate();
    for (let i = 0; i < KNOWN_AT_STRENGTH; i++) {
      evidence.push({ kind: 'retrieval', unit, outcome: 'known', day });
    }
  }

  for (const lemma of spec.met ?? []) {
    // Met while reading and never retrieved: `seen` climbs, nothing is proven. This is the state the
    // `exposure` variant exists to keep distinct, so a simulated learner must be able to be in it.
    const unit = unitKey('recognise', spec.variety, lemma);
    evidence.push({ kind: 'exposure', unit, day: backdate() });
  }

  for (const lemma of spec.claims ?? []) {
    // The one seeding path here that is not a fabrication — this is what a placement emits.
    const unit = unitKey('recognise', spec.variety, lemma);
    evidence.push({ kind: 'claim', unit, day: backdate() });
  }

  return record(createProfile(spec.language, spec.day), evidence);
}

// ── Archetypes ──────────────────────────────────────────────────────────────────────────────────

/**
 * Every lemma the pack's frequency list knows, in rank order.
 *
 * ⚠️ Re-exported from `core/bulk.ts`, where it is now PUBLIC. It lived here and only here for
 * months, so the identical loop was hand-written again in `demo.ts`, twice in the learner CLI, and
 * in two pack build scripts. A helper written five times and published zero times is the API
 * missing it.
 */
export { vocabularyOf };

/**
 * Suffixes that mark a German word as formal, abstract or Latinate.
 *
 * ⚠️ A crude proxy for REGISTER, and the reason it exists is the whole heritage thesis. ADR-0002
 * says this learner's gaps are "domain-shaped" — they know the language of the kitchen, the family
 * and the street, and not the language of the form, the contract and the news. Modelling their
 * holes as *random* would produce a learner who is merely worse, not one who is DIFFERENT, and
 * every simulation built on that measures the wrong person.
 *
 * These endings — `-ung`, `-heit`, `-keit`, `-tion`, `-ismus`, `-ität` — are where German keeps its
 * abstractions. It is a proxy, not a classifier: `Wohnung` (flat) is domestic and ends in `-ung`.
 * A real register tag would come from the content pipeline. This is honest enough to make the two
 * archetypes genuinely different and is labelled as approximate.
 */
const FORMAL_SUFFIXES = [
  'ung',
  'heit',
  'keit',
  'tion',
  'sion',
  'ismus',
  'itaet',
  'schaft',
  'nis',
  'tum',
  'ent',
  'anz',
  'enz',
];

function looksFormal(lemma: string): boolean {
  return FORMAL_SUFFIXES.some((suffix) => lemma.endsWith(suffix)) || lemma.length >= 13;
}

export type ArchetypeOptions = {
  readonly variety: Variety;
  readonly day: Day;
  readonly seed?: number;
  /** The pack's own frequency string, in rank order. */
  readonly frequency: string;
};

/**
 * **The learner this engine exists for.** Knowledge is DORMANT, LUMPY and RECEPTIVE.
 *
 * Three properties, each straight out of ADR-0002, and each one a thing a frequency-prefix learner
 * does not have:
 *
 * 1. **Broad but holey recognition.** They recognise a lot — far past where a classroom learner of
 *    the same "level" would be — but with holes scattered through it, because vocabulary was
 *    acquired at home rather than in order. The holes get denser as words get rarer and more
 *    formal, which is the register gap.
 * 2. **A large recognition–production gap.** They understand far more than they can say. This is
 *    the single defining feature, and it is why `Direction` is in the unit key.
 * 3. **A frontier of met-but-unproven words**, because they read and listen without being tested.
 *
 * ⚠️ What this CANNOT model: the aural/written split. ADR-0002 says this learner does better on
 * *listening* than *reading* — the opposite of a classroom learner — and `Direction` is only
 * `recognise | produce`. There is nowhere to put it. That is a real engine gap, and it is visible
 * here rather than hidden.
 */
export function heritageSpeaker(pack: LanguagePack, options: ArchetypeOptions): Profile {
  const vocab = vocabularyOf(pack, options.frequency);
  const next = rng(options.seed ?? 7);

  const recognises: Lemma[] = [];
  const produces: Lemma[] = [];
  const met: Lemma[] = [];

  vocab.forEach((lemma, i) => {
    const depth = i / Math.max(vocab.length - 1, 1); // 0 = commonest, 1 = rarest

    // Recognition is broad and thins with rarity, but never becomes a clean cut-off — and it takes
    // a large extra penalty on FORMAL vocabulary. That penalty is the register gap: it is what
    // makes this learner different from a classroom one rather than merely better or worse.
    const formalPenalty = looksFormal(lemma) ? 0.45 : 0;
    const knows = next() < 0.95 - 0.7 * depth - formalPenalty;

    // Production lags badly and the gap WIDENS with rarity. That is the shape of the problem.
    const says = knows && next() < 0.55 - 0.45 * depth;

    if (knows) recognises.push(lemma);
    // Met-but-unproven only near the FRONTIER of what they know. A learner has not "met" every
    // rare word in the language, and minting thousands of never-proven units at once produces a
    // drill queue where everything ties on days-waiting and the tiebreak sorts it alphabetically.
    else if (i < vocab.length * 0.35 && next() < 0.3) met.push(lemma);
    if (says) produces.push(lemma);
  });

  return learner({
    language: pack.id,
    variety: options.variety,
    day: options.day,
    recognises,
    produces,
    met,
    seed: options.seed ?? 7,
  });
}

/**
 * Someone who was fluent and has not used the language in years.
 *
 * The distinguishing shape is not a smaller vocabulary — it is knowledge that was PROVEN LONG AGO.
 * Every unit is due, all at once, and the scheduler has to choose. This is the archetype that
 * stresses selection rather than measurement.
 */
export function rustySpeaker(
  pack: LanguagePack,
  options: ArchetypeOptions & { readonly yearsAway: number },
): Profile {
  const vocab = vocabularyOf(pack, options.frequency);
  const next = rng(options.seed ?? 13);
  const recognises = vocab.filter((_, i) => next() < 0.9 - 0.6 * (i / vocab.length));
  const produces = recognises.filter(() => next() < 0.6);

  return learner({
    language: pack.id,
    variety: options.variety,
    day: options.day,
    recognises,
    produces,
    // Everything was proven before the gap, so everything is equally overdue today.
    spreadOverDays: Math.max(1, Math.round(options.yearsAway * 365)),
    seed: options.seed ?? 13,
  });
}

/**
 * The extreme of the recognition–production gap: reads comfortably, freezes when speaking.
 *
 * Common among heritage speakers who kept reading and stopped talking, and the case where
 * measuring one direction and reporting it as "level" is most obviously wrong.
 */
export function silentReader(pack: LanguagePack, options: ArchetypeOptions): Profile {
  const vocab = vocabularyOf(pack, options.frequency);
  const next = rng(options.seed ?? 17);
  const recognises = vocab.filter((_, i) => next() < 0.97 - 0.4 * (i / vocab.length));
  const produces = recognises.filter(() => next() < 0.12);

  return learner({
    language: pack.id,
    variety: options.variety,
    day: options.day,
    recognises,
    produces,
    seed: options.seed ?? 17,
  });
}

/**
 * The contrast case: someone who learned this language in a classroom, from a book, in order.
 *
 * A clean prefix of the frequency list, and a much smaller recognition–production gap. Not the
 * target user — it exists so that "the heritage profile is different" is a claim a simulation can
 * actually check, rather than a sentence in an ADR.
 */
export function classroomLearner(
  pack: LanguagePack,
  options: ArchetypeOptions & { readonly words: number },
): Profile {
  const vocab = vocabularyOf(pack, options.frequency).slice(0, options.words);
  const next = rng(options.seed ?? 11);
  const produces = vocab.filter(() => next() < 0.75);

  return learner({
    language: pack.id,
    variety: options.variety,
    day: options.day,
    recognises: vocab,
    produces,
    // The next slice of the list is what they are currently working through.
    met: vocabularyOf(pack, options.frequency).slice(options.words, options.words + 40),
    seed: options.seed ?? 11,
  });
}

/** Nothing at all. The honest starting point for someone who really is starting from zero. */
export function beginner(pack: LanguagePack, options: ArchetypeOptions): Profile {
  return learner({ language: pack.id, variety: options.variety, day: options.day });
}

/**
 * **Day one, after a placement.** The archetype v3 exists for.
 *
 * A heritage speaker who has just told the app what she recognises, and about whom NOTHING has been
 * verified. Every unit is a standing claim: rung 0, never asked, `prior.kind === 'claimed'`.
 *
 * This is the state that used to be inexpressible. Before v3 the only way to get prior knowledge in
 * was to fabricate retrievals, so a placed learner was indistinguishable from one who had genuinely
 * drilled 4,000 words — and refusing to fabricate meant an empty profile, an empty session, and a
 * coverage number of 0% on every text for months. Both were wrong, in opposite directions.
 *
 * Simulate against this one to check the things that only go wrong here: that day one is not empty,
 * that the session is full of `'verify'` rather than `'new'`, that a text she can read comes back
 * `'unverified'` rather than `'too-hard'`, and that the new-material cap does not throttle the
 * checking of words she already claimed.
 *
 * The claim rate thins with rarity, like `heritageSpeaker`'s recognition and for the same reason —
 * a placement samples what she says she knows, so it inherits the shape of what she knows.
 */
export function placedSpeaker(pack: LanguagePack, options: ArchetypeOptions): Profile {
  const vocab = vocabularyOf(pack, options.frequency);
  const next = rng(options.seed ?? 23);
  const claims = vocab.filter((lemma, i) => {
    const depth = i / Math.max(vocab.length - 1, 1);
    const formalPenalty = looksFormal(lemma) ? 0.45 : 0;
    return next() < 0.95 - 0.7 * depth - formalPenalty;
  });

  return learner({
    language: pack.id,
    variety: options.variety,
    day: options.day,
    claims,
    // A placement happens on ONE day, so every claim carries the same anchor. That is realistic and
    // it is also the hardest case for the tiebreak: several thousand units with identical waits.
    spreadOverDays: 1,
    seed: options.seed ?? 23,
  });
}
