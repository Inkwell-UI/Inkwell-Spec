import { describe, expect, it } from "vitest";
import { Graph, FUNCTION_PIN_TYPES, NodeDef, PackManifest, PacksLock, PackIndex, PACK_ASSET, packAssetUrl, parsePacksLock, writePacksLock, PinType, pinCompat, migrate, SPEC_VERSION } from "../src/index.js";

const graph = () => ({
  specVersion: SPEC_VERSION, id: "g1", name: "Popup", scope: "menu", zz: 1,
  nodes: [
    { id: "n1", kind: "core/OnWidgetCall@1", fields: { name: "show", params: [{ name: "t", type: "String" }] }, pos: { x: 0, y: 0 }, future: true },
    { id: "n2", kind: "other/Mystery@3", fields: { weird: { a: [1] } }, pos: { x: 5, y: 5, z: 2 }, extra: { k: 1 } },
  ],
  edges: [{ from: { node: "n1", pin: "exec", hint: 1 }, to: { node: "n2", pin: "in" }, extra: { c: "red" } }],
  variables: [{ id: "v1", name: "n", type: "Number", scope: "component", default: 0, q: 1 }],
  comments: [{ id: "c1", text: "hi", pos: { x: 1, y: 1 }, size: { width: 3, height: 3 } }],
  groups: [{ id: "gr", name: "G", nodes: ["n1"], pos: { x: 0, y: 0 } }],
  extra: { tool: "x" },
});

describe("graph", () => {
  it("round-trips unknown keys, nodes and fields", () => {
    const g = graph();
    expect(JSON.parse(JSON.stringify(Graph.parse(g)))).toEqual(g);
  });
  it("rejects bad input", () => {
    expect(Graph.safeParse({ ...graph(), scope: "world" }).success).toBe(false);
    expect(Graph.safeParse({ ...graph(), nodes: [{ id: "a", kind: "nopack", pos: { x: 0, y: 0 } }] }).success).toBe(false);
    expect(Graph.safeParse({ ...graph(), variables: [{ id: "v", name: "x", type: "Exec" }] }).success).toBe(false);
    expect(Graph.safeParse({ ...graph(), edges: [{ from: { node: "a" }, to: { node: "b", pin: "p" } }] }).success).toBe(false);
  });
  it("migrates 4 -> ... -> 8 unchanged (a graph has no target)", () => {
    expect(migrate({ specVersion: 4, a: 1 } as any)).toEqual({ specVersion: 8, a: 1 });
    expect(migrate({ specVersion: 5, a: 1 } as any)).toEqual({ specVersion: 8, a: 1 });
  });
  describe("function graphs", () => {
    const sig = () => ({
      inputs: [{ id: "i1", name: "title", type: "String", default: "", keep: 1 }],
      outputs: [{ id: "o1", name: "count", type: "Number" }],
      exits: [{ id: "x1", name: "Done" }, { id: "x2", name: "Failed" }],
      note: "kept",
    });
    const fn = (over: Record<string, unknown> = {}) => ({ ...graph(), scope: "function", signature: sig(), ...over });
    it("round-trips the signature with unknown keys", () => {
      const g = fn();
      expect(JSON.parse(JSON.stringify(Graph.parse(g)))).toEqual(g);
    });
    it("a graph saved before functions (no signature, menu or component scope) parses unchanged", () => {
      for (const scope of ["menu", "component"]) {
        const g = { ...graph(), scope };
        expect(JSON.parse(JSON.stringify(Graph.parse(g)))).toEqual(g);
      }
    });
    it("a function needs a signature and only a function has one", () => {
      expect(Graph.safeParse({ ...graph(), scope: "function" }).success).toBe(false);
      expect(Graph.safeParse({ ...graph(), scope: "menu", signature: sig() }).success).toBe(false);
    });
    it("needs at least one exit; inputs and outputs may be empty", () => {
      expect(Graph.safeParse(fn({ signature: { ...sig(), exits: [] } })).success).toBe(false);
      expect(Graph.parse(fn({ signature: { exits: [{ id: "x", name: "Done" }] } })).signature).toMatchObject({ inputs: [], outputs: [] });
    });
    it("pin ids are unique across inputs, outputs and exits; names are unique per list", () => {
      const s = sig();
      expect(Graph.safeParse(fn({ signature: { ...s, outputs: [{ id: "i1", name: "count", type: "Number" }] } })).success).toBe(false);
      expect(Graph.safeParse(fn({ signature: { ...s, exits: [{ id: "x1", name: "Done" }, { id: "x2", name: "Done" }] } })).success).toBe(false);
      expect(Graph.safeParse(fn({ signature: { ...s, inputs: [...s.inputs, { id: "i2", name: "title", type: "Number" }] } })).success).toBe(false);
      // an input and an output may share a name: they are different lists
      expect(Graph.safeParse(fn({ signature: { ...s, outputs: [{ id: "o1", name: "title", type: "String" }] } })).success).toBe(true);
    });
    it("pins take data types only (no Exec, no component types)", () => {
      for (const type of ["Exec", "Text", "Button", "List", "Image", "Clip", "Float"])
        expect(Graph.safeParse(fn({ signature: { ...sig(), inputs: [{ id: "i1", name: "a", type }] } })).success, type).toBe(false);
      for (const type of FUNCTION_PIN_TYPES) expect(Graph.safeParse(fn({ signature: { ...sig(), inputs: [{ id: "i1", name: "a", type }] } })).success, type).toBe(true);
    });
  });
  it("saved scope: Bool, Number, String only", () => {
    const v = (type: string, scope = "saved") => ({ ...graph(), variables: [{ id: "v", name: "x", type, scope, keep: 1 }] });
    for (const t of ["Bool", "Number", "String"]) expect(Graph.parse(v(t)).variables[0]).toMatchObject({ scope: "saved", type: t, keep: 1 });
    for (const t of ["Array", "Object", "Text", "List", "Image"]) expect(Graph.safeParse(v(t)).success, t).toBe(false);
    expect(Graph.safeParse(v("Array", "menu")).success).toBe(true);
  });
});

