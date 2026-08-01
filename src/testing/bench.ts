import { vocabularyOf } from '../core/bulk.js';
import { checkPack } from '../core/checkPack.js';
import { coverage } from '../core/coverage.js';
import { createPack } from '../core/pack.js';
import { deserialize, serialize } from '../core/persist.js';
import { plan } from '../core/plan.js';
import { createProfile } from '../core/profile.js';
import { record } from '../core/record.js';
import { summarize } from '../core/summary.js';
import type { Evidence } from '../model/index.js';
import { day, unitKey, variety, type Day, type UnitKey, type Variety } from '../model/index.js';
import type { LanguagePack, Lemma, PackConfig, PackData } from '../model/index.js';
import type { Profile } from '../model/index.js';

import { fixtures, germanPack } from './packs.js';

/**
 * The benchmark workload — how fast the engine is, and where it stops coping.
 *
 * ⚠️ **A PURE PROGRAM, and that is the entire point.** It reads no clock, no filesystem and no
 * environment: the clock arrives as `env.now` and the pack data arrives as an argument. That is what
 * lets the SAME bytes run under Node and under Hermes, and it is why the determinism lint rule that
 * governs the rest of `src/` needed no exemption here. Time is data in the benchmark for the same
 * reason it is data in the engine.
 *
 * ⚠️ **NOT A TEST, and it must never join the gate.** A wall-clock assertion is flaky by
 * construction — it fails on a loaded laptop and passes on a quiet one, and a lane that cries wolf
 * gets `--skip`ped within a week. This produces NUMBERS; a human reads them against the budgets, and
 * `scripts/bench.mjs --compare` diffs two runs when a regression is the actual question.
 *
 * The measurement discipline is the ordinary one and is worth stating because getting it wrong is
 * how benchmarks come to measure the benchmark: every result is warmed up first, batched until a
 * batch is long enough to out-measure clock resolution (Hermes may only offer millisecond-grained
 * `Date.now()`), sampled several times, and reported as a MEDIAN — not a mean, which one GC pause
 * drags around. Every operation's result is fed to {@link consume} so nothing can be optimised away.
 *
 * @module
 */

// ── The sink ────────────────────────────────────────────────────────────────────────────────────

/**
 * Somewhere for a result to go, so the work cannot be eliminated.
 *
 * A benchmark whose result is discarded is a benchmark the bundler is free to delete, and the shape
 * of that failure is a number that looks impossibly good rather than an error. Every timed operation
 * returns a number derived from its real output and it lands here.
 *
 * `| 0` keeps it a small integer forever, so the accumulator itself never becomes the thing being
 * measured.
 */
let sink = 0;

export function consume(n: number): void {
  sink = (sink + n) | 0;
}

/** Read the sink, so a host can print it and prove to itself the work happened. */
export function sinkValue(): number {
  return sink;
}

// ── Environment ─────────────────────────────────────────────────────────────────────────────────

export type BenchEnv = {
  /**
   * Milliseconds, monotonic if the runtime has one.
   *
   * Injected rather than read, because this module lives under `src/` where reading a clock is a
   * lint error — and because the caller knows whether the runtime has `performance.now()`. On Hermes
   * it may well be `Date.now`, whose resolution is one millisecond; the batching below is sized to
   * survive that.
   */
  readonly now: () => number;
  /** Bytes of live heap, when the runtime can say. Node can; Hermes cannot. */
  readonly heapUsed?: (() => number) | undefined;
  /** Progress, for a human watching a long run. Never part of the result. */
  readonly onProgress?: ((message: string) => void) | undefined;
};

// ── Results ─────────────────────────────────────────────────────────────────────────────────────

/** Which interaction a scenario sits on. Decides which budget applies — see {@link BUDGET}. */
export type BenchGroup = 'launch' | 'session' | 'answer' | 'save' | 'read' | 'adversarial';

