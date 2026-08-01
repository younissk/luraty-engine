/**
 * A unit's state, as stored by schema v3. **FLAT** — the box is gone, derived from `strength`.
 *
 * ⚠️ **The KEY format is untouched**, and that is the cash value of declining to put modality in the
 * unit key. `parseUnitKey` and `isDirection` are unchanged, so every stored `recognise:…` and
 * `produce:…` key still decodes and the v1 and v2 goldens need no rekeying. A migration that had to
 * rewrite keys would be rewriting somebody's past, which the id module names as the one shape that
 * is genuinely hard to change later.
 *
 * `prior` is `number | null` rather than a nested object — `null` for no claim, a whole day number
 * for a claim made on that day. Compact, and it parses back to `Prior` with no ambiguity; anything
 * else is `malformed`.
 *
 * Measured cost: a v2 learning unit is 63 bytes and its v3 form is 88, so an 800-unit profile goes
 * from roughly 66KB to 92KB. That is the price of three anchors plus a ledger, and it is paid on the
 * app-launch parse path — worth re-measuring if launch time regresses.
 *
 * @module
 */
export type WireUnitV3 = {
  readonly seen: number;
  readonly lastSeen: number;
  readonly lastAsked: number;
  readonly lastProven: number;
  /** `null` for no claim; the day it was made otherwise. See `Prior`. */
  readonly prior: number | null;
  readonly strength: number;
  readonly lapses: number;
};
