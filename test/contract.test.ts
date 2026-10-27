import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkContract, ContractLayer, mergeContract, type ContractEntry } from "../src/index.js";

const dir = new URL("../contracts/InventoryMenu/", import.meta.url);
const inventory = readdirSync(dir).map((f) => ContractLayer.parse(JSON.parse(readFileSync(new URL(f, dir), "utf8"))));
const ids = (c: { entries: { id: string }[] }) => c.entries.map((e) => e.id);
const layer = (name: "engine" | "skyui52" | "skyui6" | "mod", entries: ContractEntry[]) => ContractLayer.parse({ schemaVersion: 1, menu: "M", layer: name, entries });
const fn = (id: string, path: string, required: ContractEntry["required"] = "fatal"): ContractEntry => ({ id, kind: "function", path, type: "Function", required, proof: "in-game" });

describe("contract data files", () => {
  it("every file under contracts/ parses and matches its folder", () => {
    for (const m of readdirSync(new URL("../contracts/", import.meta.url)))
      for (const f of readdirSync(new URL(`../contracts/${m}/`, import.meta.url))) {
        const l = ContractLayer.parse(JSON.parse(readFileSync(new URL(`../contracts/${m}/${f}`, import.meta.url), "utf8")));
        expect(l.menu).toBe(m);
        expect(f === `${l.layer}.json` || (l.layer === "mod" && /^mod-[A-Za-z0-9]+\.json$/.test(f))).toBe(true); // one file per mod: mod-<modId>.json
      }
  });

  it("the Inventory engine layer carries the S-B required set", () => {
    const c = mergeContract(inventory, ["engine"]);
    const req = (r: string) => c.entries.filter((e) => e.required === r).map((e) => e.path ?? e.name).sort();
    expect(req("fatal")).toEqual(["_root.GetInventoryItemList", "_root.Menu_mc"]);
    expect(req("function")).toEqual(["_root.GetInventoryItemList().entryList", "_root.GetInventoryItemList().selectedIndex", "_root.call", "_root.respond"]);
    expect(req("unused")).toEqual(["SetButtonMapping", "_root.BackgroundAlpha"]);
    for (const n of ["SetCategoriesList", "InvalidateListData", "UpdatePlayerInfo", "RestoreIndices", "DropItem", "UpdateItemCardInfo"]) expect(c.entries.some((e) => e.kind === "callback" && e.name === n)).toBe(true);
    for (const n of ["PlaySound", "UpdateItem3D", "RequestItemCardInfo", "ItemSelect", "ItemDrop", "SaveIndices", "CloseTweenMenu", "CloseMenu"]) expect(c.entries.some((e) => e.kind === "call" && e.name === n)).toBe(true);
  });

  it("the SkyUI 5.2 layer adds the four version globals; SkyUI 6 adds nothing", () => {
    const c = mergeContract(inventory, ["engine", "skyui52", "skyui6"]);
    const globals = c.entries.filter((e) => e.layer === "skyui52");
    expect(globals.map((e) => `${e.path}=${e.value}`).sort()).toEqual(
      ["BottomBar", "InventoryLists", "InventoryMenu", "ItemCard"].flatMap((k) => [`_global.${k}.SKYUI_RELEASE_IDX=2018`, `_global.${k}.SKYUI_VERSION_STRING=5.2 SE`]),
    );
    expect(c.layers).toEqual(["engine", "skyui52", "skyui6"]);
  });
});

describe("ContractLayer", () => {
  it("refuses duplicate ids, a path entry without type and a call without name", () => {
    expect(() => layer("engine", [fn("a", "_root.a"), fn("a", "_root.b")])).toThrow();
    expect(ContractLayer.safeParse({ schemaVersion: 1, menu: "M", layer: "engine", entries: [{ id: "x", kind: "instance", path: "_root.x", required: "fatal", proof: "source" }] }).success).toBe(false);
    expect(ContractLayer.safeParse({ schemaVersion: 1, menu: "M", layer: "engine", entries: [{ id: "x", kind: "call", required: "optional", proof: "source" }] }).success).toBe(false);
  });

  it("keeps unknown keys", () => {
    const l = ContractLayer.parse({ schemaVersion: 1, menu: "M", layer: "mod", mod: "X", future: 1, entries: [{ ...fn("a", "_root.a"), confidence: "high" }] });
    expect((l as Record<string, unknown>)["future"]).toBe(1);
    expect((l.entries[0] as Record<string, unknown>)["confidence"]).toBe("high");
  });
});

describe("mergeContract", () => {
  it("merges in layer order whatever the input order; a later layer replaces an id", () => {
    const mod = layer("mod", [fn("a", "_root.a", "optional"), fn("m", "_root.m")]);
    const engine = layer("engine", [fn("a", "_root.a"), fn("b", "_root.b")]);
    const c = mergeContract([mod, engine], ["engine", "mod"]);
    expect(ids(c)).toEqual(["a", "b", "m"]);
    expect(c.entries[0]).toMatchObject({ required: "optional", layer: "mod" });
    expect(ids(mergeContract([mod, engine], ["engine"]))).toEqual(["a", "b"]);
  });

  it("refuses layers of two menus", () => {
    expect(() => mergeContract([layer("engine", []), { ...layer("mod", []), menu: "Other" }], ["engine", "mod"])).toThrow(/different menus/);
  });
});

describe("checkContract", () => {
  const engine = mergeContract(inventory, ["engine"]);
  const full = { "_root.Menu_mc": "MovieClip", "_root.GetInventoryItemList": "Function", "_root.call": "Function", "_root.respond": "Function", "_root.GetInventoryItemList().entryList": "Array", "_root.GetInventoryItemList().selectedIndex": "Number" };

  it("passes a SWF with every fatal and function entry", () => expect(checkContract(engine, full)).toEqual([]));

  it("reports missing entries and wrong types; optional and unused entries never", () => {
    const { ["_root.call"]: _c, ...noBridge } = full;
    expect(checkContract(engine, { ...noBridge, "_root.Menu_mc": "Shape" }).map((i) => `${i.code}:${i.entry.path}:${i.found ?? ""}`)).toEqual(["contract-wrong-type:_root.Menu_mc:Shape", "contract-missing:_root.call:"]);
  });

  it("does not report the members of a missing function", () => {
    expect(checkContract(engine, {}).map((i) => i.entry.path)).toEqual(["_root.GetInventoryItemList", "_root.Menu_mc", "_root.call", "_root.respond"]);
  });

  it("checks the SkyUI 5.2 globals only when that layer is targeted", () => {
    expect(checkContract(mergeContract(inventory, ["engine", "skyui52"]), full)).toHaveLength(8);
    expect(checkContract(mergeContract(inventory, ["engine", "skyui6"]), full)).toEqual([]);
  });
});
