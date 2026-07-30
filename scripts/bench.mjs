#!/usr/bin/env node
/**
 * The benchmark lane: how fast the engine is, on the runtime that actually ships.
 *
 * WHY THIS EXISTS. Every number anyone has for this package was measured on a laptop, under Node,
 * with a JIT. The engine ships to Hermes on a phone, where there is no JIT and where a learner with
 * years of history carries a profile that `record` copies wholesale on every answer. "It is fast"
 * has never been a measurement here; it has been an assumption, and the shape of that assumption
 * failing is a frame drop on the one interaction the product is made of.
 *
 * HOW. `src/testing/bench.ts` is a pure program — clock injected, pack data passed in, no I/O. It is
 * bundled to one file and run under Node and under Hermes, exactly like the fingerprint lane, so the
 * two numbers are the same bytes doing the same work. The report then projects the Hermes number
 * onto a target device.
 *
 * ⚠️ THE DEVICE MULTIPLIER IS AN ESTIMATE UNTIL YOU CALIBRATE IT, and this script says so on every
 * run rather than in a footnote. The bundle carries a fixed calibration kernel; run it on a real
 * phone, read the `kernel` number it prints, and pass it back as `--baseline <ms>`. The projection
 * then stops being a guess about a device and becomes a measurement of one.
 *
 * ⚠️ NOT A GATE, and never should be. Wall-clock assertions fail on a busy laptop and pass on a
 * quiet one; a lane that cries wolf gets skipped. Use `--compare` when regression is the question.
 *
 * Usage:
 *   npm run bench                        the standard suite, projected onto an older phone
 *   npm run bench -- --pack ../packs/de  against the REAL 10k-lemma German pack (do this)
 *   npm run bench -- --quick             two profile sizes, three samples — seconds, not minutes
 *   npm run bench -- --stress            add the adversarial pass; isolate every scenario
 *   npm run bench -- --device mid-2020   project onto a different phone
 *   npm run bench -- --baseline 412      a REAL device's kernel time; replaces the estimate
 *   npm run bench -- --compare reports/bench/before.json
 *   npm run bench -- --only plan,record
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'reports', 'bench');

// ── Arguments ───────────────────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2).filter((a) => a !== '--');

function flag(name) {
  return argv.includes(`--${name}`);
}

function value(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : fallback;
}

/**
 * How much slower a phone is than the machine running this, running the SAME bundle under Hermes.
 *
 * ⚠️ EVERY FACTOR HERE IS AN ESTIMATE. They are ordered guesses from single-core class, and single-
 * core class is a poor proxy for an interpreter's real bottleneck, which is memory latency and
 * allocation rate. They are here so the report has a shape before anyone owns the device, and the
 * script labels them ESTIMATED wherever they are used. `--baseline` replaces them with a
 * measurement; see the header.
 */
const DEVICES = {
  'flagship-2024': { label: 'flagship 2024 (iPhone 15 / Galaxy S24)', factor: 2 },
  'mid-2020': { label: 'mid-range 2020 (Pixel 4a / iPhone SE 2020)', factor: 5 },
  'old-2018': { label: 'older phone 2018 (iPhone 8 / Galaxy A50)', factor: 8 },
  'budget-2019': { label: 'budget Android (Snapdragon 4xx, 2019)', factor: 14 },
};

const deviceName = value('device', 'old-2018');
const device = DEVICES[deviceName];
if (!device) {
  console.error(`unknown --device "${deviceName}". Known: ${Object.keys(DEVICES).join(', ')}`);
  process.exit(2);
}

const quick = flag('quick');
const stress = flag('stress');
const packDir = value('pack', undefined);
const only = value('only', '');
const jsonPath = value('json', join(outDir, 'latest.json'));
const comparePath = value('compare', undefined);
const baselineMs = Number(value('baseline', ''));
const nodeOnly = flag('node-only');
const hermesOnly = flag('hermes-only');
const isolate = stress || flag('isolate');
const timeoutMs = Number(value('timeout', '180')) * 1000;
const heapMb = Number(value('heap', '4096'));

