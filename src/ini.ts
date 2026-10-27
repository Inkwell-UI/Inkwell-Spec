// S2 user INI: model, tolerant parser, writers and the precedence helper. All pure; the C++ runtime mirrors parseIni and must pass the same vectors.
import { z } from "zod";
import { LOG_LEVELS } from "./runtime.js";
import { HOTKEY_RANGE, OFFSET_X_RANGE, OFFSET_Y_RANGE, UI_SCALE_RANGE, type MenuDef, type UserDefaults } from "./menu.js";

export const INI_DEFAULTS = { uiScale: 1, offsetX: 0, offsetY: 0, theme: "", logLevel: "info", devMode: false, port: 8788, token: "", watch: true } as const;
export const DEV_PORT_RANGE = { min: 1024, max: 65535 } as const;
const Extra = z.record(z.string(), z.unknown()).optional();

/** `[Menu.<name>]` in `<modId>.ini`. Every key is optional: absent = not set by the user. */
export const MenuIni = z.looseObject({
  /** 0 = no hotkey (removes the JSON hotkey); absent = JSON `triggers.hotkey`. */
  openKey: z.number().int().refine((n) => n === 0 || (n >= HOTKEY_RANGE.min && n <= HOTKEY_RANGE.max), "0 or 2..255").optional(),
  uiScale: z.number().min(UI_SCALE_RANGE.min).max(UI_SCALE_RANGE.max).optional(),
  offsetX: z.number().int().min(OFFSET_X_RANGE.min).max(OFFSET_X_RANGE.max).optional(),
  offsetY: z.number().int().min(OFFSET_Y_RANGE.min).max(OFFSET_Y_RANGE.max).optional(),
  theme: z.string().optional(),
});
export type MenuIni = z.infer<typeof MenuIni>;

/** `[Widget.<name>]`: parsed and kept, not applied in 0.3 (O7). */
export const WidgetIni = z.looseObject({ offsetX: z.number().int().optional(), offsetY: z.number().int().optional(), scale: z.number().positive().optional() });

export const RuntimeIni = z.looseObject({
  /** Keyed by the menu name as first written in the file; look up with `findMenuIni`. */
  menus: z.record(z.string(), MenuIni).default({}),
  widgets: z.record(z.string(), WidgetIni).default({}),
  /** Runtime-wide sections: read only from `Inkwell.ini`. */
  runtime: z.looseObject({ logLevel: z.enum(LOG_LEVELS).optional() }).optional(),
  dev: z.looseObject({
    devMode: z.boolean().optional(),
    port: z.number().int().min(DEV_PORT_RANGE.min).max(DEV_PORT_RANGE.max).optional(),
    token: z.string().regex(/^[0-9a-f]{64}$/).optional(), // empty in the file = absent here
    watch: z.boolean().optional(),
  }).optional(),
  extra: Extra,
});
export type RuntimeIni = z.infer<typeof RuntimeIni>;

export type IniProblem = { line: number; section: string; key: string; message: string };
export type IniKind = "mod" | "runtime";

type Setter = (target: any, raw: string) => string | undefined; // returns a problem message, or undefined when applied
const int = (min: number, max: number, set: (t: any, n: number) => void): Setter => (t, raw) => {
  if (!/^[+-]?\d+$/.test(raw)) return `expected a whole number, got '${raw}'`;
  const n = Number(raw);
  if (n < min || n > max) return `${n} is outside ${min}..${max}`;
  set(t, n);
};
const flag: (set: (t: any, b: boolean) => void) => Setter = (set) => (t, raw) => (raw === "0" || raw === "1" ? void set(t, raw === "1") : `expected 0 or 1, got '${raw}'`);

