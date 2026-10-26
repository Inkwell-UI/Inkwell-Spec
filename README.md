# @inkwell-ui/spec

Zod schemas for Inkwell's shared formats (visual IR, overlay, graphs, node packs, sync patches, spec versioning, and for the Inkwell Runtime the menu JSON, user INI, runtime requirement, saved-variable record layout and the debug protocol). Spec version 6, Figma protocol 5, runtime protocol 1. Private for now. See `CLAUDE.md` for the rules and `Inkwell Design Spec.md` (workspace root) for the design.

- `src/` Zod source of truth: `ir.ts`, `overlay.ts`, `patch.ts` (with pure `applyPatch`: `remove` deletes the whole subtree; `move` with an unknown node or parent throws `PatchError`, and a failing patch applies nothing), `version.ts` (`SPEC_VERSION`, `migrate`), `graph.ts`, `pack.ts`, `pins.ts`, `protocol.ts`, `hash.ts`, and the 0.3 runtime formats: `menu.ts` (`MenuDef`, `MenuSettings`), `ini.ts` (`parseIni`, `writeIni`, `writeDefaultModIni`, `resolveMenu`), `runtime.ts` (version packing, runtime messages, AS2 bridge and Papyrus tables, co-save constants) and `runtimeProtocol.ts` (`RUNTIME_PROTOCOL`).
- `schemas/*.schema.json` are **generated** by `yarn gen:schemas`; never hand-edit them. A test fails if they are stale.

```
yarn test | typecheck | build | gen:schemas
```

`yarn test` runs 72 tests in 4 files (`spec`, `graph`, `protocol`, `runtime`). `docs/compatibility.md` says which spec and protocol versions each consumer speaks.
