#!/usr/bin/env node
/**
 * Run the demo: a simulated learner, thirty days, printed.
 *
 * Not a test. The suite proves the engine is correct; this shows what correct looks like, which is
 * a different question and the only one a human can answer.
 *
 * Bundled with esbuild rather than run through a TS loader, for the same reason the Hermes lane
 * does it: no extra dependency, and the exact same bytes can be handed to another runtime.
 *
 * Usage:  npm run demo               (German, 30 days)
 *         npm run demo -- ar          Arabic
 *         npm run demo -- de 90       German, 90 days
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'reports', 'demo');
const args = process.argv.slice(2).filter((a) => a !== '--');
const language = args.find((a) => /^[a-z]{2}$/.test(a)) ?? 'de';
const days = Number(args.find((a) => /^\d+$/.test(a)) ?? 30);

mkdirSync(outDir, { recursive: true });
const entry = join(outDir, 'entry.ts');
const bundle = join(outDir, 'demo.js');

// A generated entry point, so the arguments are build-time constants and the bundle stays a pure
// program with no argument parsing in it — which is what lets the same bytes run under Hermes.
writeFileSync(
  entry,
  `import { runDemo } from '../../src/testing/demo.js';\n` +
    `runDemo(${String(Number.isFinite(days) ? days : 30)}, ${JSON.stringify(language)});\n`,
);

execFileSync(
  'npx',
  [
    'esbuild',
    entry,
    '--bundle',
    '--format=esm',
    '--platform=node',
    `--outfile=${bundle}`,
    '--log-level=warning',
  ],
  { cwd: root, stdio: 'inherit' },
);

execFileSync(process.execPath, [bundle], { stdio: 'inherit' });