const OPTIONS = {
  sizes: quick ? [4000, 20000] : [500, 4000, 20000, 60000],
  headline: 20000,
  adversarial: stress,
  samples: quick ? 3 : 7,
  only: only.length > 0 ? only.split(',') : [],
};

if (stress) {
  // The scale question is only answerable past the sizes anyone plans for. 250,000 units is a
  // diglossic learner with two full tracks after a decade — implausible, which is the point: a
  // number that only breaks past implausible is a number nobody has to think about again.
  OPTIONS.sizes = quick ? [20000, 60000] : [20000, 60000, 120000, 250000];
}

// ── The pack ────────────────────────────────────────────────────────────────────────────────────

/**
 * Read a real pack off disk. Reading a file is the HOST's job — the engine has no filesystem — so it
 * happens here and the data is handed in, exactly as `demo.mjs` does it.
 */
function readPack(dir) {
  const at = resolve(process.cwd(), dir);
  const config = JSON.parse(readFileSync(join(at, 'pack.config.json'), 'utf8'));
  const frequency = readFileSync(join(at, 'frequency.txt'), 'utf8');
  const lemmas = {};
  const lemmaFile = join(at, 'lemmas.tsv');
  if (existsSync(lemmaFile)) {
    for (const line of readFileSync(lemmaFile, 'utf8').split('\n')) {
      const tab = line.indexOf('\t');
      if (tab <= 0) continue;
      lemmas[line.slice(0, tab).trim()] = line.slice(tab + 1).trim();
    }
  }
  return { config, data: { frequency, lemmas } };
}

const pack = packDir ? readPack(packDir) : undefined;
if (!pack) {
  console.log(
    '\x1b[33mnote\x1b[0m  no --pack given, so the small built-in fixture is used. Its frequency\n' +
      '      list is ~200 words, which makes every pack number optimistic by a wide margin.\n' +
      '      Run:  npm run bench -- --pack ../packs/de\n',
  );
}

// ── Bundle ──────────────────────────────────────────────────────────────────────────────────────

mkdirSync(outDir, { recursive: true });
const entry = join(outDir, 'entry.ts');
const bundle = join(outDir, 'bench.js');

// A generated entry, so the options are build-time constants and the bundle stays a pure program
// with no argument parsing baked into it — which is what lets the same bytes run under Hermes.
//
// The clock and the heap reader are FEATURE-DETECTED here rather than inside `src/`: `performance`
// exists on Node and may not on Hermes, `process` exists on Node and definitely does not on Hermes,
// and the engine's own lint rules forbid reading a clock in there at all.
writeFileSync(
  entry,
  `import { runBench, benchScenarioIds, sinkValue } from '../../src/testing/bench.js';\n` +
    `const g = globalThis as any;\n` +
    `const perf = g.performance;\n` +
    `const now: () => number =\n` +
    `  perf && typeof perf.now === 'function' ? () => perf.now() : () => g.Date.now();\n` +
    `const heapUsed =\n` +
    `  g.process && typeof g.process.memoryUsage === 'function'\n` +
    `    ? () => g.process.memoryUsage().heapUsed\n` +
    `    : undefined;\n` +
    // Hermes has a global `print` and no guaranteed `console`; Node is the other way round. Picking
    // whichever exists is what lets ONE bundle run on both, and getting it wrong fails at the last
    // line of a run that already did all the work.
    `const emit = (s: string) => {\n` +
    `  if (typeof g.print === 'function') g.print(s);\n` +
    `  else g.console.log(s);\n` +
    `};\n` +
    `const args: string[] = g.process && g.process.argv ? g.process.argv.slice(2) : [];\n` +
    `const baked = ${JSON.stringify(OPTIONS)};\n` +
    `const options = { ...baked` +
    (pack
      ? `, packConfig: ${JSON.stringify(pack.config)}, packData: ${JSON.stringify(pack.data)}`
      : '') +
    ` } as any;\n` +
    `if (args.length > 0 && args[0] !== '--list') options.only = args[0].split(',');\n` +
    `const env = { now, heapUsed, onProgress: (m: string) => { emit('# ' + m); } };\n` +
    `if (args[0] === '--list') {\n` +
    `  emit('__BENCH__' + JSON.stringify(benchScenarioIds(env, options)));\n` +
    `} else {\n` +
    `  const report = runBench(env, options);\n` +
    `  emit('__BENCH__' + JSON.stringify(report));\n` +
    `  emit('# sink ' + sinkValue());\n` +
    `}\n`,
);

