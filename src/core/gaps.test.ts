import { describe, expect, it } from 'vitest';

import type { Evidence } from '../model/evidence.js';
import { unitKey, variety, type Day, type UnitKey } from '../model/ids.js';
import type { Profile } from '../model/profile.js';
import { isKnown } from '../model/unit.js';

import { coverage } from './coverage.js';
import { plan } from './plan.js';
import { advanceTo, createProfile } from './profile.js';
import { record } from './record.js';
import { summarize } from './summary.js';
import { arabicPack } from '../testing/packs.js';

/**
 * The five gaps, re-measured.
 *
 * ⚠️ **EVERY NUMBER IN THIS FILE WAS MEASURED AGAINST THE OLD ENGINE FIRST.** These are not tests
 * written after the fact to describe what the code happens to do — each one is a fixture that was
 * run before anything changed, produced a specific bad number, and is kept so that the bad number
 * cannot come back. The old readings are in the comments.
 *
 * That matters because four of the five failures were SILENT. Nothing errored, nothing looked wrong
 * in a session, and the whole suite was green throughout. A regression here would be silent too.
 *
 * These are deliberately end-to-end over `record` → `plan` → `coverage`, because every one of the
 * five was a property of the loop rather than of a function. No unit test reached any of them.
 *
 * @module
 */

const V = variety('de')!;
const D = (n: number): Day => n as Day;
const U = (word: string): UnitKey => unitKey('recognise', V, word);

/** A deterministic draw in [0, 1). No `Math.random` in this package, ever. */
function draw(n: number): number {
  return ((Math.imul(n ^ 0x9e3779b9, 0x85ebca6b) >>> 0) % 100_000) / 100_000;
}

function proveAll(words: readonly string[], day: Day): Evidence[] {
  return words.flatMap((w) => [
    { kind: 'retrieval' as const, unit: U(w), outcome: 'known' as const, day },
    { kind: 'retrieval' as const, unit: U(w), outcome: 'known' as const, day },
  ]);
}

function answer(
  items: readonly { readonly unit: UnitKey }[],
  day: Day,
  accuracy: number,
  seed: number,
) {
  let tick = seed;
  return items.map((item): Evidence => {
    tick += 1;
    return {
      kind: 'retrieval',
      unit: item.unit,
      outcome: draw(tick) < accuracy ? 'known' : 'unknown',
      day,
    };
  });
}

describe('gap 1 — day one is not empty, and coverage does not read zero', () => {
  it('turns a placement into a session of things to VERIFY, not things to learn', () => {
    // OLD: a fresh profile returned `items: []` and `content.units: []`. The only way prior
    // knowledge could enter was fabricating retrievals, which writes "we pretended she was tested
    // twice" into the profile. Refusing to fabricate meant an empty screen for a fluent adult.
    const words = Array.from({ length: 40 }, (_, i) => `w${String(i)}`);
    const placed = record(
      createProfile('de', D(1)),
      words.map((w): Evidence => ({ kind: 'claim', unit: U(w), day: D(1) })),
    );

    const session = plan(placed, { day: D(1), maxItems: 12, maxNew: 4 });

    expect(session.items).toHaveLength(12);
    // ⚠️ ALL OF THEM `'verify'`. This is the field that lets a host say "you told us you know this —
    // let's check" instead of labelling 800 words she grew up hearing as new.
    expect(session.items.every((i) => i.why === 'verify')).toBe(true);
    // And verification does not eat the new-material budget: confirming a word she already claimed
    // is not teaching her a word.
    expect(session.content.newUnitsWanted).toBe(4);
  });

  it('still returns nothing for a genuinely empty profile — but says what it needs', () => {
    // The honest half. An empty profile really has nothing to schedule, and no cleverness changes
    // that; what was missing was any way for the engine to SAY so.
    const session = plan(createProfile('de', D(1)), { day: D(1), maxItems: 12, maxNew: 5 });
    expect(session.items).toHaveLength(0);
    expect(session.content.newUnitsWanted).toBe(5);
  });

  it('reports a claimed text as unverified rather than as too-hard', () => {
    // OLD: `coverage()` counted a unit known only once proven, so a learner placed at 800 words read
    // ~0% on every text for months and every passage came back `'too-hard'`. The app would have
    // starved her of content on the basis of drills it had not run yet.
    const text = Array.from({ length: 6 }, () => 'سوق كتاب مدرسة المدينة بيت ماء').join(' ');
    const AR = variety('ar-msa')!;
    const lemmas = [...new Set(arabicPack.split(text).map((s) => arabicPack.key(s)))].filter(
      (l) => l.length > 0,
    );

    const claimed = record(
      createProfile('ar', D(1)),
      lemmas.map((l): Evidence => ({
        kind: 'claim',
        unit: unitKey('recognise', AR, l),
        day: D(1),
      })),
    );

    const result = coverage(claimed, arabicPack, {
      text,
      variety: AR,
      direction: 'recognise',
    });

    expect(result.kind).toBe('unverified');
    if (result.kind !== 'unverified') return;
    // Believing her, the text is easy; not believing her, it is too hard. Both are returned, because
    // the engine genuinely does not know which is right — that is what a placement is for.
    expect(result.strict).toBe('too-hard');
    expect(result.withClaims).toBe('too-easy');
    expect(result.knownTokens).toBe(0);
    expect(result.claimedTokens).toBeGreaterThan(0);
    // And the uncertainty is actionable: these lemmas are exactly what to drill next.
    expect(result.claimedLemmas.length).toBeGreaterThan(0);
  });

  it('drains to a plain measurement once the claims are checked, with no code change', () => {
    const text = Array.from({ length: 6 }, () => 'سوق كتاب مدرسة المدينة بيت ماء').join(' ');
    const AR = variety('ar-msa')!;
    const lemmas = [...new Set(arabicPack.split(text).map((s) => arabicPack.key(s)))].filter(
      (l) => l.length > 0,
    );
    const units = lemmas.map((l) => unitKey('recognise', AR, l));

    let p = record(
      createProfile('ar', D(1)),
      units.map((unit): Evidence => ({ kind: 'claim', unit, day: D(1) })),
    );
    p = record(
      p,
      units.flatMap((unit): Evidence[] => [
        { kind: 'retrieval', unit, outcome: 'known', day: D(2) },
        { kind: 'retrieval', unit, outcome: 'known', day: D(3) },
      ]),
    );

    const result = coverage(p, arabicPack, { text, variety: AR, direction: 'recognise' });
    // Self-extinguishing: no threshold was tuned and nothing was cleared. The claims were confirmed,
    // so the two readings agree, so the answer is simply a measurement again.
    expect(result.kind).toBe('measured');
  });
});

