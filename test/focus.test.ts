import { describe, expect, it } from "vitest";
import { focusGraph, Overlay, resolvePrompt } from "../src/index.js";

const all = (): boolean => true;
const codes = (g: ReturnType<typeof focusGraph>): string[] => g.issues.map((i) => `${i.code}:${i.nodeId}`);

describe("focus graph (W3)", () => {
  it("orders by order then id and wraps the default moves", () => {
    const g = focusGraph({ b: { focus: { order: 2 } }, a: { focus: { order: 2 } }, c: { focus: { order: 1 } }, x: { role: "button" } as never }, all);
    expect(g.order).toEqual(["c", "a", "b"]);
    expect(g.moves["c"]).toEqual({ up: "b", down: "a", left: "b", right: "a" });
    expect(g.issues).toEqual([]);
  });
  it("overrides replace one direction", () => {
    const g = focusGraph({ a: { focus: { order: 1, overrides: { down: "c" } } }, b: { focus: { order: 2 } }, c: { focus: { order: 3 } } }, all);
    expect(g.moves["a"]!.down).toBe("c");
    expect(g.moves["a"]!.right).toBe("b");
  });
  it("reports missing targets, unknown directions and ignores deleted layers", () => {
    const g = focusGraph({ a: { focus: { order: 1, overrides: { up: "gone", left: "z", diag: "a" } } }, z: {}, old: { focus: { order: 0 } } }, (id) => id !== "gone" && id !== "old");
    expect(codes(g)).toEqual(["focus-node-missing:old", "focus-target-missing:a", "focus-target-missing:a", "focus-direction-unknown:a"]);
    expect(g.issues[1]!.message).toMatch(/not a layer/);
    expect(g.issues[2]!.message).toMatch(/not focusable/);
    expect(g.moves["a"]!.up).toBe("a"); // the default (one node wraps to itself)
  });
  it("finds unreachable nodes and dead ends", () => {
    const self = { up: "a", down: "a", left: "a", right: "a" };
    expect(codes(focusGraph({ a: { focus: { order: 1, overrides: self } }, b: { focus: { order: 2 } } }, all))).toEqual(["focus-unreachable:b"]);
    const trap = { up: "b", down: "b", left: "b", right: "b" };
    expect(codes(focusGraph({ a: { focus: { order: 1 } }, b: { focus: { order: 2, overrides: trap } } }, all))).toEqual(["focus-dead-end:b"]);
  });
  it("an empty graph has no issues; old overlays still parse and keep unknown keys", () => {
    expect(focusGraph({}, all)).toEqual({ order: [], moves: {}, issues: [] });
    const o = Overlay.parse({ specVersion: 8, nodes: { a: { focus: { order: 1, overrides: { up: "b", later: 1 }, extra: true }, prompt: { action: "Accept", future: 2 } } } });
    expect(o.nodes["a"]!.focus).toEqual({ order: 1, overrides: { up: "b", later: 1 }, extra: true });
    expect(o.nodes["a"]!.prompt).toEqual({ action: "Accept", future: 2 });
  });
});

describe("prompt (W4)", () => {
  it("fills the defaults of a known action and lets glyphs override", () => {
    expect(resolvePrompt({ action: "Accept" })).toEqual({ glyphs: { keyboard: "Enter", xbox: "A", playstation: "Cross" }, problems: [] });
    expect(resolvePrompt({ action: "Cancel", keyboard: "Tab", xbox: "Y" }).glyphs).toEqual({ keyboard: "Tab", xbox: "Y", playstation: "Circle" });
  });
  it("needs an action, every glyph of a custom action, and valid glyph names", () => {
    expect(resolvePrompt({}).problems).toHaveLength(1);
    expect(resolvePrompt({ action: "Wait", keyboard: "T", xbox: "X" }).problems).toEqual(['No playstation glyph: "Wait" has no default, so set one.']);
    expect(resolvePrompt({ action: "Accept", xbox: "Z", keyboard: "too long key" }).problems).toHaveLength(2);
  });
});