console.log('bundling…');
execFileSync(
  'npx',
  [
    'esbuild',
    entry,
    '--bundle',
    // Hermes has no module system, and ES2015 because Hermes 0.13 does not implement every later
    // feature — a bundle it cannot parse looks like a runtime failure rather than a build one.
    '--format=iife',
    '--target=es2015',
    '--platform=neutral',
    `--outfile=${bundle}`,
    '--log-level=warning',
  ],
  { cwd: root, stdio: 'inherit' },
);

// ── Running ─────────────────────────────────────────────────────────────────────────────────────

/** Pull the one report line out of a run's stdout. Everything else is progress. */
function parse(stdout) {
  for (const line of stdout.split('\n')) {
    if (line.startsWith('__BENCH__')) return JSON.parse(line.slice('__BENCH__'.length));
  }
  return undefined;
}

function runNode(args = []) {
  const out = execFileSync(process.execPath, [`--max-old-space-size=${heapMb}`, bundle, ...args], {
    encoding: 'utf8',
    maxBuffer: 64e6,
    timeout: timeoutMs,
  });
  return { ok: true, report: parse(out) };
}

/**
 * One scenario, in its own process.
 *
 * ⚠️ THIS IS THE WHOLE POINT OF `--stress`. An adversarial scenario that exhausts the heap does not
 * return a large number — it kills the process, taking every scenario queued behind it with it. So a
 * crash here is CAUGHT and recorded as that scenario's limit, and the sweep carries on. A benchmark
 * that dies at the first hard input has measured one thing and hidden the rest.
 */
function runIsolated(id) {
  const started = Date.now();
  const run = spawnSync(process.execPath, [`--max-old-space-size=${heapMb}`, bundle, id], {
    encoding: 'utf8',
    maxBuffer: 64e6,
    timeout: timeoutMs,
  });

  if (run.status === 0) {
    const report = parse(run.stdout ?? '');
    if (report && report.results.length > 0) return report.results;
  }

  const stderr = (run.stderr ?? '').trim();
  let why = 'CRASHED';
  if (run.error && run.error.code === 'ETIMEDOUT') why = `TIMEOUT after ${timeoutMs / 1000}s`;
  else if (run.signal === 'SIGTERM') why = `TIMEOUT after ${timeoutMs / 1000}s`;
  else if (/heap out of memory|Allocation failed/i.test(stderr))
    why = `OUT OF MEMORY at ${heapMb}MB`;
  else if (stderr.length > 0) why = `CRASHED: ${stderr.split('\n')[0]}`;

  return [
    {
      id,
      group: 'adversarial',
      label: id,
      budgetMs: 0,
      size: 0,
      medianMs: Infinity,
      minMs: Infinity,
      maxMs: Infinity,
      samples: 0,
      iterations: 0,
      failed: true,
      note: `${why} (after ${((Date.now() - started) / 1000).toFixed(1)}s)`,
    },
  ];
}

let nodeReport;
if (!hermesOnly) {
  if (isolate) {
    console.log('listing scenarios…');
    const listed = parse(execFileSync(process.execPath, [bundle, '--list'], { encoding: 'utf8' }));
    const ids = listed ?? [];
    console.log(`running ${ids.length} scenarios on node, one process each…`);
    const results = [];
    let calibrationMs = 0;
    let packInfo = { id: '?', lemmas: 0, inflections: 0, real: Boolean(pack) };
    for (const id of ids) {
      process.stdout.write(`  ${id} … `);
      const rows = runIsolated(id);
      const bad = rows.find((r) => !Number.isFinite(r.medianMs));
      console.log(bad ? `\x1b[31m${bad.note}\x1b[0m` : 'ok');
      results.push(...rows);
    }
    // One extra cheap run purely for the kernel and the pack facts, which every isolated run
    // recomputes and none of them is authoritative about.
    const meta = runNode(['pack.check']).report;
    if (meta) {
      calibrationMs = meta.calibrationMs;
      packInfo = meta.pack;
    }
    nodeReport = { calibrationMs, pack: packInfo, results };
  } else {
    console.log('running on node…');
    nodeReport = runNode().report;
  }
}