export type BenchResult = {
  readonly id: string;
  readonly group: BenchGroup;
  readonly label: string;
  /** The milliseconds this operation is allowed on the target device. See {@link BUDGET}. */
  readonly budgetMs: number;
  /** The scale axis for this scenario — units in the profile, or tokens in the text. */
  readonly size: number;
  readonly medianMs: number;
  readonly minMs: number;
  readonly maxMs: number;
  readonly samples: number;
  readonly iterations: number;
  /**
   * Bytes the operation's own output occupies, when that is a meaningful question.
   *
   * Only `serialize` fills this in, and it is the most load-bearing number in the report: it is what
   * a phone writes to storage on every save and reads back before the first frame at launch.
   */
  readonly outputBytes?: number | undefined;
  /** Heap growth across building this scenario's fixture, when the runtime can measure it. */
  readonly fixtureBytes?: number | undefined;
  /**
   * True when the scenario threw. **A BOOLEAN AND NOT JUST AN INFINITE TIME, AND THAT IS A BUG FIX.**
   *
   * `failed()` below reports `medianMs: Infinity`, which reads correctly in memory and does not
   * survive the trip through the report: `JSON.stringify(Infinity)` is `null`, `null * 8` is `0`,
   * and a driver comparing against a budget then sees a scenario that took no time at all and
   * prints it GREEN. Measured — six real Hermes failures at 250,000 units were reported as `ok`.
   *
   * The worst failure shape there is, in the tool built to find failures. A flag survives JSON.
   */
  readonly failed?: boolean | undefined;
  readonly note?: string | undefined;
};

export type BenchReport = {
  /** Milliseconds for the fixed kernel. THE yardstick — see {@link calibrate}. */
  readonly calibrationMs: number;
  readonly pack: {
    readonly id: string;
    /** Entries in the frequency list. */
    readonly lemmas: number;
    /** Rows in the lemma table. */
    readonly inflections: number;
    /** False when the small built-in fixture was used because no real pack was supplied. */
    readonly real: boolean;
  };
  readonly results: readonly BenchResult[];
};

// ── Budgets ─────────────────────────────────────────────────────────────────────────────────────

/**
 * What "fast enough" means, per interaction. Milliseconds, on the TARGET DEVICE — not on a laptop.
 *
 * Three numbers, and none of them is invented here:
 *
 * - **16 ms** is one frame at 60 Hz. Anything on the answer path runs while a finger is on the
 *   screen, so exceeding this is a visibly dropped frame rather than a slow function.
 * - **100 ms** is the limit for an action to feel like a direct consequence of the tap. Opening a
 *   session and saving after one sit under it.
 * - **1000 ms** is where attention leaves the task. Cold launch work — building a pack, reading the
 *   profile back off disk — gets this and no more, and it is a budget for the WHOLE launch, so a
 *   single item spending it all is already a failure.
 *
 * ⚠️ These are budgets for the phone, so they are compared against the projected device time, never
 * against the laptop time. A laptop number under 16 ms means nothing on its own.
 */
export const BUDGET: Readonly<Record<BenchGroup, number>> = {
  launch: 1000,
  session: 100,
  answer: 16,
  save: 100,
  read: 16,
  adversarial: 1000,
};

// ── Measurement ─────────────────────────────────────────────────────────────────────────────────

type MeasureOptions = {
  /** How long one batch must run before it out-measures the clock. */
  readonly minBatchMs: number;
  readonly samples: number;
  readonly maxIterations: number;
  /** Stop growing a batch past this, so one slow scenario cannot eat the run. */
  readonly maxTotalMs: number;
};

const DEFAULT_MEASURE: MeasureOptions = {
  // Forty times a millisecond-grained clock's resolution, so quantisation contributes under 3%.
  minBatchMs: 40,
  samples: 7,
  maxIterations: 1 << 20,
  maxTotalMs: 4000,
};

type Measured = {
  readonly medianMs: number;
  readonly minMs: number;
  readonly maxMs: number;
  readonly samples: number;
  readonly iterations: number;
};

/** Middle of a sorted list; the lower middle for an even count. Never a mean — see the module note. */
function median(sorted: readonly number[]): number {
  if (sorted.length === 0) return 0;
  return sorted[(sorted.length - 1) >> 1] ?? 0;
}

/**
 * Time one operation.
 *
 * `run` returns a number derived from its real output, which goes to {@link consume}. Returning
 * `void` would let a bundler prove the call has no effect and delete it.
 */
