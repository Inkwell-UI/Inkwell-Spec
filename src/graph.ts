import { z } from "zod";
import { PinType } from "./pins.js";
import { SAVED_TYPES } from "./runtime.js";

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
  id: Id, name: z.string(), type: PinType.exclude(["Exec"]), scope: z.enum(["component", "menu", "saved"]).default("menu"),
  default: z.unknown().optional(), extra: Extra,
}).refine((v) => v.scope !== "saved" || (SAVED_TYPES as readonly string[]).includes(v.type), {
  path: ["type"], message: "a saved variable must be Bool, Number or String",
}); // saved: spec 6, S5. Other saved rules (menu graph of a custom menu, unique names) are lint, not schema.
export const GraphComment = z.looseObject({ id: Id, text: z.string(), pos: Pos, size: Size.optional(), extra: Extra });
export const GraphGroup = z.looseObject({
  id: Id, name: z.string(), nodes: z.array(Id).default([]), pos: Pos, size: Size.optional(), extra: Extra,
});

/** Types a function can take and return. Component types (Text, Button...) name a Figma layer by id in the calling graph, so they stay out of a signature. */
export const FUNCTION_PIN_TYPES = ["Bool", "Number", "String", "Array", "Object"] as const;
export const FunctionPinType = z.enum(FUNCTION_PIN_TYPES);
/** `id` is stable (a call site refers to the pin by it); `name` is what the author sees and may be renamed. */
export const FunctionPin = z.looseObject({ id: Id, name: z.string().min(1), type: FunctionPinType, default: z.unknown().optional(), extra: Extra });
/** A named way out of the function (an exec output of its Call node). */
export const FunctionExit = z.looseObject({ id: Id, name: z.string().min(1), extra: Extra });
/** The interface of a function graph. Outputs are shared by all exits: an Exit node supplies a value for each. */
export const FunctionSignature = z.looseObject({
  inputs: z.array(FunctionPin).default([]),
  outputs: z.array(FunctionPin).default([]),
  exits: z.array(FunctionExit).min(1),
  extra: Extra,
}).superRefine((s, ctx) => {
  const dup = (what: string, ids: string[]): void => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) ctx.addIssue({ code: "custom", message: `${what} "${id}" is used twice in the signature` });
      seen.add(id);
    }
  };
  dup("pin or exit id", [...s.inputs, ...s.outputs, ...s.exits].map((p) => p.id));
  dup("input name", s.inputs.map((p) => p.name));
  dup("output name", s.outputs.map((p) => p.name));
  dup("exit name", s.exits.map((p) => p.name));
});

export const Graph = z.looseObject({
  specVersion: z.number().int(),
  id: Id,
  name: z.string(),
  /** `function`: a callable graph (own file, compiled to its own class, `signature` required); a function's variables are locals of one call. */
  scope: z.enum(["menu", "component", "function"]),
  signature: FunctionSignature.optional(),
  nodes: z.array(GraphNode).default([]),
  edges: z.array(GraphEdge).default([]),
  variables: z.array(GraphVariable).default([]),
  comments: z.array(GraphComment).default([]),
  groups: z.array(GraphGroup).default([]),
  extra: Extra,
}).superRefine((g, ctx) => {
  if (g.scope === "function" && !g.signature) ctx.addIssue({ code: "custom", path: ["signature"], message: "a function graph needs a signature" });
  if (g.scope !== "function" && g.signature) ctx.addIssue({ code: "custom", path: ["signature"], message: "only a function graph has a signature" });
});
export type Graph = z.infer<typeof Graph>;
export type GraphNode = z.infer<typeof GraphNode>;
