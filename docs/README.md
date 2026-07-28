# Documentation

Plain markdown, kept next to the code it describes.

```
docs/
  concepts/    why the engine is shaped the way it is — the invariants a newcomer will break
    determinism.md          the one load-bearing claim, and what it forbids
    the-boundary.md         what may not enter this package, and how that is enforced
    selection.md            how plan() chooses, with a worked example  ← start here
  guides/      how to do a specific thing, start to finish
    adding-a-language.md    the pack contract as data
    building-a-client.md    where your app ends and the engine begins  ← and here
```

**New to the engine?** Read `concepts/selection.md` then `guides/building-a-client.md`. Between them
they cover what the engine decides, what it refuses to decide, and why.

The **API reference is not written by hand.** When the barrel has real exports, TypeDoc generates it
from TSDoc comments in the source, so it cannot drift from the code. Hand-written API docs are a
confident lie three commits later.

## Why there is no docs site (yet), and why it will never live in this package

This repo is deliberately not MkDocs. MkDocs cannot read TypeScript, so the API reference would
either not exist or be hand-maintained, and it puts a Python toolchain in a TypeScript project —
every contributor then needs two runtimes to build the docs.

More importantly, **no site generator may be installed in this package**. VitePress, Docusaurus,
Starlight and Nextra each pull Vue, React or Astro into `node_modules`, and from that moment
`import { ref } from 'vue'` typechecks green inside `src/`. The engine's boundary is enforced by
module resolution, so a transitive UI framework silently dissolves it — `src/boundary.test.ts` holds
an allowlist specifically to stop this. When a site is genuinely wanted it goes in a **sibling
package** where its dependencies cannot reach the engine.

## Writing here

- **Concepts explain the "why".** They exist because the engine has non-obvious invariants —
  determinism, purity, one profile per language, the language-pack contract — that a newcomer will
  violate reasonably, having never been told. An API reference cannot carry that.
- **Examples must be compiled, not pasted.** A fenced code block in markdown is a string that
  nothing checks. Prefer extracting from a real test file, so the example breaks when the code does.
- **Mermaid diagrams render on GitHub.** Use them for state machines and flow; skip them for prose
  that reads fine as prose.
