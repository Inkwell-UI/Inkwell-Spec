import { describe, expect, it } from "vitest";
import { isThemeBindingKey, PluginMessage, Swf, Theme, themedCollection } from "../src/index.js";

const colors: Theme = { name: "Colors", modes: ["Vanilla", "Nordic"], variables: { "VariableID:1:2": { name: "colors/accent", type: "color", values: { Vanilla: { r: 1, g: 1, b: 1 }, Nordic: { r: 0.2, g: 0.4, b: 0.9, a: 1 } } } } };
const sizes: Theme = { name: "Sizes", modes: ["Default"], variables: {} };

describe("themes (SPEC-CHANGES V6)", () => {
  it("picks the preferred collection, else the first with two or more modes", () => {
    expect(themedCollection([sizes, colors])).toBe(colors);
    expect(themedCollection([sizes, colors], "Sizes")).toBe(sizes);
    expect(themedCollection([sizes])).toBeUndefined();
    expect(themedCollection(undefined)).toBeUndefined();
  });
  it("knows the binding keys", () => {
    for (const k of ["fills/0/color", "fills/12/color", "strokes/1/color", "opacity", "visible", "transform/width", "transform/height", "runs/0/fill/color", "runs/0/size", "fills/0/stops/2/color", "strokes/1/stops/0/color", "content", "lineHeight", "letterSpacing", "strokes/0/weight", "strokes/2/side/left", "autoLayout/spacing", "autoLayout/padding/3"]) expect(isThemeBindingKey(k), k).toBe(true);
    for (const k of ["fills/x/color", "fills/0/opacity", "transform/rotation", "runs/1/size", "xopacity", "fills/0/stops/color", "fills/0/stops/x/color", "fills/stops/0/color", "strokes/0/side/middle", "autoLayout/padding/4", "strokes/x/weight"]) expect(isThemeBindingKey(k), k).toBe(false);
  });
  it("validates a collection and rejects a variable of an unknown type", () => {
    expect(Theme.safeParse(colors).success).toBe(true);
    expect(Theme.safeParse({ ...colors, variables: { a: { name: "x", type: "vector", values: {} } } }).success).toBe(false);
  });
  it("rides on the swf metadata of a patch and in the IR", () => {
    const m = { type: "patch", seq: 1, swfId: "1:1", swf: { id: "1:1", name: "menu", stage: { width: 1280, height: 720 }, themes: [colors] }, patch: { ops: [] } };
    expect(PluginMessage.parse(m)).toMatchObject({ swf: { themes: [colors] } });
    expect(PluginMessage.safeParse({ ...m, swf: { ...m.swf, themes: [{ name: "x" }] } }).success).toBe(false);
    const ir = { specVersion: 7, id: "1:1", name: "menu", target: { kind: "customMenu" }, stage: { width: 1, height: 1 }, root: "r", nodes: {}, themes: [colors] };
    expect(Swf.parse(ir).themes).toEqual([colors]);
  });
});

import { applyTheme, themeModes } from "../src/index.js";

