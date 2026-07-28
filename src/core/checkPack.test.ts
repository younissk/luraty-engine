import { describe, expect, it } from 'vitest';

import { arabicPack, fixtures, frenchPack } from '../testing/packs.js';

import { checkPack } from './checkPack.js';
import { createPack } from './pack.js';

const ARABIC_SAMPLE = { text: 'ذهبت إلى السوق مع أخي في الصباح' };
const FRENCH_SAMPLE = { text: "Je vais au marché avec l'automne qui arrive" };

describe('checkPack', () => {
  it('passes a healthy pack', () => {
    expect(checkPack(frenchPack, FRENCH_SAMPLE)).toEqual([]);
    expect(checkPack(arabicPack, ARABIC_SAMPLE)).toEqual([]);
  });

  it('catches a frequency list in the wrong format', () => {
    // The likeliest real-world pack defect there is. Leipzig, OpenSubtitles and wordfreq all ship
    // one word per line, and a pack built from a mis-parsed list still builds, still tokenizes, and
    // silently ranks nothing — while affix stripping stops dead, because it consults the same
    // table. No unit test reaches this, because fixtures are correct by construction.
    const broken = createPack(fixtures.frenchConfig, { frequency: 'wordsthatarenotinthetext' });
    expect(broken.ok).toBe(true);
    if (!broken.ok) return;

    const problems = checkPack(broken.value, FRENCH_SAMPLE);
    expect(problems.map((p) => p.kind)).toContain('empty-vocabulary');
  });

  it('catches a tokenizer pointed at the wrong script', () => {
    // A French pattern with an Arabic pack, or a copy-pasted config. Everything downstream reads
    // zero tokens, so coverage would report 0% for every learner in that language forever.
    const problems = checkPack(arabicPack, FRENCH_SAMPLE);
    expect(problems.map((p) => p.kind)).toContain('tokenizer-matches-nothing');
  });

  it('catches a pack that marks every answer correct', () => {
    // The worst failure this package can have, and the one nobody reports.
    const alwaysRight = { ...frenchPack, compare: () => 1 };
    const problems = checkPack(alwaysRight, FRENCH_SAMPLE);
    expect(problems.map((p) => p.kind)).toContain('compare-always-true');
  });

  it('catches a pack that rejects a word against itself', () => {
    const alwaysWrong = { ...frenchPack, compare: () => 0 };
    const problems = checkPack(alwaysWrong, FRENCH_SAMPLE);
    expect(problems.map((p) => p.kind)).toContain('compare-rejects-identity');
  });

  it('catches an unstable key, which silently splits a learner in two', () => {
    // If keying a canonical form changes it again, the same word files itself under two keys
    // depending on the route it took, and half a learner's history detaches from the other half.
    let n = 0;
    const unstable = {
      ...frenchPack,
      key: (s: string) => `${frenchPack.key(s)}${String(n++ % 2)}`,
    };
    const problems = checkPack(unstable, FRENCH_SAMPLE);
    expect(problems.map((p) => p.kind)).toContain('unstable-key');
  });

  it('reports something a human can act on', () => {
    const broken = createPack(fixtures.frenchConfig, { frequency: 'zzz' });
    if (!broken.ok) return;
    for (const problem of checkPack(broken.value, FRENCH_SAMPLE)) {
      expect(problem.message).toContain('fr');
      expect(problem.message.length).toBeGreaterThan(20);
    }
  });
});
