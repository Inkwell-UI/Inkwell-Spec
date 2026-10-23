# @inkwell-ui/spec

Zod schemas for Inkwell's shared formats (visual IR, overlay, sync patches, spec versioning). Private for now. See `CLAUDE.md` for the rules and `Inkwell Design Spec.md` (workspace root) for the design.

- `src/` Zod source of truth: `ir.ts`, `overlay.ts`, `patch.ts` (with pure `applyPatch`), `version.ts` (`SPEC_VERSION`, `migrate`).
- `schemas/*.schema.json` are **generated** by `yarn gen:schemas`; never hand-edit them. A test fails if they are stale.

```
yarn test | typecheck | build | gen:schemas
```
