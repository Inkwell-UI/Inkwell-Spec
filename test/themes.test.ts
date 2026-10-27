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
    for (const k of ["fills/0/color", "fills/12/color", "strokes/1/color", "opacity", "visible", "transform/width", "transform/height", "runs/0/fill/color", "runs/0/size"]) expect(isThemeBindingKey(k), k).toBe(true);
    for (const k of ["fills/x/color", "fills/0/opacity", "transform/rotation", "runs/1/size", "xopacity"]) expect(isThemeBindingKey(k), k).toBe(false);
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
