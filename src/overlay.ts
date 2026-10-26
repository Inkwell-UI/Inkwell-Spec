import { z } from "zod";
import { NodeId } from "./ir.js";

export const NodeOverlay = z.looseObject({
  role: z.string().optional(), // button, list, progress, text...
  instanceName: z.string().optional(),
  focus: z.looseObject({ order: z.number().optional(), overrides: z.record(z.string(), NodeId).optional() }).optional(),
  dataBinding: z.string().optional(),
  scripts: z.array(z.string()).optional(), // graph IDs
  anchor: z.looseObject({ h: z.string().optional(), v: z.string().optional() }).optional(),
  list: z.looseObject({ itemTemplate: NodeId.optional(), spacing: z.number().optional() }).optional(), // S8, role `list`: item template (default: first child) and row spacing
  themable: z.record(z.string(), z.boolean()).optional(), // runtime-themable flags per property
});

export const Overlay = z.looseObject({
  specVersion: z.number().int(),
  nodes: z.record(NodeId, NodeOverlay),
});
export type Overlay = z.infer<typeof Overlay>;
