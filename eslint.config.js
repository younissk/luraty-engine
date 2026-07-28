import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules/**', 'dist/**', 'coverage/**'] },

  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // ── The determinism rule ────────────────────────────────────────────────────────────────────
  // Recovered from the pre-reset config rather than re-derived (it was tuned over weeks):
  //   git show refs/tags/archive/pre-reset-2026-07-27:mobile/eslint.config.js
  //
  // WHY IT MATTERS HERE. The engine's one load-bearing claim is that a session replays identically
  // from a seed — that is what makes an adaptive system testable at all, since you cannot A/B a
  // scheduler on one human. Wall-clock reads and unseeded randomness break replay silently: nothing
  // errors, the numbers are just quietly different next time.
  //
  // NOTE: the archived config carried an eleven-file exempt list (kv.ts, supabase.ts, store.ts …).
  // That list is deliberately NOT reproduced. Every file on it was an I/O adapter, and I/O adapters
  // no longer live in this package. If an exemption ever feels necessary in here, that is the signal
  // that something has landed on the wrong side of the boundary — move it out, don't exempt it.
  {
    files: ['src/**/*.ts'],
    ignores: ['src/**/*.test.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message:
            'Determinism: no Date.now() in the engine. `day` is already on Profile and on Evidence — take the time as data, so a session replays from a seed.',
        },
        {
          selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message:
            'Determinism: no Math.random() in the engine. Take a `seed` in the options and derive draws from it (hash(seed, day, key)), so call order cannot change a decision.',
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'Determinism: no argless `new Date()` in the engine. Pass the day in as data.',
        },

        // ── The Hermes / ICU rules ──────────────────────────────────────────────────────────────
        // Hermes ships WITHOUT full ICU. Every API below exists in Node and in your browser, so
        // `tsc` is green, the tests pass, and the phone is where it breaks — either throwing or,
        // worse, quietly returning a different answer than it did on your laptop.
        //
        // This is not hypothetical for THIS package: the two language-pack functions most likely to
        // be written first are `split` (text → pieces) and `compare` (fold accents / fold
        // diacritics), and the idiomatic implementations of those are `Intl.Segmenter` and
        // `normalize()` / `localeCompare()`. The obvious code is the broken code.
        {
          selector: "MemberExpression[object.name='Intl']",
          message:
            'Runtime fidelity: no Intl in the engine. Hermes ships without full ICU, so this is green on Node and broken on a phone. Locale-aware behaviour belongs in a language pack as explicit data (a collation table, an explicit character map), not in a runtime API.',
        },
        {
          selector: "CallExpression[callee.property.name='localeCompare']",
          message:
            'Runtime fidelity: no localeCompare() in the engine — its ordering depends on ICU data Hermes does not ship. Compare canonical keys produced by the language pack instead.',
        },
        {
          selector: 'CallExpression[callee.property.name=/^toLocale(Lower|Upper)Case$/]',
          message:
            'Runtime fidelity: no toLocaleLowerCase/UpperCase in the engine (locale-dependent, ICU-backed). Use toLowerCase/toUpperCase, or fold the case explicitly in the language pack.',
        },
        {
          selector: "CallExpression[callee.property.name='normalize']",
          message:
            'Runtime fidelity: no String.prototype.normalize() in the engine — Unicode normalization is ICU-backed and unreliable on Hermes. Diacritic folding is a language-pack concern: ship it as an explicit character map.',
        },
      ],
    },
  },

  // Config files sit outside tsconfig's `include`, so type-aware rules have no program for them.
  {
    files: ['*.config.js', '*.config.ts', 'commitlint.config.js'],
    ...tseslint.configs.disableTypeChecked,
  },

  // MUST BE LAST. eslint-config-prettier only turns rules OFF — every stylistic rule that would
  // fight the formatter. Anything placed after it could switch one back on and reintroduce the
  // fight, which shows up as a file that eslint --fix and prettier --write edit forever in turn.
  //
  // Note this is the `eslint-config-prettier` approach, NOT `eslint-plugin-prettier`: running the
  // formatter as a lint rule reports every whitespace difference as an error and is markedly
  // slower. Prettier formats, eslint reasons about code. Separate tools, separate jobs.
  prettierConfig,
);
