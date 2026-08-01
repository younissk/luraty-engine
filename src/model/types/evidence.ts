/**
 * One observation about the learner.
 *
 * ⚠️ THE IMPORTANT PROPERTY, UNCHANGED SINCE v1: evidence describes the LEARNER, not the exercise.
 *
 * There is no `source: 'flashcard' | 'cloze' | 'speech'` field and there should never be one. A word
 * tapped while reading, a failed recall, a hesitation mid-sentence and a wrong answer on a test all
 * arrive here in the same shape. That is what lets a speaking exercise be added in six months
 * without the core changing at all — the core cannot tell where anything came from, so it cannot
 * grow a dependency on it.
 *
 * ⚠️ CLOSED AT FOUR, and the axis is what a learner can DO that tells you something: prove it, meet
 * it and move on, meet it and ask, or state it unasked. A fifth member needs a fifth learner
 * behaviour, not a fifth exercise type. That is what closes the set, and it is the same rule that
 * keeps `flashcard | cloze | speech` out.
 *
 * ⚠️ There is deliberately NO `purpose: 'practice' | 'assessment'` axis. It is the exercise's
 * framing, which this module's own rule excludes; the magnitude that would carry it (a larger
 * demotion for a formal miss) is invented, with nothing measuring it; and it is untagged host data
 * crossing a trust boundary, so a host that mislabels poisons the ledger with no way for the engine
 * to detect it. "A re-measurement is indistinguishable from a bad morning" is answered where a
 * measurement belongs — in the host's decision to take a `Summary` snapshot.
 *
 * ### What each variant may do — the complete table, and the only place it is written down
 *
 * | variant             | seen | lastSeen | lastAsked | lastProven | strength | lapses | prior |
 * | ------------------- | ---- | -------- | --------- | ---------- | -------- | ------ | ----- |
 * | retrieval + known   | +1   | → day    | → day     | → day      | +1 (cap) | → 0    | –     |
 * | retrieval + unknown | +1   | → day    | → day     | –          | −2 (flr) | +1     | –     |
 * | exposure            | +1   | → day    | –         | –          | –        | –      | –     |
 * | help                | +1   | → day    | –         | –          | −1 (flr) | –      | –     |
 * | claim               | –    | –        | –         | –          | –        | –      | set   |
 *
 * "→ day" is `later(current, evidence.day)` — monotone, so an out-of-order offline queue converges
 * on the same answer whatever order it drains in.
 *
 * @module
 */

import type { Claim } from './claim.js';
import type { Exposure } from './exposure.js';
import type { Help } from './help.js';
import type { Retrieval } from './retrieval.js';

export type Evidence = Retrieval | Exposure | Help | Claim;
