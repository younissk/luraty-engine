import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // `reports/` holds generated Stryker and coverage output — thousands of lines of bundled HTML
  // and JS that are not source and must never be linted.
  { ignores: ['node_modules/**', 'dist/**', 'coverage/**', 'reports/**', '.stryker-tmp/**'] },

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

  // ── One stylistic rule turned off, deliberately ──────────────────────────────────────────────
  // `consistent-type-definitions` wants `interface` for object shapes. This package wants `type`,
  // for two reasons that are about the contract rather than taste:
  //
  // 1. **Interfaces are open.** Declaration merging means a consumer can reopen `interface Profile`
  //    and add fields to it from their own code. For a package whose types ARE the public contract,
  //    a shape that anyone can extend from the outside is a shape we do not fully control. A `type`
  //    alias cannot be merged into.
  // 2. **Consistency is not optional here.** `UnitState` is a union, so it MUST be a `type`.
  //    Following this rule would mean the union is a `type` and its two variants are `interface`s,
  //    in the same file, describing one idea. Mixed declaration styles in a model layer make the
  //    reader wonder what the difference signifies. It signifies nothing.
  //
  // Note this is only about *declaration style*. Everything else in stylisticTypeChecked stays on.
  {
    files: ['src/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-definitions': 'off',

      // ── no-misused-spread, off package-wide ────────────────────────────────────────────────────
      // The rule warns that spreading a string yields code points, which can split emoji ZWJ
      // sequences, and recommends `Intl.Segmenter` instead.
      //
      // `Intl` is BANNED in this package — Hermes ships without full ICU, and the ban is enforced
      // two rules above. So the rule's only remedy is unavailable here by design, and a rule whose
      // fix you have already outlawed is a rule that produces nothing but inline suppressions.
      //
      // Code points are also exactly what every use here wants: building a Set of single characters
      // for a punctuation table, and an alphabet of Arabic letters for a test generator. Neither
      // contains an emoji, and neither ever will.
      '@typescript-eslint/no-misused-spread': 'off',
    },
  },

  // ── Test fixtures may assert non-null ─────────────────────────────────────────────────────────
  // strictTypeChecked and stylisticTypeChecked genuinely contradict each other here:
  // `non-nullable-type-assertion-style` rewrites `variety('ar') as Variety` into `variety('ar')!`,
  // and `no-non-null-assertion` then rejects that. There is no way to satisfy both.
  //
  // Resolved in favour of `!` IN TESTS ONLY. A constructor returns `T | undefined` because its
  // input is untrusted — but a test fixture is a literal the author just typed, so the undefined
  // case is not a runtime possibility, it is a typo. `!` makes a typo crash immediately and
  // loudly, which is exactly what you want from a fixture. In `src/` the ban stands: there the
  // input really is untrusted, and `!` would be a lie.
  {
    files: ['src/**/*.test.ts'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
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
