# Compatibility matrix

Every release of a consumer declares the spec version and protocol version it speaks; the editor checks both on connect. Update this table whenever a format changes (see CLAUDE.md: breaking changes need a compatibility note).

| Spec version | Protocol version | `@inkwell-ui/spec` | Editor | Figma plugin | Runtime | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | `feat/foundations`, `feat/protocol` | `feat/swf-compiler` (0.1 work in progress) | `feat/plugin` | n/a | First IR. Text layout hints lived in `extra.text`. |
| 2 | 1 | `feat/ir-text` | `feat/ir-text` and later | `feat/ir-text` and later | n/a | Text node gains `align`, `verticalAlign`, `lineHeight`, `letterSpacing`, `textFit`, `truncate`. |
| 3 | 2 | `feat/swf-per-frame` | `feat/swf-per-frame` and later | `feat/swf-per-frame` and later | n/a | One SWF per top-level Figma frame; alias `FontRef.styleName`. |
| 4 | 3 | `feat/images` | `feat/images` and later | `feat/images` and later | n/a | Images: image fill `opacity`, Frame `fills`, Image `fillOpacity`; `asset` / `needAssets` messages. |

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
