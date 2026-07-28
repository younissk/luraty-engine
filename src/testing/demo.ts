import { coverage } from '../core/coverage.js';
import { plan } from '../core/plan.js';
import { advanceTo, createProfile } from '../core/profile.js';
import { record } from '../core/record.js';
import type { Evidence } from '../model/evidence.js';
import { unitKey, variety, type Day, type UnitKey } from '../model/ids.js';
import type { LanguagePack, Lemma } from '../model/pack.js';
import type { Profile } from '../model/profile.js';

import {
  beginner,
  classroomLearner,
  heritageSpeaker,
  rustySpeaker,
  silentReader,
} from './learners.js';
import { arabicPack, germanPack } from './packs.js';

/**
 * A learner, thirty days, printed.
 *
 * ⚠️ NOT A TEST, and not exported from the barrel. This exists so a human can WATCH the engine make
 * decisions — the tests prove it is correct, and this shows what correct looks like. A green suite
 * tells you nothing about whether the thing is any good.
 *
 * Everything here uses only the public functions, in the order a real host would call them:
 * `plan` → show content → `record` what happened → `coverage` to size the next passage.
 *
 * The passage is REAL TEXT rather than a word list with weights, because the token distribution
 * then comes from the language instead of from a guess — and because someone who speaks the
 * language can read the output and tell you whether it is nonsense.
 *
 * @module
 */

const D = (n: number): Day => n as Day;

type Course = {
  readonly pack: LanguagePack;
  readonly variety: string;
  /** Real text the learner reads every day. */
  readonly passage: string;
  /** Words a heritage speaker grew up hearing — knowledge is lumpy, not a frequency prefix. */
  readonly familiar: readonly string[];
};

const COURSES: Readonly<Record<string, Course>> = {
  de: {
    pack: germanPack,
    variety: 'de',
    passage:
      'Der Mann geht am Morgen aus dem Haus. Er kauft Brot und Wasser auf dem Markt in der ' +
      'Stadt. Die Straße ist heute sehr voll, denn viele Menschen kommen und gehen. Ein Kind ' +
      'liest eine Zeitung vor dem Fenster. Die Frau sagt, dass die Schule schon offen ist. Der ' +
      'Arzt wohnt in dem großen Haus mit dem grünen Garten. Wir trinken Wasser und essen Brot, ' +
      'und dann sprechen wir über die Zeit und über das Jahr. Am Abend fährt der Zug zum ' +
      'Bahnhof, und die Sonne geht langsam unter. Das Kind findet das schön und will morgen ' +
      'wieder kommen.',
    familiar: ['haus', 'wasser', 'brot', 'kind', 'mann', 'frau', 'gehen', 'essen', 'trinken'],
  },
  ar: {
    pack: arabicPack,
    variety: 'ar-msa',
    passage:
      'في المدينة سوق كبير. كل يوم يذهب الرجل من البيت إلى السوق. هو يشتري خبز وماء. ' +
      'المدرسة بعد الشارع، والمطار حول المدينة. الطبيب في البيت الكبير. القطار يذهب إلى ' +
      'المطار كل وقت. الولد يقرأ الجريدة عند البيت. هذا هو السوق التي كان بين الشارع ' +
      'والمدرسة. مع الوقت كل شيء بعد ذلك.',
    familiar: ['بيت', 'ماء', 'خبز', 'سوق'],
  },
};

/** A seeded PRNG. No `Math.random`: the whole point is that this run is reproducible. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Greedy word wrap. No `Intl.Segmenter`: it is banned here, and spaces are enough for this. */
function wrap(text: string, width: number): readonly string[] {
  const lines: string[] = [];
  let line = '';
  for (const w of text.split(' ')) {
    if (line.length + w.length + 1 > width) {
      lines.push(line);
      line = w;
    } else {
      line = line.length === 0 ? w : `${line} ${w}`;
    }
  }
  if (line.length > 0) lines.push(line);
  return lines;
}

function bar(value: number, total: number, width = 24): string {
  const filled = total === 0 ? 0 : Math.round((value / total) * width);
  return '█'.repeat(filled) + '·'.repeat(Math.max(0, width - filled));
}

function word(unit: UnitKey): string {
  return unit.split(':').slice(2).join(':');
}

function say(line: string): void {
  // Hermes has `print`, Node has `console.log`. Neither is assumed.
  const g = globalThis as { print?: (s: string) => void; console?: { log: (s: string) => void } };
  if (typeof g.print === 'function') g.print(line);
  else g.console?.log(line);
}

/**
 * A pack loaded from disk by a host, replacing the built-in fixture.
 *
 * The engine cannot read files, so a real pack can only ever arrive this way — which is the point.
 * `scripts/demo.mjs --pack ../packs/de` is the smallest host that does it.
 */
export type PackOverride = {
  readonly pack: LanguagePack;
  readonly passage?: string;
  /** The pack's own frequency list, needed to build a learner who already knows some of it. */
  readonly frequency?: string;
};

