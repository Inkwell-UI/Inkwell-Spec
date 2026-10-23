import { z } from "zod";
import { NodeId, Swf } from "./ir.js";
import { Patch } from "./patch.js";
import { SPEC_VERSION } from "./version.js";

/** Bump on every handshake or message change. Editor and plugin must match exactly. */
export const PROTOCOL_VERSION = 2;

const msg = <T extends z.ZodRawShape>(s: T) => z.looseObject(s); // unknown keys survive

/** Derived problems reported alongside a patch or status; never stored in the IR. */
export const SyncIssue = msg({ code: z.string(), message: z.string(), nodeId: NodeId.optional() });
export type SyncIssue = z.infer<typeof SyncIssue>;

// plugin -> editor
export const Hello = msg({
  type: z.literal("hello"),
  pluginVersion: z.string(),
  protocolVersion: z.number().int(),
  specVersion: z.number().int(),
  fileKey: z.string().optional(),
});
/** SWF metadata (no nodes). Sent with the first upsert of a root and whenever it changes. */
export const SwfMeta = msg({ id: NodeId, name: z.string(), stage: Swf.shape.stage, target: Swf.shape.target.optional() });
export type SwfMeta = z.infer<typeof SwfMeta>;
/** One SWF per top-level Figma frame: `swfId` is that frame's node id. */
export const PatchMsg = msg({
  type: z.literal("patch"), seq: z.number().int(), swfId: NodeId, swf: SwfMeta.optional(),
  patch: Patch, issues: z.array(SyncIssue).optional(),
});
export const HashTree = msg({ type: z.literal("hashTree"), swfId: NodeId, nodeHashes: z.record(NodeId, z.string()) });
const LayerRef = msg({ id: NodeId, name: z.string() });
/** Which top-level frames exist (SWFs) and which loose top-level layers belong to none. Sent on connect and when either changes. */
export const Swfs = msg({ type: z.literal("swfs"), frames: z.array(LayerRef), loose: z.array(LayerRef) });
export const Selection = msg({ type: z.literal("selection"), ids: z.array(NodeId) });
export const PluginMessage = z.discriminatedUnion("type", [Hello, PatchMsg, HashTree, Selection, Swfs]);
export type PluginMessage = z.infer<typeof PluginMessage>;

// editor -> plugin
export const HelloAck = msg({
  type: z.literal("helloAck"),
  ok: z.boolean(),
  editorVersion: z.string(),
  protocolVersion: z.number().int(),
  error: z.string().optional(),
});
export const Resend = msg({ type: z.literal("resend"), swfId: NodeId, ids: z.array(NodeId) });
export const ErrorMsg = msg({ type: z.literal("error"), code: z.string(), message: z.string(), nodeId: NodeId.optional() });
export const Status = msg({
  type: z.literal("status"),
  swfId: NodeId.optional(), // absent = the whole project
  state: z.enum(["synced", "compiling", "error"]),
  issues: z.array(SyncIssue).optional(),
});
export const EditorMessage = z.discriminatedUnion("type", [HelloAck, Resend, ErrorMsg, Status]);
export type EditorMessage = z.infer<typeof EditorMessage>;

/** Editor side: answer a hello. Exact protocol match required; a spec mismatch is also refused. */
export function ackHello(
  hello: z.infer<typeof Hello>,
  editorVersion: string,
  specVersion: number = SPEC_VERSION,
): z.infer<typeof HelloAck> {
  const base = { type: "helloAck" as const, editorVersion, protocolVersion: PROTOCOL_VERSION };
  if (hello.protocolVersion !== PROTOCOL_VERSION)
    return { ...base, ok: false, error: `Protocol mismatch: plugin ${hello.pluginVersion} speaks protocol ${hello.protocolVersion}, editor ${editorVersion} speaks ${PROTOCOL_VERSION}. Update the ${hello.protocolVersion < PROTOCOL_VERSION ? "plugin" : "editor"}.` };
  if (hello.specVersion !== specVersion)
    return { ...base, ok: false, error: `Spec mismatch: plugin uses specVersion ${hello.specVersion}, editor uses ${specVersion}. Update the ${hello.specVersion < specVersion ? "plugin" : "editor"}.` };
  return { ...base, ok: true };
}

export { hashNode } from "./hash.js"; // separate module so zod-free consumers can import it alone
