import { coverage } from '../core/coverage.js';
import { deserialize, serialize } from '../core/persist.js';
import { plan } from '../core/plan.js';
import { createProfile } from '../core/profile/index.js';
import { record } from '../core/record/index.js';
import { applyStep } from '../normalize/index.js';
import type { Day } from '../model/index.js';
import { parseUnitKey, unitKey, variety } from '../model/index.js';
import type { NormalizeStep } from '../model/index.js';

import { arabicPack, frenchPack, germanPack } from './packs.js';

/**
 * A deterministic fingerprint of everything that could plausibly differ between JavaScript engines.
 *
 * ⚠️ THIS IS THE ONLY THING THAT VERIFIES THE PACKAGE'S HEADLINE CLAIM.
 *
 * `internal/text.ts` exists *entirely* because Hermes ships without full ICU. Every function in it
 * is a hand-written replacement for something ICU-backed, and until this file existed, not one line
 * of it had ever run on Hermes. The tests were green on Node and the claim "runs unchanged on
 * Hermes" was an assertion nobody had checked.
 *
 * The fingerprint is a plain string rather than a hash, deliberately: when the two runtimes
 * disagree, a diff points at the exact input that differs. A hash would only say "something".
 *
 * Pure, and importing no I/O, so the same function runs unmodified under vitest, under Node, and
 * under the Hermes VM.
 *
 * @module
 */

/** Inputs chosen for where engines actually diverge, not for coverage. */
const CORPUS = [
  // Arabic: diacritics, alef variants, tatweel, teh marbuta — the whole reason text.ts exists.
  'سوق',
  'سُوق',
  'السُّوق',
  'كتـــاب',
  'أحمد',
  'إلى',
  'آية',
  'مدينة',
  'على',
  'ولد',
  'وقت',
  // Latin: accents, ligatures, the sharp s that expands to two characters.
  'marché',
  'MARCHÉ',
  "l'automne",
  'Œuvre',
  'straße',
  'çà et là',
  'naïve',
  // German: the umlaut pairs that a script-level fold destroys. schön/schon and zählen/zahlen are
  // different words, and the two-letter fold is the only thing keeping them apart.
  'schön',
  'schon',
  'zählen',
  'zahlen',
  'Bär',
  'GROSSE STRAßE',
  'Über',
  // Case folding, where a locale-aware implementation would differ from a locale-independent one.
  'İstanbul',
  'ISTANBUL',
  'ĲSSELMEER',
  // Punctuation, Latin and Arabic.
  'سوق، كتاب؟',
  'a.b,c;d!e?f',
  '«quoted»',
  '‘curly’',
  // Surrogate pairs and combining marks: string iteration is a real divergence risk.
  '𝔘𝔫𝔦𝔠𝔬𝔡𝔢',
  'é',
  '👍🏽',
  // Empty and whitespace edges.
  '',
  ' ',
  '\t\n',
];

const STEPS: readonly NormalizeStep[] = [
  'lowercase',
  'stripPunctuation',
  'stripArabicDiacritics',
  'stripTatweel',
  'normalizeArabicAlef',
  'normalizeArabicFinals',
  'foldLatinDiacritics',
  'foldGermanUmlauts',
];

/** Escapes to code points so a diff is readable and cannot be confused by terminal shaping. */
function show(s: string): string {
  let out = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    out += cp < 128 ? ch : `U+${cp.toString(16).toUpperCase()}`;
  }
  return out;
}

/**
 * Compute the fingerprint.
 *
 * Every line is `label | input | output`. Byte-identical output on two runtimes is the claim; a
 * differing line is the bug, named.
 */
