import { coverage } from '../core/coverage.js';
import { deserialize, serialize } from '../core/persist.js';
import { createProfile } from '../core/profile.js';
import { record } from '../core/record.js';
import { applyStep } from '../internal/text.js';
import type { Day } from '../model/ids.js';
import { parseUnitKey, unitKey, variety } from '../model/ids.js';
import type { NormalizeStep } from '../model/pack.js';

import { arabicPack, frenchPack } from './packs.js';

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
  for (const pack of [frenchPack, arabicPack]) {
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
  const AR = variety('ar-msa');
  if (AR !== undefined) {
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
  if (AR !== undefined) {
    let profile = createProfile('ar', 0 as Day);
    for (let day = 1; day <= 20; day++) {
      const word = CORPUS[day % CORPUS.length] ?? 'سوق';
      profile = record(profile, [
        {
          unit: unitKey(day % 2 === 0 ? 'recognise' : 'produce', AR, word),
          outcome: day % 3 === 0 ? 'unknown' : 'known',
          tested: day % 2 === 0,
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
    const v = variety(pack.id);
    if (v === undefined) continue;
    const words = pack.id.startsWith('ar')
      ? ['سوق', 'كتاب', 'مدرسة', 'المدينة', 'ـــ', 'بيت']
      : ['de', 'la', "l'automne", 'marché', 'vais', 'zzz'];
    // A passage long enough to classify, with a fixed knowledge set: the first two words proven.
    const text = Array.from({ length: 4 }, () => words.join(' ')).join(' ');
    const known = createProfile(pack.id, 0 as Day);
    const proven = record(
      known,
      words.slice(0, 2).flatMap((w) => [
        {
          unit: unitKey('recognise', v, pack.key(w)),
          outcome: 'known' as const,
          tested: true,
          day: 0 as Day,
        },
        {
          unit: unitKey('recognise', v, pack.key(w)),
          outcome: 'known' as const,
          tested: true,
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

  // ── Number and JSON behaviour, which have historically differed ──────────────────────────────
  lines.push(`json-order | | ${JSON.stringify({ b: 1, a: 2, 10: 3, 2: 4 })}`);
  lines.push(`json-escape | | ${JSON.stringify('سوق  👍')}`);
  lines.push(`imul | | ${String(Math.imul(0x9e3779b9, 0x85ebca6b))}`);
  lines.push(`float | | ${String(0.1 + 0.2)}`);
  lines.push(`int-string | | ${String(1e21)},${String(-0)},${String(1 / 3)}`);

  return lines.join('\n');
}
