# Changesets

Version bumps and the changelog are driven from this folder.

## Why it is here while the package is unpublished

`private: true` means nothing is going to npm yet, and `privatePackages.version: true` in the config
is what makes changesets still track versions for a private package. So today this buys one thing:
**the changelog is written by the person who made the change, at the time they made it**, instead of
being reconstructed from `git log` months later by someone guessing at intent.

It is deliberately _not_ automated. `semantic-release` derives the version from commit messages and
removes the human from the decision — which is exactly the wrong trade for a `0.x` engine whose API
is still being designed, where "is this breaking?" is a judgement call about a contract, not a
lookup on a commit prefix.

## Using it

```bash
npx changeset          # describe the change and pick patch/minor/major
npx changeset version  # apply the bumps and fold entries into CHANGELOG.md
```

Not every commit needs one. A changeset is for a change that alters **what a consumer can rely on** —
an export, a behaviour, an invariant. Tooling, tests, docs and refactors that keep the surface
identical do not.

⚠️ **`ENGINE_API_VERSION` in `src/index.ts` is pinned to `package.json` by `src/boundary.test.ts`.**
So `changeset version` bumps the manifest and the test then fails until the constant is updated in
the same commit. That is intentional — it is what stops the version becoming a comfortable lie.
