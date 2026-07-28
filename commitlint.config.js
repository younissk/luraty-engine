/**
 * Conventional commits, enforced by the `commit-msg` hook.
 *
 * The scope list is CLOSED on purpose. An open scope list drifts into noise within a month
 * (`feat(stuff):`, `fix(misc):`), and the whole point of a scope is that you can read the log and
 * know which layer moved. Adding one is a deliberate edit here.
 *
 * Note `engine` is deliberately NOT a scope — everything in this repository is the engine, so it
 * carries zero information. Use the layer instead.
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      [
        'core', // the pure functions: plan, record, coverage, serialize
        'model', // the types: Profile, UnitState, Evidence, Session
        'pack', // the language-pack contract and its implementations
        'ci', // workflows, hooks, lint, formatting, tooling
        'docs', // markdown, TSDoc, examples
        'deps', // dependency bumps (what Dependabot uses)
      ],
    ],
    // A scope is optional — a change that genuinely spans layers should not be forced to lie about
    // which one it touched.
    'scope-empty': [0],
    // The default is 100. Long enough to be descriptive, short enough to read in `git log --oneline`.
    'header-max-length': [2, 'always', 100],
    // The body is where "why" goes, and why is the only thing the diff cannot tell you.
    'body-max-line-length': [2, 'always', 100],
  },
};