function measure(env: BenchEnv, run: () => number, options: MeasureOptions): Measured {
  // Warm up: the first calls pay for lazy compilation and a cold inline cache, and on Node they also
  // pay for the optimiser to notice the function at all. Measuring those measures the runtime's
  // startup, not the engine.
  consume(run());
  consume(run());

  let iterations = 1;
  let batchMs = 0;
  const growthDeadline = env.now() + options.maxTotalMs;

  for (;;) {
    const started = env.now();
    for (let i = 0; i < iterations; i++) consume(run());
    batchMs = env.now() - started;

    if (batchMs >= options.minBatchMs) break;
    if (iterations >= options.maxIterations) break;
    if (env.now() > growthDeadline) break;

    // A batch too fast to time at all reports 0, and dividing by it would be an infinite growth
    // factor — so an unmeasurable batch just octuples.
    const factor = batchMs > 0 ? Math.ceil(options.minBatchMs / batchMs) : 8;
    iterations = Math.min(options.maxIterations, iterations * Math.max(2, Math.min(8, factor)));
  }

  const perOperationMs = batchMs / Math.max(1, iterations);
  // An operation costing hundreds of milliseconds cannot be sampled seven times without the run
  // taking longer than anyone will wait for it. Fewer samples is a worse median; a benchmark nobody
  // runs is no median at all.
  let samples = options.samples;
  if (perOperationMs > 1000) samples = 2;
  else if (perOperationMs > 200) samples = 3;

  const observed: number[] = [];
  for (let s = 0; s < samples; s++) {
    const started = env.now();
    for (let i = 0; i < iterations; i++) consume(run());
    observed.push((env.now() - started) / iterations);
  }
  observed.sort((a, b) => a - b);

  return {
    medianMs: median(observed),
    minMs: observed[0] ?? 0,
    maxMs: observed[observed.length - 1] ?? 0,
    samples,
    iterations,
  };
}

// ── The calibration kernel ──────────────────────────────────────────────────────────────────────

/**
 * A fixed workload whose only job is to be the SAME workload everywhere.
 *
 * ⚠️ **THIS IS WHAT MAKES THE PHONE NUMBER HONEST.** Everything else in this file measures the
 * engine on whatever machine happens to be running it. A device multiplier picked from a spec sheet
 * is a guess, and a guess presented as a measurement is worse than no number — so instead: run this
 * bundle on the real phone, read its `calibrationMs`, and the ratio to the laptop's is the device's
 * actual slowdown, measured rather than assumed. `scripts/bench.mjs --baseline <ms>` takes that
 * number and reprojects every result through it.
 *
 * The mix is deliberate. Integer arithmetic alone flatters an interpreter; the engine's real hot
 * paths are string building, `Map` churn and object allocation, so all four are in here in roughly
 * the proportion `record` → `serialize` → `plan` exercises them. No `Math.random` (banned, and it
 * would make the kernel non-reproducible), no dates, no I/O.
 */
export function calibrate(env: BenchEnv): number {
  const run = (): number => {
    const table = new Map<string, number>();
    let hash = 0x9e3779b9;
    for (let i = 0; i < 20000; i++) {
      hash = (Math.imul(hash ^ i, 0x85ebca6b) ^ (hash >>> 13)) | 0;
      const word = `w${String(hash & 0xffff)}`;
      table.set(word, (table.get(word) ?? 0) + 1);
    }
    let total = 0;
    for (const [word, count] of table) total = (total + word.length + count) | 0;
    return total;
  };

  const measured = measure(env, run, { ...DEFAULT_MEASURE, samples: 5, maxTotalMs: 2000 });
  return measured.medianMs;
}

// ── Fixtures ────────────────────────────────────────────────────────────────────────────────────

/**
 * Build once, on first use.
 *
 * ⚠️ Not an optimisation — a correctness fix for the LISTING path. `benchScenarioIds` builds the
 * scenario table purely to read its ids off, and the adversarial fixtures include a megabyte of
 * generated text and a four-hundred-thousand-word JSON blob. Built eagerly, merely asking what the
 * scenarios are called spent tens of seconds and hundreds of megabytes — on a run that then
 * discards all of it.
 */
