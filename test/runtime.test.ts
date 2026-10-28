import { describe, expect, it } from "vitest";
import {
  MenuDef, MenuSettings, normalizeSwfPath, effectiveInputContext, MENU_SLOTS, MENU_WARN_THRESHOLD, NodeOverlay, NodeDef,
  parseIni, writeIni, writeDefaultModIni, resolveMenu, findMenuIni, RuntimeIni,
  packVersion, unpackVersion, compareVersions, isRuntimeCompatible, parseVersion, RUNTIME_MESSAGES,
  BRIDGE_MEMBERS, PAPYRUS_API, COSAVE_UNIQUE_ID, COSAVE_RECORD_SAVED,
  RUNTIME_PROTOCOL, PROTOCOL_VERSION, RuntimeMessage, EditorToRuntime, RuntimeToEditor, SPEC_VERSION, migrate,
} from "../src/index.js";

const TOKEN = "ab".repeat(32);
const menu = () => ({
  specVersion: 6, name: "MyMod_Wheel", swf: "Interface/Inkwell/MyMod/Wheel.swf", minRuntime: "0.3.0",
  flags: { pausesGame: true, cursor: true, modal: true, closeOnEscape: true, future: 1 }, inputContext: "menuMode", depth: 3,
  triggers: { hotkey: 37, papyrus: true, modEvent: "MyMod_OpenWheel", more: [1] }, extra: { a: 1 }, unknownTop: { x: 1 },
});

describe("constants and versions", () => {
  it("spec 6, separate protocols", () => {
    expect(SPEC_VERSION).toBe(8);
    expect(PROTOCOL_VERSION).toBe(5);
    expect(RUNTIME_PROTOCOL).toBe(1);
    expect(MENU_SLOTS).toBe(16);
    expect(MENU_WARN_THRESHOLD).toBe(4);
    expect(COSAVE_UNIQUE_ID).toBe(0x494e4b57);
    expect(COSAVE_RECORD_SAVED).toBe(0x53564152);
    expect(migrate({ specVersion: 5, k: 1 } as any)).toEqual({ specVersion: 8, k: 1 });
    expect(migrate({ specVersion: 6, k: 1 } as any)).toEqual({ specVersion: 8, k: 1 });
  });
  it("packs like S3", () => {
    expect(packVersion("0.3.0")).toBe(196608);
    expect(packVersion({ major: 1, minor: 2, patch: 3 })).toBe(16777216 + 2 * 65536 + 48);
    expect(unpackVersion(packVersion("12.34.567"))).toEqual({ major: 12, minor: 34, patch: 567 });
    expect(() => packVersion("256.0.0")).toThrow();
    expect(() => packVersion("1.2")).toThrow();
    expect(parseVersion("0.0.4095")).toBeTruthy();
    expect(parseVersion("0.0.4096")).toBeNull();
  });
  it("compares and checks compatibility (same major, not lower)", () => {
    expect(compareVersions("0.3.0", "0.3.1")).toBeLessThan(0);
    expect(compareVersions("1.0.0", "0.9.9")).toBeGreaterThan(0);
    expect(compareVersions("0.3.0", "0.3.0")).toBe(0);
    expect(isRuntimeCompatible("0.3.0", "0.3.0")).toBe(true);
    expect(isRuntimeCompatible("0.3.0", "0.4.2")).toBe(true);
    expect(isRuntimeCompatible("0.3.1", "0.3.0")).toBe(false);
    expect(isRuntimeCompatible("0.3.0", "1.0.0")).toBe(false);
    expect(isRuntimeCompatible("x", "0.3.0")).toBe(false);
  });
  it("message texts match the Papyrus check", () => {
    expect(RUNTIME_MESSAGES.outdated("My Mod", "0.3.0", { major: 0, minor: 2, patch: 0 })).toBe("My Mod needs Inkwell Runtime 0.3.0 or newer; you have 0.2.0. Please update Inkwell Runtime.");
    expect(RUNTIME_MESSAGES.notInstalled("My Mod", "0.3.0")).toContain("is not installed");
  });
  it("tables have unique names and the bridge covers S4.2", () => {
    for (const t of [BRIDGE_MEMBERS, PAPYRUS_API]) expect(new Set(t.map((m) => m.name)).size).toBe(t.length);
    expect(BRIDGE_MEMBERS.map((m) => m.name)).toEqual(expect.arrayContaining(["ready", "log", "getSaved", "pin"]));
    expect(PAPYRUS_API.find((f) => f.name === "MakeVersion")?.native).toBe(false);
  });
});

