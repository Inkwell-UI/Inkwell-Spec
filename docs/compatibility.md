# Compatibility matrix

Every release of a consumer declares the spec version and protocol version it speaks; the editor checks both on connect. Update this table whenever a format changes (see CLAUDE.md: breaking changes need a compatibility note).

| Spec version | Protocol version | `@inkwell-ui/spec` | Editor | Figma plugin | Runtime | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | `feat/foundations`, `feat/protocol` | `feat/swf-compiler` (0.1 work in progress) | `feat/plugin` | n/a | First IR. Text layout hints lived in `extra.text`. |
| 2 | 1 | `feat/ir-text` | `feat/ir-text` and later | `feat/ir-text` and later | n/a | Text node gains `align`, `verticalAlign`, `lineHeight`, `letterSpacing`, `textFit`, `truncate`. |

## 1 to 2 (IR change)

- **What changed:** the Text node has real layout fields. They have defaults, so a v2 reader can parse a v2 document that omits them.
- **Migration:** `migrate()` runs the chain 1->2. It moves `extra.text` keys into the new fields (`lineHeight` px number -> `{unit:'px', value}`, `letterSpacing` percent number -> `{unit:'percent', value}`, `shrink` -> `textFit`) and leaves every other `extra` key untouched; `extra` is removed if it ends up empty. `decoration` has no IR field and stays under `extra.text`.
- **Who must do what:** the editor runs `migrate()` on any IR below the current `specVersion` when a project loads; old projects always open. The Figma plugin writes v2 only and no longer writes `extra.text`.
- **A v1 consumer reading v2 data:** not supported. The editor refuses a plugin whose `specVersion` differs from its own and shows a mismatch message in `helloAck`.
- **Protocol:** unchanged (v1); `hello` carries `specVersion`, so mismatches are caught at connect time.
