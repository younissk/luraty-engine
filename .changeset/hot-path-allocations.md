---
'@luraty/engine': patch
---

Halve the text layer. Behaviour-preserving — the 447-test suite, the wire golden and the 897-check
cross-runtime fingerprint all passed unchanged, which for a rewrite of `internal/text.ts` is the
proof that matters.

Hermes, 20,000-unit profile, real German pack:

|                                   | before | after      |      |
| --------------------------------- | ------ | ---------- | ---- |
| `createPack` (cold start)         | 323 ms | **150 ms** | −54% |
| `key` × 1,000 tokens (per screen) | 7.3 ms | **3.4 ms** | −53% |
| `compare` × 100 (per answer)      | 786 µs | **359 µs** | −54% |
| `coverage`                        |        |            | −48% |
| `plan` (per session)              | 53 ms  | **37 ms**  | −38% |
| `serialize` (per save)            | 79 ms  | **57 ms**  | −37% |
| `summarize`                       | 20 ms  | **13 ms**  | −35% |

Three causes, all the same shape — **the obvious code allocates**:

- **Every normalize step was `for (const ch of s) out += ch`**: a one-character string per
  character, a concatenation per character, and a fresh copy _even when nothing changed_. Most words
  are untouched by most steps — a German lemma has no punctuation to strip — so the common case now
  scans and returns the input **by identity**. Tables are keyed by code point, so nothing is
  materialised unless a substitution fires, and unchanged runs are copied with one `slice`.
  Iteration stays code-point-exact; the fingerprint pushes surrogate pairs through all eight steps
  on both runtimes to prove it.
- **`Object.entries` in `serialize`, `summarize` and `createPack`** materialises one throwaway
  two-element array per unit before the loop body runs once. In `serialize` the comparator was
  `([a], [b]) => …`, which **destructures both arrays on every comparison** — roughly 280,000
  destructures inside one sort of a 20,000-unit profile.
- **`plan` now picks its comparator once.** The priority tier is a no-op when the host names
  nothing, but a comparator runs O(n log n) times, so the no-op still cost two `Map` lookups per
  comparison to reach a branch that could never be taken.

`record` is untouched. Batching a session into one call remains the host's largest lever — the copy
is per CALL, so twenty singles cost 8× one batch of twenty at 20,000 units.
