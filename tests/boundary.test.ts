// The engine's boundary, asserted out loud.
//
// WHY THIS EXISTS. The primary guard on engine purity is structural: this package has its own
// package.json and its own node_modules, and neither lists react-native. Module resolution walks
// only UPWARD, never sideways into a consumer's node_modules, so `import { View } from
// 'react-native'` in here does not resolve and `npm run typecheck` fails with TS2307. The wrong
// thing is impossible, not merely discouraged.
//
// That guarantee is silent, which makes it fragile in one specific way: it can be destroyed by an
// edit that looks like tidying. Adding this package to an npm workspace would hoist react-native
// into a shared node_modules, the engine would resolve it again, and typecheck would go green on
// exactly the mistake this package exists to prevent. Nothing would fail. Nobody would know.
//
// So these tests turn a silent structural property into a loud one.

import { describe, expect, it } from 'vitest';

import pkgJson from '../package.json';

import { ENGINE_API_VERSION } from '../src/index.js';

// TypeScript infers package.json's LITERAL shape, so `pkg.dependencies` is a compile error while
// the package happens to have no runtime dependencies. Widen once, here, so these tests keep
// compiling as the manifest grows — the assertions are about what is declared at any given moment,
// not about which keys exist today.
const pkg = pkgJson as unknown as {
  version: string;
  private?: boolean;
  license?: string;
  publishConfig?: { access?: string };
  exports: Record<string, unknown>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

/**
 * The COMPLETE set of packages this repo may install, dev included.
 *
 * An allowlist rather than a denylist, because the dangerous additions are the ones nobody thinks
 * to ban. The worked example: installing a docs site (VitePress, Docusaurus, Starlight, Nextra)
 * into this package drags Vue or React into `node_modules` — and from that moment
 * `import { ref } from 'vue'` typechecks GREEN inside `src/`, because resolution finds it. The
 * denylist below does not mention vue, and never would have. The compiler-enforced boundary is the
 * whole premise of this package, and a transitive UI framework dissolves it silently.
 *
 * So: every new dependency is a deliberate edit to this line, reviewed on its own merits.
 * If a tool needs a UI framework, it belongs in a SIBLING package, not this one.
 */
const ALLOWED_DEPENDENCIES = [
  '@changesets/cli',
  '@commitlint/cli',
  '@commitlint/config-conventional',
  '@eslint/js',
  '@stryker-mutator/core',
  '@stryker-mutator/vitest-runner',
  // ⚠️ Must track the vitest version EXACTLY — it peer-depends on a specific patch, so the two are
  // always bumped together. Dependabot groups all devDeps into one PR partly for this reason.
  '@vitest/coverage-v8',
  'eslint',
  'esbuild',
  'eslint-config-prettier',
  'fast-check',
  'husky',
  'lint-staged',
  'prettier',
  'publint',
  'tsdown',
  'typescript',
  'typescript-eslint',
  'vitest',
] as const;

/**
 * Anything that binds the engine to a UI runtime, a device, or a database.
 *
 * Redundant with the allowlist above and kept deliberately: the allowlist ENFORCES, this one
 * DOCUMENTS. When the allowlist fails, this list is what tells the next person why the rule exists.
 */
const BANNED = [
  'react',
  'react-dom',
  'react-native',
  'react-native-web',
  'expo',
  '@react-navigation/native',
  '@react-native-async-storage/async-storage',
  '@supabase/supabase-js',
] as const;

const BANNED_PREFIXES = ['expo-', '@expo/', '@react-native/', '@react-native-community/'] as const;

function declaredDependencies(): string[] {
  return [
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
  ];
}

describe('engine boundary', () => {
  it('installs nothing outside the allowlist', () => {
    const declared = declaredDependencies().sort();
    expect(
      declared,
      `A dependency was added that is not on ALLOWED_DEPENDENCIES. That is not automatically wrong ` +
        `— but it is a decision, so make it here. Ask: can this package pull in a UI framework, ` +
        `even transitively? If yes it does not belong in the engine; put it in a sibling package. ` +
        `Docs-site generators are the usual culprit.`,
    ).toEqual([...ALLOWED_DEPENDENCIES].sort());
  });

  it('declares no UI-runtime dependency', () => {
    const offenders = declaredDependencies().filter(
      (d) =>
        (BANNED as readonly string[]).includes(d) || BANNED_PREFIXES.some((p) => d.startsWith(p)),
    );
    expect(
      offenders,
      `package.json declares ${offenders.join(', ')}. The engine must stay runtime-agnostic: it ` +
        `runs under Hermes, Node and a browser unchanged. If it needs something from the outside ` +
        `world, take it as an argument and let the host supply it — do not depend on the frontend ` +
        `from the backend.`,
    ).toEqual([]);
  });

  it("does not depend on a database client — persistence is the host's job", () => {
    // Called out separately because it is the tempting one. The engine decides WHAT to ask for;
    // the host decides HOW it is fetched and stored. An engine that imports a database client can
    // no longer be tested without one, and "the engine is the backend" collapses into two coupled
    // halves that must ship together.
    expect(declaredDependencies()).not.toContain('@supabase/supabase-js');
  });

  it('is publishable, publicly, under MIT — and each of those is a decision', () => {
    // ⚠️ THIS TEST USED TO ASSERT THE OPPOSITE: `pkg.private === true`, "this package is never
    // published". It was inverted on 2026-09-11 when @luraty/engine was published to npm so that
    // `luraty-language-packs` — a PUBLIC repo — could install it; every pack imports the engine at
    // runtime, so a private, unpublished dependency blocked the whole packs split.
    //
    // The assertion is kept rather than deleted because its JOB is unchanged: publish posture is a
    // decision, and this is where it gets made. `private` absent means npm will accept a publish;
    // `access: public` means it lands world-readable on a free org; MIT means anyone may fork it
    // and ship a competitor. Flipping any of these back is a founder call, not a cleanup.
    //
    // ⚠️ THE LICENCE **TEXT** IS DELIBERATELY NOT ASSERTED HERE. Checking that LICENSE exists
    // means reading a file, and this package has no `@types/node` on purpose — that absence is the
    // same boundary the tests above defend, so a `node:fs` import in this suite would breach the
    // rule it is written to enforce. `npm run check:publish` covers it from outside: publint packs
    // the tarball, and npm always includes LICENSE in it.
    expect(pkg.private).toBeUndefined();
    expect(pkg.publishConfig?.access).toBe('public');
    expect(pkg.license).toBe('MIT');
  });

  it('exposes exactly one public entry point', () => {
    // One narrow door. A consumer reaching past the barrel into engine internals is how a
    // replaceable engine quietly becomes an unreplaceable one. Resist adding an "./internal" or
    // "./testing" subpath for the simulation harness — if the harness cannot work through the
    // barrel, the barrel is wrong.
    expect(Object.keys(pkg.exports)).toEqual(['.']);
  });

  it('keeps ENGINE_API_VERSION honest', () => {
    // A hand-maintained version string that nothing verifies is a lie with a countdown on it.
    expect(ENGINE_API_VERSION).toBe(pkg.version);
  });
});
