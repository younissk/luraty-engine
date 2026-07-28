import { coverage } from '../core/coverage.js';
import { plan } from '../core/plan.js';
import { advanceTo, createProfile } from '../core/profile.js';
import { record } from '../core/record.js';
import type { Evidence } from '../model/evidence.js';
import { unitKey, variety, type Day, type UnitKey } from '../model/ids.js';
import type { LanguagePack } from '../model/pack.js';
import type { Profile } from '../model/profile.js';

import { arabicPack } from './packs.js';

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
 * @module
 */

const AR = variety('ar-msa') ?? ('ar-msa' as ReturnType<typeof variety> & string);
const D = (n: number): Day => n as Day;

/**
 * The words this learner is working on — the whole Arabic fixture vocabulary.
 *
 * ⚠️ THE SIZE IS LOAD-BEARING, which a first draft of this demo proved by getting it wrong. With
 * twelve words the coverage band was UNREACHABLE: the learner went from 88% to 100% in one day and
 * skipped 95–98% entirely, because each word carried eight tokens and there was no way to land
 * between them. That is not an engine bug, it is the grain of the content — and it is the open
 * question ADR-0004 hands to the product. A tail of words worth one or two tokens each is what gives
 * the band somewhere to be.
 */
const VOCAB = [
  'في',
  'من',
  'على',
  'أن',
  'إلى',
  'عن',
  'مع',
  'هذا',
  'التي',
  'كان',
  'قد',
  'لا',
  'ما',
  'هو',
  'كل',
  'بعد',
  'بين',
  'حول',
  'عند',
  'سوق',
  'كتاب',
  'مدرسة',
  'بيت',
  'ماء',
  'خبز',
  'شارع',
  'مطار',
  'طبيب',
  'قطار',
  'جريدة',
  'حكومة',
  'ولد',
  'وقت',
  'مدينة',
] as const;

/** Zipfian: a few words carry most of the tokens, and the tail appears once. Like real text. */
const WEIGHTS = [
  18, 14, 11, 9, 8, 7, 6, 5, 5, 4, 4, 3, 3, 3, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  1, 1,
];

/** 120 running tokens of it, which is comfortably above the band's 20-token floor. */
const PASSAGE = VOCAB.flatMap((word, i) =>
  Array.from({ length: WEIGHTS[i] ?? 1 }, () => word),
).join(' ');

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

/** Grew up hearing these — the heritage shape: lumpy and domain-flavoured, not a frequency prefix. */
function knowsAlready(word: string): boolean {
  return ['بيت', 'ماء', 'خبز', 'سوق'].includes(word);
}

function bar(value: number, total: number, width = 28): string {
  const filled = total === 0 ? 0 : Math.round((value / total) * width);
  return '█'.repeat(filled) + '·'.repeat(Math.max(0, width - filled));
}

function shortKey(unit: UnitKey): string {
  const parts = unit.split(':');
  return `${parts[0] === 'produce' ? 'say ' : 'read'} ${parts.slice(2).join(':')}`;
}

function say(line: string): void {
  // Hermes has `print`, Node has `console.log`. Neither is assumed.
  const g = globalThis as { print?: (s: string) => void; console?: { log: (s: string) => void } };
  if (typeof g.print === 'function') g.print(line);
  else g.console?.log(line);
}

export function runDemo(days = 30, pack: LanguagePack = arabicPack): void {
  const next = rng(42);
  let profile: Profile = createProfile('ar', D(0));

  say('');
  say(`  A learner, ${String(days)} days, on the ${pack.id} pack.`);
  say('  Nothing here is random: same seed, same run, every time and on every runtime.');
  say('');
  say('  day  drilled                        pool  known   coverage of the reading');
  say('  ───  ────────────────────────────  ─────  ─────  ─────────────────────────────────');

  for (let d = 1; d <= days; d++) {
    profile = advanceTo(profile, D(d));

    // 1. THE ENGINE DECIDES. No pack, no clock, no content — just the profile and the day.
    const session = plan(profile, { day: D(d), maxItems: 4 });

    // 2. THE HOST WOULD NOW FETCH CONTENT for `session.content.units`, and a passage of at least
    //    `session.content.minPassageTokens` running tokens. Here the learner just answers.
    const answered: Evidence[] = session.items.map((item) => {
      const word = item.unit.split(':').slice(2).join(':');
      const state = profile.units[item.unit];
      const practice = state ? state.seen : 0;
      const chance = Math.min(0.95, (knowsAlready(word) ? 0.7 : 0.3) + 0.06 * practice);
      return {
        unit: item.unit,
        outcome: next() < chance ? 'known' : 'unknown',
        tested: true,
        day: D(d),
      };
    });

    // 3. Reading the passage mints units for anything not met yet — this is the intake path.
    const read: Evidence[] = VOCAB.map((word) => ({
      unit: unitKey('recognise', AR, pack.key(word)),
      outcome: 'known' as const,
      tested: false,
      day: D(d),
    }));

    profile = record(profile, [...answered, ...read]);

    // 4. HOW HARD IS THE READING NOW? This is what sizes tomorrow's passage.
    const measured = coverage(profile, pack, {
      text: PASSAGE,
      variety: AR,
      direction: 'recognise',
    });

    const pool = Object.keys(profile.units).length;
    const known = measured.kind === 'measured' ? measured.knownTokens : 0;
    const total = measured.kind === 'measured' ? measured.runningTokens : 0;
    const band = measured.kind === 'measured' ? measured.band : measured.kind;

    const drilled = session.items.map((i) => shortKey(i.unit)).join(', ') || '—';
    say(
      `  ${String(d).padStart(3)}  ${drilled.slice(0, 28).padEnd(28)}  ` +
        `${String(pool).padStart(5)}  ${String(known).padStart(3)}/${String(total).padEnd(3)}  ` +
        `${bar(known, total)} ${band}`,
    );
  }

  say('');
  const final = coverage(profile, pack, { text: PASSAGE, variety: AR, direction: 'recognise' });
  if (final.kind === 'measured') {
    say(`  Ends at ${String(final.knownTokens)}/${String(final.runningTokens)} — ${final.band}.`);
    if (final.unknownLemmas.length > 0) {
      say(`  Still unknown: ${final.unknownLemmas.join(' ، ')}`);
    }
  }
  say('');
  say('  What to notice — including the parts that look wrong:');
  say('   · Nothing is known for the first ~12 days. Promotion needs two tested successes, and at');
  say('     4 drills a day a 33-unit pool takes that long to come round twice. Reading every day');
  say('     does NOT help: passive exposure never promotes, by design.');
  say(
    '   · Then it climbs steeply, OVERSHOOTS into too-easy, and settles into the band from above',
  );
  say(
    '     as failures demote words. The band is not a destination the engine steers toward yet —',
  );
  say('     coverage only measures. A selector that consumes the verdict is not built.');
  say(
    '   · "read" and "say" would be separate units for the same word. This run only reads, so the',
  );
  say('     production half of every word is untouched — which is the gap the product exists for.');
  say('   · Nothing graduates: proven words keep coming back. That is where the retention lives.');
  say('');
}
