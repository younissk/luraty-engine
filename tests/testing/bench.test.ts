import { describe, expect, it } from 'vitest';

import {
  BUDGET,
  benchScenarioIds,
  failedResult,
  runBench,
  sinkValue,
  type BenchEnv,
  type BenchResult,
} from '../../src/testing/bench.js';

/**
 * Tests for the benchmark harness itself.
 *
 * ⚠️ **NOT A PERFORMANCE TEST, and the distinction is the whole reason this file can exist at all.**
 * Nothing in here asserts that anything is fast. A wall-clock assertion fails on a busy laptop and
 * passes on a quiet one, and the gate would be red for reasons no commit caused. What is tested is
 * the harness's own contract: that it measures every scenario, that the numbers it reports are
 * shaped right, and — the one that was a live bug — that a failure still reads as a failure after a
 * round trip through JSON.
 *
 * ⚠️ **THE CLOCK IS A COUNTER, not a timer.** `now()` advances by a fixed step per call, which makes
 * every duration in here a known constant and the whole file deterministic and fast. It also proves
 * the harness never reads a clock of its own: if it did, these numbers would not come out exact.
 *
 * @module
 */

/** Advances 100 ms per read, so a batch always measures 100 ms exactly regardless of iterations. */
function fakeClock(): BenchEnv {
  let t = 0;
  return {
    now: () => {
      t += 100;
      return t;
    },
  };
}

/** Small enough to be instant; large enough that `plan` has something to choose between. */
const SMALL = { sizes: [40, 120], headline: 40, samples: 3 } as const;

describe('runBench', () => {
  const report = runBench(fakeClock(), SMALL);

  it('measures every scenario it says it will', () => {
    // The listing path and the running path must agree, because the driver isolates scenarios by
    // asking for ids first and spawning one process per id. A scenario reachable by `runBench` and
    // invisible to `benchScenarioIds` would be silently dropped from every `--stress` run.
    expect(report.results.map((r) => r.id)).toEqual(benchScenarioIds(fakeClock(), SMALL));
  });

  it('gives every scenario a unique id', () => {
    const ids = report.results.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('runs every scenario without failing', () => {
    // A failure here is not a slow machine — it is the harness or the engine throwing on ordinary
    // input, which no timing test would report and this one names.
    const broken = report.results.filter((r) => r.failed === true);
    expect(broken.map((r) => `${r.id}: ${r.note ?? ''}`)).toEqual([]);
  });

  it('gives each scenario the budget for its group, and no other', () => {
    for (const result of report.results) {
      expect(result.budgetMs).toBe(BUDGET[result.group]);
    }
  });

  it('reports the fake clock verbatim, so nothing is reading a real one', () => {
    // Every batch is exactly one clock step, so a harness that consulted `Date.now()` anywhere would
    // produce something other than 100 here.
    for (const result of report.results) {
      expect(result.medianMs).toBe(100 / result.iterations);
    }
  });

  it('measures the profile at each requested size', () => {
    for (const size of SMALL.sizes) {
      expect(report.results.some((r) => r.id === `plan.${String(size)}`)).toBe(true);
    }
  });

  it('reports what a save actually costs in bytes', () => {
    // The most load-bearing number in the report, and the only one that is exact rather than timed:
    // it is what a phone writes to storage every save. It must also GROW with the profile — a
    // constant here would mean the sized fixtures collapsed onto one, which is exactly what the
    // Hermes loop-capture bug did before it was found.
    const bytes = SMALL.sizes.map(
      (size) => report.results.find((r) => r.id === `serialize.${String(size)}`)?.outputBytes ?? 0,
    );
    expect(bytes[0]).toBeGreaterThan(0);
    expect(bytes[1]).toBeGreaterThan(bytes[0] ?? 0);
  });

  it('actually did the work', () => {
    // The sink is what stops a bundler proving the timed calls have no effect and deleting them. A
    // zero here means every measurement above timed an empty loop.
    expect(sinkValue()).not.toBe(0);
  });
});

describe('a scenario that throws', () => {
  const scenario = { id: 'x', group: 'session', label: 'x', size: 1 } as const;
  const result = failedResult(scenario, new Error('Property storage exceeds 196607 properties'));

  it('names the limit rather than dropping the row', () => {
    expect(result.note).toContain('196607');
    expect(result.medianMs).toBe(Infinity);
  });

  it('SURVIVES JSON as a failure', () => {
    // ⚠️ THE REGRESSION TEST FOR A REAL FALSE GREEN. `medianMs: Infinity` reads correctly in memory
    // and is `null` the moment the report crosses a process boundary; `null * deviceFactor` is `0`,
    // which is under every budget, so six genuine Hermes failures at 250,000 units printed as `ok`.
    //
    // The assertion is deliberately in two halves: the first pins the trap (so nobody "fixes" it by
    // assuming Infinity round-trips), the second pins the escape.
    const roundTripped = JSON.parse(JSON.stringify(result)) as BenchResult;
    expect(roundTripped.medianMs).toBeNull();
    expect(roundTripped.failed).toBe(true);
  });
});