describe('gap 2 — new material no longer starves review', () => {
  /** The exact fixture the failure was measured on: the host introduces `intro` words every day. */
  function reviewShare(intro: number, budget: number, maxNew: number, days: number): number {
    let p: Profile = createProfile('de', D(1));
    let maintenance = 0;
    let total = 0;
    let next = 0;

    for (let d = 2; d <= days + 1; d++) {
      const day = D(d);
      p = record(
        p,
        Array.from({ length: intro }, (): Evidence => {
          next += 1;
          return { kind: 'exposure', unit: U(`w${String(next)}`), day };
        }),
      );

      const session = plan(p, { day, maxItems: budget, maxNew });
      for (const item of session.items) {
        total += 1;
        if (item.why !== 'new') maintenance += 1;
      }
      p = record(p, answer(session.items, day, 1, d * 977));
    }
    return total === 0 ? 0 : maintenance / total;
  }

  it('gives review most of the session where it used to get none at all', () => {
    // ⚠️ MEASURED BEFORE: 20 new words a day into a 20-item budget gave review **0.0% of 3,600
    // slots** — not "a small share", none, forever. A never-attended unit's wait is `day - 0`, which
    // strictly dominates every attended unit at every epoch, so new material won every slot every
    // day and nothing errored.
    expect(reviewShare(20, 20, 20, 180)).toBe(0); // the old behaviour, reproduced exactly
    expect(reviewShare(20, 20, 5, 180)).toBeGreaterThan(0.6);
  });

  it('reserves the slots the cap held back, at every introduction rate', () => {
    // The failure was not one bad setting — it was that the HOST's introduction rate silently
    // decided the review schedule, with no way to express or cap it.
    for (const intro of [5, 15, 20, 40]) {
      expect(reviewShare(intro, 20, 5, 120), `intro ${String(intro)}/day`).toBeGreaterThan(0.6);
    }
  });
});

