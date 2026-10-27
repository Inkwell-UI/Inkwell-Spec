import { z } from "zod";

/**
 * Menu contracts (design spec, "Menus, contracts and SkyUI"; SPEC-CHANGES W5): what a menu-replacement SWF must define so the game executable
 * (layer `engine`) and other installed UI mods (`skyui52`, `skyui6`, `mod`) work with it. One JSON file per menu and layer, `contracts/<menu>/<layer>.json`.
 */
export const CONTRACT_LAYERS = ["engine", "skyui52", "skyui6", "mod"] as const;
export const ContractLayerName = z.enum(CONTRACT_LAYERS);
export type ContractLayerName = z.infer<typeof ContractLayerName>;

/**
 * fatal: missing = the game crashes when the menu opens. function: missing = the menu opens but a feature is dead (or another mod complains).
 * optional: the menu works without it. unused: the engine looks it up or sends it, but nothing depends on it. Only fatal and function are validated.
 */
export const ContractRequired = z.enum(["fatal", "function", "optional", "unused"]);
export type ContractRequired = z.infer<typeof ContractRequired>;

/** Where the entry (and its `required` flag) comes from: tested or observed in game, read in a decompiled SWF or source, or only inferred. */
export const ContractProof = z.enum(["in-game", "source", "inferred"]);

/** AS2 type of a path-checked entry. Instances are MovieClip (frames, images), TextField (text) or Shape (not addressable from AS2). */
export const ContractType = z.enum(["MovieClip", "TextField", "Shape", "Function", "Array", "Number", "String", "Boolean", "Object"]);
export type ContractType = z.infer<typeof ContractType>;

const extra = z.record(z.string(), z.unknown()).optional();

export const ContractEntry = z
  .looseObject({
    id: z.string().regex(/^[A-Za-z0-9_.-]+$/), // unique per merged contract; a later layer with the same id replaces the entry
    // instance/function/member/global are checked by `path`; callback (engine->AS, by GameDelegate name) and call (AS->engine) by `name` feed the contract nodes
    kind: z.enum(["instance", "function", "member", "global", "callback", "call"]),
    path: z.string().optional(), // "_root.Menu_mc", "_root.GetInventoryItemList", "_root.GetInventoryItemList().entryList", "_global.ItemCard.SKYUI_RELEASE_IDX"
    name: z.string().optional(),
    type: ContractType.optional(),
    value: z.union([z.string(), z.number(), z.boolean()]).optional(), // expected value of a global
    args: z.array(z.string()).optional(), // "name:Type" as the engine sends or takes them
    required: ContractRequired,
    proof: ContractProof,
    evidence: z.string().optional(),
    notes: z.string().optional(),
    extra,
  })
  .refine((e) => (e.kind === "callback" || e.kind === "call" ? !!e.name : !!e.path && !!e.type), { message: "callback/call entries need `name`; the others need `path` and `type`" });
export type ContractEntry = z.infer<typeof ContractEntry>;

export const ContractLayer = z
  .looseObject({
    schemaVersion: z.literal(1),
    menu: z.string().min(1), // the engine's menu name, e.g. "InventoryMenu"; IR `target.contract` refers to it
    layer: ContractLayerName,
    mod: z.string().optional(), // layer "mod": the mod that adds these entries
    swf: z.string().optional(), // the file the menu replaces, relative to Data/
    description: z.string().optional(),
    sources: z.record(z.string(), z.string()).optional(),
    entries: z.array(ContractEntry),
    extra,
  })
  .refine((l) => new Set(l.entries.map((e) => e.id)).size === l.entries.length, { message: "entry ids must be unique in a layer" });
export type ContractLayer = z.infer<typeof ContractLayer>;

export type MergedEntry = ContractEntry & { layer: ContractLayerName };
export interface MergedContract {
  menu: string;
  layers: ContractLayerName[];
  entries: MergedEntry[];
}

/** Merges the layers named in `use` in the fixed order engine, skyui52, skyui6, mod; an entry of a later layer replaces an earlier one with the same id. */
export function mergeContract(layers: readonly ContractLayer[], use: readonly ContractLayerName[]): MergedContract {
  const order = (l: ContractLayer): number => CONTRACT_LAYERS.indexOf(l.layer);
  const picked = layers.filter((l) => use.includes(l.layer)).sort((a, b) => order(a) - order(b));
  const menus = new Set(picked.map((l) => l.menu));
  if (menus.size > 1) throw new Error(`contract layers of different menus: ${[...menus].join(", ")}`);
  const entries = new Map<string, MergedEntry>();
  for (const l of picked) for (const e of l.entries) entries.set(e.id, { ...e, layer: l.layer });
  return { menu: picked[0]?.menu ?? "", layers: picked.map((l) => l.layer), entries: [...entries.values()] };
}

export interface ContractIssue {
  code: "contract-missing" | "contract-wrong-type";
  entry: MergedEntry;
  /** contract-wrong-type: the type the SWF has. */
  found?: string;
}

/**
 * Checks what a SWF defines (`provided`: path -> type, paths like the contract's) against the fatal and function entries with a path.
 * A member of a function's return value (`f().x`) is only checked when `f` is provided: without it the missing function is the one finding.
 */
export function checkContract(c: MergedContract, provided: Readonly<Record<string, string>>): ContractIssue[] {
  const out: ContractIssue[] = [];
  for (const e of c.entries) {
    if (!e.path || (e.required !== "fatal" && e.required !== "function")) continue;
    const call = e.path.indexOf("().");
    if (call >= 0 && !provided[e.path.slice(0, call)]) continue;
    const found = provided[e.path];
    if (found === undefined) out.push({ code: "contract-missing", entry: e });
    else if (e.type && found !== e.type) out.push({ code: "contract-wrong-type", entry: e, found });
  }
  return out;
}