function lazy<T>(make: () => T): () => T {
  let value: T | undefined;
  return () => {
    value ??= make();
    return value;
  };
}

/** A tiny seeded PRNG (mulberry32). `Math.random` is banned, and a benchmark must be reproducible. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Total, so no `!` is needed for a number the caller computed. `day()` rejects zero and negatives. */
function asDay(n: number): Day {
  return day(Math.max(1, Math.trunc(n))) ?? day(1);
}

/**
 * Enough distinct lemmas to key `count` units.
 *
 * Real vocabulary first, because keying a real German word exercises the lemma table, the affix
 * strip and the compound splitter, and a synthetic `w12345` exercises none of them. Past the end of
 * the list it synthesises, which is honest for a scale test: the question there is what an object
 * with 250,000 keys costs, and the words are addresses rather than content.
 */
function lemmasFor(vocabulary: readonly Lemma[], count: number): readonly Lemma[] {
  const out: Lemma[] = [];
  for (let i = 0; i < count; i++) {
    const word = vocabulary[i];
    out.push(word ?? `synthetisch${String(i)}`);
  }
  return out;
}

/**
 * A profile of `units` units, shaped like a heavy learner rather than like a fixture.
 *
 * ⚠️ **THE MIX MATTERS FOR `plan`, not just for realism.** A profile whose every unit is known and
 * fresh has almost nothing due, so `plan` walks the whole pool and returns nothing — measuring the
 * scan and never the sort. A profile whose every unit is overdue measures a full-length sort every
 * time. Real proportions (roughly 60% maintained, 25% mid-acquisition, 15% claimed-but-unchecked)
 * and last-asked days spread over two months put both paths in the measurement, in the ratio a real
 * learner produces.
 *
 * Built through `record` and not by hand, so the fixture cannot drift from what the engine actually
 * produces — and so a change to the fold shows up here as a changed benchmark rather than as a
 * benchmark measuring a state the product can no longer reach.
 */
function profileOf(
  units: readonly Lemma[],
  language: string,
  v: Variety,
  today: Day,
  seed = 11,
): Profile {
  const next = rng(seed);
  const evidence: Evidence[] = [];

  for (const [index, lemma] of units.entries()) {
    // Both directions across the pool rather than both for every word: recognition outruns
    // production for this learner, which is the whole thesis, and it also means the pool is not two
    // identical halves.
    const direction = index % 4 === 3 ? 'produce' : 'recognise';
    const unit = unitKey(direction, v, lemma);
    const when = asDay(Math.max(1, today - 1 - Math.floor(next() * 60)));
    const roll = next();

    if (roll < 0.6) {
      evidence.push({ kind: 'retrieval', unit, outcome: 'known', day: when });
      evidence.push({ kind: 'retrieval', unit, outcome: 'known', day: when });
    } else if (roll < 0.85) {
      evidence.push({ kind: 'exposure', unit, day: when });
      evidence.push({ kind: 'retrieval', unit, outcome: 'unknown', day: when });
    } else {
      evidence.push({ kind: 'claim', unit, day: when });
    }
  }

  return record(createProfile(language, today), evidence);
}

/**
 * A passage of roughly `tokens` words, with a realistic share the learner will not know.
 *
 * Drawn from the pack's own frequency list so that `key()` does real work on every token. One word
 * in twelve is synthetic, which puts the text near the hard edge of the coverage band — the arm that
 * costs the most, since an unknown lemma is the one that misses the memo and reaches the profile.
 */
function passage(vocabulary: readonly Lemma[], tokens: number, seed = 5): string {
  const next = rng(seed);
  const words: string[] = [];
  for (let i = 0; i < tokens; i++) {
    if (next() < 1 / 12 || vocabulary.length === 0) {
      words.push(`Unbekanntwort${String(i)}`);
      continue;
    }
    words.push(vocabulary[Math.floor(next() * vocabulary.length)] ?? 'und');
  }
  return words.join(' ');
}

