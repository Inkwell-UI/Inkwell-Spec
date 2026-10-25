import { z } from "zod";
import { PinType } from "./pins.js";

const Extra = z.record(z.string(), z.unknown()).optional();
const Semver = z.string().regex(/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/);
const Range = z.string().min(1); // semver range, e.g. "^0.2.0"; evaluated by the loader
const PackId = z.string().regex(/^[a-z0-9][a-z0-9._-]*$/);

export const PackManifest = z.looseObject({
  id: PackId,
  version: Semver,
  compatible: z.looseObject({ tool: Range, runtimeApi: Range.optional() }),
  dependencies: z.record(PackId, Range).default({}),
  extra: Extra,
});
export type PackManifest = z.infer<typeof PackManifest>;

export const PinDef = z.looseObject({ name: z.string().min(1), type: PinType, label: z.string().optional(), default: z.unknown().optional() });

export const NodeDef = z.looseObject({
  kind: z.string().regex(/^[A-Za-z0-9_.-]+$/), // nodeKind; the full id is `packId/kind@major`
  major: z.number().int().min(0),
  title: z.string(),
  category: z.string(),
  milestone: z.string().optional(), // "0.2", "0.3"...
  pure: z.boolean().default(false),
  inputs: z.array(PinDef).default([]),
  outputs: z.array(PinDef).default([]),
  fields: z.record(z.string(), z.unknown()).default({}), // JSON Schema for the node's fields; converted to Zod at load
  as2Template: z.string().optional(), // path of the template inside the pack
  extra: Extra,
});
export type NodeDef = z.infer<typeof NodeDef>;

export const PacksLock = z.looseObject({
  specVersion: z.number().int(),
  packs: z.array(z.looseObject({
    id: PackId, version: Semver, source: z.string(), commit: z.string(), hash: z.string(), extra: Extra,
  })),
});
export type PacksLock = z.infer<typeof PacksLock>;
