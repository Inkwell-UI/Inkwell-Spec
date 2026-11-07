// S1 menu JSON (`MenuDef`) and S9 per-SWF source (`MenuSettings`).
import { z } from "zod";
import { TRANSLATION_MOD } from "./localization.js";
import { FIRST_RUNTIME_VERSION } from "./runtime.js";

/** The runtime has 16 template slots in total, shared by every installed mod (S1 rule 2). */
export const MENU_SLOTS = 16;
/** Editor lint `menu-limit`: error above MENU_SLOTS menus in one project, warning above this (O3). */
export const MENU_WARN_THRESHOLD = 4;
export const MENU_MIN_SPEC_VERSION = 6;
export const MENU_NAME = /^[A-Za-z][A-Za-z0-9_]{1,63}$/;
export const MOD_EVENT_NAME = /^[A-Za-z0-9_]{1,64}$/;
/** `triggers.systemMenu`: the text (or `$Key` translation key) of the entry added to the Journal's System page. */
export const SYSTEM_MENU_LABEL = { min: 1, max: 64 } as const;
export const HOTKEY_RANGE = { min: 2, max: 255 } as const; // 1 (Escape) is reserved
export const DEPTH_RANGE = { min: 0, max: 15 } as const;
export const INPUT_CONTEXTS = ["none", "menuMode"] as const;
export const UI_SCALE_RANGE = { min: 0.2, max: 2 } as const;
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

/** Screen shapes a menu may ship its own SWF for; `swf` itself is the 16:9 layout (4K is 16:9 too) and the fallback. */
export const MENU_VARIANT_ASPECTS = ["16:10", "21:9", "32:9"] as const;
/** `Interface/Inkwell/Mod/Menu.swf` + "21:9" -> `Interface/Inkwell/Mod/Menu_21x9.swf` (the editor's file name for a variant). */
export const variantSwfPath = (swf: string, aspect: string): string => swf.replace(/\.swf$/i, `_${aspect.replace(":", "x")}.swf`);
/** A screen shape as "W:H" (both 1 to 999). */
export const VARIANT_ASPECT = /^[1-9]\d{0,2}:[1-9]\d{0,2}$/;
/** Width / height of a "W:H" key, or null when it is not one. */
export const aspectRatioOf = (key: string): number | null => {
  if (!VARIANT_ASPECT.test(key)) return null;
  const [w, h] = key.split(":").map(Number);
  return w! / h!;
};
/**
 * Runtime rule as a pure function: the SWF to open on a screen of `ratio` (width / height): the one of `swf` (as 16:9) and `variants` whose ratio is
 * nearest (compared as ratios of ratios, so 21:9 vs 16:9 is as far as 9:21 vs 9:16); a tie keeps `swf`. A bad variant key is ignored.
 */
export function pickSwf(swf: string, variants: Record<string, string> | undefined, ratio: number): string {
  let best = swf;
  let bestD = Math.abs(Math.log(ratio / (16 / 9)));
  for (const [k, p] of Object.entries(variants ?? {})) {
    const r = aspectRatioOf(k);
    const d = r === null ? Infinity : Math.abs(Math.log(ratio / r));
    if (d < bestD - 1e-9) (best = p), (bestD = d);
  }
  return best;
}
const MenuName = z.string().regex(MENU_NAME, "name must match ^[A-Za-z][A-Za-z0-9_]{1,63}$");
const Hotkey = z.number().int().min(HOTKEY_RANGE.min).max(HOTKEY_RANGE.max);

const Flags = z.looseObject({
  pausesGame: z.boolean().default(false),
  cursor: z.boolean().default(false),
  modal: z.boolean().default(false),
  closeOnEscape: z.boolean().default(true),
  /** Skyrim's own full-screen menu blur while the menu is open. Optional, not defaulted: absent means "never chosen", so the editor may set it from a Figma background blur; absent = off at run time. */
  blur: z.boolean().optional(),
  /** Hides the HUD (health bars, compass) while the menu is open. Optional like `blur`: absent = off, so existing menu files stay as they are. */
  hideHud: z.boolean().optional(),
});
const Triggers = z.looseObject({
  hotkey: Hotkey.optional(),
  papyrus: z.boolean().default(true),
  modEvent: z.string().regex(MOD_EVENT_NAME).optional(),
  systemMenu: z.string().min(SYSTEM_MENU_LABEL.min).max(SYSTEM_MENU_LABEL.max).optional(),
});
const InputContext = z.enum(INPUT_CONTEXTS);
const Depth = z.number().int().min(DEPTH_RANGE.min).max(DEPTH_RANGE.max).default(3);

/** One menu per file in `Data/SKSE/Plugins/Inkwell/menus/`. Any invalid field skips the whole file (the runtime's rule, not the schema's). */
export const MenuDef = z.looseObject({
  specVersion: z.number().int(),
  name: MenuName,
  swf: SwfPath,
  /** Optional layouts for other screen shapes, keyed "W:H" (see `pickSwf`); an older runtime ignores it and always opens `swf`. */
  variants: z.record(z.string().regex(VARIANT_ASPECT), SwfPath).optional(),
  minRuntime: z.string().regex(/^\d{1,3}\.\d{1,3}\.\d{1,3}$/).default(FIRST_RUNTIME_VERSION),
  flags: Flags.default(() => Flags.parse({})),
  /** Absent = "menuMode" if flags.modal else "none" (see effectiveInputContext). */
  inputContext: InputContext.optional(),
  depth: Depth,
  triggers: Triggers.default(() => Triggers.parse({})),
  /** V13.2: the mod name of the translation files (`Interface/Translations/<translations>_<LANGUAGE>.txt`); absent = the menu has no translations. */
  translations: z.string().regex(TRANSLATION_MOD).optional(),
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
  // Editor build choice, not in the deployed MenuDef: true = the SWF holds only the layers the default theme shows (a layer another theme shows is left out, so the INI Theme cannot switch it).
  // Absent/false = such layers are compiled hidden and the INI Theme switches them. Additive (2026-11-05): older readers keep it as an unknown key.
  stripThemeLayers: z.boolean().optional(),
  extra: Extra,
});
export type MenuSettings = z.infer<typeof MenuSettings>;

/** O2 (owner decision 2026-10-26, verified in game on SE 1.7.104): where a custom menu's SWF goes, relative to `Data/`. One place to change if the engine ever refuses a sub-path. */
export const menuSwfPath = (modId: string, swfFile: string): string => `Interface/Inkwell/${modId}/${swfFile}.swf`;
