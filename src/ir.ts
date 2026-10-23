import { z } from "zod";

// Every object is loose (unknown keys survive parse); `extra` is the explicit bag.
const obj = <T extends z.ZodRawShape>(s: T) => z.looseObject(s);

export const NodeId = z.string();
export type NodeId = z.infer<typeof NodeId>;

const extra = z.record(z.string(), z.unknown()).optional();
const VariableRef = obj({ id: z.string(), collection: z.string().optional() });

const Color = obj({ r: z.number(), g: z.number(), b: z.number(), a: z.number().optional() });
const Stop = obj({ position: z.number(), color: Color });

export const Fill = z.discriminatedUnion("type", [
  obj({ type: z.literal("solid"), color: Color, opacity: z.number().optional() }),
  obj({ type: z.literal("linear"), stops: z.array(Stop), transform: z.array(z.number()).optional() }),
  obj({ type: z.literal("radial"), stops: z.array(Stop), transform: z.array(z.number()).optional() }),
  // asset = Figma image hash (the key of the project's assets/<hash>.png); scaleMode = fill | fit | crop | tile (Figma's, lower case)
  obj({ type: z.literal("image"), asset: z.string(), scaleMode: z.string().optional(), opacity: z.number().optional() }),
]);

export const Stroke = obj({
  fill: Fill,
  weight: z.number(),
  alignment: z.enum(["inside", "center", "outside"]),
});

/** Cubic path: move/line/cubic/close with absolute coordinates. */
export const PathCmd = z.discriminatedUnion("op", [
  obj({ op: z.literal("M"), x: z.number(), y: z.number() }),
  obj({ op: z.literal("L"), x: z.number(), y: z.number() }),
  obj({ op: z.literal("C"), x1: z.number(), y1: z.number(), x2: z.number(), y2: z.number(), x: z.number(), y: z.number() }),
  obj({ op: z.literal("Z") }),
]);

const base = {
  id: NodeId,
  name: z.string(),
  parent: NodeId.nullable(),
  children: z.array(NodeId),
  transform: obj({ x: z.number(), y: z.number(), width: z.number(), height: z.number(), rotation: z.number() }),
  anchor: obj({
    h: z.enum(["left", "right", "center", "stretch", "scale"]),
    v: z.enum(["top", "bottom", "center", "stretch", "scale"]),
  }),
  visible: z.boolean(),
  opacity: z.number(),
  blend: z.string().optional(),
  mask: z.union([z.boolean(), NodeId]).optional(),
  bindings: z.record(z.string(), VariableRef).optional(),
  extra,
};

export const Frame = obj({
  ...base,
  type: z.literal("frame"),
  clipContent: z.boolean(),
  fills: z.array(Fill).optional(), // background fills (spec 4); compilers may support only some fill types here
  autoLayout: obj({
    mode: z.enum(["horizontal", "vertical"]),
    spacing: z.number(),
    padding: z.array(z.number()).length(4),
    dynamic: z.boolean().optional(), // generate runtime layout code (lists, repeaters)
  }).optional(),
});

export const Shape = obj({
  ...base,
  type: z.literal("shape"),
  paths: z.array(z.array(PathCmd)),
  fills: z.array(Fill),
  strokes: z.array(Stroke),
});

export const FontRef = z.discriminatedUnion("kind", [
  obj({ kind: z.literal("alias"), name: z.string(), styleName: z.string().optional() }), // name = Figma family/style; styleName = Figma text style name
  obj({ kind: z.literal("embedded"), asset: z.string() }),
]);

export const TextRun = obj({
  start: z.number().int(),
  end: z.number().int(),
  font: FontRef,
  size: z.number(),
  fill: Fill.optional(),
});

const LineHeight = z.discriminatedUnion("unit", [
  obj({ unit: z.literal("auto") }),
  obj({ unit: z.enum(["px", "percent"]), value: z.number() }),
]);
const LetterSpacing = obj({ unit: z.enum(["px", "percent"]), value: z.number() });

export const Text = obj({
  ...base,
  type: z.literal("text"),
  content: z.string(), // literal text or "$KEY"
  runs: z.array(TextRun).length(1), // 0.1 allows exactly one run
  sizing: z.enum(["fixed", "autoWidth", "autoHeight"]),
  align: z.enum(["left", "center", "right", "justify"]).default("left"),
  verticalAlign: z.enum(["top", "center", "bottom"]).default("top"),
  lineHeight: LineHeight.default({ unit: "auto" }),
  letterSpacing: LetterSpacing.default({ unit: "px", value: 0 }),
  textFit: z.enum(["none", "shrink", "fit"]).default("none"), // shrink-to-fit; separate from `sizing`
  truncate: z.boolean().default(false),
});

export const Image = obj({
  ...base,
  type: z.literal("image"),
  asset: z.string(),
  scaleMode: z.enum(["fill", "fit", "crop", "tile"]),
  fillOpacity: z.number().optional(), // the image paint's own opacity (spec 4), separate from the node's `opacity`
});

export const Instance = obj({
  ...base,
  type: z.literal("instance"),
  component: NodeId,
  variant: z.string().optional(),
  overrides: z.record(z.string(), z.unknown()).optional(),
});

export const Component = obj({
  ...base,
  type: z.literal("component"),
  variants: z.array(obj({ name: z.string(), node: NodeId })), // compiled to frame labels
});

export const Node = z.discriminatedUnion("type", [Frame, Shape, Text, Image, Instance, Component]);
export type Node = z.infer<typeof Node>;

/** Image hashes a node references (Image nodes and image fills of shapes and frames). The one place that knows where they live. */
export function imageHashes(n: Node): string[] {
  const fills = n.type === "shape" || n.type === "frame" ? n.fills ?? [] : [];
  return [...(n.type === "image" ? [n.asset] : []), ...fills.flatMap((f) => (f.type === "image" ? [f.asset] : []))];
}

export const Asset = obj({ kind: z.enum(["image", "font"]), hash: z.string(), name: z.string().optional() });
export const Theme = obj({ name: z.string(), modes: z.array(z.string()), variables: z.record(z.string(), z.unknown()).optional() });

export const Swf = obj({
  specVersion: z.number().int(),
  id: z.string(),
  name: z.string(),
  target: obj({
    kind: z.enum(["hudWidget", "customMenu", "menuReplacement"]),
    contract: z.string().optional(),
    base: z.enum(["vanilla", "skyui"]).optional(),
  }),
  stage: obj({ width: z.number(), height: z.number() }),
  root: NodeId,
  nodes: z.record(NodeId, Node),
  assets: z.record(z.string(), Asset).optional(), // project level, keyed by hash
  themes: z.array(Theme).optional(),
  extra,
});
export type Swf = z.infer<typeof Swf>;