describe("normalizeSwfPath", () => {
  it("strips Interface/ and .swf", () => {
    expect(normalizeSwfPath("Interface/Wheel.swf")).toBe("Wheel");
    expect(normalizeSwfPath("Interface/Inkwell/MyMod/Wheel.swf")).toBe("Inkwell/MyMod/Wheel");
    expect(normalizeSwfPath("interface/Wheel.SWF")).toBe("Wheel");
  });
  it.each(["Wheel.swf", "Interface/Wheel", "Interface/../x.swf", "Interface/a/../x.swf", "C:/Interface/x.swf", "/Interface/x.swf", "Interface\\x.swf",
    "Interface/.swf", "Interface//x.swf", "Data/Interface/x.swf", "Interface/x:y.swf", ""])("rejects %j", (p) => expect(normalizeSwfPath(p)).toBeNull());
});

describe("MenuDef / MenuSettings", () => {
  it("round-trips unknown keys", () => {
    expect(JSON.parse(JSON.stringify(MenuDef.parse(menu())))).toEqual(menu());
  });
  it("applies defaults", () => {
    const m = MenuDef.parse({ specVersion: 6, name: "Ab", swf: "Interface/a.swf" });
    expect(m).toMatchObject({ minRuntime: "0.3.0", depth: 3, flags: { pausesGame: false, cursor: false, modal: false, closeOnEscape: true }, triggers: { papyrus: true } });
    expect(m.triggers.hotkey).toBeUndefined();
    expect(effectiveInputContext(m)).toBe("none");
    expect(effectiveInputContext({ ...m, flags: { ...m.flags, modal: true } })).toBe("menuMode");
    expect(effectiveInputContext({ ...m, inputContext: "none", flags: { ...m.flags, modal: true } })).toBe("none");
  });
  it("rejects each invalid field", () => {
    const bad: Record<string, unknown> = {
      "name 1 char": { name: "A" }, "name digit start": { name: "1abc" }, "name dash": { name: "a-b" }, "name 65": { name: "a".repeat(65) },
      "swf no Interface": { swf: "Foo/x.swf" }, "swf dotdot": { swf: "Interface/../x.swf" }, "swf colon": { swf: "Interface/x:.swf" },
      "swf ext": { swf: "Interface/x.gfx" }, minRuntime: { minRuntime: "0.3" }, "minRuntime 4 digits": { minRuntime: "0.3.1000" },
      inputContext: { inputContext: "gameplay" }, "depth 16": { depth: 16 }, "depth -1": { depth: -1 }, "depth frac": { depth: 1.5 },
      "hotkey 1": { triggers: { hotkey: 1 } }, "hotkey 256": { triggers: { hotkey: 256 } }, "modEvent space": { triggers: { modEvent: "a b" } },
      "modEvent 65": { triggers: { modEvent: "a".repeat(65) } }, "systemMenu empty": { triggers: { systemMenu: "" } }, "systemMenu 65": { triggers: { systemMenu: "a".repeat(65) } }, "flag type": { flags: { modal: "yes" } }, "papyrus type": { triggers: { papyrus: 1 } },
    };
    for (const [k, patch] of Object.entries(bad)) expect(MenuDef.safeParse({ ...menu(), ...(patch as object) }).success, k).toBe(false);
    expect(MenuDef.safeParse({ ...menu(), specVersion: "6" }).success).toBe(false);
    expect(MenuDef.safeParse({ ...menu(), depth: 15, triggers: { hotkey: 255 } }).success).toBe(true);
    expect(MenuDef.safeParse({ ...menu(), triggers: { hotkey: 2 } }).success).toBe(true);
    expect(MenuDef.safeParse({ ...menu(), triggers: { systemMenu: "$MY_ENTRY" } }).success).toBe(true);
  });
  it("MenuSettings: optional name/swf, userDefaults, unknown keys kept", () => {
    const s = { specVersion: 6, flags: { pausesGame: false, cursor: true, modal: false, closeOnEscape: true }, depth: 3, triggers: { papyrus: true },
      userDefaults: { uiScale: 1.5, offsetX: -10, offsetY: 20, theme: "dark", z: 1 }, q: 1 };
    expect(MenuSettings.parse(s)).toEqual(s);
    expect(MenuSettings.safeParse({ ...s, userDefaults: { uiScale: 3 } }).success).toBe(false);
    expect(MenuSettings.safeParse({ ...s, userDefaults: { offsetX: 961 } }).success).toBe(false);
    expect(MenuSettings.safeParse({ ...s, swf: "x.swf" }).success).toBe(false);
  });
});

