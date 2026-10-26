// S1 menu JSON (`MenuDef`) and S9 per-SWF source (`MenuSettings`).
import { z } from "zod";
import { FIRST_RUNTIME_VERSION } from "./runtime.js";

/** The runtime has 16 template slots in total, shared by every installed mod (S1 rule 2). */
export const MENU_SLOTS = 16;
/** Editor lint `menu-limit`: error above MENU_SLOTS menus in one project, warning above this (O3). */
export const MENU_WARN_THRESHOLD = 4;
export const MENU_MIN_SPEC_VERSION = 6;
export const MENU_NAME = /^[A-Za-z][A-Za-z0-9_]{1,63}$/;
export const MOD_EVENT_NAME = /^[A-Za-z0-9_]{1,64}$/;
export const HOTKEY_RANGE = { min: 2, max: 255 } as const; // 1 (Escape) is reserved
export const DEPTH_RANGE = { min: 0, max: 15 } as const;
export const INPUT_CONTEXTS = ["none", "menuMode"] as const;
export const UI_SCALE_RANGE = { min: 0.5, max: 2 } as const;
export const OFFSET_X_RANGE = { min: -960, max: 960 } as const;
export const OFFSET_Y_RANGE = { min: -540, max: 540 } as const;

const Extra = z.record(z.string(), z.unknown()).optional();

/**
 * S1 `swf` rule as a pure function: returns the bare movie name `LoadMovieEx` needs (`Interface/` and `.swf` stripped; sub-paths
 * stay: "Interface/Inkwell/MyMod/Wheel.swf" -> "Inkwell/MyMod/Wheel"), or null when the path is invalid.
 * Relative to Data/, forward slashes, starts with Interface/ (any case), ends with .swf (any case, a small widening of S1), no `..`, no `:`,
 * no leading `/`, no empty segments, a non-empty name.
 */
export function normalizeSwfPath(swf: string): string | null {
  if (typeof swf !== "string" || swf.includes("\\") || swf.includes(":") || swf.startsWith("/")) return null;
  if (!/^interface\//i.test(swf) || !/\.swf$/i.test(swf)) return null;
  const bare = swf.slice("interface/".length, -".swf".length);
  const segs = bare.split("/");
  if (bare === "" || segs.some((s) => s === "" || s === "." || s === "..")) return null;
  return bare;
}
const SwfPath = z.string().refine((s) => normalizeSwfPath(s) !== null, "swf must be relative to Data/, start with Interface/, end with .swf, use / and contain no '..', ':' or leading '/'");
const MenuName = z.string().regex(MENU_NAME, "name must match ^[A-Za-z][A-Za-z0-9_]{1,63}$");
const Hotkey = z.number().int().min(HOTKEY_RANGE.min).max(HOTKEY_RANGE.max);

const Flags = z.looseObject({
  pausesGame: z.boolean().default(false),
  cursor: z.boolean().default(false),
  modal: z.boolean().default(false),
  closeOnEscape: z.boolean().default(true),
});
const Triggers = z.looseObject({
  hotkey: Hotkey.optional(),
  papyrus: z.boolean().default(true),
  modEvent: z.string().regex(MOD_EVENT_NAME).optional(),
});
const InputContext = z.enum(INPUT_CONTEXTS);
const Depth = z.number().int().min(DEPTH_RANGE.min).max(DEPTH_RANGE.max).default(3);

/** One menu per file in `Data/SKSE/Plugins/Inkwell/menus/`. Any invalid field skips the whole file (the runtime's rule, not the schema's). */
export const MenuDef = z.looseObject({
  specVersion: z.number().int(),
  name: MenuName,
  swf: SwfPath,
  minRuntime: z.string().regex(/^\d{1,3}\.\d{1,3}\.\d{1,3}$/).default(FIRST_RUNTIME_VERSION),
  flags: Flags.default(() => Flags.parse({})),
  /** Absent = "menuMode" if flags.modal else "none" (see effectiveInputContext). */
  inputContext: InputContext.optional(),
  depth: Depth,
  triggers: Triggers.default(() => Triggers.parse({})),
  extra: Extra,
});
export type MenuDef = z.infer<typeof MenuDef>;

export const effectiveInputContext = (m: Pick<MenuDef, "inputContext" | "flags">): (typeof INPUT_CONTEXTS)[number] =>
  m.inputContext ?? (m.flags.modal ? "menuMode" : "none");

/** Menu names are unique case-insensitively among loaded menus. */
export const menuNameKey = (name: string): string => name.toLowerCase();

/** S9: the end-user defaults the editor writes to the commented INI (never to the deployed JSON). */
export const UserDefaults = z.looseObject({
  uiScale: z.number().min(UI_SCALE_RANGE.min).max(UI_SCALE_RANGE.max).optional(),
  offsetX: z.number().int().min(OFFSET_X_RANGE.min).max(OFFSET_X_RANGE.max).optional(),
  offsetY: z.number().int().min(OFFSET_Y_RANGE.min).max(OFFSET_Y_RANGE.max).optional(),
  theme: z.string().optional(),
});
export type UserDefaults = z.infer<typeof UserDefaults>;

/**
 * S9 `swfs/<name>/menu.json`: the author's source. Like MenuDef but `name` and `swf` are optional (derived at deploy as
 * `<modId>_<SwfName>` and `Interface/Inkwell/<modId>/<SwfName>.swf`), `minRuntime` is computed and not stored, and `userDefaults` is added.
 * Ambiguity: S9 says "without specVersion generated"; read as: specVersion is kept (project files carry it, like graphs).
 */
export const MenuSettings = z.looseObject({
  specVersion: z.number().int(),
  name: MenuName.optional(),
  swf: SwfPath.optional(),
  flags: Flags.default(() => Flags.parse({})),
  inputContext: InputContext.optional(),
  depth: Depth,
  triggers: Triggers.default(() => Triggers.parse({})),
  userDefaults: UserDefaults.optional(),
  extra: Extra,
});
export type MenuSettings = z.infer<typeof MenuSettings>;
