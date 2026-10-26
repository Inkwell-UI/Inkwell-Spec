// Runtime constants shared with the C++ runtime and the editor's codegen: S3 (version), S4 (bridge, Papyrus, messaging), S5 (saved scope).
import { z } from "zod";

// ---- S3: runtime requirement -------------------------------------------------------------------------------------
export type RuntimeVersion = { major: number; minor: number; patch: number };

/** Version of the first runtime; the default `minRuntime`. */
export const FIRST_RUNTIME_VERSION = "0.3.0";

/**
 * S3 rule 1: major and minor 0..255, patch 0..4095. (S1's `minRuntime` regex allows 3 digits per part, so a patch of 1000+ passes
 * here but not MenuDef; S3's range is the one packVersion enforces.)
 */
export function parseVersion(s: string): RuntimeVersion | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,4})$/.exec(s);
  if (!m) return null;
  const v = { major: +m[1]!, minor: +m[2]!, patch: +m[3]! };
  return v.major > 255 || v.minor > 255 || v.patch > 4095 ? null : v;
}
export const RuntimeVersionString = z.string().refine((s) => parseVersion(s) !== null, "expected MAJOR.MINOR.PATCH (0-255, 0-255, 0-4095)");

const toVersion = (v: RuntimeVersion | string): RuntimeVersion => {
  const x = typeof v === "string" ? parseVersion(v) : v;
  if (!x || ![x.major, x.minor, x.patch].every(Number.isInteger) || x.major < 0 || x.major > 255 || x.minor < 0 || x.minor > 255 || x.patch < 0 || x.patch > 4095)
    throw new Error(`invalid runtime version ${JSON.stringify(v)}`);
  return x;
};

/** Packed Int, the only form Papyrus sees (same as SKSE's plugin version): major*16777216 + minor*65536 + patch*16. `0.3.0` is 196608. */
export function packVersion(v: RuntimeVersion | string): number {
  const x = toVersion(v);
  return x.major * 16777216 + x.minor * 65536 + x.patch * 16;
}
export function unpackVersion(packed: number): RuntimeVersion {
  return { major: Math.floor(packed / 16777216) % 256, minor: Math.floor(packed / 65536) % 256, patch: Math.floor(packed / 16) % 4096 };
}
export const versionString = (v: RuntimeVersion): string => `${v.major}.${v.minor}.${v.patch}`;
/** Negative, 0, positive like Array.sort. Throws on an invalid version. */
export const compareVersions = (a: RuntimeVersion | string, b: RuntimeVersion | string): number => packVersion(a) - packVersion(b);
/** O10: compatible = same major and the installed version is not lower than the required one. Invalid input is not compatible. */
export function isRuntimeCompatible(required: RuntimeVersion | string, have: RuntimeVersion | string): boolean {
  try {
    const r = toVersion(required), h = toVersion(have);
    return r.major === h.major && compareVersions(h, r) >= 0;
  } catch { return false; }
}

/** The in-game messages of the generated Papyrus check (S3 rule 3); the generated script must produce exactly these texts. */
export const RUNTIME_MESSAGES = {
  notInstalled: (modName: string, requiredText: string) =>
    `${modName} needs Inkwell Runtime ${requiredText} or newer, but it is not installed (or SKSE is not running). Its menus will not work until you install it.`,
  majorMismatch: (modName: string, requiredText: string, requiredMajor: number, have: RuntimeVersion) =>
    `${modName} was made for Inkwell Runtime ${requiredText} (major version ${requiredMajor}). The installed runtime is ${versionString(have)}. Update ${modName} or the runtime.`,
  outdated: (modName: string, requiredText: string, have: RuntimeVersion) =>
    `${modName} needs Inkwell Runtime ${requiredText} or newer; you have ${versionString(have)}. Please update Inkwell Runtime.`,
  /** Logged by the DLL (S3 rule 4). */
  menuSkipped: (menu: string, min: string, have: string) => `ERROR menu '${menu}' needs Inkwell Runtime ${min}, this is ${have}: not registered`,
} as const;
/** SKSE plugin name the Papyrus check asks for: `SKSE.GetPluginVersion("Inkwell")` (unverified in game). */
export const RUNTIME_PLUGIN_NAME = "Inkwell";

// ---- S4: Papyrus API, AS2 bridge, SKSE messaging -----------------------------------------------------------------
export type PapyrusFn = { name: string; params: string; returns: string; native: boolean };
/** `Inkwell_API.psc` (all Global). `MakeVersion` is pure Papyrus; the rest are Native. */
export const PAPYRUS_API: readonly PapyrusFn[] = [
  { name: "GetVersion", params: "", returns: "Int", native: true },
  { name: "GetVersionString", params: "", returns: "String", native: true },
  { name: "MakeVersion", params: "Int major, Int minor, Int patch", returns: "Int", native: false },
  { name: "IsDevMode", params: "", returns: "Bool", native: true },
  { name: "IsMenuRegistered", params: "String menuName", returns: "Bool", native: true },
  { name: "IsMenuOpen", params: "String menuName", returns: "Bool", native: true },
  { name: "Open", params: "String menuName", returns: "Bool", native: true },
  { name: "Close", params: "String menuName", returns: "Bool", native: true },
  { name: "SetString", params: "String menuName, String key, String value", returns: "", native: true },
  { name: "SetNumber", params: "String menuName, String key, Float value", returns: "", native: true },
  { name: "SetBool", params: "String menuName, String key, Bool value", returns: "", native: true },
];
export const PAPYRUS_SCRIPT = "Inkwell_API";
/** SKSE mod events the runtime sends (`strArg` = menu name, `numArg` = 0). */
export const PAPYRUS_EVENTS = ["Inkwell_MenuOpened", "Inkwell_MenuClosed"] as const;