export function fingerprint(): string {
  const lines: string[] = [];

  // ── Text transformations, one step at a time ────────────────────────────────────────────────
  for (const step of STEPS) {
    for (const input of CORPUS) {
      lines.push(`step ${step} | ${show(input)} | ${show(applyStep(step, input))}`);
    }
  }

  // ── String iteration itself, which is where surrogate handling would diverge ─────────────────
  for (const input of CORPUS) {
    const points: number[] = [];
    for (const ch of input) points.push(ch.codePointAt(0) ?? -1);
    lines.push(`codepoints | ${show(input)} | ${points.join(',')}`);
    lines.push(`length | ${show(input)} | ${String(input.length)}`);
  }

  // ── The packs end to end ─────────────────────────────────────────────────────────────────────
  for (const pack of [frenchPack, arabicPack, germanPack]) {
    for (const input of CORPUS) {
      const tokens = pack.split(input);
      const keys = tokens.map((t) => pack.key(t));
      const ranks = keys.map((k) => pack.rank(k) ?? -1);
      lines.push(`${pack.id} split | ${show(input)} | ${tokens.map(show).join('~')}`);
      lines.push(`${pack.id} key | ${show(input)} | ${keys.map(show).join('~')}`);
      lines.push(`${pack.id} rank | ${show(input)} | ${ranks.join(',')}`);
      lines.push(
        `${pack.id} compare-self | ${show(input)} | ${String(pack.compare(input, input))}`,
      );
    }
  }

  // ── Sorting, which underpins canonical serialization ─────────────────────────────────────────
  // A locale-aware sort would order these differently per device. This must not.
  const sortable = [...CORPUS].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  lines.push(`sort | corpus | ${sortable.map(show).join('~')}`);

  // ── Ids ──────────────────────────────────────────────────────────────────────────────────────
  //
  // ⚠️ THE `if (AR !== undefined)` GUARDS ARE GONE, and that is an improvement rather than tidying.
  // `variety('ar-msa')` is a literal the compiler now proves legal, so they were dead — but while
  // they were there, a `variety()` that began returning undefined would have made this function emit
  // a SHORTER fingerprint under BOTH VMs, and the cross-runtime lane would have gone green while
  // covering nothing. A conditional wrapped around a whole test body is a coverage cliff with a
  // handrail. The bare blocks are kept only to preserve scoping.
  const AR = variety('ar-msa');
  {
    for (const word of ['سوق', 'a:b', '👍🏽', '']) {
      const key = unitKey('recognise', AR, word);
      const parts = parseUnitKey(key);
      lines.push(`unitKey | ${show(word)} | ${show(key)}`);
      lines.push(
        `parseUnitKey | ${show(word)} | ${parts === undefined ? 'none' : show(parts.word)}`,
      );
    }
  }

  // ── The full state and persistence loop ──────────────────────────────────────────────────────
  {
    let profile = createProfile('ar', 1 as Day);
    for (let day = 1; day <= 20; day++) {
      const word = CORPUS[day % CORPUS.length] ?? 'سوق';
      profile = record(profile, [
        // ⚠️ ALL FOUR evidence kinds across the 20 days, so the fingerprint covers the whole fold
        // rather than only its retrieval arm — including the saturating rung arithmetic, which is
        // the one new integer computation v3 added, and the `prior` serialization.
        //
        // The `claim` arm was MISSING when this comment was first written, and the comment claimed
        // otherwise: the cross-runtime lane ran 896 checks with `"prior":null` on every one of them.
        // A comment that overstates its own coverage is worse than no comment, because it stops the
        // next person looking.
        day % 5 === 0
          ? { kind: 'exposure' as const, unit: unitKey('recognise', AR, word), day: day as Day }
          : day % 7 === 0
            ? { kind: 'help' as const, unit: unitKey('recognise', AR, word), day: day as Day }
            : day % 11 === 0
              ? { kind: 'claim' as const, unit: unitKey('recognise', AR, word), day: day as Day }
              : {
                  kind: 'retrieval' as const,
                  unit: unitKey(day % 2 === 0 ? 'recognise' : 'produce', AR, word),
                  outcome: day % 3 === 0 ? ('unknown' as const) : ('known' as const),
                  day: day as Day,
                },
      ]);
    }
    const blob = serialize(profile);
    lines.push(`serialize | 20 days | ${show(blob)}`);

    const back = deserialize(blob);
    lines.push(`deserialize | ok | ${String(back.ok)}`);
    if (back.ok) {
      lines.push(`reserialize-stable | | ${String(serialize(back.value) === blob)}`);
    }

    // Decoding failures must be identical too — a differing error kind means a learner on one
    // runtime gets a different recovery path from a learner on another.
    for (const bad of ['', '{', 'null', '{"v":99}', '{"v":1,"language":"ar","day":0,"units":{}}']) {
      const result = deserialize(bad);
      lines.push(`deserialize-bad | ${bad} | ${result.ok ? 'ok' : result.error.kind}`);
    }
  }

  // ── Coverage ────────────────────────────────────────────────────────────────────────────────
  //
  // Catches nothing today, and that is the point. Coverage is integer arithmetic over keyed tokens,
  // so it SHOULD be identical everywhere — this line is what makes that a checked claim instead of
  // an assumption. It goes red the day someone adds a `fraction` field, a `Math.round(ratio * 100)`
  // or a sort of `unknownLemmas` (whose idiomatic comparator is the banned `localeCompare`).
  for (const pack of [frenchPack, arabicPack]) {
    // `pack.id` IS a `Variety` now — `createPack` validates it — so there is nothing to guard.
    const v = pack.id;
    const words = pack.id.startsWith('ar')
      ? ['سوق', 'كتاب', 'مدرسة', 'المدينة', 'ـــ', 'بيت']
      : ['de', 'la', "l'automne", 'marché', 'vais', 'zzz'];
    // A passage long enough to classify, with a fixed knowledge set: the first two words proven.
    const text = Array.from({ length: 4 }, () => words.join(' ')).join(' ');
    const known = createProfile(pack.id, 1 as Day);
    const proven = record(
      known,
      words.slice(0, 2).flatMap((w) => [
        {
          kind: 'retrieval' as const,
          unit: unitKey('recognise', v, pack.key(w)),
          outcome: 'known' as const,
          day: 1 as Day,
        },
        {
          kind: 'retrieval' as const,
          unit: unitKey('recognise', v, pack.key(w)),
          outcome: 'known' as const,
          day: 1 as Day,
        },
      ]),
    );
    const result = coverage(proven, pack, { text, variety: v, direction: 'recognise' });
    lines.push(
      `coverage | ${pack.id} | ${result.kind} | ${
        result.kind === 'measured'
          ? `${String(result.runningTokens)}/${String(result.knownTokens)}/${String(result.unknownTokens)}/${String(result.unkeyableTokens)}/${result.band}`
          : result.kind === 'too-short'
            ? `${String(result.runningTokens)}/${String(result.needsMoreTokens)}`
            : String(result.unkeyableTokens)
      }`,
    );
    // First-appearance ORDER is part of the contract, so it is pinned rather than the set.
    const unknownLemmas = result.kind === 'no-words' ? [] : result.unknownLemmas;
    lines.push(`coverage-unknown | ${pack.id} | ${show(unknownLemmas.join(','))}`);
  }

  // ── Planning ────────────────────────────────────────────────────────────────────────────────
  //
  // Scheduling is integer arithmetic over sorted keys, so it should be identical everywhere — and
  // this is what makes that a checked claim rather than an assumption. It goes red the day someone
  // sorts unit keys with `localeCompare` (ICU-backed, and the ORDER of a session would then depend
  // on the device's language settings) or introduces a float into the score.
  {
    let scheduled = createProfile('ar', 1 as Day);
    for (let i = 0; i < 12; i++) {
      const unit = unitKey(i % 3 === 0 ? 'produce' : 'recognise', AR, CORPUS[i] ?? 'سوق');
      scheduled = record(scheduled, [
        { kind: 'retrieval', unit, outcome: 'known', day: (i + 1) as Day },
        {
          kind: 'retrieval',
          unit,
          outcome: i % 4 === 0 ? ('unknown' as const) : ('known' as const),
          day: (i + 2) as Day,
        },
      ]);
    }
    const session = plan(scheduled, { day: 40 as Day, maxItems: 5, maxNew: 2 });
    lines.push(
      `plan | day 40 | ${session.items.map((i) => `${show(i.unit)}@${String(i.daysWaiting)}`).join('~')}`,
    );
    lines.push(
      `plan-request | day 40 | ${String(session.content.units.length)}/${String(session.content.minPassageTokens)}/${String(session.content.newUnitsWanted)}`,
    );
    // The rung ladder and the three anchors, straight from the fold — so the cross-runtime lane
    // covers the arithmetic that now decides what "known" means, not just the dates.
    lines.push(
      `plan-why | day 40 | ${session.items.map((i) => i.why).join('~')} | reassess=${session.reassess.kind}`,
    );
  }

  // ── Closures over a loop variable ────────────────────────────────────────────────────────────
  //
  // ⚠️ **HERMES 0.13.0 GETS THIS WRONG, MEASURED, AND IT IS THE WORST SHAPE OF WRONG THERE IS.**
  //
  // ES6 gives a `let`/`const` loop variable a FRESH binding per iteration, so a closure built inside
  // the loop body captures that iteration's value. Hermes 0.13.0 does not: every closure sees the
  // LAST value, which is the `var` semantics ES6 abolished. Node is right, Hermes is wrong, and
  // nothing errors — the program runs and quietly computes with one wrong value.
  //
  // Found by the benchmark lane, and found only because the same bundle ran on both runtimes. It had
  // silently made every profile-size measurement report the same number, which looked like a
  // performance FINDING rather than a bug: "a 20,000-unit learner costs the same as a 4,000-unit
  // one" is a plausible-sounding result and it was an artefact.
  //
  // No file under `src/core`, `src/model` or `src/internal` builds a closure that escapes a loop
  // body today, so nothing shipping is affected — which is exactly why this belongs here rather than
  // in a comment somewhere. The next person to write `for (const x of xs) handlers.push(() => x)` in
  // this package gets a red line instead of a phone-only bug.
  //
  // ⚠️ A real React Native app usually escapes this: Metro runs Babel, whose block-scoping transform
  // rewrites the capture. This bundle does not go through Babel, so it sees the raw runtime. That
  // makes this line a check on HERMES, not a prediction about the app — and the reason to keep
  // writing the factory form anyway is that the workaround costs nothing and the bug is invisible.
  {
    const captured: (() => number)[] = [];
    for (const n of [1, 2, 3]) captured.push(() => n);
    lines.push(`loop-capture-for-of | 1,2,3 | ${captured.map((f) => String(f())).join(',')}`);

    const counted: (() => number)[] = [];
    for (let i = 0; i < 3; i++) counted.push(() => i);
    lines.push(`loop-capture-c-for | 0,1,2 | ${counted.map((f) => String(f())).join(',')}`);

    // The workaround, pinned alongside the bug: a CALL FRAME is a fresh binding everywhere. If this
    // line ever differs between runtimes, the advice in `bench.ts` is no longer safe either.
    const byFrame = [1, 2, 3].map((n) => () => n);
    lines.push(`loop-capture-factory | 1,2,3 | ${byFrame.map((f) => String(f())).join(',')}`);
  }

  // ── Number and JSON behaviour, which have historically differed ──────────────────────────────
  lines.push(`json-order | | ${JSON.stringify({ b: 1, a: 2, 10: 3, 2: 4 })}`);
  lines.push(`json-escape | | ${JSON.stringify('سوق  👍')}`);
  lines.push(`imul | | ${String(Math.imul(0x9e3779b9, 0x85ebca6b))}`);
  lines.push(`float | | ${String(0.1 + 0.2)}`);
  lines.push(`int-string | | ${String(1e21)},${String(-0)},${String(1 / 3)}`);

  return lines.join('\n');
}
