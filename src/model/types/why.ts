/**
 * Why an item is in the session — the partition it was drawn from.
 *
 * Derived on every call and stored nowhere, so it can never disagree with the state it describes.
 *
 * ⚠️ THE MOST PRODUCT-VISIBLE FIELD IN v3. `'verify'` is what lets day one say *"you told us you
 * know this — let's check"* to a fluent adult, instead of labelling 800 words she grew up hearing as
 * "new". A heritage speaker being called a beginner is the specific failure this product exists to
 * avoid, and until now the engine had no way to tell the host not to.
 *
 * @module
 */
export type Why =
  /**
   * A standing claim: the host asserted it and nobody has checked. Draws from the REVIEW budget, not
   * the new-material cap — confirming what she already said she knows is not teaching her a word.
   */
  | 'verify'
  /** Never asked and never claimed. **The only value `PlanOptions.maxNew` caps.** */
  | 'new'
  /** Asked at least once and never once right. Maintenance, uncapped — she is mid-acquisition. */
  | 'relearn'
  /** Proven at least once. Maintenance, uncapped. */
  | 'review';
