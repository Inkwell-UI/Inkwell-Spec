import type { Swf, Theme, ThemeVariable } from "./ir.js";
import { themedCollection } from "./ir.js";

// Applying a theme (SPEC-CHANGES V6.3, V14): the bound properties of the IR get the variable's value in one mode. Used for the compile-time default and the editor preview.

/** The modes of the collection that supplies the themes, in Figma's order; empty without a themed collection. */
export const themeModes = (swf: Pick<Swf, "themes">, preferred?: string): string[] => themedCollection(swf.themes, preferred)?.modes ?? [];

const isColor = (v: unknown): v is { r: number; g: number; b: number; a?: number } => !!v && typeof v === "object" && typeof (v as { r?: unknown }).r === "number";

/** The value of a binding in a mode, when the variable exists in the themed collection and has the right type for the property. */
export function boundValue(col: Theme, key: string, id: string, mode: string): unknown {
  const v: ThemeVariable | undefined = col.variables?.[id];
  const x = v?.values[mode];
  if (!v || x === undefined) return undefined;
  if (key === "visible") return v.type === "boolean" && typeof x === "boolean" ? x : undefined;
  if (key.endsWith("color")) return v.type === "color" && isColor(x) ? x : undefined;
  return v.type === "number" && typeof x === "number" ? x : undefined;
}

type N = Swf["nodes"][string];

/** One binding applied to a copy of the node; the node itself when the key does not fit it (gradient fill, image, missing paint, other node type). */
function setBound(n: N, key: string, value: unknown): N {
  const solid = (f: unknown) => !!f && (f as { type?: string }).type === "solid";
  const m = /^(fills|strokes)\/(\d+)\/color$/.exec(key);
  if (key === "opacity") return { ...n, opacity: Math.min(1, Math.max(0, (value as number) / 100)) }; // a Figma opacity variable is 0 to 100
  if (key === "visible") return { ...n, visible: value as boolean };
  if (key === "transform/width" || key === "transform/height") return { ...n, transform: { ...n.transform, [key.slice(10)]: value as number } };
  if (m && (n.type === "frame" || n.type === "shape")) {
    const i = Number(m[2]);
    if (m[1] === "fills") {
      const f = n.fills?.[i];
      return solid(f) ? { ...n, fills: n.fills!.map((x, j) => (j === i ? { ...x, color: value } : x)) } as N : n;
    }
    if (n.type !== "shape") return n;
    const s = n.strokes[i];
    return s && solid(s.fill) ? { ...n, strokes: n.strokes.map((x, j) => (j === i ? { ...x, fill: { ...x.fill, color: value } } : x)) } as N : n;
  }
  if (n.type === "text" && (key === "runs/0/fill/color" || key === "runs/0/size") && n.runs[0]) {
    const r = n.runs[0];
    if (key === "runs/0/size") return { ...n, runs: [{ ...r, size: value as number }, ...n.runs.slice(1)] };
    return solid(r.fill) ? { ...n, runs: [{ ...r, fill: { ...r.fill, color: value } }, ...n.runs.slice(1)] } as N : n;
  }
  return n;
}

/** A copy of the IR with every binding of the themed collection resolved in `mode`; the IR itself when there is no themed collection or the mode is unknown. */
export function applyTheme(swf: Swf, mode: string | undefined, preferred?: string): Swf {
  const col = themedCollection(swf.themes, preferred);
  if (!col || !mode || !col.modes.includes(mode)) return swf;
  let nodes = swf.nodes;
  for (const [nid, node] of Object.entries(swf.nodes)) {
    let next: N = node;
    for (const [key, ref] of Object.entries(node.bindings ?? {})) {
      const v = boundValue(col, key, ref.id, mode);
      if (v !== undefined) next = setBound(next, key, v);
    }
    if (next !== node) nodes = { ...nodes, [nid]: next };
  }
  return nodes === swf.nodes ? swf : { ...swf, nodes };
}
