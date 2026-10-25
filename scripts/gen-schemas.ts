// Generates schemas/*.json from the Zod types. Generated files: never hand-edit.
import { mkdirSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { Swf, Overlay, Patch, PluginMessage, EditorMessage, Graph, PackManifest, NodeDef, PacksLock } from "../src/index.js";

const schemas = { swf: Swf, overlay: Overlay, patch: Patch, "plugin-message": PluginMessage, "editor-message": EditorMessage, graph: Graph, "pack-manifest": PackManifest, "node-def": NodeDef, "packs-lock": PacksLock };

export function render(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(schemas).map(([k, s]) => [`${k}.schema.json`, JSON.stringify(z.toJSONSchema(s, { io: "input" }), null, 2) + "\n"]),
  );
}

if (process.argv[1]?.endsWith("gen-schemas.ts")) {
  mkdirSync("schemas", { recursive: true });
  for (const [f, text] of Object.entries(render())) writeFileSync(`schemas/${f}`, text);
}