export type BridgeMember = { name: string; kind: "property" | "function"; type: string; params?: string; dev?: boolean };
/** Members of `_root.inkwell` (S4.2). `type` is the AS2 type of a property or the return type of a function. The editor's Ruffle mock implements the same table. */
export const BRIDGE_MEMBERS: readonly BridgeMember[] = [
  { name: "ready", kind: "property", type: "Boolean" },
  { name: "version", kind: "property", type: "Number" },
  { name: "menu", kind: "property", type: "String" },
  { name: "uiScale", kind: "property", type: "Number" },
  { name: "offsetX", kind: "property", type: "Number" },
  { name: "offsetY", kind: "property", type: "Number" },
  { name: "theme", kind: "property", type: "String" },
  { name: "language", kind: "property", type: "String" }, // V13.2, runtime 0.4.0: the game language, upper case (`ENGLISH`)
  { name: "log", kind: "function", type: "Void", params: "level:String, nodeId:String, text:String" },
  { name: "glueReady", kind: "function", type: "Void", params: "" },
  { name: "openMenu", kind: "function", type: "Boolean", params: "name:String" },
  { name: "closeMenu", kind: "function", type: "Boolean", params: "name:String" },
  { name: "sendModEvent", kind: "function", type: "Void", params: "event:String, strArg:String, numArg:Number" },
  { name: "callRuntime", kind: "function", type: "String", params: "name:String, arg:String" },
  { name: "playSound", kind: "function", type: "Boolean", params: "editorId:String" },
  { name: "getSetting", kind: "function", type: "String", params: "section:String, key:String, defaultValue:String" },
  { name: "getInputDevice", kind: "function", type: "String", params: "" },
  { name: "translate", kind: "function", type: "String", params: "key:String" }, // V13.2, runtime 0.4.0: the text of a `$KEY` for the game language, or the key itself
  { name: "getSaved", kind: "function", type: "Object", params: "name:String, defaultValue:Object" },
  { name: "setSaved", kind: "function", type: "Void", params: "name:String, value:Object" },
  { name: "watch", kind: "function", type: "Void", params: "graphId:String, name:String, scope:String, value:Object", dev: true },
  { name: "pin", kind: "function", type: "Void", params: "nodeId:String, pin:String, value:Object", dev: true },
];
export const LOG_LEVELS = ["trace", "debug", "info", "warn", "error"] as const;
export const INPUT_DEVICES = ["keyboardMouse", "gamepad"] as const;
/** S4.2 retry rule of the generated menu class: poll every 50 ms, up to 100 times, then run with a stub. */
export const BRIDGE_POLL_MS = 50;
export const BRIDGE_POLL_MAX = 100;
/** S7: the runtime waits at most this long for `glueReady()` before it sends onOpen. */
export const GLUE_READY_TIMEOUT_MS = 5000;

/** The members of the generated menu class the runtime invokes (S7). */
export const MENU_CLASS_MEMBERS = ["start", "onOpen", "onClose", "onInput", "onMessage", "onModEvent", "dumpVariables"] as const;
/** On Input actions forwarded in 0.3 (S7; the exact engine event strings are unverified). */
export const INPUT_ACTIONS = ["Up", "Down", "Left", "Right", "Accept", "Cancel", "Scroll Up", "Scroll Down", "PageUp", "PageDown"] as const;
/** Node titles that fire only in a custom menu served by the runtime (S7); also `requiresRuntime: true` in core pack 0.3.0. */
export const RUNTIME_ONLY_EVENTS = ["On Open", "On Close", "On Click", "On Focus", "On Blur", "On Value Changed", "On Item Selected", "On Input", "On Mod Event", "On Runtime Message"] as const;
/** Game bridge node titles (S8); each is one `inkwell.*` call. */
export const GAME_BRIDGE_NODES = ["Send Mod Event", "Call Runtime", "Open Menu", "Close Menu", "Play Sound", "Get Setting", "Get Input Device"] as const;
/** Built-in Call Runtime names (O1). */
export const CALL_RUNTIME_BUILTINS = ["inkwell.version", "inkwell.ismenuopen", "inkwell.isdevmode"] as const;
/** Lint codes introduced by S3, S7 and S9. */
export const RUNTIME_LINT_CODES = ["menu-name-invalid", "menu-name-duplicate", "menu-hotkey-invalid", "menu-limit", "saved-variable-invalid", "runtime-required", "runtime-check-missing"] as const;

/** Version of the C interface handed out over SKSE messaging (`InkwellInterfaceV1.interfaceVersion`). Message numbers are API once public. */
export const MESSAGING_INTERFACE_VERSION = 1;
export const MESSAGING_MESSAGES = { kInterfaceReady: 1, kGetInterface: 2, kMenuOpened: 100, kMenuClosed: 101 } as const;
/** `RegisterFunction` names: `plugin.function`, lower-case. */
export const MESSAGING_FUNCTION_NAME = /^[a-z0-9_.]{3,64}$/;

// ---- S5: saved scope ---------------------------------------------------------------------------------------------
/** Pin types a saved variable may have (Bool, Number, String only in 0.3). */
export const SAVED_TYPES = ["Bool", "Number", "String"] as const;
/** SKSE co-save: unique id INKW, record type SVAR (four chars as a big-endian u32, like SKSE's multi-char literals), record version 1. */
export const COSAVE_UNIQUE_ID = 0x494e4b57;
export const COSAVE_RECORD_SAVED = 0x53564152;
export const COSAVE_RECORD_VERSION = 1;
/** Type byte of a value in the record. */
export const COSAVE_VALUE_TYPE = { Bool: 0, Number: 1, String: 2 } as const;
export const SAVED_LIMITS = { variablesPerMenu: 256, keyBytes: 64, stringBytes: 4096 } as const;
