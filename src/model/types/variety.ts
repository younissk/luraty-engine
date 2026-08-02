/**
 * A language variety, opaque to the engine.
 *
 * The engine never interprets this — `'fr'`, `'ar-msa'` and `'ar-levantine'` are all just strings
 * it carries around. That is what keeps the engine language-agnostic.
 *
 * It is part of the unit key rather than only the profile because a diglossic language keeps two
 * varieties in play at once: the dialect a learner speaks at home and the standard they read. They
 * are related but different systems and must be measured separately.
 *
 * @module
 */

import type { Brand } from './brand.js';

export type Variety = Brand<string, 'Variety'>;