const MENU_KEYS: Record<string, Setter> = {
  openkey: (t, raw) => (/^[+-]?\d+$/.test(raw) && (Number(raw) === 0 || (Number(raw) >= HOTKEY_RANGE.min && Number(raw) <= HOTKEY_RANGE.max)) ? void (t.openKey = Number(raw)) : `expected 0 or ${HOTKEY_RANGE.min}..${HOTKEY_RANGE.max}, got '${raw}'`),
  uiscale: (t, raw) => {
    if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(raw)) return `expected a number, got '${raw}'`;
    const n = Number(raw), c = Math.min(UI_SCALE_RANGE.max, Math.max(UI_SCALE_RANGE.min, n));
    t.uiScale = c;
    if (c !== n) return `clamped ${n} to ${c}`; // S2: out of range is clamped with a warning (the value is kept)
  },
  offsetx: int(OFFSET_X_RANGE.min, OFFSET_X_RANGE.max, (t, n) => (t.offsetX = n)),
  offsety: int(OFFSET_Y_RANGE.min, OFFSET_Y_RANGE.max, (t, n) => (t.offsetY = n)),
  theme: (t, raw) => void (raw === "" ? delete t.theme : (t.theme = raw)),
};
const WIDGET_KEYS: Record<string, Setter> = {
  offsetx: int(-100000, 100000, (t, n) => (t.offsetX = n)),
  offsety: int(-100000, 100000, (t, n) => (t.offsetY = n)),
  scale: (t, raw) => (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(raw) && Number(raw) > 0 ? void (t.scale = Number(raw)) : `expected a positive number, got '${raw}'`),
};
const RUNTIME_KEYS: Record<string, Setter> = {
  loglevel: (t, raw) => ((LOG_LEVELS as readonly string[]).includes(raw.toLowerCase()) ? void (t.logLevel = raw.toLowerCase()) : `expected one of ${LOG_LEVELS.join(", ")}, got '${raw}'`),
};
const DEV_KEYS: Record<string, Setter> = {
  devmode: flag((t, b) => (t.devMode = b)),
  port: int(DEV_PORT_RANGE.min, DEV_PORT_RANGE.max, (t, n) => (t.port = n)),
  token: (t, raw) => (raw === "" ? void delete t.token : /^[0-9a-f]{64}$/.test(raw) ? void (t.token = raw) : "expected 64 lower-case hex digits"),
  watch: flag((t, b) => (t.watch = b)),
};

/**
 * Tolerant parser: never throws, ignores unknown sections and keys, reports each invalid value (that key is ignored; one exception:
 * UIScale is clamped). `[Runtime]`/`[Dev]` are read only when `kind` is "runtime" (a mod INI must not switch dev mode on).
 * Format: `[section]`, `key=value`, whole-line comments with ; or #, case-insensitive names, trimmed values, last duplicate wins.
 */
export function parseIni(text: string, kind: IniKind = "mod"): { ini: RuntimeIni; problems: IniProblem[] } {
  const ini: any = { menus: {}, widgets: {} };
  const problems: IniProblem[] = [];
  const names = { menu: new Map<string, string>(), widget: new Map<string, string>() };
  let section = "", target: any, keys: Record<string, Setter> | undefined;
  const lines = String(text ?? "").replace(/^﻿/, "").split(/\r\n|\r|\n/);
  lines.forEach((rawLine, i) => {
    const line = rawLine.trim(), no = i + 1;
    if (line === "" || line[0] === ";" || line[0] === "#") return;
    const sec = /^\[(.*)\]$/.exec(line);
    if (sec) {
      section = sec[1]!.trim(); target = keys = undefined;
      const lower = section.toLowerCase();
      const sub = (p: string) => section.slice(p.length).trim();
      for (const [prefix, bag, map, table] of [["menu.", ini.menus, names.menu, MENU_KEYS], ["widget.", ini.widgets, names.widget, WIDGET_KEYS]] as const) {
        if (lower.startsWith(prefix) && sub(prefix)) {
          const first = map.get(sub(prefix).toLowerCase()) ?? (map.set(sub(prefix).toLowerCase(), sub(prefix)), sub(prefix));
          target = bag[first] ??= {}; keys = table;
        }
      }
      if (lower === "runtime" || lower === "dev") {
        if (kind === "mod") problems.push({ line: no, section, key: "", message: `[${section}] is only read from Inkwell.ini; ignored` });
        else { target = ini[lower] ??= {}; keys = lower === "dev" ? DEV_KEYS : RUNTIME_KEYS; }
      }
      return;
    }
    const eq = line.indexOf("=");
    if (eq < 0) { problems.push({ line: no, section, key: "", message: "not a key=value line; ignored" }); return; }
    if (!keys) return; // unknown section, or a section skipped above
    const key = line.slice(0, eq).trim(), set = keys[key.toLowerCase()];
    if (!set) return; // unknown key
    const msg = set(target, line.slice(eq + 1).trim());
    if (msg) problems.push({ line: no, section, key, message: msg });
  });
  for (const k of ["runtime", "dev"]) if (ini[k] && Object.keys(ini[k]).length === 0) delete ini[k];
  return { ini: ini as RuntimeIni, problems };
}

/** Looks a menu section up case-insensitively (menu names are unique that way). */
export function findMenuIni(ini: Pick<RuntimeIni, "menus">, menuName: string): MenuIni | undefined {
  const k = menuName.toLowerCase();
  return Object.entries(ini.menus).find(([n]) => n.toLowerCase() === k)?.[1];
}

