import { describe, expect, it } from "vitest";
import { ackHello, hashNode, PluginMessage, EditorMessage, PROTOCOL_VERSION, SPEC_VERSION } from "../src/index.js";

const H = "0123456789abcdef0123456789abcdef01234567";

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
  it("refuses a protocol 1 plugin", () => expect(ackHello({ ...hello, protocolVersion: 1 }, "1.0").error).toMatch(/Protocol mismatch.*Update the plugin/));
  it("patch carries swfId and swf metadata; hashTree, resend, status, swfs are per swf", () => {
    const m = { type: "patch", seq: 1, swfId: "1:1", swf: { id: "1:1", name: "Hud", stage: { width: 100, height: 50 } }, patch: { ops: [] } };
    expect(PluginMessage.parse(m)).toEqual(m);
    expect(PluginMessage.safeParse({ type: "patch", seq: 1, patch: { ops: [] } }).success).toBe(false);
    expect(PluginMessage.safeParse({ type: "hashTree", nodeHashes: {} }).success).toBe(false);
    expect(PluginMessage.parse({ type: "hashTree", swfId: "1:1", nodeHashes: {} })).toBeTruthy();
    expect(PluginMessage.parse({ type: "swfs", frames: [{ id: "1:1", name: "Hud" }], loose: [{ id: "2:2", name: "Text" }] })).toBeTruthy();
    expect(EditorMessage.parse({ type: "resend", swfId: "1:1", ids: ["1:2"] })).toBeTruthy();
    expect(EditorMessage.safeParse({ type: "resend", ids: [] }).success).toBe(false);
    expect(EditorMessage.parse({ type: "status", swfId: "1:1", state: "synced" })).toBeTruthy();
    expect(EditorMessage.parse({ type: "status", state: "synced" })).toBeTruthy();
  });
  it("refuses a protocol 2 plugin (no asset messages)", () => expect(ackHello({ ...hello, protocolVersion: 2 }, "1.0").error).toMatch(/Update the plugin/));
  it("protocol 3: asset and needAssets carry validated hashes", () => {
    expect(PluginMessage.parse({ type: "asset", hash: H, data: "iVBORw0KGgo=" })).toBeTruthy();
    expect(EditorMessage.parse({ type: "needAssets", hashes: [H] })).toBeTruthy();
    for (const bad of ["../../evil", H.toUpperCase(), H.slice(1), `${H}/x`]) {
      expect(PluginMessage.safeParse({ type: "asset", hash: bad, data: "" }).success).toBe(false);
      expect(EditorMessage.safeParse({ type: "needAssets", hashes: [bad] }).success).toBe(false);
    }
    expect(PluginMessage.safeParse({ type: "asset", hash: H }).success).toBe(false);
  });
  it("hashNode ignores key order", () => {
    expect(hashNode({ a: 1, b: { c: 2, d: 3 } })).toBe(hashNode({ b: { d: 3, c: 2 }, a: 1 }));
    expect(hashNode({ a: 1 })).not.toBe(hashNode({ a: 2 }));
  });
});
