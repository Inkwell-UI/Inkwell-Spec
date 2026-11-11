// `slices.json` at the project root: 9-slice / 3-slice insets per image asset (PLAN-SLICING.md). Editor-owned: Figma cannot express a slice, so it is not in the IR.
import { z } from "zod";
import { AssetHash } from "./protocol.js";

const Inset = z.number().int().min(0).max(4096);

/**
 * Insets l/t/r/b in source px and the image size (w, h) they were set for. A 3-slice is a 9-slice with one pair at 0.
 * Each axis needs a stretchable middle (l + r < w, t + b < h) and at least one inset is above 0.
 */
export const Slice = z
  .looseObject({ l: Inset, t: Inset, r: Inset, b: Inset, w: z.number().int().min(1).max(4096), h: z.number().int().min(1).max(4096) })
  .refine((s) => s.l + s.r < s.w && s.t + s.b < s.h, "the insets leave no stretchable middle")
  .refine((s) => s.l + s.r + s.t + s.b > 0, "all insets are 0");
export type Slice = z.infer<typeof Slice>;

export const Slices = z.looseObject({ specVersion: z.number().int(), assets: z.record(AssetHash, Slice) });
export type Slices = z.infer<typeof Slices>;
