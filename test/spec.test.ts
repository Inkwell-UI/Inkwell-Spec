import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Swf, applyPatch, migrate, SPEC_VERSION, type Node, type Patch } from "../src/index.js";
import { render } from "../scripts/gen-schemas.js";

const t = { x: 0, y: 0, width: 10, height: 10, rotation: 0 };
const anchor = { h: "left", v: "top" } as const;
const frame = (id: string, parent: string | null, children: string[] = []) => ({
  id, name: id, type: "frame" as const, parent, children, transform: t, anchor,
  visible: true, opacity: 1, clipContent: false,
});
const minimal = () => ({
  specVersion: SPEC_VERSION, id: "s", name: "S",
  target: { kind: "hudWidget" as const }, stage: { width: 1920, height: 1080 },
  root: "1:1",
  nodes: { "1:1": frame("1:1", null, ["1:2"]), "1:2": frame("1:2", "1:1"), "1:3": frame("1:3", null) },
});
const parse = (x: unknown) => Swf.parse(x);
const ok = (s: ReturnType<typeof parse>) => {
  for (const n of Object.values(s.nodes)) {
    if (n.parent) expect(s.nodes[n.parent]?.children.filter((c) => c === n.id)).toHaveLength(1);
    for (const c of n.children) expect(s.nodes[c]?.parent).toBe(n.id);
  }
};

describe("ir", () => {
  it("parses a minimal swf", () => expect(Swf.safeParse(minimal()).success).toBe(true));

  it("round-trips unknown keys at every level", () => {
    const doc: any = minimal();
    doc.futureTop = 1;
    doc.nodes["1:2"].futureKey = { a: [1] };
    doc.nodes["1:2"].extra = { figma: { deep: true } };
    expect(JSON.parse(JSON.stringify(parse(doc)))).toEqual(doc);
  });
});

describe("applyPatch", () => {
  const s = parse(minimal());
  const run = (ops: Patch["ops"]) => applyPatch(s, { ops });

  it("upserts new node under parent, and does not mutate input", () => {
    const before = JSON.stringify(s);
    const r = run([{ op: "upsert", node: frame("1:4", "1:1") as Node }]);
    expect(r.nodes["1:1"]?.children).toEqual(["1:2", "1:4"]);
    ok(r);
    expect(JSON.stringify(s)).toBe(before);
  });
  it("upsert with changed parent reparents", () => {
    const r = run([{ op: "upsert", node: frame("1:2", "1:3") as Node }]);
    expect(r.nodes["1:1"]?.children).toEqual([]);
    expect(r.nodes["1:3"]?.children).toEqual(["1:2"]);
  });
  it("removes a subtree and detaches from parent", () => {
    const r = run([{ op: "remove", id: "1:1" }]);
    expect(Object.keys(r.nodes)).toEqual(["1:3"]);
    const r2 = run([{ op: "remove", id: "1:2" }]);
    expect(r2.nodes["1:1"]?.children).toEqual([]);
    ok(r2);
  });
  it("moves with index", () => {
    const r = applyPatch(
      run([{ op: "upsert", node: frame("1:4", "1:1") as Node }]),
      { ops: [{ op: "move", id: "1:4", parent: "1:3" }, { op: "move", id: "1:2", parent: "1:3", index: 0 }] },
    );
    expect(r.nodes["1:3"]?.children).toEqual(["1:2", "1:4"]);
    expect(r.nodes["1:1"]?.children).toEqual([]);
    expect(r.nodes["1:2"]?.parent).toBe("1:3");
    ok(r);
  });
});

describe("migrate", () => {
  it("runs the chain in order", () => {
    const order: number[] = [];
    const chain = [
      { from: 2, to: 3, fn: (d: any) => (order.push(2), { ...d, trail: [...d.trail, "2>3"] }) },
      { from: 1, to: 2, fn: (d: any) => (order.push(1), { ...d, trail: [...d.trail, "1>2"] }) },
    ];
    const r = migrate({ specVersion: 1, trail: [] } as any, { chain, target: 3 });
    expect(order).toEqual([1, 2]);
    expect(r).toEqual({ specVersion: 3, trail: ["1>2", "2>3"] });
  });
  it("current docs pass, newer docs are rejected", () => {
    expect(migrate(minimal()).specVersion).toBe(SPEC_VERSION);
    expect(() => migrate({ specVersion: SPEC_VERSION + 1 })).toThrow();
  });
});

describe("generated schemas", () => {
  it("are up to date (run yarn gen:schemas)", () => {
    for (const [f, text] of Object.entries(render())) {
      expect(readFileSync(new URL(`../schemas/${f}`, import.meta.url), "utf8")).toBe(text);
    }
  });
});
