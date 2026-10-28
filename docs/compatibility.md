# Compatibility matrix

Every release of a consumer declares the spec version and protocol version it speaks; the editor checks both on connect. Update this table whenever a format changes (see CLAUDE.md: breaking changes need a compatibility note).

| Spec version | Protocol version (Figma) | Runtime protocol | `@inkwell-ui/spec` | Editor | Figma plugin | Runtime | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | n/a | `main` | `main` (0.1 work in progress) | `main` | n/a | First IR. Text layout hints lived in `extra.text`. |
| 2 | 1 | n/a | `main` | `main` | `main` | n/a | Text node gains `align`, `verticalAlign`, `lineHeight`, `letterSpacing`, `textFit`, `truncate`. |
| 3 | 2 | n/a | `main` | `main` | `main` | n/a | One SWF per top-level Figma frame; alias `FontRef.styleName`. |
| 4 | 3 | n/a | `main` | `main` | `main` | n/a | Images: image fill `opacity`, Frame `fills`, Image `fillOpacity`; `asset` / `needAssets` messages. |
| 5 | 3 | n/a | `main` | `main` | `main` | n/a | New graph, node pack and `packs.lock` formats (visual scripting, 0.2). IR and protocol unchanged. |
| 5 | 4 | n/a | `main` | `main` | `main` | n/a | Figma plugin connects by approval in the editor instead of a pasted token. Spec version unchanged. |
| 5 | 5 | n/a | `main` | `main` | `main` | n/a | Editor can select / focus a layer in Figma (`selectNode`). Spec version unchanged. |
| 6 | 5 | 1 | `main` | `main` (0.3) | `main` (rebuilt at spec 6) | 0.3.0 (`main`; not seen in game) | Runtime formats (0.3): menu JSON, INI, runtime requirement, saved scope, debug protocol. Figma protocol unchanged. |
| 7 | 5 | 1 | `feat/localization` | not yet | not yet (rebuild against spec 7) | 0.4.0 for translated menus (not built yet) | Localization (0.4): `localization.json`, `NodeOverlay.locKey` and `.font`, `MenuDef.translations`, translation files, bridge `translate` and `language`. |
| 8 | 5 | 1 | `feat/contracts-05` | `feat/contracts-05` (0.5) | not yet (rebuild against spec 8) | unchanged | Contracts (0.5, W5): IR `target.base` replaced by `target.layers`. |
| 8 | 5 | 1 | `main` | `main` (0.5) | unchanged | unchanged | Packs (0.5, SPEC-CHANGES W1/W2): `packs.lock` entries become `{id, version, source, sha256}`; new `PackIndex`, `PACK_ASSET`, `packAssetUrl`, `parsePacksLock` / `writePacksLock`. Spec version unchanged. |
| 8 | 5 | 1 | `feat/gamepad-05` | `feat/gamepad-05` (0.5) | unchanged | unchanged | Focus graph and prompts (0.5, W3/W4): `NodeOverlay.focus` typed (`order`, `overrides.up/down/left/right`), new `NodeOverlay.prompt`, `focusGraph`, `resolvePrompt`. Spec version unchanged. |
| 8 | 5 | 1 | `main` | `main` (0.5) | unchanged | unchanged | Spec freeze (0.5 Phase 7): `NodeDef.contract` becomes a real field (it was `extra.contract` in core pack 0.5.2 and before; optional, so every pack parses). Spec version unchanged. |

## Spec v1: the frozen author-facing formats (1.0)

From release 1.0 on, the formats people write, share or keep in their projects change **only with a migration and a compatibility note here**; a field is never renamed or removed in place. Until then (0.x) they may still change. `specVersion` (8 at 0.5) keeps counting up; "v1" names the freeze, not a number in the files.

| Frozen format | Where it is defined | JSON schema |
| --- | --- | --- |
| Menu JSON (`SKSE/Plugins/Inkwell/menus/<menu>.json`) and the author's `swfs/<name>/menu.json` | `MenuDef`, `MenuSettings` (`src/menu.ts`) | `menu-def`, `menu-settings` |
| The mod INI (`<modId>.ini`, and the dev `Inkwell.ini`) | `RuntimeIni`, `writeDefaultModIni`, `parseIni` (`src/ini.ts`) | `runtime-ini` |
| Node pack manifest | `PackManifest` (`src/pack.ts`) | `pack-manifest` |
| Node definitions (`nodes/*.json` of a pack), including the contract field `NodeDef.contract` | `NodeDef` | `node-def` |
| Graph files (`swfs/<name>/graphs/<id>.json`) | `Graph` (`src/graph.ts`) | `graph` |
| `packs.lock` | `PacksLock`, entries `{id, version, source, sha256}` | `packs-lock` |
| The pack index entry (`Inkwell-Packs-Index/index.json`) and contract layer files (`contracts/<menu>/<layer>.json`) | `PackIndex`, `ContractLayer` | `pack-index`, `contract-layer` |