describe('gap 3 — the known count climbs with consolidation instead of reporting the error rate', () => {
  function knownAfter(pool: number, take: number, accuracy: number, days: number): number {
    const words = Array.from({ length: pool }, (_, i) => `w${String(i)}`);
    let p = record(createProfile('de', D(1)), proveAll(words, D(1)));

    for (let d = 2; d <= days + 1; d++) {
      const day = D(d);
      p = advanceTo(p, day);
      const session = plan(p, { day, maxItems: take, maxNew: 0 });
      p = record(p, answer(session.items, day, accuracy, d * 7919));
    }
    return summarize(p, { kind: 'all' }).known;
  }

  it('no longer settles at accuracy times pool', () => {
    // ⚠️ MEASURED BEFORE, over 720 days: the count settled at `accuracy x pool` and stayed there.
    // At 800 words and 90% accuracy it sat near 720 — so a learner placed at 800 watched the number
    // FALL for a month and then never rise, because one slip erased two proofs and there was no
    // strength dimension for consolidation to accumulate in.
    //
    // For a product whose entire pitch is "you know more than you think", a headline number that
    // reports how often she slips is the worst thing it could show her.
    const at90 = knownAfter(800, 20, 0.9, 720);
    expect(at90).toBeGreaterThan(0.9 * 800);
  });

  it('still discriminates — a learner who does not know the words does not read as knowing them', () => {
    // The other side, and the reason the ladder is asymmetric rather than ±1. Expected drift is
    // positive only above `missRetrieval / (gain + missRetrieval)` = 66.7%, so the ledger classifies
    // rather than smooths. A symmetric ladder would put break-even at 50% and report a 60%-accurate
    // learner as knowing almost everything.
    const weak = knownAfter(800, 20, 0.6, 720);
    const strong = knownAfter(800, 20, 0.9, 720);
    expect(weak).toBeLessThan(strong);
    expect(weak).toBeLessThan(0.8 * 800);
  });
});

describe('gap 4 — a handful of failed words no longer own the queue', () => {
  it('holds leeches near their fair share instead of at nine times it', () => {
    // ⚠️ MEASURED BEFORE, on exactly this fixture: ten always-failed words in a pool of 210, 20
    // slots a day for 60 days, took **44% of every slot** against a 4.8% fair share. The cause was
    // that `lastProven` was both the trust anchor and the scheduling one, so a word never got right
    // accumulated wait forever and sat at the head of the queue permanently.
    const POOL = 210;
    const LEECHES = 10;
    const words = Array.from({ length: POOL }, (_, i) => `w${String(i)}`);
    const isLeech = (unit: UnitKey) => {
      const n = Number(String(unit).split(':')[2]?.slice(1) ?? '-1');
      return n < LEECHES;
    };

    let p = record(createProfile('de', D(1)), proveAll(words, D(1)));
    let leechSlots = 0;
    let total = 0;

    for (let d = 2; d <= 61; d++) {
      const day = D(d);
      p = advanceTo(p, day);
      const session = plan(p, { day, maxItems: 20, maxNew: 0 });
      for (const item of session.items) {
        total += 1;
        if (isLeech(item.unit)) leechSlots += 1;
      }
      p = record(
        p,
        session.items.map((item): Evidence => ({
          kind: 'retrieval',
          unit: item.unit,
          outcome: isLeech(item.unit) ? 'unknown' : 'known',
          day,
        })),
      );
    }

    const share = leechSlots / total;
    const fairShare = LEECHES / POOL;
    expect(share, `${String(leechSlots)}/${String(total)}`).toBeLessThan(3 * fairShare);
    // ⚠️ AND NOT ZERO. The rejected alternative was a backoff — showing a repeatedly-failed word
    // LESS often — which hits the same number by hiding the problem. A word she is failing is a word
    // she needs; the engine names it in `Session.stuck` instead of quietly burying it.
    expect(leechSlots).toBeGreaterThan(0);
  });

  it('names the words that are not sticking rather than hiding them', () => {
    let p = record(createProfile('de', D(1)), proveAll(['bad'], D(1)));
    for (let d = 2; d <= 12; d++) {
      p = record(p, [{ kind: 'retrieval', unit: U('bad'), outcome: 'unknown', day: D(d) }]);
    }
    const session = plan(p, { day: D(13), maxItems: 5, maxNew: 0 });
    expect(session.stuck).toContain(U('bad'));
    // Named AND still scheduled. `stuck` is a diagnosis for the host — the exercise is wrong, the
    // audio is bad, the gloss is misleading — not an exclusion.
    expect(session.items.map((i) => i.unit)).toContain(U('bad'));
  });
});

