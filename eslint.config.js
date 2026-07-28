import js from '@eslint/js';
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
          message:
            'Determinism: no argless `new Date()` in the engine. Pass the day in as data.',
        },
      ],
    },
  },

  // Config files sit outside tsconfig's `include`, so type-aware rules have no program for them.
  {
    files: ['*.config.js', '*.config.ts'],
    ...tseslint.configs.disableTypeChecked,
  },
);