**Not frozen** (these may change in any release, with a migration where a stored file is affected): the IR (`swf.schema.json`, `Swf`), the Figma sync protocol and the runtime debug protocol (they are negotiated at connect time and refused on mismatch), the overlay (`NodeOverlay`: focus and prompt fields were added in 0.5 without a version bump and are kept as they are), `project.json`, `localization.json`'s internals, and everything under `build/`.

**Rules after the freeze**
- Adding an **optional** field is allowed (readers keep unknown keys; the schemas are loose objects) and needs a line here.
- Anything else (rename, remove, tighten, change a meaning) needs a `specVersion` bump, a `migrate()` step, a note in this file and a fixture test.
- A project saved at any older `specVersion` keeps opening: `migrate()` runs the whole chain (`1 -> ... -> 8`). Tests: `test/spec.test.ts` (chain, 7 -> 8 `baseToLayers`) and the editor's `examples.test.ts` (every sample opens, the oldest at spec 4).
- Packs: a pack built for an older tool stays loadable; `compatible.tool` says which editors it works with.
- The JSON schemas in `schemas/` are generated (`yarn gen:schemas`) and checked against the Zod types by a test; the schema file is the contract other tools should use.

## 7 to 8 (contracts, 0.5)

- **What changed:** the IR `target` of a menu replacement drops `base` (`"vanilla"` | `"skyui"`) and gains `layers`, the contract layers the SWF is built for, engine first (`["engine"]`, `["engine", "skyui52"]`, ...). Absent means `["engine"]`. The names are strings, not an enum, so a newer layer name survives a round trip; the editor lints unknown names, duplicates and a list that does not start with `engine`.
- **Migration:** `migrate()` runs 7->8 (`baseToLayers`): `base: "skyui"` -> `layers: ["engine", "skyui52", "skyui6"]`, `base: "vanilla"` -> `["engine"]`; a target without `base` keeps its keys. Nothing else is rewritten.
- **Who must do what:** the Figma plugin must be rebuilt against spec 8 (`ackHello` refuses a mismatch; it never sends a target, so no code change). The runtime only logs a spec mismatch and is not affected. Projects saved at spec 7 keep opening.

## Focus graph and prompts (0.5, W3/W4, no version bump)

- **What changed:** `NodeOverlay.focus` keeps its 0.1 shape (`{order?, overrides?}`) but `overrides` is now a loose object with optional `up`, `down`, `left`, `right` node ids (other keys are kept, not validated; the editor warns `focus-direction-unknown`). New optional `NodeOverlay.prompt` `{action?, keyboard?, xbox?, playstation?}` (loose). New `focusGraph(nodes, exists)` (order, moves with defaults, issues `focus-unreachable`, `focus-dead-end`, `focus-target-missing`, `focus-node-missing`, `focus-direction-unknown`) and `resolvePrompt`, `PROMPT_DEFAULTS`, `XBOX_GLYPHS`, `PS_GLYPHS`, `KEY_LABEL`.
- **Why no version bump:** every field is optional and every overlay written before parses unchanged (like Themes); the IR and both protocols are untouched, so the Figma plugin needs no rebuild.
- **Who must do what:** nothing for old projects. An older editor keeps `prompt` and the focus data as unknown keys.

## Packs lockfile and index (0.5, no version bump)

- **What changed:** `PacksLock` entries drop `commit` and `hash` and require `sha256` (64 lower-case hex digits of the release asset) and a `source` on `https://github.com/`; ids are unique. New `PackIndex` (`index.json` of Inkwell-Packs-Index: `{packs: [{id, repo, latest, description?, deprecated?}]}`, sorted by id), generated as `schemas/pack-index.schema.json`. A pack release is the asset `pack.zip` on the tag `v<version>` (`packAssetUrl`).
- **Why no version bump:** the IR, overlay and protocols are untouched, and no tool ever wrote a `packs.lock` in the old shape (the editor kept it as raw text; the samples held the placeholder `packs: []`, now JSON). Built at spec 7 and landed after spec 8: a `packs.lock` records the spec in force when written (8 now), and any `specVersion` parses.
- **Who must do what:** the editor reads and writes `packs.lock` through `parsePacksLock` / `writePacksLock`; a lockfile that does not parse is never overwritten.

