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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'reports', 'demo');
const args = process.argv.slice(2).filter((a) => a !== '--');
const language = args.find((a) => /^[a-z]{2}$/.test(a)) ?? 'de';
const days = Number(args.find((a) => /^\d+$/.test(a)) ?? 30);
// `--pack <dir>` swaps the built-in fixture for a real pack read off disk. Reading the file is the
// HOST's job — the engine has no filesystem — so it happens here and the data is handed in.
const packIndex = args.indexOf('--pack');
const packDir = packIndex >= 0 ? args[packIndex + 1] : undefined;

mkdirSync(outDir, { recursive: true });
const entry = join(outDir, 'entry.ts');
const bundle = join(outDir, 'demo.js');

// A generated entry point, so the arguments are build-time constants and the bundle stays a pure
// program with no argument parsing in it — which is what lets the same bytes run under Hermes.
let head = `import { runDemo } from '../../src/testing/demo.js';\n`;
let call = `runDemo(${String(Number.isFinite(days) ? days : 30)}, ${JSON.stringify(language)});\n`;

if (packDir !== undefined) {
  const dir = resolve(process.cwd(), packDir);
  const config = JSON.parse(readFileSync(join(dir, 'pack.config.json'), 'utf8'));
  const frequency = readFileSync(join(dir, 'frequency.txt'), 'utf8');
  const lemmas = {};
  const lemmaFile = join(dir, 'lemmas.tsv');
  if (existsSync(lemmaFile)) {
    for (const line of readFileSync(lemmaFile, 'utf8').split('\n')) {
      const [surface, lemma] = line.split('\t');
      if (surface && lemma) lemmas[surface.trim()] = lemma.trim();
    }
  }
  const samplePath = join(dir, 'sample.txt');
  const passage = existsSync(samplePath)
    ? readFileSync(samplePath, 'utf8').replace(/\s+/g, ' ').trim()
    : undefined;

  head =
    `import { runDemo } from '../../src/testing/demo.js';\n` +
    `import { createPack } from '../../src/index.js';\n`;
  call =
    `const built = createPack(${JSON.stringify(config)} as never, ` +
    `{ frequency: ${JSON.stringify(frequency)}, lemmas: ${JSON.stringify(lemmas)} });\n` +
    `if (!built.ok) throw new Error('pack failed: ' + built.error.message);\n` +
    `runDemo(${String(Number.isFinite(days) ? days : 30)}, ${JSON.stringify(language)}, ` +
    `{ pack: built.value` +
    (passage === undefined ? '' : `, passage: ${JSON.stringify(passage)}`) +
    ` });\n`;
}

writeFileSync(entry, head + call);

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