describe("pack and overlay additions", () => {
  it("requiresRuntime and overlay list round-trip", () => {
    const d = { kind: "OnOpen", major: 1, title: "On Open", category: "Events", requiresRuntime: true, pure: false, inputs: [], outputs: [], fields: {} };
    expect(NodeDef.parse(d)).toEqual(d);
    expect(NodeDef.safeParse({ ...d, requiresRuntime: "yes" }).success).toBe(false);
    const o = { role: "list", list: { itemTemplate: "1:2", spacing: 4, x: 1 } };
    expect(NodeOverlay.parse(o)).toEqual(o);
  });
});

describe("INI", () => {
  it("parses a mod INI and tolerates junk", () => {
    const text = [
      "\uFEFF; comment", "# another", "", "[Menu.MyMod_Wheel]", "OpenKey = 38", "uiscale=1.25", "OffsetX=-20", "OffsetY=abc", "Theme=dark", "Bogus=1", "OpenKey=39",
      "[menu.mymod_wheel]", "OffsetY=5", "[Menu.Other]", "UIScale=9", "OpenKey=1", "[Widget.Hud]", "Scale=0.5", "OffsetX=3",
      "[Dev]", "DevMode=1", "[Unknown]", "A=1", "garbage line", "",
    ].join("\r\n");
    const { ini, problems } = parseIni(text);
    expect(ini.menus["MyMod_Wheel"]).toEqual({ openKey: 39, uiScale: 1.25, offsetX: -20, theme: "dark", offsetY: 5 });
    expect(Object.keys(ini.menus)).toEqual(["MyMod_Wheel", "Other"]);
    expect(ini.menus["Other"]).toEqual({ uiScale: 2 }); // clamped, OpenKey=1 ignored
    expect(ini.widgets["Hud"]).toEqual({ scale: 0.5, offsetX: 3 });
    expect(ini.dev).toBeUndefined(); // a mod INI cannot enable dev mode
    expect(problems.map((p) => `${p.section}/${p.key}`).sort()).toEqual(["Dev/", "Menu.MyMod_Wheel/OffsetY", "Menu.Other/OpenKey", "Menu.Other/UIScale", "Unknown/"]);
    expect(findMenuIni(ini, "MYMOD_WHEEL")?.openKey).toBe(39);
    expect(() => RuntimeIni.parse(ini)).not.toThrow();
  });
  it("runtime file reads Runtime and Dev", () => {
    const { ini, problems } = parseIni(`[Runtime]\nLogLevel=DEBUG\n[Dev]\nDevMode=1\nPort=70000\nToken=${TOKEN}\nWatch=0\n`, "runtime");
    expect(ini.runtime).toEqual({ logLevel: "debug" });
    expect(ini.dev).toEqual({ devMode: true, token: TOKEN, watch: false });
    expect(problems).toHaveLength(1);
    expect(parseIni("[Dev]\nToken=\nDevMode=2", "runtime").ini.dev).toBeUndefined();
  });
  it("never throws on odd input", () => {
    for (const t of ["", "[", "]=", "=", "[Menu.]\nOpenKey=1", "\0\0", "[Menu.A]\nUIScale=1e9", "[Menu.A]\nOpenKey", undefined as any, null as any])
      expect(() => parseIni(t)).not.toThrow();
    expect(parseIni("[Menu.A]\nUIScale=1e9").ini.menus["A"]).toEqual({});
  });
  it("writeIni round-trips", () => {
    const model: any = {
      menus: { A: { openKey: 37, uiScale: 1.5, offsetX: -5, offsetY: 6, theme: "x" }, B: { openKey: 0 } }, widgets: { H: { offsetX: 1, offsetY: 2, scale: 0.75 } },
      runtime: { logLevel: "warn" }, dev: { devMode: true, port: 9000, token: TOKEN, watch: false },
    };
    const text = writeIni(model);
    const back = parseIni(text, "runtime");
    expect(back.problems).toEqual([]);
    expect(back.ini).toEqual(model);
    expect(writeIni(back.ini)).toBe(text);
  });
  it("default mod INI: commented defaults, differing author defaults uncommented, parses back", () => {
    const text = writeDefaultModIni({ modName: "My Mod", modId: "MyMod", menus: [
      { name: "MyMod_Wheel", hotkey: 37, userDefaults: { uiScale: 1.5, theme: "dark" } }, { name: "MyMod_Two" },
    ] });
    expect(text).toContain("; Inkwell Runtime settings for My Mod (MyMod).");
    expect(text).toContain("[Menu.MyMod_Wheel]");
    expect(text).toContain("\n;OpenKey=37\n");
    expect(text).toContain("\nUIScale=1.50\n");
    expect(text).toContain("\nTheme=dark\n");
    expect(text).toContain("\n;OffsetX=0\n");
    const { ini, problems } = parseIni(text);
    expect(problems).toEqual([]);
    expect(ini.menus).toEqual({ MyMod_Wheel: { uiScale: 1.5, theme: "dark" }, MyMod_Two: {} });
  });
  it("precedence: default < JSON < INI", () => {
    const json = MenuDef.parse(menu());
    expect(resolveMenu(json)).toEqual({ openKey: 37, uiScale: 1, offsetX: 0, offsetY: 0, theme: "" });
    expect(resolveMenu(json, { openKey: 40, uiScale: 1.5, theme: "t" })).toEqual({ openKey: 40, uiScale: 1.5, offsetX: 0, offsetY: 0, theme: "t" });
    expect(resolveMenu(json, { openKey: 0 }).openKey).toBeUndefined();
    expect(resolveMenu(MenuDef.parse({ ...menu(), triggers: {} })).openKey).toBeUndefined();
  });
});

