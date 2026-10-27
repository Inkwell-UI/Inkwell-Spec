import { z } from "zod";
import { NodeId } from "./ir.js";
import { FocusOverlay, PromptOverlay } from "./focus.js";

export const NodeOverlay = z.looseObject({
  role: z.string().optional(), // button, list, progress, text...
  instanceName: z.string().optional(),
  focus: FocusOverlay.optional(), // W3: gamepad focus order and up/down/left/right overrides
  prompt: PromptOverlay.optional(), // W4: role `prompt`: the action and glyphs per device
  dataBinding: z.string().optional(),
  scripts: z.array(z.string()).optional(), // graph IDs
  anchor: z.looseObject({ h: z.string().optional(), v: z.string().optional() }).optional(),
  list: z.looseObject({ itemTemplate: NodeId.optional(), spacing: z.number().optional() }).optional(), // S8, role `list`: item template (default: first child) and row spacing
  locKey: z.string().regex(/^\$[A-Za-z0-9_]{1,96}$/).optional(), // V2.1, text layers: the translation key; the IR keeps the source-language literal
  font: z.string().optional(), // V5.6, text layers: hash of an embedded font asset (wins over the alias rules)
  themable: z.record(z.string(), z.boolean()).optional(), // runtime-themable flags per property
});

export const Overlay = z.looseObject({
  specVersion: z.number().int(),
  nodes: z.record(NodeId, NodeOverlay),
});
export type Overlay = z.infer<typeof Overlay>;