/**
 * Who is sitting down to use this.
 *
 * `beginner` is not just one option among three — it is the ONLY state a real learner can be in
 * today, because placement is not built. The other two are fabricated histories, which is fine for
 * a simulation and would be a lie in the product.
 */
export type Who = 'beginner' | 'heritage' | 'classroom';

export function runDemo(
  days = 30,
  language = 'de',
  override?: PackOverride,
  who: Who = 'beginner',
): void {
  const base = COURSES[language] ?? COURSES.de;
  if (base === undefined) return;
  const course: Course =
    override === undefined
      ? base
      : { ...base, pack: override.pack, passage: override.passage ?? base.passage };
  const v = variety(course.variety);
  if (v === undefined) return;

  const pack = course.pack;
  const next = rng(42);

  // Day 0 for a beginner; a back-dated history for anyone else, so their words are already due.
  const startDay = who === 'beginner' ? D(0) : D(200);
  const frequency = override?.frequency;
  const archetypeOpts = { variety: v, day: startDay, seed: 42, frequency: frequency ?? '' };
  let profile: Profile =
    who === 'beginner' || frequency === undefined
      ? createProfile(language, startDay)
      : who === 'heritage'
        ? heritageSpeaker(course.pack, archetypeOpts)
        : classroomLearner(course.pack, { ...archetypeOpts, words: 120 });
  if (who !== 'beginner' && frequency === undefined) {
    profile = beginner(course.pack, archetypeOpts);
  }

  // The vocabulary IS the passage — every distinct lemma the pack finds in it. Nothing is
  // hand-listed, so the token distribution is the language's own.
  const lemmas: Lemma[] = [];
  const seen = new Set<Lemma>();
  for (const surface of pack.split(course.passage)) {
    const lemma = pack.key(surface);
    if (lemma.length === 0 || seen.has(lemma)) continue;
    seen.add(lemma);
    lemmas.push(lemma);
  }
  const tokens = pack.split(course.passage).length;

  say('');
  const whoLabel =
    who === 'heritage'
      ? 'a heritage speaker'
      : who === 'classroom'
        ? 'a classroom learner'
        : 'a beginner (the only state placement-free code can produce)';
  say(`  ${pack.id} — ${whoLabel}, ${String(days)} days.`);
  say(`  ${String(tokens)} running tokens, ${String(lemmas.length)} distinct words.`);
  say('  Seeded: same run every time, on every runtime.');
  say('');
  for (const line of wrap(course.passage, 88)) say(`    ${line}`);
  say('');
  say('  day  drilled                                        known    coverage');
  say('  ───  ────────────────────────────────────────────  ───────  ────────────────────────');

  for (let d = startDay + 1; d <= startDay + days; d++) {
    profile = advanceTo(profile, D(d));

    // 1. THE ENGINE DECIDES. No pack, no clock, no content — just the profile and the day.
    // 12 items is a plausible 15-20 minute session — the length the evidence supports. With 5
    // the 67-word pool takes 14 days to come round once, so nothing promotes for nearly three
    // weeks and the run shows only its own cold start.
    const session = plan(profile, { day: D(d), maxItems: 12 });

    // 2. A real host would now fetch exercises for `session.content.units` and a passage of at
    //    least `session.content.minPassageTokens` tokens. Here the learner just answers.
    const answered: Evidence[] = session.items.map((item) => {
      const w = word(item.unit);
      const practice = profile.units[item.unit]?.seen ?? 0;
      const base = course.familiar.some((f) => pack.key(f) === w) ? 0.75 : 0.3;
      return {
        unit: item.unit,
        outcome: next() < Math.min(0.95, base + 0.07 * practice) ? 'known' : 'unknown',
        tested: true,
        day: D(d),
      };
    });

    // 3. Reading mints a unit for anything not met yet. This is the intake path — and it never
    //    promotes anything, because `tested: false`.
    const read: Evidence[] = lemmas.map((lemma) => ({
      unit: unitKey('recognise', v, lemma),
      outcome: 'known' as const,
      tested: false,
      day: D(d),
    }));

    profile = record(profile, [...answered, ...read]);

    // 4. HOW HARD IS THE READING NOW? This is what would size tomorrow's passage.
    const measured = coverage(profile, pack, {
      text: course.passage,
      variety: v,
      direction: 'recognise',
    });
    const known = measured.kind === 'measured' ? measured.knownTokens : 0;
    const total = measured.kind === 'measured' ? measured.runningTokens : 0;
    const band = measured.kind === 'measured' ? measured.band : measured.kind;

    // Truncated on a word boundary — a canonical form cut in half is exactly what a reader would
    // mistake for a normalization bug.
    const all = session.items.map((i) => word(i.unit));
    let drilled = '';
    for (const w of all) {
      if (drilled.length + w.length + 1 > 44) {
        drilled += ' …';
        break;
      }
      drilled = drilled.length === 0 ? w : `${drilled} ${w}`;
    }
    if (drilled.length === 0) drilled = '—';
    say(
      `  ${String(d - startDay).padStart(3)}  ${drilled.slice(0, 44).padEnd(44)}  ` +
        `${String(known).padStart(3)}/${String(total).padEnd(3)}  ${bar(known, total)} ${band}`,
    );
  }

  const final = coverage(profile, pack, {
    text: course.passage,
    variety: v,
    direction: 'recognise',
  });
  say('');
  if (final.kind === 'measured') {
    say(`  Ends at ${String(final.knownTokens)}/${String(final.runningTokens)} — ${final.band}.`);
    if (final.unknownLemmas.length > 0) {
      say(`  Still unknown: ${final.unknownLemmas.slice(0, 14).join(' ')}`);
    }
  }
  say('');
  say('  What to check, if you speak the language:');
  say('   · The "drilled" column shows CANONICAL forms, not surface forms. For German that means');
  say('     umlauts are written out — schön is schoen, groß is gross, über is ueber. That is the');
  say('     pack normalizing, and it is deliberate: folding ö to o would merge schön with schon.');
  say('   · Inflected forms collapse onto one word: ist/sind/war all key to sein, so proving one');
  say('     proves them all. If you see two entries that are obviously the same word, that is a');
  say('     pack bug — the lemma table is incomplete, not the engine.');
  say(
    '   · Nothing is known for the first days. Promotion needs two tested successes, and reading',
  );
  say('     the passage every single day never promotes anything. Only drills do.');
  say('   · Nothing graduates. Proven words keep coming back — that is where retention lives.');
  say('');
}