describe("runtime protocol", () => {
  const hello = { type: "hello", token: TOKEN, editorVersion: "0.3.0", protocolVersion: 1, specVersion: 6, extra1: true };
  const msgs: any[] = [
    hello,
    { type: "helloAck", ok: true, runtimeVersion: 196608, runtimeVersionString: "0.3.0", protocolVersion: 1, specVersion: 6, gameVersion: "1.5.97.0", menus: [{ name: "A", swf: "Interface/a.swf", open: false, k: 1 }] },
    { type: "helloAck", ok: false, error: "unauthorized", runtimeVersion: 196608, runtimeVersionString: "0.3.0", protocolVersion: 1, specVersion: 6, gameVersion: "1.5.97.0", menus: [] },
    { type: "menuState", menu: "A", open: true },
    { type: "trace", ts: 12, level: "warn", source: "as2", menu: "A", node: "n1", graph: "g", text: "hi", zz: 1 },
    { type: "trace", ts: 1, level: "info", source: "runtime", text: "x" },
    { type: "subscribe", menu: "A", watch: true, pins: false }, { type: "unsubscribe", menu: "A", watch: false, pins: false },
    { type: "watch", menu: "A", graph: "g", scope: "saved", name: "n", value: null }, { type: "watch", menu: "A", graph: "g", scope: "menu", name: "n", value: 3 },
    { type: "pin", menu: "A", node: "n1", pin: "out", value: "[1,2]" },
    { type: "reload", id: 1 }, { type: "reload", id: 2, menu: "A" },
    { type: "reloadAck", id: 1, ok: true, reloaded: ["A"], skipped: [{ name: "B", reason: "no slot" }], ms: 120 },
    { type: "error", code: "bad-message", message: "m", id: 3 }, { type: "ping", id: 1 }, { type: "pong" },
  ];
  it("every message round-trips with unknown keys", () => {
    for (const m of msgs) expect(JSON.parse(JSON.stringify(RuntimeMessage.parse(m))), m.type).toEqual(m);
  });
  it("direction unions", () => {
    expect(EditorToRuntime.safeParse(hello).success).toBe(true);
    expect(EditorToRuntime.safeParse({ type: "trace", ts: 1, level: "info", source: "as2", text: "" }).success).toBe(false);
    expect(RuntimeToEditor.safeParse({ type: "menuState", menu: "A", open: true }).success).toBe(true);
    expect(RuntimeToEditor.safeParse(hello).success).toBe(false);
  });
  it("subscribe flags default to false", () => {
    expect(RuntimeMessage.parse({ type: "subscribe", menu: "A" })).toMatchObject({ watch: false, pins: false });
  });
  it("rejects invalid", () => {
    for (const m of [
      { ...hello, token: "short" }, { ...hello, token: TOKEN.toUpperCase() }, { ...hello, protocolVersion: "1" }, { type: "nope" },
      { type: "trace", ts: 1, level: "loud", source: "as2", text: "" }, { type: "trace", ts: 1, level: "info", source: "game", text: "" },
      { type: "watch", menu: "A", graph: "g", scope: "world", name: "n", value: 1 }, { type: "watch", menu: "A", graph: "g", scope: "menu", name: "n", value: [1] },
      { type: "error", code: "oops", message: "" }, { type: "reload" }, { type: "helloAck", ok: true, error: "bad-message" },
    ]) expect(RuntimeMessage.safeParse(m).success, JSON.stringify(m)).toBe(false);
  });
});