describe("applyTheme", () => {
  const col: Theme = {
    name: "Colors", modes: ["Vanilla", "Nordic"],
    variables: {
      A: { name: "accent", type: "color", values: { Vanilla: { r: 1, g: 1, b: 1 }, Nordic: { r: 0, g: 0, b: 1 } } },
      S: { name: "size", type: "number", values: { Vanilla: 20, Nordic: 30 } },
      O: { name: "alpha", type: "number", values: { Vanilla: 100, Nordic: 50 } },
      V: { name: "show", type: "boolean", values: { Vanilla: true, Nordic: false } },
    },
  };
  const t = { x: 0, y: 0, width: 10, height: 10, rotation: 0 };
  const b = { parent: null, children: [], transform: t, anchor: { h: "left", v: "top" }, visible: true, opacity: 1 };
  const red = { type: "solid", color: { r: 1, g: 0, b: 0 } };
  const ir = Swf.parse({
    specVersion: 7, id: "s", name: "s", target: { kind: "customMenu" }, stage: { width: 1, height: 1 }, root: "f", themes: [{ name: "Sizes", modes: ["One"] }, col],
    nodes: {
      f: { ...b, id: "f", name: "f", type: "frame", clipContent: false, children: ["r", "g", "t"], fills: [red], bindings: { "fills/0/color": { id: "A" }, opacity: { id: "O" }, "transform/width": { id: "S" } } },
      r: { ...b, id: "r", name: "r", parent: "f", type: "shape", paths: [], fills: [red], strokes: [{ fill: red, weight: 1, alignment: "center" }], bindings: { "fills/0/color": { id: "A" }, "strokes/0/color": { id: "A" }, visible: { id: "V" } } },
      g: { ...b, id: "g", name: "g", parent: "f", type: "shape", paths: [], fills: [{ type: "linear", stops: [] }], strokes: [], bindings: { "fills/0/color": { id: "A" }, "fills/3/color": { id: "A" }, opacity: { id: "MISSING" } } },
      t: { ...b, id: "t", name: "t", parent: "f", type: "text", content: "x", sizing: "fixed", align: "left", verticalAlign: "top", lineHeight: { unit: "auto" }, letterSpacing: { unit: "px", value: 0 }, textFit: "none", truncate: false,
        runs: [{ start: 0, end: 1, font: { kind: "alias", name: "a" }, size: 12, fill: red }], bindings: { "runs/0/fill/color": { id: "A" }, "runs/0/size": { id: "S" }, opacity: { id: "A" } } },
    },
  });
  it("lists the modes of the themed collection", () => expect(themeModes(ir)).toEqual(["Vanilla", "Nordic"]));
  it("resolves every kind of binding in a mode and leaves the input alone", () => {
    const n = applyTheme(ir, "Nordic").nodes as any;
    expect(n.f).toMatchObject({ fills: [{ color: { r: 0, g: 0, b: 1 } }], opacity: 0.5, transform: { width: 30 } });
    expect(n.r).toMatchObject({ fills: [{ color: { b: 1 } }], strokes: [{ fill: { color: { b: 1 } } }], visible: false });
    expect(n.t).toMatchObject({ runs: [{ size: 30, fill: { color: { b: 1 } } }], opacity: 1 }); // opacity bound to a colour variable: wrong type, ignored
    expect((ir.nodes as any).f.opacity).toBe(1);
  });
  it("takes a mode's alpha as the paint opacity instead of multiplying it with the stored one", () => {
    const c: Theme = { name: "C", modes: ["A", "B"], variables: { P: { name: "p", type: "color", values: { A: { r: 0, g: 0, b: 0, a: 0.7 }, B: { r: 0.1, g: 0.1, b: 0.1, a: 0.95 } } } } };
    const one = Swf.parse({ ...ir, themes: [c], nodes: { ...ir.nodes, f: { ...(ir.nodes as any).f, fills: [{ ...red, opacity: 0.7 }], bindings: { "fills/0/color": { id: "P" } } } } });
    expect((applyTheme(one, "B").nodes as any).f.fills[0]).toMatchObject({ color: { r: 0.1 }, opacity: 0.95 });
    expect((applyTheme(one, "A").nodes as any).f.fills[0]).toMatchObject({ opacity: 0.7 });
  });
  it("themes a frame's border too", () => {
    const c: Theme = { name: "C", modes: ["A", "B"], variables: { P: { name: "p", type: "color", values: { A: { r: 1, g: 1, b: 1 }, B: { r: 1, g: 1, b: 1, a: 0 } } } } };
    const fr = { ...(ir.nodes as any).f, strokes: [{ fill: red, weight: 1, alignment: "inside" }], bindings: { "strokes/0/color": { id: "P" } } };
    const one = Swf.parse({ ...ir, themes: [c], nodes: { ...ir.nodes, f: fr } });
    expect((applyTheme(one, "B").nodes as any).f.strokes[0].fill).toMatchObject({ opacity: 0 });
  });
  it("themes the colour of a gradient stop, in a fill and in a frame border", () => {
    const c: Theme = { name: "C", modes: ["A", "B"], variables: { P: { name: "p", type: "color", values: { A: { r: 1, g: 0, b: 0 }, B: { r: 0, g: 0, b: 1, a: 0.5 } } } } };
    const grad = { type: "linear", stops: [{ position: 0, color: { r: 1, g: 1, b: 1 } }, { position: 1, color: { r: 0, g: 0, b: 0 } }] };
    const fr = { ...(ir.nodes as any).f, fills: [grad], strokes: [{ fill: grad, weight: 1, alignment: "inside" }], bindings: { "fills/0/stops/1/color": { id: "P" }, "strokes/0/stops/0/color": { id: "P" }, "fills/0/stops/9/color": { id: "P" } } };
    const one = Swf.parse({ ...ir, themes: [c], nodes: { ...ir.nodes, f: fr } });
    const f = (applyTheme(one, "B").nodes as any).f;
    expect(f.fills[0].stops).toEqual([{ position: 0, color: { r: 1, g: 1, b: 1 } }, { position: 1, color: { r: 0, g: 0, b: 1, a: 0.5 } }]);
    expect(f.strokes[0].fill.stops[0].color).toEqual({ r: 0, g: 0, b: 1, a: 0.5 });
    expect(f.strokes[0].fill.stops[1].color).toEqual({ r: 0, g: 0, b: 0 }); // untouched stop; a stop index that does not exist changes nothing
  });
  describe("more collections, pinned modes and more properties", () => {
    const cols: Theme[] = [
      { name: "Colors", modes: ["Vanilla", "Nordic"], variables: { C: { name: "c", type: "color", values: { Vanilla: { r: 1, g: 0, b: 0 }, Nordic: { r: 0, g: 0, b: 1 } } } } },
      { name: "Density", modes: ["Compact", "Nordic"], variables: { G: { name: "gap", type: "number", values: { Compact: 4, Nordic: 12 } } } },
      { name: "Prims", modes: ["Only"], variables: { W: { name: "w", type: "number", values: { Only: 3 } }, T: { name: "t", type: "string", values: { Only: "Hi" } } } },
    ];
    const frame = (id: string, parent: string | null, extra: object = {}) => ({ ...b, id, name: id, parent, type: "frame", clipContent: false, children: [], ...extra });
    const mk = (nodes: object) => Swf.parse({ specVersion: 7, id: "s", name: "s", target: { kind: "customMenu" }, stage: { width: 1, height: 1 }, root: "f", themes: cols, nodes });
    it("a theme is every mode name of every multi-mode collection; each collection takes its own mode of that name, else its first", () => {
      expect(themeModes(mk({ f: frame("f", null) }))).toEqual(["Vanilla", "Nordic", "Compact"]);
      const one = mk({ f: frame("f", null, { fills: [red], bindings: { "fills/0/color": { id: "C" }, "autoLayout/spacing": { id: "G" } }, autoLayout: { mode: "horizontal", spacing: 0, padding: [0, 0, 0, 0] } }) });
      let f = (applyTheme(one, "Nordic").nodes as any).f;
      expect([f.fills[0].color.b, f.autoLayout.spacing]).toEqual([1, 12]); // both collections have a Nordic
      f = (applyTheme(one, "Compact").nodes as any).f;
      expect([f.fills[0].color.r, f.autoLayout.spacing]).toEqual([1, 4]); // Colors has no Compact: stays Vanilla
    });
    it("a variable of a single-mode collection resolves", () => {
      const one = mk({ f: frame("f", null, { strokes: [{ fill: red, weight: 1, alignment: "inside" }], bindings: { "strokes/0/weight": { id: "W" } } }) });
      expect((applyTheme(one, "Nordic").nodes as any).f.strokes[0].weight).toBe(3);
    });
    it("a layer pinned to a mode keeps it, and so do its descendants", () => {
      const one = mk({
        f: frame("f", null, { children: ["p", "k"] }),
        p: frame("p", "f", { modes: { Colors: "Vanilla" }, children: ["k2"], fills: [{ type: "solid", color: { r: 0, g: 1, b: 0 } }], bindings: { "fills/0/color": { id: "C" } } }),
        k2: frame("k2", "p", { fills: [{ type: "solid", color: { r: 0, g: 1, b: 0 } }], bindings: { "fills/0/color": { id: "C" } } }),
        k: frame("k", "f", { fills: [{ type: "solid", color: { r: 0, g: 1, b: 0 } }], bindings: { "fills/0/color": { id: "C" } } }),
      });
      const n = applyTheme(one, "Nordic").nodes as any;
      expect([n.p.fills[0].color.r, n.k2.fills[0].color.r, n.k.fills[0].color.b]).toEqual([1, 1, 1]); // pinned and inherited stay Vanilla (red), the free one is Nordic (blue)
    });
    it("a string variable sets a text's content and its run; line height, letter spacing, stroke sides and padding follow numbers", () => {
      const tx = { ...b, id: "t", name: "t", parent: "f", type: "text", content: "old text", sizing: "fixed", align: "left", verticalAlign: "top", lineHeight: { unit: "auto" }, letterSpacing: { unit: "px", value: 0 }, textFit: "none", truncate: false,
        runs: [{ start: 0, end: 8, font: { kind: "alias", name: "a" }, size: 12, fill: red }], bindings: { content: { id: "T" }, lineHeight: { id: "G" }, letterSpacing: { id: "W" } } };
      const fr = frame("f", null, { children: ["t"], strokes: [{ fill: red, weight: 2, alignment: "inside", sides: { top: 0, right: 0, bottom: 2, left: 0 } }], autoLayout: { mode: "vertical", spacing: 1, padding: [1, 1, 1, 1] },
        bindings: { "strokes/0/side/bottom": { id: "G" }, "autoLayout/padding/2": { id: "G" } } });
      const n = applyTheme(mk({ f: fr, t: tx }), "Nordic").nodes as any;
      expect(n.t).toMatchObject({ content: "Hi", runs: [{ start: 0, end: 2 }], lineHeight: { unit: "px", value: 12 }, letterSpacing: { unit: "px", value: 3 } });
      expect(n.f.strokes[0]).toMatchObject({ weight: 12, sides: { top: 0, bottom: 12 } });
      expect(n.f.autoLayout.padding).toEqual([1, 1, 12, 1]);
    });
  });
  it("leaves a gradient, a missing paint and a missing variable as they are", () => {
    const g = (applyTheme(ir, "Nordic").nodes as any).g;
    expect(g).toEqual((ir.nodes as any).g);
  });
  it("returns the IR itself for an unknown mode, no mode or no themed collection", () => {
    expect(applyTheme(ir, "Nope")).toBe(ir);
    expect(applyTheme(ir, undefined)).toBe(ir);
    expect(applyTheme({ ...ir, themes: undefined }, "Nordic")).toEqual({ ...ir, themes: undefined });
  });
});
