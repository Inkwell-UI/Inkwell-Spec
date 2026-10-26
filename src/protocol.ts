import { z } from "zod";
import { NodeId, Swf } from "./ir.js";
import { Patch } from "./patch.js";
import { SPEC_VERSION } from "./version.js";

/** Bump on every handshake or message change. Editor and plugin must match exactly. */
export const PROTOCOL_VERSION = 5;

const msg = <T extends z.ZodRawShape>(s: T) => z.looseObject(s); // unknown keys survive

/** Derived problems reported alongside a patch or status; never stored in the IR. */
export const SyncIssue = msg({ code: z.string(), message: z.string(), nodeId: NodeId.optional() });
export type SyncIssue = z.infer<typeof SyncIssue>;

/** 32 random bytes as 64 lower-case hex digits. */
export const PluginSecret = z.string().regex(/^[0-9a-f]{64}$/, "pluginSecret must be 64 lower-case hex digits");

// plugin -> editor
export const Hello = msg({
  type: z.literal("hello"),
  pluginVersion: z.string(),
  protocolVersion: z.number().int(),
  specVersion: z.number().int(),
  fileKey: z.string().optional(),
  /** Protocol 4: random 256-bit credential the plugin makes once and keeps in Figma client storage; the editor stores only its SHA-256. */
  pluginSecret: PluginSecret,
  /** Protocol 4: the Figma file's name, shown in the editor's approval prompt. */
  fileName: z.string(),
});
/** SWF metadata (no nodes). Sent with the first upsert of a root and whenever it changes. */
/** `themes` (spec 7, optional so the protocol version stays 5): the Figma variable collections; present = replaces the SWF's themes, absent = unchanged. */
export const SwfMeta = msg({ id: NodeId, name: z.string(), stage: Swf.shape.stage, target: Swf.shape.target.optional(), themes: Swf.shape.themes });
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
/** Figma image hash (40 hex digits, SHA-1). Validated because it becomes a file name (assets/<hash>.png, textures/.../<hash>.dds). */
export const AssetHash = z.string().regex(/^[0-9a-f]{40}$/, "asset hash must be 40 lower-case hex digits");
/**
 * Protocol 3: one image, sent only when the editor asked for it (`needAssets`) and at most once per hash per connection.
 * `data` is a base64 PNG (the plugin re-encodes other formats); the editor decodes and checks it before storing it.
 */
export const AssetMsg = msg({ type: z.literal("asset"), hash: AssetHash, data: z.string().max(64 * 1024 * 1024) });
export const PluginMessage = z.discriminatedUnion("type", [Hello, PatchMsg, HashTree, Selection, Swfs, AssetMsg]);
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
/** Protocol 3: image hashes an IR references that the editor does not have; the plugin answers with one `asset` message each. */
export const NeedAssets = msg({ type: z.literal("needAssets"), hashes: z.array(AssetHash) });
/** Protocol 4: the secret is unknown; the user is being asked. The socket may send nothing else until `helloAck` or `denied`. */
export const Pending = msg({ type: z.literal("pending") });
/** Protocol 4: the user refused, or the editor could not ask (`busy`, `timeout`). The editor closes the socket. */
export const Denied = msg({ type: z.literal("denied"), reason: z.string() });
/** Protocol 5: select the layer in Figma (`focus`: also scroll and zoom the viewport to it). The plugin acts only if the node exists on the current page. */
export const SelectNode = msg({ type: z.literal("selectNode"), nodeId: NodeId, focus: z.boolean().default(false) });
export const EditorMessage = z.discriminatedUnion("type", [HelloAck, Resend, ErrorMsg, Status, NeedAssets, Pending, Denied, SelectNode]);
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