const f2 = (n: number) => n.toFixed(2);
const menuLines = (m: MenuIni, c = ""): string[] => [
  ...(m.openKey !== undefined ? [`${c}OpenKey=${m.openKey}`] : []),
  ...(m.uiScale !== undefined ? [`${c}UIScale=${f2(m.uiScale)}`] : []),
  ...(m.offsetX !== undefined ? [`${c}OffsetX=${m.offsetX}`] : []),
  ...(m.offsetY !== undefined ? [`${c}OffsetY=${m.offsetY}`] : []),
  ...(m.theme !== undefined ? [`${c}Theme=${m.theme}`] : []),
];
const b01 = (b: boolean) => (b ? "1" : "0");

/** Serialises a model: every set key, uncommented, no comments. `parseIni(writeIni(x))` gives back `x` (for valid values). Used for `Inkwell.ini`. */
export function writeIni(ini: Partial<RuntimeIni>): string {
  const out: string[] = [];
  const block = (head: string, lines: string[]) => lines.length && out.push(`[${head}]`, ...lines, "");
  block("Runtime", ini.runtime?.logLevel !== undefined ? [`LogLevel=${ini.runtime.logLevel}`] : []);
  const d = ini.dev;
  block("Dev", d ? [
    ...(d.devMode !== undefined ? [`DevMode=${b01(d.devMode)}`] : []), ...(d.port !== undefined ? [`Port=${d.port}`] : []),
    ...(d.token !== undefined ? [`Token=${d.token}`] : []), ...(d.watch !== undefined ? [`Watch=${b01(d.watch)}`] : []),
  ] : []);
  for (const [n, m] of Object.entries(ini.menus ?? {})) block(`Menu.${n}`, menuLines(m));
  for (const [n, w] of Object.entries(ini.widgets ?? {}))
    block(`Widget.${n}`, [...(w.offsetX !== undefined ? [`OffsetX=${w.offsetX}`] : []), ...(w.offsetY !== undefined ? [`OffsetY=${w.offsetY}`] : []), ...(w.scale !== undefined ? [`Scale=${f2(w.scale)}`] : [])]);
  return out.join("\n");
}

/**
 * The commented default `<modId>.ini` the editor generates (written only when the file does not exist). Every key is a commented default;
 * a user default that differs from the built-in one is written uncommented; `OpenKey` always stays commented (it shows the author's hotkey).
 */
export function writeDefaultModIni(opts: { modName: string; modId: string; menus: { name: string; hotkey?: number; userDefaults?: UserDefaults }[] }): string {
  const out = [
    `; Inkwell Runtime settings for ${opts.modName} (${opts.modId}). Remove the leading ; to change a setting.`,
    "; Deleting a line restores the default. Inkwell never overwrites this file after the first deploy.",
  ];
  for (const m of opts.menus) {
    const u = m.userDefaults ?? {};
    const on = (differs: boolean) => (differs ? "" : ";");
    out.push("", `[Menu.${m.name}]`,
      "; Key that opens the menu: DirectInput scan code (K is 37). 0 = no hotkey.", `;OpenKey=${m.hotkey ?? 0}`,
      "; Menu size, 0.20 to 2.00.", `${on(u.uiScale !== undefined && u.uiScale !== INI_DEFAULTS.uiScale)}UIScale=${f2(u.uiScale ?? INI_DEFAULTS.uiScale)}`,
      "; Move the menu, in pixels of a 1920x1080 screen.",
      `${on((u.offsetX ?? 0) !== 0)}OffsetX=${u.offsetX ?? 0}`, `${on((u.offsetY ?? 0) !== 0)}OffsetY=${u.offsetY ?? 0}`,
      "; Theme name: a mode of the menu's Figma variable collection (for example Vanilla). Empty = the menu's default.", `${on(!!u.theme)}Theme=${u.theme ?? ""}`);
  }
  return out.join("\n") + "\n";
}

export type EffectiveMenu = { openKey: number | undefined; uiScale: number; offsetX: number; offsetY: number; theme: string };
/** Precedence: built-in default < author JSON < user INI. `openKey` 0 in the INI removes the hotkey. The JSON only carries the hotkey. */
export function resolveMenu(json: Pick<MenuDef, "triggers">, ini?: MenuIni): EffectiveMenu {
  const key = ini?.openKey ?? json.triggers.hotkey;
  return {
    openKey: key === 0 ? undefined : key,
    uiScale: ini?.uiScale ?? INI_DEFAULTS.uiScale,
    offsetX: ini?.offsetX ?? INI_DEFAULTS.offsetX,
    offsetY: ini?.offsetY ?? INI_DEFAULTS.offsetY,
    theme: ini?.theme ?? INI_DEFAULTS.theme,
  };
}