/**
 * The three archetypes on one screen, so "different learners" is something you can look at.
 *
 * This is the shortest demonstration of why placement matters: the same text, the same engine, and
 * a starting comprehension that ranges from nothing to most of it.
 */
export function runCompare(language = 'de', override?: PackOverride): void {
  const base = COURSES[language] ?? COURSES.de;
  if (base === undefined) return;
  const v = variety(base.variety);
  if (v === undefined) return;

  const pack = override?.pack ?? base.pack;
  const passage = override?.passage ?? base.passage;
  const frequency = override?.frequency;
  if (frequency === undefined) {
    say('  runCompare needs a real pack: npm run demo -- de --pack ../packs/de compare');
    return;
  }

  const day = 200 as Day;
  const opts = { variety: v, day, seed: 42, frequency };
  const people = [
    ['beginner', beginner(pack, opts)],
    ['classroom, 400 words', classroomLearner(pack, { ...opts, words: 400 })],
    ['classroom, 2000 words', classroomLearner(pack, { ...opts, words: 2000 })],
    ['heritage speaker', heritageSpeaker(pack, opts)],
    ['silent reader', silentReader(pack, opts)],
    ['rusty, 8 years away', rustySpeaker(pack, { ...opts, yearsAway: 8 })],
  ] as const;

  say('');
  say(`  ${String(people.length)} learners, one text, ${pack.id}.`);
  say('');
  say('  who                     reads   says   gap   reads the passage');
  say('  ─────────────────────  ──────  ─────  ────  ────────────────────────────────────');

  for (const [name, profile] of people) {
    let recognises = 0;
    let produces = 0;
    for (const [key, state] of Object.entries(profile.units)) {
      if (state.box !== 'understood') continue;
      if (key.startsWith('produce:')) produces++;
      else recognises++;
    }
    const c = coverage(profile, pack, { text: passage, variety: v, direction: 'recognise' });
    const known = c.kind === 'measured' ? c.knownTokens : 0;
    const total = c.kind === 'measured' ? c.runningTokens : 0;
    const band = c.kind === 'measured' ? c.band : c.kind;
    // The GAP is the number this product exists for: what they understand minus what they can say.
    const gap = recognises === 0 ? 0 : Math.round((100 * (recognises - produces)) / recognises);
    say(
      `  ${name.padEnd(21)}  ${String(recognises).padStart(6)}  ${String(produces).padStart(5)}  ` +
        `${String(gap).padStart(3)}%  ${bar(known, total, 18)} ${String(known)}/${String(total)} ${band}`,
    );
  }

  say('');
  say('  GAP is the share of what they read that they cannot say — the number this product exists');
  say('  for, and it separates the two kinds of learner more than any total does. A classroom');
  say('  learner of 2000 words and a heritage speaker can read the same text and be nothing alike');
  say('  underneath: 24% against 62%.');
  say('');
  say('  The classroom rows are a clean PREFIX of the word list. The heritage rows have holes');
  say('  scattered through, denser on formal vocabulary (-ung, -heit, -tion) — the register gap,');
  say('  which is what learning a language at home rather than in a classroom leaves behind.');
  say('');
  say(
    '  ⚠️ The beginner row is the only one a REAL learner can be in today. Placement is not built,',
  );
  say('     so a heritage speaker who understands 70% of this text is taught as though they knew');
  say('     none of it. Every other row is a fabricated history — honest in a simulation, and a');
  say('     lie in the product.');
  say('');
}