describe("pack", () => {
  const def = { kind: "Branch", major: 1, title: "Branch", category: "Flow", milestone: "0.2", pure: false,
    inputs: [{ name: "exec", type: "Exec" }], outputs: [{ name: "then", type: "Exec" }], fields: { type: "object" }, as2Template: "as2/branch.tpl", more: 1 };
  it("a node definition names the game menu contract it talks to (top-level `contract`; older packs used `extra.contract` and still parse)", () => {
    expect(NodeDef.parse({ ...def, contract: "InventoryMenu" }).contract).toBe("InventoryMenu");
    expect(NodeDef.parse({ ...def, extra: { contract: "InventoryMenu" } }).contract).toBeUndefined();
    expect(NodeDef.safeParse({ ...def, contract: 1 }).success).toBe(false);
  });
  it("round-trips node definitions, manifest and lock", () => {
    expect(NodeDef.parse(def)).toEqual(def);
    const m = { id: "core", version: "0.2.0", compatible: { tool: "^0.2.0", runtimeApi: "^1.0.0" }, dependencies: { other: "^1.0.0" }, x: 1 };
    expect(PackManifest.parse(m)).toEqual(m);
    const l = { specVersion: 7, packs: [{ id: "core", version: "0.2.0", source: packAssetUrl("o/core", "0.2.0"), sha256: SHA, z: 1 }] };
    expect(PacksLock.parse(l)).toEqual(l);
  });
  it("rejects bad input", () => {
    expect(PackManifest.safeParse({ id: "core", version: "1.0", compatible: { tool: "^0.2.0" } }).success).toBe(false);
    expect(NodeDef.safeParse({ ...def, inputs: [{ name: "a", type: "Float" }] }).success).toBe(false);
    expect(PacksLock.safeParse({ specVersion: 5, packs: [{ id: "core" }] }).success).toBe(false);
  });
});

const SHA = "a".repeat(64);
const entry = (id: string, version = "1.0.0") => ({ id, version, source: packAssetUrl(`me/${id}`, version), sha256: SHA });

describe("packs.lock (W1)", () => {
  it("round-trips through text, written sorted by id, unknown keys kept", () => {
    const lock = { specVersion: 7, packs: [entry("tween", "0.4.0"), { ...entry("anim"), extra: { note: 1 } }], future: true };
    const text = writePacksLock(lock);
    expect(text.endsWith("\n")).toBe(true);
    const back = parsePacksLock(text);
    expect(back.packs.map((p) => p.id)).toEqual(["anim", "tween"]);
    expect(back).toEqual({ ...lock, packs: [lock.packs[1], lock.packs[0]] });
    expect(writePacksLock(back)).toBe(text);
  });
  it("refuses a bad hash, a non-GitHub source, a duplicate id and broken JSON", () => {
    const bad = (p: object) => PacksLock.safeParse({ specVersion: 7, packs: [p] }).success;
    expect(bad(entry("a"))).toBe(true);
    expect(bad({ ...entry("a"), sha256: "A".repeat(64) })).toBe(false);
    expect(bad({ ...entry("a"), sha256: "abc" })).toBe(false);
    expect(bad({ ...entry("a"), source: "http://github.com/x/y/pack.zip" })).toBe(false);
    expect(bad({ ...entry("a"), source: "https://evil.example/pack.zip" })).toBe(false);
    expect(PacksLock.safeParse({ specVersion: 7, packs: [entry("a"), entry("a", "2.0.0")] }).success).toBe(false);
    expect(() => parsePacksLock("packs: []")).toThrow();
  });
  it("asset URLs: a pinned version or the latest release", () => {
    expect(packAssetUrl("me/p", "1.2.3")).toBe(`https://github.com/me/p/releases/download/v1.2.3/${PACK_ASSET}`);
    expect(packAssetUrl("me/p")).toBe("https://github.com/me/p/releases/latest/download/pack.zip");
  });
});

describe("pack index (W2)", () => {
  const e = (id: string, more = {}) => ({ id, repo: `me/${id}`, latest: "1.0.0", ...more });
  it("accepts a sorted index with a deprecated entry and unknown keys", () => {
    const idx = { packs: [e("anim", { description: "Tweens" }), e("old", { deprecated: "Use anim", x: 1 })] };
    expect(PackIndex.parse(idx)).toEqual(idx);
  });
  it("refuses unsorted, duplicate, bad repo, bad version and an empty deprecation reason", () => {
    expect(PackIndex.safeParse({ packs: [e("b"), e("a")] }).success).toBe(false);
    expect(PackIndex.safeParse({ packs: [e("a"), e("a")] }).success).toBe(false);
    expect(PackIndex.safeParse({ packs: [e("a", { repo: "https://github.com/me/a" })] }).success).toBe(false);
    expect(PackIndex.safeParse({ packs: [e("a", { latest: "1.0" })] }).success).toBe(false);
    expect(PackIndex.safeParse({ packs: [e("a", { deprecated: "" })] }).success).toBe(false);
  });
});

describe("pinCompat", () => {
  it("covers the full table", () => {
    const coerce = ["Bool>Number", "Bool>String", "Number>String"];
    for (const a of PinType.options) for (const b of PinType.options) {
      const want = a === b ? "same" : coerce.includes(`${a}>${b}`) ? "coerce" : "none";
      expect(pinCompat(a, b), `${a}>${b}`).toBe(want);
    }
  });
});