/**
 * Words built to be the compound splitter's worst case.
 *
 * `decompose` scans every cut point, tries every linker at each, and recurses up to four deep — so
 * its cost is superlinear in word length, and it is reached exactly when a word is NOT in the
 * lexicon and NOT strippable. That is a scanner artefact, an OCR error, or a name: rare per token,
 * and every one of them lands on the reading path while a learner waits. Forty characters is the
 * length cap the pack itself enforces, so these sit precisely on it.
 */
function pathologicalWords(count: number, seed = 3): readonly string[] {
  const next = rng(seed);
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    let word = '';
    for (let c = 0; c < 40; c++) {
      word += alphabet[Math.floor(next() * alphabet.length)] ?? 'x';
    }
    out.push(word);
  }
  return out;
}

// ── Scenarios ───────────────────────────────────────────────────────────────────────────────────

type Scenario = {
  readonly id: string;
  readonly group: BenchGroup;
  readonly label: string;
  readonly size: number;
  /** Everything expensive that is not the thing being timed. Runs once, outside the clock. */
  readonly setup?: (() => void) | undefined;
  readonly run: () => number;
  readonly outputBytes?: (() => number) | undefined;
  readonly note?: string | undefined;
};

export type BenchOptions = {
  /** A real pack's config and data. Omitted, the small built-in German fixture stands in. */
  readonly packConfig?: PackConfig | undefined;
  readonly packData?: PackData | undefined;
  /** Profile sizes for the scale sweep. */
  readonly sizes?: readonly number[] | undefined;
  /** The size the full scenario table runs at — the learner the report is about. */
  readonly headline?: number | undefined;
  /** Run only these scenario ids. Prefix match, so `record` selects `record.one` and `record.batch`. */
  readonly only?: readonly string[] | undefined;
  /** Add the adversarial scenarios — the ones asking what breaks rather than what is fast. */
  readonly adversarial?: boolean | undefined;
  readonly samples?: number | undefined;
};

/** A heavy learner: 20,000 units is a decade of daily study, or German plus a second track. */
const DEFAULT_HEADLINE = 20000;
const DEFAULT_SIZES: readonly number[] = [500, 4000, 20000, 60000];

/**
 * Build every scenario, given a pack.
 *
 * Fixtures are built lazily and memoised: the sweep asks for four profiles and the adversarial pass
 * for one very large one, and building all of them up front would spend minutes and gigabytes before
 * the first number appears.
 */
