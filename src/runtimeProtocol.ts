// S6: debug and hot-reload protocol between the editor and the runtime's dev server. Separate from the Figma sync protocol (protocol.ts).
import { z } from "zod";
import { LOG_LEVELS } from "./runtime.js";

/** Bump when a message is removed, renamed or retyped. Adding an optional field or a message type does not bump. Editor and runtime must match exactly. */
export const RUNTIME_PROTOCOL = 1;

export const RUNTIME_LIMITS = {
  maxMessageBytes: 1024 * 1024, handshakeMs: 5000, pingEveryMs: 10_000, pongTimeoutMs: 30_000, defaultPort: 8788,
  queueSize: 1000, pinsPerSecondPerPin: 20, messagesPerSecond: 200, pinValueChars: 512, failedTokens: 5, lockoutMs: 60_000,
} as const;

const msg = <T extends z.ZodRawShape>(s: T) => z.looseObject(s); // unknown keys survive
export const RuntimeToken = z.string().regex(/^[0-9a-f]{64}$/, "token must be 64 lower-case hex digits");
export const RuntimeErrorCode = z.enum(["unauthorized", "protocol-mismatch", "busy", "bad-message", "unknown-menu", "reload-failed"]);
const Scalar = z.union([z.boolean(), z.number(), z.string(), z.null()]);

// editor -> runtime
export const RtHello = msg({
  type: z.literal("hello"), token: RuntimeToken, editorVersion: z.string(), protocolVersion: z.number().int(), specVersion: z.number().int(),
});
/** `watch` makes the runtime ask the menu for a full variable dump; `pins` streams pin values. Both default false. */
export const RtSubscribe = msg({ type: z.literal("subscribe"), menu: z.string(), watch: z.boolean().default(false), pins: z.boolean().default(false) });
export const RtUnsubscribe = msg({ type: z.literal("unsubscribe"), menu: z.string(), watch: z.boolean().default(false), pins: z.boolean().default(false) });
/** `menu` absent = all menus. */
export const RtReload = msg({ type: z.literal("reload"), id: z.number(), menu: z.string().optional() });
/** Both directions. The runtime pings every 10 s; no pong in 30 s closes the socket. */
export const RtPing = msg({ type: z.literal("ping"), id: z.number().optional() });
export const RtPong = msg({ type: z.literal("pong"), id: z.number().optional() });
export const EditorToRuntime = z.discriminatedUnion("type", [RtHello, RtSubscribe, RtUnsubscribe, RtReload, RtPing, RtPong]);
export type EditorToRuntime = z.infer<typeof EditorToRuntime>;

// runtime -> editor
export const RtHelloAck = msg({
  type: z.literal("helloAck"), ok: z.boolean(),
  error: z.enum(["unauthorized", "protocol-mismatch", "busy"]).optional(),
  runtimeVersion: z.number().int(), // packed (runtime.ts packVersion)
  runtimeVersionString: z.string(), protocolVersion: z.number().int(), specVersion: z.number().int(), gameVersion: z.string(),
  menus: z.array(msg({ name: z.string(), swf: z.string(), open: z.boolean() })),
});
export const RtMenuState = msg({ type: z.literal("menuState"), menu: z.string(), open: z.boolean() });
export const RtTrace = msg({
  type: z.literal("trace"), ts: z.number(), level: z.enum(LOG_LEVELS), source: z.enum(["as2", "runtime"]),
  menu: z.string().optional(), node: z.string().optional(), graph: z.string().optional(), text: z.string(),
});
export const RtWatch = msg({ type: z.literal("watch"), menu: z.string(), graph: z.string(), scope: z.enum(["component", "menu", "saved"]), name: z.string(), value: Scalar });
/** Primitives as is; Array/Object as a JSON string cut at 512 characters. */
export const RtPin = msg({ type: z.literal("pin"), menu: z.string(), node: z.string(), pin: z.string(), value: Scalar });
export const RtReloadAck = msg({
  type: z.literal("reloadAck"), id: z.number(), ok: z.boolean(), reloaded: z.array(z.string()),
  skipped: z.array(msg({ name: z.string(), reason: z.string() })), ms: z.number(), error: z.string().optional(),
});
export const RtError = msg({ type: z.literal("error"), code: RuntimeErrorCode, message: z.string(), id: z.number().optional() });
export const RuntimeToEditor = z.discriminatedUnion("type", [RtHelloAck, RtMenuState, RtTrace, RtWatch, RtPin, RtReloadAck, RtError, RtPing, RtPong]);
export type RuntimeToEditor = z.infer<typeof RuntimeToEditor>;

/** Every message in both directions (ping and pong appear once); the source of `schemas/runtime-message.schema.json`. */
export const RuntimeMessage = z.discriminatedUnion("type", [RtHello, RtSubscribe, RtUnsubscribe, RtReload, RtPing, RtPong, RtHelloAck, RtMenuState, RtTrace, RtWatch, RtPin, RtReloadAck, RtError]);
export type RuntimeMessage = z.infer<typeof RuntimeMessage>;
