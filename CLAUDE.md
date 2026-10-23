# Inkwell Spec

Single source of truth for every format spoken by more than one Inkwell repo: the IR, the Figma sync protocol, the debug and hot-reload protocol, menu JSON and INI formats, the pack manifest and the packs index. The full design is in `Inkwell Design Spec.md` (workspace root); this repo is also the right home for that document's canonical copy.

## Commands

Use yarn.

- `yarn test`: Vitest (includes a check that `schemas/` is up to date)
- `yarn typecheck`: `tsc --noEmit`
- `yarn build`: emit `dist/`
- `yarn gen:schemas`: regenerate `schemas/*.schema.json` from Zod (run after any schema change)

## Stack

TypeScript, Zod schemas, generated JSON Schemas, protocol docs. Published to npm for the TypeScript repos; the runtime generates or validates its C++ types against the same schemas.

## Rules that are easy to break

- **Zod is the source of truth.** JSON Schemas and docs are generated from it, never edited by hand.
- **Every change is versioned.** Bump `specVersion` and add a migration function for IR changes, so old projects always open. Protocol changes bump the protocol version used in handshakes.
- **Spec first, consumers second.** A format change lands and is released here before any consumer repo uses it.
- **Never drop unknown data:** schemas keep unknown keys (`extra`, loose objects) so round-trips stay lossless.
- **Design-level IR, not SWF-level:** keep cubic curves, stroke alignment and auto-layout as Figma means them; approximations belong to the compiler.
- **Flat node map keyed by Figma node ID;** visual IR and overlay are separate schemas sharing those IDs.
- **Text is an array of style runs,** even while 0.1 allows only one run.
- **No diagnostics in the IR.** Issues are derived, never stored.
- **Menu JSON `swf` is relative to `Data/` including `Interface/` and `.swf`;** the runtime normalizes it for the engine. Contract entries record whether `required` is proven or only inferred.
- **Breaking changes need a compatibility note** listing which consumer versions speak which spec version.