function scenarios(
  env: BenchEnv,
  pack: LanguagePack,
  frequency: string,
  packConfig: PackConfig,
  packData: PackData,
  options: BenchOptions,
): readonly Scenario[] {
  const v = variety('de');
  const language = 'de';
  const today = asDay(900);
  const vocabulary = vocabularyOf(pack, frequency);
  const headline = options.headline ?? DEFAULT_HEADLINE;
  const sizes = options.sizes ?? DEFAULT_SIZES;

  const profiles = new Map<number, Profile>();
  const profileFor = (size: number): Profile => {
    const existing = profiles.get(size);
    if (existing !== undefined) return existing;
    env.onProgress?.(`building a ${String(size)}-unit profile`);
    const built = profileOf(lemmasFor(vocabulary, size), language, v, today);
    profiles.set(size, built);
    return built;
  };

  const blobs = new Map<number, string>();
  const blobFor = (size: number): string => {
    const existing = blobs.get(size);
    if (existing !== undefined) return existing;
    const built = serialize(profileFor(size));
    blobs.set(size, built);
    return built;
  };

  const out: Scenario[] = [];

  // ── Launch ────────────────────────────────────────────────────────────────────────────────────
  out.push({
    id: 'pack.create',
    group: 'launch',
    label: 'createPack — build the language pack',
    size: vocabulary.length,
    run: () => {
      const built = createPack(packConfig, packData);
      return built.ok ? built.value.id.length : 0;
    },
    note: 'runs once at launch, before anything can be keyed',
  });

  out.push({
    id: 'pack.check',
    group: 'launch',
    label: 'checkPack — conformance against a sample',
    size: vocabulary.length,
    run: () => checkPack(pack, { text: passage(vocabulary, 60) }).length + 1,
  });

  // ── Session ───────────────────────────────────────────────────────────────────────────────────
  //
  // ⚠️ **A FUNCTION, NOT A LOOP BODY, AND THAT IS A HERMES BUG WORKAROUND — DO NOT INLINE IT.**
  //
  // Every scenario below closes over `size`. Hermes 0.13.0 does NOT give a `let`/`const` loop
  // variable a fresh binding per iteration, so closures built inside the loop body all see the
  // LAST value — the `var` semantics ES6 abolished. Node is correct, Hermes is not, and the same
  // bundle runs on both, so the failure appeared only on the phone runtime and appeared as
  // *plausible numbers*: every profile-size scenario silently measured one wrong-sized profile, and
  // the report claimed a 20,000-unit learner cost the same as a 4,000-unit one.
  //
  // A CALL FRAME is a fresh binding on every runtime. `.forEach`, `.map` and a factory like this
  // one are therefore all safe; a loop body is not. See `fingerprint.ts`, which now pins this so it
  // cannot silently return.
  const sizedScenarios = (size: number): readonly Scenario[] => [
    {
      id: `plan.${String(size)}`,
      group: 'session',
      label: `plan — choose 20 items`,
      size,
      setup: () => void profileFor(size),
      run: () => plan(profileFor(size), { day: today, maxItems: 20 }).items.length + 1,
    },
    {
      id: `record.one.${String(size)}`,
      group: 'answer',
      label: 'record — one answer',
      size,
      setup: () => void profileFor(size),
      run: () => {
        const profile = profileFor(size);
        const unit = unitKey('recognise', v, vocabulary[0] ?? 'und');
        const next = record(profile, [{ kind: 'retrieval', unit, outcome: 'known', day: today }]);
        return next.day;
      },
      note: 'copies the whole unit map — the cost is in the pool size, not the answer',
    },
    {
      id: `record.batch20.${String(size)}`,
      group: 'session',
      label: 'record — a whole 20-item session',
      size,
      setup: () => void profileFor(size),
      run: () => {
        const profile = profileFor(size);
        const evidence: Evidence[] = [];
        for (let i = 0; i < 20; i++) {
          const unit = unitKey('recognise', v, vocabulary[i] ?? `w${String(i)}`);
          evidence.push({ kind: 'retrieval', unit, outcome: 'known', day: today });
        }
        return record(profile, evidence).day;
      },
      note: 'one call for twenty answers — compare against 20x record.one',
    },
    {
      id: `serialize.${String(size)}`,
      group: 'save',
      label: 'serialize — write the profile',
      size,
      setup: () => void profileFor(size),
      run: () => serialize(profileFor(size)).length,
      outputBytes: () => blobFor(size).length,
    },
    {
      id: `deserialize.${String(size)}`,
      group: 'launch',
      label: 'deserialize — read the profile back',
      size,
      setup: () => void blobFor(size),
      run: () => {
        const decoded = deserialize(blobFor(size));
        return decoded.ok ? decoded.value.day : 0;
      },
      note: 'blocks the first frame at launch',
    },
    {
      id: `summarize.${String(size)}`,
      group: 'session',
      label: 'summarize — the progress snapshot',
      size,
      setup: () => void profileFor(size),
      run: () => summarize(profileFor(size), { kind: 'all' }).units + 1,
    },
  ];

  for (const size of sizes) out.push(...sizedScenarios(size));

  // ── Reading ───────────────────────────────────────────────────────────────────────────────────
  const thousandWords = lazy(() => passage(vocabulary, 1000));
  const tokens = lazy(() => pack.split(thousandWords()));

  out.push({
    id: 'pack.split.1k',
    group: 'read',
    label: 'split — tokenize a 1,000-word text',
    size: 1000,
    setup: () => void thousandWords(),
    run: () => pack.split(thousandWords()).length,
  });

  out.push({
    id: 'pack.key.1k',
    group: 'read',
    label: 'key — lemmatize 1,000 real tokens',
    size: 1000,
    setup: () => void tokens(),
    run: () => {
      let total = 0;
      for (const token of tokens()) total += pack.key(token).length;
      return total;
    },
    note: 'lemma table, then affix strip, then compound split',
  });

  out.push({
    id: 'pack.compare.100',
    group: 'answer',
    label: 'compare — grade 100 answers',
    size: 100,
    run: () => {
      let total = 0;
      for (let i = 0; i < 100; i++) {
        const word = vocabulary[i] ?? 'und';
        total += pack.compare(word, word);
      }
      return total;
    },
  });

  // A factory again, for the reason spelled out above `sizedScenarios`. Do not inline it.
  const coverageScenario = (tokenCount: number): Scenario => {
    const text = lazy(() => passage(vocabulary, tokenCount));
    return {
      id: `coverage.${String(tokenCount)}`,
      group: tokenCount <= 200 ? 'read' : 'session',
      label: `coverage — measure a ${String(tokenCount)}-token passage`,
      size: tokenCount,
      setup: () => {
        profileFor(headline);
        text();
      },
      run: () => {
        const result = coverage(profileFor(headline), pack, {
          text: text(),
          variety: v,
          direction: 'recognise',
        });
        return result.kind.length;
      },
    };
  };

  for (const tokenCount of [200, 2000]) out.push(coverageScenario(tokenCount));

  // ── Adversarial ───────────────────────────────────────────────────────────────────────────────
  if (options.adversarial === true) {
    const nonsense = lazy(() => pathologicalWords(200));
    out.push({
      id: 'adv.key.compounds',
      group: 'adversarial',
      label: 'key — 200 unlexicalised 40-char words (compound splitter worst case)',
      size: 200,
      setup: () => void nonsense(),
      run: () => {
        let total = 0;
        for (const word of nonsense()) total += pack.key(word).length;
        return total;
      },
      note: 'decompose scans every cut point, every linker, four deep',
    });

    const megabyte = lazy(() => passage(vocabulary, 150000));
    out.push({
      id: 'adv.split.1mb',
      group: 'adversarial',
      label: 'split — a ~1 MB text',
      size: 1000000,
      setup: () => void megabyte(),
      run: () => pack.split(megabyte()).length,
    });

    const book = lazy(() => passage(vocabulary, 50000, 9));
    out.push({
      id: 'adv.coverage.50k',
      group: 'adversarial',
      label: 'coverage — a 50,000-token text (a short book)',
      size: 50000,
      setup: () => {
        profileFor(headline);
        book();
      },
      run: () => {
        const result = coverage(profileFor(headline), pack, {
          text: book(),
          variety: v,
          direction: 'recognise',
        });
        return result.kind.length;
      },
    });

    out.push({
      id: 'adv.record.batch10k',
      group: 'adversarial',
      label: 'record — a 10,000-item offline sync queue',
      size: 10000,
      setup: () => void profileFor(headline),
      run: () => {
        const profile = profileFor(headline);
        const evidence: Evidence[] = [];
        for (let i = 0; i < 10000; i++) {
          const unit = unitKey('recognise', v, vocabulary[i % 500] ?? 'und');
          evidence.push({ kind: 'retrieval', unit, outcome: 'known', day: today });
        }
        return record(profile, evidence).day;
      },
    });

    out.push({
      id: 'adv.plan.priority',
      group: 'adversarial',
      label: 'plan — with a priority list as long as the pool',
      size: headline,
      setup: () => void profileFor(headline),
      run: () => {
        const profile = profileFor(headline);
        const priority = Object.keys(profile.units) as UnitKey[];
        return plan(profile, { day: today, maxItems: 20, priority }).items.length + 1;
      },
    });

    const garbage = lazy(() =>
      JSON.stringify({ v: 3, language: 'de', units: passage(vocabulary, 400000) }),
    );
    out.push({
      id: 'adv.deserialize.garbage',
      group: 'adversarial',
      label: 'deserialize — reject a multi-megabyte non-profile',
      size: 400000,
      setup: () => void garbage(),
      run: () => {
        const decoded = deserialize(garbage());
        return decoded.ok ? 1 : decoded.error.kind.length;
      },
      note: 'rejection must not be slower than acceptance',
    });
  }

  const only = options.only;
  if (only === undefined || only.length === 0) return out;
  return out.filter((scenario) => only.some((prefix) => scenario.id.startsWith(prefix)));
}

