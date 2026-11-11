import { describe, expect, it } from "vitest";
import { Slices } from "../src/index.js";

const h = "a".repeat(40);
const doc = (s: object) => ({ specVersion: 8, assets: { [h]: s } });

describe("Slices", () => {
  it("accepts a 9-slice and a 3-slice (one pair at 0)", () => {
    expect(Slices.safeParse(doc({ l: 24, t: 24, r: 24, b: 24, w: 128, h: 128 })).success).toBe(true);
    expect(Slices.safeParse(doc({ l: 8, t: 0, r: 8, b: 0, w: 128, h: 16 })).success).toBe(true);
  });
  it("refuses insets without a stretchable middle, all zeros, negatives and bad hashes", () => {
    expect(Slices.safeParse(doc({ l: 64, t: 0, r: 64, b: 0, w: 128, h: 16 })).success).toBe(false);
    expect(Slices.safeParse(doc({ l: 0, t: 0, r: 0, b: 0, w: 128, h: 16 })).success).toBe(false);
    expect(Slices.safeParse(doc({ l: -1, t: 0, r: 8, b: 0, w: 128, h: 16 })).success).toBe(false);
    expect(Slices.safeParse({ specVersion: 8, assets: { nothash: { l: 1, t: 0, r: 1, b: 0, w: 8, h: 8 } } }).success).toBe(false);
  });
  it("keeps unknown keys", () => {
    const p = Slices.parse({ ...doc({ l: 1, t: 1, r: 1, b: 1, w: 8, h: 8, note: "x" }), future: 1 });
    expect((p as Record<string, unknown>)["future"]).toBe(1);
    expect((p.assets[h] as Record<string, unknown>)["note"]).toBe("x");
  });
});
