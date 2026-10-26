import { describe, expect, it } from "vitest";
import { Graph, NodeDef, PackManifest, PacksLock, PinType, pinCompat, migrate, SPEC_VERSION } from "../src/index.js";

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
  it("migrates 4 -> 5 -> 6 unchanged", () => {
    expect(migrate({ specVersion: 4, a: 1 } as any)).toEqual({ specVersion: 6, a: 1 });
    expect(migrate({ specVersion: 5, a: 1 } as any)).toEqual({ specVersion: 6, a: 1 });
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
  it("round-trips node definitions, manifest and lock", () => {
    expect(NodeDef.parse(def)).toEqual(def);
    const m = { id: "core", version: "0.2.0", compatible: { tool: "^0.2.0", runtimeApi: "^1.0.0" }, dependencies: { other: "^1.0.0" }, x: 1 };
    expect(PackManifest.parse(m)).toEqual(m);
    const l = { specVersion: 5, packs: [{ id: "core", version: "0.2.0", source: "https://x/y.zip", commit: "abc", hash: "sha256:1", z: 1 }] };
    expect(PacksLock.parse(l)).toEqual(l);
  });
  it("rejects bad input", () => {
    expect(PackManifest.safeParse({ id: "core", version: "1.0", compatible: { tool: "^0.2.0" } }).success).toBe(false);
    expect(NodeDef.safeParse({ ...def, inputs: [{ name: "a", type: "Float" }] }).success).toBe(false);
    expect(PacksLock.safeParse({ specVersion: 5, packs: [{ id: "core" }] }).success).toBe(false);
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
