import type { Swf, Theme, ThemeVariable } from "./ir.js";
import { themedCollection } from "./ir.js";

// Applying a theme (SPEC-CHANGES V6.3, V14): the bound properties of the IR get the variable's value in one mode. Used for the compile-time default and the editor preview.

/**
 * The theme names: every mode name of every collection with two or more modes, in Figma's order, each once (a theme switches every collection that has a mode of that name; a
 * collection without it stays in its first mode). With `preferred`, only that collection's modes. Empty without a themed collection.
 */
export const themeModes = (swf: Pick<Swf, "themes">, preferred?: string): string[] =>
  preferred ? themedCollection(swf.themes, preferred)?.modes ?? [] : [...new Set((swf.themes ?? []).filter((t) => t.modes.length >= 2).flatMap((t) => t.modes))];

/** The collection and variable of a binding's variable id (any collection, a single-mode one too). */
export const variableIn = (themes: readonly Theme[] | undefined, id: string): { col: Theme; v: ThemeVariable } | undefined => {
  for (const col of themes ?? []) { const v = col.variables?.[id]; if (v) return { col, v }; }
  return undefined;
};

/** The mode of `col` a layer shows when the theme `mode` is applied: its pinned mode, else `mode`, else the collection's first mode. */
export const modeIn = (col: Theme, mode: string, pins?: Record<string, string>): string => {
  const pin = pins?.[col.name];
  return pin && col.modes.includes(pin) ? pin : col.modes.includes(mode) ? mode : col.modes[0] ?? mode;
};

/** The modes pinned on a layer or inherited from its nearest pinned ancestor (Figma explicit variable modes), by collection name. */
export function pinsOf(nodes: Swf["nodes"], id: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (let n = nodes[id], i = 0; n && i < 256; n = n.parent ? nodes[n.parent] : undefined, i++) for (const [c, m] of Object.entries(n.modes ?? {})) if (!(c in out)) out[c] = m;
  return out;
}

/** `boundValue` of a variable in whichever collection holds it, resolved for the theme `mode` and the layer's pins. */
export function boundIn(themes: readonly Theme[] | undefined, key: string, id: string, mode: string, pins?: Record<string, string>): unknown {
  const f = variableIn(themes, id);
  return f ? boundValue(f.col, key, id, modeIn(f.col, mode, pins)) : undefined;
}

const isColor = (v: unknown): v is { r: number; g: number; b: number; a?: number } => !!v && typeof v === "object" && typeof (v as { r?: unknown }).r === "number";

/** The value of a binding in a mode, when the variable exists in the themed collection and has the right type for the property. */
export function boundValue(col: Theme, key: string, id: string, mode: string): unknown {
  const v: ThemeVariable | undefined = col.variables?.[id];
  const x = v?.values[mode];
  if (!v || x === undefined) return undefined;
  if (key === "visible") return v.type === "boolean" && typeof x === "boolean" ? x : undefined;
  if (key.endsWith("color")) return v.type === "color" && isColor(x) ? x : undefined;
  if (key === "content") return v.type === "string" && typeof x === "string" ? x : undefined;
  return v.type === "number" && typeof x === "number" ? x : undefined;
}

type N = Swf["nodes"][string];

