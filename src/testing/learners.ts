import { record } from '../core/record.js';
import { createProfile } from '../core/profile.js';
import type { Evidence } from '../model/evidence.js';
import { unitKey, type Day, type Variety } from '../model/ids.js';
import type { LanguagePack, Lemma } from '../model/pack.js';
import type { Profile } from '../model/profile.js';
import { PROMOTE_AFTER_SUCCESSES } from '../core/record.js';

/**
 * Building learners to simulate against.
 *
 * ⚠️ A TESTING UTILITY, not part of the public API, and the distinction is load-bearing. These
 * functions FABRICATE a history — they invent evidence that never happened so that a profile comes
 * out the far end looking like a particular person. That is exactly right for a simulation and
 * exactly wrong for a product: a real learner's profile is a fold over evidence they actually
 * generated, and anything that seeds knowledge without evidence is the engine lying to itself.
 *
 * The real version of this is PLACEMENT — asking a learner enough questions to earn a prior — and
 * it is not built. This file is what makes its absence measurable in the meantime.
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
  /** Lemmas met but never proven — the learning frontier, `learning` with a real `seen` count. */
  readonly met?: readonly Lemma[];
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
    for (let i = 0; i < PROMOTE_AFTER_SUCCESSES; i++) {
      evidence.push({ unit, outcome: 'known', tested: true, day });
    }
  }

  for (const lemma of spec.produces ?? []) {
    const unit = unitKey('produce', spec.variety, lemma);
    const day = backdate();
    for (let i = 0; i < PROMOTE_AFTER_SUCCESSES; i++) {
      evidence.push({ unit, outcome: 'known', tested: true, day });
    }
  }

  for (const lemma of spec.met ?? []) {
    // Met while reading and never retrieved: `seen` climbs, nothing is proven. This is the state
    // the engine's `tested` flag exists to keep distinct, so a simulated learner must be able to
    // be in it.
    const unit = unitKey('recognise', spec.variety, lemma);
    evidence.push({ unit, outcome: 'known', tested: false, day: backdate() });
  }

  return record(createProfile(spec.language, spec.day), evidence);
}

// ── Archetypes ──────────────────────────────────────────────────────────────────────────────────

/** Every lemma the pack's frequency list knows, in rank order. */
export function vocabularyOf(pack: LanguagePack, frequency: string): readonly Lemma[] {
  const out: Lemma[] = [];
  const seen = new Set<Lemma>();
  for (const word of frequency.split(/\s+/)) {
    if (word.length === 0) continue;
    const lemma = pack.key(word);
    if (lemma.length === 0 || seen.has(lemma)) continue;
    seen.add(lemma);
    out.push(lemma);
  }
  return out;
}

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

/** Nothing at all. The honest starting point, and what every learner is today without placement. */
export function beginner(pack: LanguagePack, options: ArchetypeOptions): Profile {
  return learner({ language: pack.id, variety: options.variety, day: options.day });
}