## 6 to 7 (localization, 0.4)

- **What changed:** new schema `Localization` (`localization.json`: namespace, source language, languages, entries per key and language) and the pure functions `writeTranslationFile` / `parseTranslationFile` (UTF-16 LE with BOM, `KEY<TAB>text`, the two characters backslash-n for a line break), `entriesFor`, `toCsv` / `fromCsv`, `suggestKey` / `uniqueKey`, `pseudoLocalize`. `NodeOverlay` gains optional `locKey` and `font`; `MenuDef` gains optional `translations` (the mod name of the translation files). The AS2 bridge table gains `language` and `translate(key)`, which need runtime 0.4.0. IR, Figma protocol and runtime protocol are untouched.
- **Migration:** `migrate()` runs 6->7, a no-op that only bumps `specVersion`.
- **Who must do what:** the Figma plugin must be rebuilt against spec 7 and move with the editor (`ackHello` refuses a mismatch). Projects saved at spec 6 keep opening. The runtime (C++) mirrors `parseTranslationFile` and the bridge table; shared vectors live in `Inkwell-Runtime/test-vectors/translations/`. A menu that has translated text sets `minRuntime` 0.4.0; one without keeps 0.3.0.

## 5 to 6 (new formats: Inkwell Runtime, 0.3)

- **What changed:** new schemas `MenuDef` (menu JSON), `MenuSettings` (`swfs/<name>/menu.json`), `RuntimeIni` (user INI model, plus the pure `parseIni` / `writeIni` / `writeDefaultModIni` / `resolveMenu`), `RuntimeMessage` (debug protocol), and runtime constants (version packing, AS2 bridge and Papyrus API tables, messaging and co-save constants, `MENU_SLOTS` = 16). `GraphVariable.scope` gains `saved` (Bool, Number, String only), `NodeDef` gains optional `requiresRuntime`, `NodeOverlay` gains optional `list`. IR and the Figma protocol are untouched.
- **Runtime protocol:** new constant `RUNTIME_PROTOCOL` = 1 (`src/runtimeProtocol.ts`), separate from the Figma `PROTOCOL_VERSION` (stays 5). Editor and runtime must match it exactly.
- **Migration:** `migrate()` runs 5->6, a no-op that only bumps `specVersion`.
- **Who must do what:** `hello` carries `specVersion` and `ackHello` refuses a mismatch, so the Figma plugin must be rebuilt against spec 6 and move together with the editor. Editor and Figma tests that hard-code 5 must follow `SPEC_VERSION`. Projects saved at spec 5 keep opening (migration). The runtime (C++) mirrors `parseIni`, the bridge and Papyrus tables, and the co-save constants.

## 4 to 5 (protocol): selectNode

- **What changed:** new editor message `selectNode {nodeId, focus}` (`focus` defaults to false). The plugin selects the node only if it exists on the current page, and with `focus` also scrolls and zooms the viewport to it; an unknown or removed node changes nothing (the plugin only shows a Figma notice; the protocol has no plugin reply for it). IR and spec version (5) are unchanged; no migration.
- **Who must do what:** plugin and editor move to protocol 5 together; `ackHello` refuses a protocol 4 plugin with the "Update the plugin" message.

## 3 to 4 (protocol): approve-on-connect

- **What changed:** `hello` gains `pluginSecret` (64 lower-case hex digits, 32 random bytes) and `fileName`. New editor messages `pending` (secret unknown, the user is being asked) and `denied {reason}` (refused, or `busy` / `timeout`). The `token` query parameter is no longer used on the Figma bridge (the runtime debug server keeps its token). `ackHello` still refuses any protocol or spec mismatch. IR and spec version (5) are unchanged; no migration.
- **Who must do what:** plugin and editor move to protocol 4 together. The plugin makes the secret once (`crypto.getRandomValues`), keeps it in `figma.clientStorage` and sends it in every `hello`. The editor keeps only the SHA-256 of approved secrets in its user settings (not in the project), answers an unknown secret with `pending` and asks the user; a pending socket may send nothing else, is closed after 60 s, and a denied secret is refused for the rest of the session. A protocol 3 plugin gets a "Protocol mismatch ... Update the plugin" `helloAck`.

