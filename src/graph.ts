import { z } from "zod";
import { PinType } from "./pins.js";

const Id = z.string().min(1);
/** `packId/nodeKind@major`, e.g. `core/Branch@1`. */
export const NodeKind = z.string().regex(/^[a-z0-9][a-z0-9._-]*\/[A-Za-z0-9_.-]+@\d+$/);
const Pos = z.looseObject({ x: z.number(), y: z.number() });
const Size = z.looseObject({ width: z.number(), height: z.number() });
const Extra = z.record(z.string(), z.unknown()).optional();

/** `fields` is open: node settings, and On Widget Call's name and typed params live here. Unknown kinds keep everything. */
export const GraphNode = z.looseObject({
  id: Id, kind: NodeKind, fields: z.record(z.string(), z.unknown()).default({}), pos: Pos, extra: Extra,
});
const Endpoint = z.looseObject({ node: Id, pin: z.string().min(1) });
export const GraphEdge = z.looseObject({ from: Endpoint, to: Endpoint, extra: Extra });
export const GraphVariable = z.looseObject({
  id: Id, name: z.string(), type: PinType.exclude(["Exec"]), scope: z.enum(["component", "menu"]).default("menu"),
  default: z.unknown().optional(), extra: Extra,
});
export const GraphComment = z.looseObject({ id: Id, text: z.string(), pos: Pos, size: Size.optional(), extra: Extra });
export const GraphGroup = z.looseObject({
  id: Id, name: z.string(), nodes: z.array(Id).default([]), pos: Pos, size: Size.optional(), extra: Extra,
});

export const Graph = z.looseObject({
  specVersion: z.number().int(),
  id: Id,
  name: z.string(),
  scope: z.enum(["menu", "component"]),
  nodes: z.array(GraphNode).default([]),
  edges: z.array(GraphEdge).default([]),
  variables: z.array(GraphVariable).default([]),
  comments: z.array(GraphComment).default([]),
  groups: z.array(GraphGroup).default([]),
  extra: Extra,
});
export type Graph = z.infer<typeof Graph>;
export type GraphNode = z.infer<typeof GraphNode>;
