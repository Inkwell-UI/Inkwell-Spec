import { describe, expect, it } from "vitest";
import { ackHello, hashNode, PluginMessage, EditorMessage, PROTOCOL_VERSION, SPEC_VERSION } from "../src/index.js";

const hello = { type: "hello" as const, pluginVersion: "0.1.0", protocolVersion: PROTOCOL_VERSION, specVersion: SPEC_VERSION };

describe("protocol", () => {
  it("acks a matching hello", () => expect(ackHello(hello, "1.0")).toMatchObject({ ok: true, protocolVersion: PROTOCOL_VERSION }));
  it("refuses a protocol mismatch with a clear error", () => {
    const a = ackHello({ ...hello, protocolVersion: PROTOCOL_VERSION + 1 }, "1.0");
    expect(a.ok).toBe(false);
    expect(a.error).toMatch(/Protocol mismatch.*Update the editor/);
  });
  it("refuses a spec mismatch", () => expect(ackHello({ ...hello, specVersion: 0 }, "1.0").error).toMatch(/Spec mismatch/));
  it("round-trips unknown keys", () => {
    const m = { ...hello, future: { a: 1 } };
    expect(PluginMessage.parse(m)).toEqual(m);
    const s = { type: "status", state: "error", issues: [{ code: "x", message: "y", more: 1 }], extraKey: true };
    expect(EditorMessage.parse(s)).toEqual(s);
  });
  it("rejects unknown message types and bad status", () => {
    expect(PluginMessage.safeParse({ type: "nope" }).success).toBe(false);
    expect(EditorMessage.safeParse({ type: "status", state: "weird" }).success).toBe(false);
  });
  it("hashNode ignores key order", () => {
    expect(hashNode({ a: 1, b: { c: 2, d: 3 } })).toBe(hashNode({ b: { d: 3, c: 2 }, a: 1 }));
    expect(hashNode({ a: 1 })).not.toBe(hashNode({ a: 2 }));
  });
});
