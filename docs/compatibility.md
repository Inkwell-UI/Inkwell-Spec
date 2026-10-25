# Compatibility matrix

Every release of a consumer declares the spec version and protocol version it speaks; the editor checks both on connect. Update this table whenever a format changes (see CLAUDE.md: breaking changes need a compatibility note).

| Spec version | Protocol version | `@inkwell-ui/spec` | Editor | Figma plugin | Runtime | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | `main` | `main` (0.1 work in progress) | `main` | n/a | First IR. Text layout hints lived in `extra.text`. |
| 2 | 1 | `main` | `main` | `main` | n/a | Text node gains `align`, `verticalAlign`, `lineHeight`, `letterSpacing`, `textFit`, `truncate`. |
| 3 | 2 | `main` | `main` | `main` | n/a | One SWF per top-level Figma frame; alias `FontRef.styleName`. |
| 4 | 3 | `main` | `main` | `main` | n/a | Images: image fill `opacity`, Frame `fills`, Image `fillOpacity`; `asset` / `needAssets` messages. |
| 5 | 3 | `main` | `main` | `main` | n/a | New graph, node pack and `packs.lock` formats (visual scripting, 0.2). IR and protocol unchanged. |
| 5 | 4 | `main` | `main` | `main` | n/a | Figma plugin connects by approval in the editor instead of a pasted token. Spec version unchanged. |
| 5 | 5 | `main` | `main` | `main` | n/a | Editor can select / focus a layer in Figma (`selectNode`). Spec version unchanged. |

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
