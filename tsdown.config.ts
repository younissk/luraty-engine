import { defineConfig } from 'tsdown';

/**
 * The build exists for ONE reason: to make publishing possible without changing how the engine is
 * consumed today.
 *
 * Right now `mobile/` links this package with `file:../engine` and Metro reads the TypeScript
 * SOURCE directly — no build step, so there is no build to forget on every edit (ADR-0001). That
 * stays true. `package.json` still points `main`/`types`/`exports` at `src/index.ts`, and
 * `publishConfig` swaps them for `dist/` only at publish time.
 *
 * So `npm run build` is not part of the daily loop. It runs when you want to check the published
 * shape (`npm run check:publish`), and on the day this is actually published.
 */
export default defineConfig({
  entry: ['src/index.ts'],

  // ESM only. Node 20 reached EOL on 2026-04-30, so every supported Node has unflagged
  // `require(esm)` — CJS output would double the export surface to serve nobody.
  format: ['esm'],

  // The types ARE the public contract for a TypeScript library. Without this the package is
  // untyped to consumers, which for this package would be most of its value gone.
  dts: true,

  // Match tsconfig. Hermes is the narrowest runtime this ships to, not Node.
  target: 'es2022',

  outDir: 'dist',
  clean: true,
  sourcemap: true,
});
