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