// ── The run ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Run the benchmark and return the numbers. Prints nothing — the caller owns the output.
 *
 * A scenario that throws is reported rather than fatal: the adversarial pass exists precisely to
 * find inputs the engine cannot take, and a run that dies on the first of them has answered the
 * question for exactly one scenario and hidden the rest.
 */
export function runBench(env: BenchEnv, options: BenchOptions = {}): BenchReport {
  const packConfig = options.packConfig ?? fixtures.germanConfig;
  const packData = options.packData ?? fixtures.germanData;
  const real = options.packConfig !== undefined && options.packData !== undefined;

  const built = createPack(packConfig, packData);
  const pack = built.ok ? built.value : germanPack;
  const frequency = packData.frequency;

  env.onProgress?.('calibrating');
  const calibrationMs = calibrate(env);

  const measureOptions: MeasureOptions = {
    ...DEFAULT_MEASURE,
    samples: options.samples ?? DEFAULT_MEASURE.samples,
  };

  const results: BenchResult[] = [];
  for (const scenario of scenarios(env, pack, frequency, packConfig, packData, options)) {
    env.onProgress?.(scenario.id);

    const heapBefore = env.heapUsed?.();
    try {
      scenario.setup?.();
    } catch (error) {
      results.push(failedResult(scenario, error));
      continue;
    }
    const heapAfter = env.heapUsed?.();

    try {
      const measured = measure(env, scenario.run, measureOptions);
      results.push({
        id: scenario.id,
        group: scenario.group,
        label: scenario.label,
        budgetMs: BUDGET[scenario.group],
        size: scenario.size,
        medianMs: measured.medianMs,
        minMs: measured.minMs,
        maxMs: measured.maxMs,
        samples: measured.samples,
        iterations: measured.iterations,
        outputBytes: scenario.outputBytes?.(),
        fixtureBytes:
          heapBefore !== undefined && heapAfter !== undefined
            ? Math.max(0, heapAfter - heapBefore)
            : undefined,
        note: scenario.note,
      });
    } catch (error) {
      results.push(failedResult(scenario, error));
    }
  }

  return {
    calibrationMs,
    pack: {
      id: pack.id,
      lemmas: frequency.split(/\s+/).filter((w) => w.length > 0).length,
      inflections: Object.keys(packData.lemmas ?? {}).length,
      real,
    },
    results,
  };
}