## 4 to 5 (new formats: graphs and packs)

- **What changed:** new schemas `Graph` (one file per graph, `swfs/<name>/graphs/<id>.json`), `PackManifest`, `NodeDef`, `PacksLock`, and the pin type model with `pinCompat()`. IR, overlay and protocol are untouched; `specVersion` is bumped so graph files carry the same version.
- **Migration:** `migrate()` runs 4->5, a no-op that only bumps `specVersion`.
- **Who must do what:** protocol stays 3, but `hello` carries `specVersion` and `ackHello` refuses a mismatch, so the editor and the Figma plugin must move to spec 5 together (the plugin only needs a rebuild against the new spec). Projects saved at spec 4 keep opening (migration). Consumers adopt the graph formats when they implement visual scripting.

## 3 to 4 (IR and protocol change: images)

- **What changed (IR):** the image `Fill` gains optional `opacity`; `Frame` gains optional `fills` (background fills; the editor compiles image fills there); `Image` gains optional `fillOpacity` (the image paint's opacity, separate from the node's `opacity`). New helper `imageHashes(node)` lists the image hashes a node references. Old documents parse unchanged.
- **Migration:** `migrate()` runs 3->4, a no-op that only bumps `specVersion`.
- **What changed (protocol 3):** new editor message `needAssets {hashes}` (hashes an IR references that the editor lacks) and plugin message `asset {hash, data}` (one base64 PNG per hash, sent only when asked and at most once per hash per connection). `AssetHash` is 40 lower-case hex digits (Figma's SHA-1 image hash) because it becomes a file name.
- **Who must do what:** plugin and editor both move to protocol 3 / spec 4; `ackHello` refuses any other combination, so a protocol 2 plugin gets a clear "update the plugin" message instead of silently missing images. Projects saved at spec 3 keep opening (migration). A project without any assets still compiles; images whose bytes never arrived are linted (`image-missing-asset`).

## 2 to 3 (IR and protocol change)

- **What changed (IR):** an alias `FontRef` gains optional `styleName` (the Figma text style name) next to `name` (Figma `family/style`). Old documents parse unchanged.
- **Migration:** `migrate()` runs 2->3, a no-op that only bumps `specVersion`.
- **What changed (protocol 2):** `patch` carries `swfId` (the top-level frame's node id, one SWF per top-level frame) and optional `swf` metadata `{id, name, stage, target?}` (sent with the first upsert of a root and when it changes). `hashTree` and `resend` carry `swfId`; `status` carries optional `swfId` (absent = whole project). New plugin message `swfs` lists the existing top-level `frames` and the `loose` top-level layers that belong to no frame/SWF, so the editor can mark SWFs of deleted frames as orphaned (never delete them) and warn `unreachable-node`.
- **Who must do what:** plugin and editor must both move to protocol 2 / spec 3; `ackHello` refuses any other combination. A project's SWFs live in `swfs/<name>/`; a v2 single-SWF project keeps opening (its one SWF stays as is).

## 1 to 2 (IR change)

- **What changed:** the Text node has real layout fields. They have defaults, so a v2 reader can parse a v2 document that omits them.
- **Migration:** `migrate()` runs the chain 1->2. It moves `extra.text` keys into the new fields (`lineHeight` px number -> `{unit:'px', value}`, `letterSpacing` percent number -> `{unit:'percent', value}`, `shrink` -> `textFit`) and leaves every other `extra` key untouched; `extra` is removed if it ends up empty. `decoration` has no IR field and stays under `extra.text`.
- **Who must do what:** the editor runs `migrate()` on any IR below the current `specVersion` when a project loads; old projects always open. The Figma plugin writes v2 only and no longer writes `extra.text`.
- **A v1 consumer reading v2 data:** not supported. The editor refuses a plugin whose `specVersion` differs from its own and shows a mismatch message in `helloAck`.
- **Protocol:** unchanged (v1); `hello` carries `specVersion`, so mismatches are caught at connect time.

## Themes (SPEC-CHANGES V6, milestone 0.4)

`Swf.themes` is a list of Figma variable collections (`Theme`: collection name, modes, variables keyed by variable id with a value per mode); the themes of a menu are the modes of the collection `themedCollection` picks. `SwfMeta.themes` carries them from the plugin; it is optional, so the protocol version stays 5 and an older editor ignores it. No spec version change: every field is optional.
