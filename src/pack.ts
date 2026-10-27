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
  requiresRuntime: z.boolean().optional(), // S8: fires/works only with Inkwell Runtime; absent = false. The lint `runtime-required` warns in a HUD widget graph
  extra: Extra,
});
export type NodeDef = z.infer<typeof NodeDef>;

const Sha256 = z.string().regex(/^[0-9a-f]{64}$/); // lower-case hex
const GitHubRepo = z.string().regex(/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/); // "owner/name"
const uniqueIds = (sorted: boolean) => (v: { packs: { id: string }[] }, ctx: z.RefinementCtx) => {
  v.packs.forEach((p, i) => {
    const prev = v.packs[i - 1]?.id;
    if (v.packs.findIndex((q) => q.id === p.id) !== i) ctx.addIssue({ code: "custom", path: ["packs", i, "id"], message: `duplicate pack id "${p.id}"` });
    else if (sorted && prev !== undefined && prev > p.id) ctx.addIssue({ code: "custom", path: ["packs", i, "id"], message: `"${p.id}" must come before "${prev}" (sorted by id)` });
  });
};

/** A pack is released as one GitHub release asset with this name, on the tag `v<version>` (SPEC-CHANGES W). */
export const PACK_ASSET = "pack.zip";
/** Download URL of a pack release asset; without `version`, GitHub's redirect to the latest release. Never the GitHub API (rate limits). */
export const packAssetUrl = (repo: string, version?: string): string =>
  version ? `https://github.com/${repo}/releases/download/v${version}/${PACK_ASSET}` : `https://github.com/${repo}/releases/latest/download/${PACK_ASSET}`;

/** W1: one entry per pack. `source` is the release asset URL of exactly that version; `sha256` is the hash of the asset's bytes. Updates only on request. */
export const PackLockEntry = z.looseObject({
  id: PackId,
  version: Semver,
  source: z.string().regex(/^https:\/\/github\.com\/[^\s]+$/),
  sha256: Sha256,
  extra: Extra,
});
export type PackLockEntry = z.infer<typeof PackLockEntry>;

/** `packs.lock` at the project root: JSON, one entry per pack id, written sorted by id. */
export const PacksLock = z.looseObject({
  specVersion: z.number().int(),
  packs: z.array(PackLockEntry),
}).superRefine(uniqueIds(false));
export type PacksLock = z.infer<typeof PacksLock>;

/** Throws (JSON or schema error) on an unreadable lockfile; the caller never overwrites a file it could not read. */
export const parsePacksLock = (text: string): PacksLock => PacksLock.parse(JSON.parse(text));
/** Stable text: packs sorted by id, 2-space indent, trailing newline. */
export const writePacksLock = (lock: PacksLock): string =>
  JSON.stringify({ ...lock, packs: [...lock.packs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) }, null, 2) + "\n";

/** W2: one entry of `Inkwell-Packs-Index/index.json`. `deprecated` is the reason; entries are deprecated, never removed, so lockfiles keep resolving. */
export const PackIndexEntry = z.looseObject({
  id: PackId,
  repo: GitHubRepo,
  latest: Semver,
  description: z.string().optional(),
  deprecated: z.string().min(1).optional(),
  extra: Extra,
});
export type PackIndexEntry = z.infer<typeof PackIndexEntry>;

/** The index: entries sorted by id, one per pack. */
export const PackIndex = z.looseObject({ packs: z.array(PackIndexEntry) }).superRefine(uniqueIds(true));
export type PackIndex = z.infer<typeof PackIndex>;
