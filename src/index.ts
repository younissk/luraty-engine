// The public API of the Luraty engine.
//
// This barrel is the ONLY thing a consumer may import. Everything else under src/ is internal —
// if a caller needs something, export it here deliberately.
//
// ⚠️ Hand-written allowlist. Never `export * from './something'`: a wildcard makes every future
// internal file public by default, and a barrel you cannot narrow is an engine you cannot replace.
//
// Nothing is implemented yet. This is scaffolding — see README.md for the shape it grows into.

/**
 * The version of this package's public contract.
 *
 * Pinned to `package.json` by `src/boundary.test.ts`, so it cannot drift into a comfortable lie.
 * Bump it in the same commit as any breaking change to the exports above.
 */
export const ENGINE_API_VERSION = '0.1.0';
