#!/usr/bin/env node
/**
 * The cross-runtime lane: run the engine under Hermes and compare it to Node, byte for byte.
 *
 * WHY THIS EXISTS. `src/internal/text.ts` is a hand-written replacement for things ICU provides,
 * because Hermes ships without full ICU. Every test in this package runs on Node, where all of
 * those ICU-backed APIs work perfectly — so the suite can be entirely green while the code is
 * broken on the only runtime that actually matters. That is the worst failure shape there is.
 *
 * HOW. `src/testing/fingerprint.ts` is a pure function producing a deterministic string from every
 * operation that could plausibly differ between engines. It is bundled to a single file, run under
 * both runtimes, and the outputs are diffed. A differing LINE names the exact input that broke —
 * which is why the fingerprint is text rather than a hash.
 *
 * ⚠️ HONEST LIMITS, because a lane that oversells itself is worse than none:
 *  - The Hermes here is the last standalone release (v0.13.0, for RN 0.75.x). React Native 0.86
 *    bundles its own in-tree Hermes, so this is a close approximation of the shipping runtime, not
 *    the exact one. It catches the CLASS of bug; it cannot certify a specific build.
 *  - It runs the fingerprint, not the test suite. Vitest needs Node APIs Hermes does not have.
 *  - A missing binary is a loud SKIP, never a silent pass. Set HERMES_BIN to point at one.
 *
 * Usage:  node scripts/hermes.mjs          (or: npm run test:hermes)
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'reports', 'hermes');

/** Places a Hermes VM might live, in order of preference. */
function findHermes() {
  if (process.env['HERMES_BIN']) return process.env['HERMES_BIN'];

  const candidates = [
    // Downloaded by `make hermes-install`.
    join(root, '.hermes', 'hermes'),
    // A scratch download from an earlier session.
    join(root, '..', '.hermes', 'hermes'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  // Anything already on PATH.
  const which = spawnSync('command', ['-v', 'hermes'], { shell: true, encoding: 'utf8' });
  const found = which.stdout.trim();
  return found.length > 0 ? found : undefined;
}

function skip(reason) {
  console.log(`\x1b[33mSKIP\x1b[0m hermes lane — ${reason}`);
  console.log(
    '     This is the ONLY check that verifies the package runs on its narrowest runtime.\n' +
      '     Get a VM with:  make hermes-install\n' +
      '     Or point at one: HERMES_BIN=/path/to/hermes npm run test:hermes',
  );
  // Exit 0 deliberately: a missing tool must not fail a contributor's build. It is loud, not fatal
  // — the repo's rule is that a skipped check is announced, never hidden.
  process.exit(0);
}

const hermes = findHermes();
if (!hermes) skip('no Hermes binary found');

mkdirSync(outDir, { recursive: true });
const bundle = join(outDir, 'fingerprint.js');

// Bundle to one file. Hermes has no module system, so `iife`. ES2015 because Hermes 0.13 does not
// implement every later feature, and a bundle it cannot parse would look like a runtime failure.
console.log('bundling…');
execFileSync(
  'npx',
  [
    'esbuild',
    join(root, 'src', 'testing', 'hermes-entry.ts'),
    '--bundle',
    '--format=iife',
    '--target=es2015',
    '--platform=neutral',
    `--outfile=${bundle}`,
    '--log-level=warning',
  ],
  { cwd: root, stdio: 'inherit' },
);

console.log('running on node…');
const nodeOut = execFileSync(process.execPath, [bundle], { encoding: 'utf8', maxBuffer: 32e6 });

console.log(`running on hermes (${hermes})…`);
const hermesRun = spawnSync(hermes, [bundle], { encoding: 'utf8', maxBuffer: 32e6 });
if (hermesRun.status !== 0) {
  console.error('\x1b[31mFAIL\x1b[0m hermes could not execute the bundle:');
  console.error(hermesRun.stderr || hermesRun.stdout);
  process.exit(1);
}

writeFileSync(join(outDir, 'node.txt'), nodeOut);
writeFileSync(join(outDir, 'hermes.txt'), hermesRun.stdout);

const nodeLines = nodeOut.trimEnd().split('\n');
const hermesLines = hermesRun.stdout.trimEnd().split('\n');

const diffs = [];
const max = Math.max(nodeLines.length, hermesLines.length);
for (let i = 0; i < max; i++) {
  if (nodeLines[i] !== hermesLines[i]) {
    diffs.push({
      line: i + 1,
      node: nodeLines[i] ?? '(missing)',
      hermes: hermesLines[i] ?? '(missing)',
    });
  }
}

const version = spawnSync(hermes, ['--version'], { encoding: 'utf8' }).stdout.split('\n')[0] ?? '?';

if (diffs.length === 0) {
  console.log(
    `\x1b[32mPASS\x1b[0m hermes lane — ${String(nodeLines.length)} checks identical on Node and Hermes`,
  );
  console.log(`     hermes: ${version.trim()}`);
  process.exit(0);
}

console.error(
  `\x1b[31mFAIL\x1b[0m hermes lane — ${String(diffs.length)} of ${String(max)} checks differ between runtimes`,
);
console.error(
  '     Each line is a real behavioural difference on a phone. Do not "fix" the test.\n',
);
for (const d of diffs.slice(0, 25)) {
  console.error(`  line ${String(d.line)}`);
  console.error(`    node:   ${d.node}`);
  console.error(`    hermes: ${d.hermes}`);
}
if (diffs.length > 25) console.error(`  … and ${String(diffs.length - 25)} more`);
console.error(`\n  full output: ${join(outDir, 'node.txt')} vs ${join(outDir, 'hermes.txt')}`);

// Read the whole file rather than truncating on the first failure — a systematic difference (one
// Unicode range handled differently) shows up as a pattern across many lines, and the pattern is
// the diagnosis.
readFileSync(bundle);
process.exit(1);
