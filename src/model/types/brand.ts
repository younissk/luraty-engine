/**
 * Nominal typing at zero runtime cost — a branded string is still a string at run time, but the
 * compiler refuses to swap one brand for another.
 *
 * ⚠️ Not exported from `model/index.ts`. Every brand in the package is declared here; a consumer
 * branding its own type would be inventing an identifier the engine cannot parse.
 *
 * @module
 */

declare const BRAND: unique symbol;

export type Brand<T, N extends string> = T & { readonly [BRAND]: N };