/** One binding applied to a copy of the node; the node itself when the key does not fit it (gradient fill, image, missing paint, other node type). */
function setBound(n: N, key: string, value: unknown): N {
  // Figma keeps a bound colour variable's alpha in the paint opacity, so a mode's alpha replaces it (never multiplies with the stored one)
  const paint = (f: object | undefined) => { const { r, g, b, a } = value as { r: number; g: number; b: number; a?: number }; return { ...f, color: { r, g, b }, opacity: a ?? 1 }; };
  const solid = (f: unknown) => !!f && (f as { type?: string }).type === "solid";
  const m = /^(fills|strokes)\/(\d+)\/color$/.exec(key);
  if (key === "opacity") return { ...n, opacity: Math.min(1, Math.max(0, (value as number) / 100)) }; // a Figma opacity variable is 0 to 100
  if (key === "visible") return { ...n, visible: value as boolean };
  if (key === "transform/width" || key === "transform/height") return { ...n, transform: { ...n.transform, [key.slice(10)]: value as number } };
  const gs = /^(fills|strokes)\/(\d+)\/stops\/(\d+)\/color$/.exec(key);
  if (gs && (n.type === "frame" || n.type === "shape")) {
    // a gradient stop's colour carries its own alpha (a Figma stop has no paint opacity)
    const [i, j] = [Number(gs[2]), Number(gs[3])];
    const stops = (f: unknown) => { const g = f as { type?: string; stops?: { color: unknown }[] } | undefined; return g && (g.type === "linear" || g.type === "radial") && g.stops?.[j] ? g : undefined; };
    const recolor = <F>(f: F): F => { const g = f as unknown as { stops: object[] }; return { ...f, stops: g.stops.map((x, k) => (k === j ? { ...x, color: value } : x)) }; };
    if (gs[1] === "fills") return stops(n.fills?.[i]) ? { ...n, fills: n.fills!.map((x, k) => (k === i ? recolor(x) : x)) } as N : n;
    return stops(n.strokes?.[i]?.fill) ? { ...n, strokes: n.strokes!.map((x, k) => (k === i ? { ...x, fill: recolor(x.fill) } : x)) } as N : n;
  }
  if (m && (n.type === "frame" || n.type === "shape")) {
    const i = Number(m[2]);
    if (m[1] === "fills") {
      const f = n.fills?.[i];
      return solid(f) ? { ...n, fills: n.fills!.map((x, j) => (j === i ? paint(x) : x)) } as N : n;
    }
    const s = n.strokes?.[i]; // a shape's strokes and a frame's border
    return s && solid(s.fill) ? { ...n, strokes: n.strokes!.map((x, j) => (j === i ? { ...x, fill: paint(x.fill) } : x)) } as N : n;
  }
  if (key === "content" && n.type === "text") {
    // the runs follow the new length: the last kept run ends at it
    const len = (value as string).length;
    const runs = n.runs.filter((r, i) => i === 0 || r.start < len).map((r, i, a) => ({ ...r, end: i === a.length - 1 ? len : Math.min(r.end, len) }));
    return { ...n, content: value as string, runs } as N;
  }
  if ((key === "lineHeight" || key === "letterSpacing") && n.type === "text") return { ...n, [key]: { unit: "px", value: value as number } } as N;
  const sw = /^strokes\/(\d+)\/(?:weight|side\/(top|right|bottom|left))$/.exec(key);
  if (sw && (n.type === "frame" || n.type === "shape")) {
    const i = Number(sw[1]);
    const s = n.strokes?.[i];
    if (!s) return n;
    const v = value as number;
    const side = sw[2] as "top" | "right" | "bottom" | "left" | undefined;
    const sides = side ? { ...(s.sides ?? { top: s.weight, right: s.weight, bottom: s.weight, left: s.weight }), [side]: v } : s.sides && Object.fromEntries(Object.entries(s.sides as Record<string, number>).map(([k, w]) => [k, w > 0 ? v : 0]));
    const next = { ...s, weight: sides ? Math.max(...Object.values(sides) as number[]) : v, ...(sides && { sides }) };
    return { ...n, strokes: n.strokes!.map((x, j) => (j === i ? next : x)) } as N;
  }
  const al = /^autoLayout\/(spacing|padding\/([0-3]))$/.exec(key);
  if (al && (n as { autoLayout?: object }).autoLayout) {
    const a = (n as unknown as { autoLayout: { padding: number[] } }).autoLayout;
    return { ...n, autoLayout: al[2] ? { ...a, padding: a.padding.map((p, k) => (k === Number(al[2]) ? (value as number) : p)) } : { ...a, spacing: value as number } } as N;
  }
  if (n.type === "text" && (key === "runs/0/fill/color" || key === "runs/0/size") && n.runs[0]) {
    const r = n.runs[0];
    if (key === "runs/0/size") return { ...n, runs: [{ ...r, size: value as number }, ...n.runs.slice(1)] };
    return solid(r.fill) ? { ...n, runs: [{ ...r, fill: paint(r.fill) }, ...n.runs.slice(1)] } as N : n;
  }
  return n;
}

/** A copy of the IR with every binding resolved in the theme `mode` (each variable in its own collection, a layer's pinned mode winning); the IR itself when there is no themed collection or the mode is unknown. */
export function applyTheme(swf: Swf, mode: string | undefined, preferred?: string): Swf {
  if (!mode || !themeModes(swf, preferred).includes(mode)) return swf;
  let nodes = swf.nodes;
  for (const [nid, node] of Object.entries(swf.nodes)) {
    let next: N = node;
    const pins = node.bindings ? pinsOf(swf.nodes, nid) : undefined;
    for (const [key, ref] of Object.entries(node.bindings ?? {})) {
      const v = boundIn(swf.themes, key, ref.id, mode, pins);
      if (v !== undefined) next = setBound(next, key, v);
    }
    if (next !== node) nodes = { ...nodes, [nid]: next };
  }
  return nodes === swf.nodes ? swf : { ...swf, nodes };
}
