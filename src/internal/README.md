# src/internal — helpers that are nobody's business

Small mechanical utilities used by `core/`: the seeded hash, canonical key ordering, `assertNever`,
and similar.

**Nothing here is ever exported from `src/index.ts`.** That is the entire point of the folder — the
barrel is a hand-written allowlist, and a helper leaking into it becomes a promise to strangers that
you then cannot change.

If something here starts to look like a decision the engine makes rather than a mechanism it uses,
it belongs in `core/`.
