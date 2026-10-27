# Inkwell Spec

Single source of truth for every format spoken by more than one Inkwell repo: the IR, the Figma sync protocol, the debug and hot-reload protocol, menu JSON and INI formats, the pack manifest and the packs index. The full design is in `Inkwell Design Spec.md` (workspace root); this repo is also the right home for that document's canonical copy.

## Commands

Use yarn.

- `yarn test`: Vitest (includes a check that `schemas/` is up to date)
- `yarn typecheck`: `tsc --noEmit`
- `yarn build`: emit `dist/`
- `yarn gen:schemas`: regenerate `schemas/*.schema.json` from Zod (run after any schema change)

## Stack

TypeScript, Zod schemas, generated JSON Schemas, protocol docs. Published to npm for the TypeScript repos; the Inkwell Runtime (C++) mirrors the INI parser, the bridge and Papyrus tables and the co-save constants by hand and is kept in step by shared test vectors (`Inkwell-Runtime/test-vectors/ini/`, produced by the Spec's `parseIni`/`resolveMenu`).

## Source files

`src/`: `ir`, `overlay`, `patch`, `protocol`, `hash`, `version` (migrations), `graph` (graph documents), `pack` (manifest, node definitions, `packs.lock`), `pins` (pin types and `pinCompat`), `menu` (menu JSON `MenuDef`, `MenuSettings`, `normalizeSwfPath`, `MENU_SLOTS`), `ini` (user INI model, `parseIni`, `writeIni`, `writeDefaultModIni`, `resolveMenu`), `runtime` (runtime version packing and messages, AS2 bridge and Papyrus API tables, messaging and co-save constants), `runtimeProtocol` (debug protocol, `RUNTIME_PROTOCOL`, separate from the Figma `PROTOCOL_VERSION`), `localization` (0.4: the project table, `$KEY` rules, Skyrim translation file text, pseudo-localization), `themes` (0.4: Figma variable collections as `Swf.themes`, binding keys, `applyTheme`) and `contract` (0.5: menu contract layer files `ContractLayer`, `mergeContract`, `checkContract`).

Contract data: `contracts/<menu>/<layer>.json` (layers `engine`, `skyui52`, `skyui6`; a mod layer is `mod-<modId>.json`; schema `schemas/contract-layer.schema.json`; shipped in the package). `InventoryMenu` comes from spike S-B (`TEST-IN-GAME-0.5.md`); the editor keeps a copy (`yarn sync:contracts` there). SkyUI layers hold names and values only, never SkyUI code. The older draft stays in `spikes/inventory-contract/` as the source record. A menu replacement picks its contract with IR `target.contract` (the menu name) and its layers with `target.layers` (engine first; spec 8 replaced `target.base`, migration `baseToLayers`).

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
- **Mod ids are letters and digits only,** starting with a letter (no `_`, no space): the id becomes a Papyrus script name and part of file and class names. The editor cleans an id by removing bad characters (`Editor src/shared/modId.ts`); anything that takes an id from outside should do the same.
- **Breaking changes need a compatibility note** listing which consumer versions speak which spec version.