/** Places a Hermes VM might live, in order of preference. Same list as the fingerprint lane. */
function findHermes() {
  if (process.env['HERMES_BIN']) return process.env['HERMES_BIN'];
  for (const candidate of [
    join(root, '.hermes', 'hermes'),
    join(root, '..', '.hermes', 'hermes'),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  const which = spawnSync('command', ['-v', 'hermes'], { shell: true, encoding: 'utf8' });
  const found = (which.stdout ?? '').trim();
  return found.length > 0 ? found : undefined;
}

let hermesReport;
let hermesVersion = '';
const hermes = nodeOnly ? undefined : findHermes();

if (hermes) {
  console.log(`running on hermes (${hermes})… this is the number that matters`);
  const run = spawnSync(hermes, [bundle], {
    encoding: 'utf8',
    maxBuffer: 64e6,
    timeout: timeoutMs,
  });
  if (run.status === 0) {
    hermesReport = parse(run.stdout ?? '');
    hermesVersion = (spawnSync(hermes, ['--version'], { encoding: 'utf8' }).stdout ?? '').split(
      '\n',
    )[0];
  } else {
    console.log(
      `\x1b[31mFAIL\x1b[0m hermes could not complete the set — that is itself a finding.\n` +
        `       ${(run.stderr ?? run.stdout ?? '').trim().split('\n')[0] ?? ''}`,
    );
  }
} else if (!nodeOnly) {
  console.log(
    `\x1b[33mSKIP\x1b[0m hermes — no VM found. Every number below is NODE, with a JIT, which the\n` +
      `      phone does not have. The device projection is correspondingly weaker.\n` +
      `      Get a VM with:  make hermes-install\n`,
  );
}

// ── The device projection ───────────────────────────────────────────────────────────────────────

/**
 * How much slower the target device is than this machine.
 *
 * Measured when `--baseline` carries a real device's kernel time, estimated otherwise — and the
 * report says which, every time, because the difference is the difference between a number you can
 * act on and a number you made up.
 */
function slowdown() {
  const hostKernel = hermesReport?.calibrationMs ?? nodeReport?.calibrationMs;
  if (Number.isFinite(baselineMs) && baselineMs > 0 && hostKernel > 0) {
    return { factor: baselineMs / hostKernel, measured: true, label: `--baseline ${baselineMs}ms` };
  }
  return { factor: device.factor, measured: false, label: device.label };
}

const projection = slowdown();

// ── Output ──────────────────────────────────────────────────────────────────────────────────────

function ms(n) {
  if (!Number.isFinite(n)) return '   —   ';
  if (n >= 1000) return `${(n / 1000).toFixed(2)}s`;
  if (n >= 1) return `${n.toFixed(1)}ms`;
  return `${(n * 1000).toFixed(0)}µs`;
}

function bytes(n) {
  if (n === undefined || n === null) return '';
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)}KB`;
  return `${n}B`;
}

function pad(s, width, right = false) {
  const text = String(s);
  // Colour codes are zero-width to a reader and full-width to `.length`, so they are stripped
  // before measuring. Getting this wrong is how a table that looks fine locally shreds in CI.
  // Built rather than written as a literal: an escape character inside a regex literal is a
  // control character, which `no-control-regex` rejects — correctly, in general.
  const bare = text.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g'), '');
  const fill = ' '.repeat(Math.max(0, width - bare.length));
  return right ? fill + text : text + fill;
}

const GROUPS = [
  ['launch', 'APP LAUNCH — cold start, before the first frame'],
  ['session', 'OPENING A SESSION'],
  ['answer', 'ONE ANSWER — this runs while a finger is on the screen'],
  ['save', 'SAVING'],
  ['read', 'READING — per screen of text'],
  ['adversarial', 'ADVERSARIAL — what it cannot take'],
];

const byId = new Map();
for (const r of nodeReport?.results ?? []) byId.set(r.id, { node: r });
for (const r of hermesReport?.results ?? []) {
  const existing = byId.get(r.id) ?? {};
  existing.hermes = r;
  byId.set(r.id, existing);
}

const previous = comparePath
  ? new Map((JSON.parse(readFileSync(comparePath, 'utf8')).rows ?? []).map((r) => [r.id, r]))
  : undefined;

/**
 * A time that is really a time.
 *
 * ⚠️ NOT the same question as `Number.isFinite`, and the difference was a real false green.
 * `runBench` marks a scenario that threw with `medianMs: Infinity` — correct in memory, and gone by
 * the time it crosses the process boundary, because `JSON.stringify(Infinity)` is `null`. Multiplied
 * by a device factor that is `0`, compared against a budget it is under, printed in green. Six
 * genuine Hermes failures at 250,000 units were reported as passing before this existed.
 */
function realMs(result) {
  if (!result || result.failed === true) return undefined;
  return typeof result.medianMs === 'number' && Number.isFinite(result.medianMs)
    ? result.medianMs
    : undefined;
}

const rows = [];
for (const [id, pair] of byId) {
  const base = pair.node ?? pair.hermes;
  if (!base) continue;
  // The phone's runtime when we have it, the laptop's otherwise. Never a blend: an average of two
  // runtimes is a number describing no machine that exists.
  const source = pair.hermes ?? pair.node;
  const sourceMs = realMs(source);
  const deviceMs = sourceMs === undefined ? Infinity : sourceMs * projection.factor;
  rows.push({
    id,
    group: base.group,
    label: base.label,
    size: base.size,
    budgetMs: base.budgetMs,
    nodeMs: realMs(pair.node),
    hermesMs: realMs(pair.hermes),
    deviceMs,
    over: Number.isFinite(deviceMs) ? deviceMs / base.budgetMs : Infinity,
    outputBytes: base.outputBytes,
    // The failing runtime's message wins: "it broke on the phone" is the fact worth carrying, and a
    // successful Node note would otherwise paper over it.
    note:
      (pair.hermes?.failed === true ? pair.hermes.note : undefined) ?? pair.node?.note ?? base.note,
  });
}

console.log('');
console.log('\x1b[1m@luraty/engine — bench\x1b[0m');
console.log('');
console.log(`  host      node ${process.version} · ${process.platform} ${process.arch}`);
const packFacts = nodeReport?.pack ?? hermesReport?.pack;
if (packFacts) {
  console.log(
    `  pack      ${packFacts.id} · ${packFacts.lemmas.toLocaleString()} lemmas · ` +
      `${packFacts.inflections.toLocaleString()} inflections` +
      (packFacts.real ? '' : '  \x1b[33m(built-in fixture — not a real pack)\x1b[0m'),
  );
}
console.log(
  `  runtime   ${hermesReport ? `hermes ${hermesVersion.trim()}  \x1b[32m(the phone's engine)\x1b[0m` : '\x1b[33mnode only — no Hermes VM, so no JIT-free number\x1b[0m'}`,
);
if (nodeReport?.calibrationMs) {
  console.log(`  kernel    node ${ms(nodeReport.calibrationMs)}`);
}
if (hermesReport?.calibrationMs) {
  console.log(
    `  kernel    hermes ${ms(hermesReport.calibrationMs)}   \x1b[2m← run this bundle on a real phone, pass its kernel time as --baseline\x1b[0m`,
  );
}
console.log(
  `  device    ${projection.label} · ×${projection.factor.toFixed(1)} ` +
    (projection.measured
      ? '\x1b[32mMEASURED\x1b[0m'
      : '\x1b[33mESTIMATED — not measured, see --baseline\x1b[0m'),
);
console.log('');

for (const [group, heading] of GROUPS) {
  const groupRows = rows.filter((r) => r.group === group);
  if (groupRows.length === 0) continue;
  groupRows.sort((a, b) => a.size - b.size || a.id.localeCompare(b.id));

  const budget = groupRows[0].budgetMs;
  console.log(`\x1b[1m${heading}\x1b[0m  \x1b[2m— budget ${budget}ms on device\x1b[0m`);
  console.log(
    '  ' +
      pad('scenario', 34) +
      pad('size', 10, true) +
      pad('node', 10, true) +
      pad('hermes', 10, true) +
      pad('device', 10, true) +
      '  verdict',
  );

  for (const r of groupRows) {
    let verdict;
    if (!Number.isFinite(r.deviceMs)) verdict = `\x1b[31m${r.note ?? 'FAILED'}\x1b[0m`;
    else if (r.over <= 1) verdict = `\x1b[32mok\x1b[0m`;
    else verdict = `\x1b[31m×${r.over.toFixed(1)} over budget\x1b[0m`;

    let delta = '';
    const before = previous?.get(r.id);
    if (before && Number.isFinite(before.deviceMs) && Number.isFinite(r.deviceMs)) {
      const change = (r.deviceMs - before.deviceMs) / before.deviceMs;
      if (Math.abs(change) >= 0.15) {
        const colour = change > 0 ? '\x1b[31m' : '\x1b[32m';
        delta = `  ${colour}${change > 0 ? '+' : ''}${(change * 100).toFixed(0)}%\x1b[0m vs before`;
      }
    }

    console.log(
      '  ' +
        pad(r.id, 34) +
        pad(r.size.toLocaleString(), 10, true) +
        pad(ms(r.nodeMs ?? Infinity), 10, true) +
        pad(ms(r.hermesMs ?? Infinity), 10, true) +
        pad(ms(r.deviceMs), 10, true) +
        '  ' +
        verdict +
        delta,
    );
    if (r.outputBytes) {
      console.log(`  ${pad('', 34)}\x1b[2m${bytes(r.outputBytes)} written every save\x1b[0m`);
    }
  }
  console.log('');
}

// A limit and a slow path are different findings and are reported separately. "It took too long" is
// a budget conversation; "it threw" is a ceiling, and a ceiling buried in a list sorted by ratio is
// a ceiling nobody reads.
const failures = rows.filter((r) => !Number.isFinite(r.deviceMs));
const overBudget = rows
  .filter((r) => Number.isFinite(r.deviceMs) && r.over > 1)
  .sort((a, b) => b.over - a.over);

console.log('\x1b[1mVERDICT\x1b[0m');
if (failures.length > 0) {
  console.log(`  \x1b[1mHARD LIMITS\x1b[0m — these did not return a number at all:`);
  for (const r of failures) {
    console.log(`  \x1b[31m✗\x1b[0m ${pad(r.id, 30)} ${r.note ?? 'failed'}`);
  }
  console.log('');
}
if (overBudget.length === 0 && failures.length === 0) {
  console.log(
    `  Every scenario fits its budget on ${projection.label}` +
      (projection.measured ? '.' : ' — on an ESTIMATED multiplier. Calibrate before believing it.'),
  );
} else {
  for (const r of overBudget.slice(0, 8)) {
    console.log(
      `  \x1b[31m✗\x1b[0m ${pad(r.id, 30)} ${ms(r.deviceMs)} against a ${r.budgetMs}ms budget` +
        ` (×${r.over.toFixed(1)})`,
    );
  }
  if (overBudget.length > 8) console.log(`    … and ${overBudget.length - 8} more`);
}
console.log('');

const payload = {
  when: new Date().toISOString(),
  host: { node: process.version, platform: process.platform, arch: process.arch },
  pack: packFacts,
  device: { name: deviceName, ...projection },
  kernel: { node: nodeReport?.calibrationMs, hermes: hermesReport?.calibrationMs },
  options: OPTIONS,
  rows,
};
writeFileSync(jsonPath, JSON.stringify(payload, null, 2));
console.log(`  full report: ${jsonPath}`);
console.log(`  compare later with:  npm run bench -- --compare ${jsonPath}`);
console.log('');

// Exit 0 even when something is over budget. This is a measurement, not a gate — see the header.
process.exit(0);