describe('gap 5 — the engine can ask for a re-measurement, and the host can diff one', () => {
  it('goes due after a month without a single proof, and resets when she proves something', () => {
    // OLD: `plan()` could only say "drill these". Nothing in a session could say "it has been a
    // month, reassess" — so a scheduled measurement had nowhere to come from.
    const p = record(createProfile('de', D(1)), [
      { kind: 'retrieval', unit: U('x'), outcome: 'known', day: D(1) },
    ]);

    const early = plan(p, { day: D(10), maxItems: 5, maxNew: 0 }).reassess;
    expect(early.kind).toBe('not-due');
    if (early.kind === 'not-due') expect(early.daysUntil).toBe(21);

    const late = plan(p, { day: D(40), maxItems: 5, maxNew: 0 }).reassess;
    expect(late.kind).toBe('due');
    if (late.kind === 'due') expect(late.daysSinceProven).toBe(39);

    // Proving something resets it, so a learner drilling daily is never nagged.
    const active = record(p, [{ kind: 'retrieval', unit: U('x'), outcome: 'known', day: D(40) }]);
    expect(plan(active, { day: D(41), maxItems: 5, maxNew: 0 }).reassess.kind).toBe('not-due');
  });

  it('counts a placement into standing, confirmed and refuted — from present state alone', () => {
    // ⚠️ THE NUMBER NO FOLD THAT DISCARDED THE CLAIM COULD PRODUCE, and the reason `prior` is never
    // cleared. "Of the words you said you knew, N did not hold" needs no stored history at all.
    let p = record(
      createProfile('de', D(1)),
      ['a', 'b', 'c'].map((w): Evidence => ({ kind: 'claim', unit: U(w), day: D(1) })),
    );
    p = record(p, [
      { kind: 'retrieval', unit: U('a'), outcome: 'known', day: D(2) },
      { kind: 'retrieval', unit: U('b'), outcome: 'unknown', day: D(2) },
    ]);

    const s = summarize(p, { kind: 'all' });
    expect(s.claimsConfirmed).toBe(1); // a — she was right
    expect(s.claimsRefuted).toBe(1); // b — she was not
    expect(s.claimsStanding).toBe(1); // c — nobody has checked
    // The three partition the claimed set exactly, and are disjoint by construction: proof needs an
    // ask, so nothing can be both confirmed and refuted.
    expect(s.claimsStanding + s.claimsConfirmed + s.claimsRefuted).toBe(3);
  });

  it('gives the host two snapshots it can subtract', () => {
    // The engine stores no history — a profile is a fold, and folds do not remember. What it owes
    // the host is a value small enough to keep forever, and that is `Summary`.
    const words = Array.from({ length: 30 }, (_, i) => `w${String(i)}`);
    const march = record(createProfile('de', D(1)), proveAll(words.slice(0, 10), D(1)));
    const june = record(march, proveAll(words.slice(10), D(60)));

    const before = summarize(march, { kind: 'all' });
    const after = summarize(june, { kind: 'all' });
    expect(after.known - before.known).toBe(20);
    // Fixed size regardless of how many words she knows, and every value an integer — so nothing
    // float-formatted ever reaches the host's storage.
    expect(after.byStrength).toHaveLength(7);
    expect(after.byStrength.every((n) => Number.isInteger(n))).toBe(true);
  });

  it('refuses to blur two varieties into one number', () => {
    // For a diglossic learner, MSA and the home dialect are two systems. A single figure across them
    // is a category error, so the scope is a union the caller had to type rather than a default.
    const AR = variety('ar-msa')!;
    const LEV = variety('ar-levantine')!;
    const p = record(createProfile('ar', D(1)), [
      { kind: 'retrieval', unit: unitKey('recognise', AR, 'x'), outcome: 'known', day: D(1) },
      { kind: 'retrieval', unit: unitKey('recognise', AR, 'x'), outcome: 'known', day: D(2) },
      { kind: 'retrieval', unit: unitKey('recognise', LEV, 'y'), outcome: 'known', day: D(1) },
    ]);

    expect(summarize(p, { kind: 'all' }).known).toBe(1);
    expect(summarize(p, { kind: 'skill', variety: AR, direction: 'recognise' }).known).toBe(1);
    expect(summarize(p, { kind: 'skill', variety: LEV, direction: 'recognise' }).known).toBe(0);
    expect(summarize(p, { kind: 'skill', variety: LEV, direction: 'recognise' }).units).toBe(1);
  });
});

describe('the gloss-tap bug, end to end', () => {
  it('does not erase months of proof when she taps for help while reading', () => {
    // ⚠️ A REGRESSION TEST FOR A BUG THAT SHIPPED. In v2 the `outcome === 'unknown'` branch was
    // tested before the `!tested` check, so a gloss tap demoted an understood unit outright.
    let p = createProfile('de', D(1));
    for (let d = 1; d <= 6; d++) {
      p = record(p, [{ kind: 'retrieval', unit: U('x'), outcome: 'known', day: D(d) }]);
    }
    p = record(p, [{ kind: 'help', unit: U('x'), day: D(30) }]);
    expect(isKnown(p.units[U('x')]!)).toBe(true);
  });
});