/**
 * The ids `runBench` would run, without running any of them.
 *
 * ⚠️ **THIS IS WHAT MAKES "what it CANNOT handle" ANSWERABLE.** An adversarial scenario that runs
 * the machine out of memory does not return a slow number — it kills the process, and every
 * scenario queued behind it dies unmeasured with it. So the driver asks for the list first and
 * spawns each id in its own process: a crash then names one limit and the run continues.
 *
 * Building the pack to enumerate is deliberate. The scenario list depends on the pack (the sweep is
 * keyed off real vocabulary), and a list derived some other way would be a second definition of
 * what this file runs.
 */
export function benchScenarioIds(env: BenchEnv, options: BenchOptions = {}): readonly string[] {
  const packConfig = options.packConfig ?? fixtures.germanConfig;
  const packData = options.packData ?? fixtures.germanData;
  const built = createPack(packConfig, packData);
  const pack = built.ok ? built.value : germanPack;
  return scenarios(env, pack, packData.frequency, packConfig, packData, options).map((s) => s.id);
}

/**
 * A scenario that threw, reported as a limit rather than as a missing row.
 *
 * `Infinity` for the times, because every consumer already compares against a budget and a limit
 * that sorts to the top of "slowest" is a limit somebody reads. **And `failed: true` alongside it,
 * because `Infinity` does not survive `JSON.stringify` — see {@link BenchResult.failed}.**
 *
 * Exported for its test. It is not part of any public contract: nothing in `src/testing` is.
 */
export function failedResult(
  scenario: Pick<Scenario, 'id' | 'group' | 'label' | 'size'>,
  error: unknown,
): BenchResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    id: scenario.id,
    group: scenario.group,
    label: scenario.label,
    budgetMs: BUDGET[scenario.group],
    size: scenario.size,
    medianMs: Infinity,
    minMs: Infinity,
    maxMs: Infinity,
    samples: 0,
    iterations: 0,
    failed: true,
    note: `FAILED: ${message}`,
  };
}
