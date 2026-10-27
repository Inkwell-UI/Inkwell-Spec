// SPEC-CHANGES W3 (focus graph) and W4 (Prompt component): overlay data per SWF, its defaults and its validation.
import { z } from "zod";
import { NodeId } from "./ir.js";

export const FOCUS_DIRS = ["up", "down", "left", "right"] as const;
export type FocusDir = (typeof FOCUS_DIRS)[number];

/**
 * `NodeOverlay.focus`: a node with a numeric `order` is focusable and joins the SWF's focus graph. Default moves: down/right = next in order,
 * up/left = previous (wrapping). `overrides` replaces the default of one direction by another focusable node's id. Unknown keys survive.
 */
export const FocusOverlay = z.looseObject({
  order: z.number().optional(),
  overrides: z.looseObject({ up: NodeId.optional(), down: NodeId.optional(), left: NodeId.optional(), right: NodeId.optional() }).optional(),
});
export type FocusOverlay = z.infer<typeof FocusOverlay>;

export type FocusIssue = { severity: "error" | "warning"; code: string; nodeId: string; message: string };
export interface FocusGraph {
  /** Focusable node ids in focus order (order, then id); the first gets focus when the menu opens. */
  order: string[];
  /** Where each direction moves from each focusable node (defaults filled in, broken overrides replaced by the default). */
  moves: Record<string, Record<FocusDir, string>>;
  issues: FocusIssue[];
}

/**
 * The focus graph of one SWF from its overlay nodes. `exists` says whether a node id is in the SWF's IR (an entry of a deleted layer is ignored with a warning).
 * Errors: an override to a node that is not focusable (`focus-target-missing`), a node the first one cannot reach (`focus-unreachable`), a node from which the first
 * one cannot be reached again (`focus-dead-end`, focus would be trapped).
 */
export function focusGraph(nodes: Record<string, { focus?: unknown } | undefined>, exists: (id: string) => boolean): FocusGraph {
  const issues: FocusIssue[] = [];
  const entries: { id: string; order: number; overrides: Record<string, unknown> }[] = [];
  for (const [id, n] of Object.entries(nodes)) {
    const f = n?.focus as { order?: unknown; overrides?: unknown } | undefined;
    if (!f || typeof f !== "object" || typeof f.order !== "number" || !Number.isFinite(f.order)) continue;
    if (!exists(id)) {
      issues.push({ severity: "warning", code: "focus-node-missing", nodeId: id, message: "This focus graph entry belongs to a layer that no longer exists in Figma; it is ignored." });
      continue;
    }
    entries.push({ id, order: f.order, overrides: f.overrides && typeof f.overrides === "object" ? (f.overrides as Record<string, unknown>) : {} });
  }
  entries.sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const order = entries.map((e) => e.id);
  const inGraph = new Set(order);
  const moves: FocusGraph["moves"] = {};
  entries.forEach((e, i) => {
    const next = order[(i + 1) % order.length]!;
    const prev = order[(i - 1 + order.length) % order.length]!;
    const m: Record<FocusDir, string> = { up: prev, down: next, left: prev, right: next };
    for (const [k, t] of Object.entries(e.overrides)) {
      if (!(FOCUS_DIRS as readonly string[]).includes(k)) {
        issues.push({ severity: "warning", code: "focus-direction-unknown", nodeId: e.id, message: `Override "${k}" is not a direction (up, down, left, right); it is ignored.` });
      } else if (typeof t !== "string" || !inGraph.has(t)) {
        issues.push({ severity: "error", code: "focus-target-missing", nodeId: e.id, message: `The ${k} override points to ${String(t)}, which is ${typeof t === "string" && exists(t) ? "not focusable (it has no focus order)" : "not a layer of this SWF"}.` });
      } else m[k as FocusDir] = t;
    }
    moves[e.id] = m;
  });
  if (order.length) {
    const walk = (from: string, edges: (id: string) => string[]): Set<string> => {
      const seen = new Set([from]);
      const todo = [from];
      while (todo.length) for (const t of edges(todo.pop()!)) if (!seen.has(t)) (seen.add(t), todo.push(t));
      return seen;
    };
    const first = order[0]!;
    const fwd = walk(first, (id) => FOCUS_DIRS.map((d) => moves[id]![d]));
    const back = walk(first, (id) => order.filter((o) => FOCUS_DIRS.some((d) => moves[o]![d] === id)));
    for (const id of order) {
      if (!fwd.has(id)) issues.push({ severity: "error", code: "focus-unreachable", nodeId: id, message: "No path of up/down/left/right moves leads here from the first focusable component; a gamepad can never focus it." });
      else if (!back.has(id)) issues.push({ severity: "error", code: "focus-dead-end", nodeId: id, message: "Focus can get here but no up/down/left/right moves lead back to the first focusable component: a gamepad user gets stuck." });
    }
  }
  return { order, moves, issues };
}

/** Engine user events a prompt usually names; any other string is allowed when it sets a glyph for every device. */
export const PROMPT_ACTIONS = ["Accept", "Cancel", "Up", "Down", "Left", "Right"] as const;
export const XBOX_GLYPHS = ["A", "B", "X", "Y", "LB", "RB", "LT", "RT", "DpadUp", "DpadDown", "DpadLeft", "DpadRight", "Start", "Back"] as const;
export const PS_GLYPHS = ["Cross", "Circle", "Square", "Triangle", "L1", "R1", "L2", "R2", "DpadUp", "DpadDown", "DpadLeft", "DpadRight", "Options", "Share"] as const;
export const PROMPT_DEVICES = ["keyboard", "xbox", "playstation"] as const;
export type PromptDevice = (typeof PROMPT_DEVICES)[number];
/** A keyboard glyph is a key cap with this label (printable ASCII, 1 to 8 characters). */
export const KEY_LABEL = /^[\x21-\x7e]([\x20-\x7e]{0,6}[\x21-\x7e])?$/;

/**
 * `NodeOverlay.prompt` on a frame with role `prompt`: the action it shows and optional glyphs per device (default `PROMPT_DEFAULTS[action]`). The label is the frame's text
 * layer, localized by its own `locKey` like any text. Unknown keys survive.
 */
export const PromptOverlay = z.looseObject({
  action: z.string().optional(),
  keyboard: z.string().optional(),
  xbox: z.string().optional(),
  playstation: z.string().optional(),
});
export type PromptOverlay = z.infer<typeof PromptOverlay>;

export const PROMPT_DEFAULTS: Record<(typeof PROMPT_ACTIONS)[number], Record<PromptDevice, string>> = {
  Accept: { keyboard: "Enter", xbox: "A", playstation: "Cross" },
  Cancel: { keyboard: "Esc", xbox: "B", playstation: "Circle" },
  Up: { keyboard: "Up", xbox: "DpadUp", playstation: "DpadUp" },
  Down: { keyboard: "Down", xbox: "DpadDown", playstation: "DpadDown" },
  Left: { keyboard: "Left", xbox: "DpadLeft", playstation: "DpadLeft" },
  Right: { keyboard: "Right", xbox: "DpadRight", playstation: "DpadRight" },
};

/** The glyph per device (explicit glyphs win over the action's defaults) and what is wrong (empty when the prompt can be built). */
export function resolvePrompt(p: unknown): { glyphs: Partial<Record<PromptDevice, string>>; problems: string[] } {
  const o = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
  const action = typeof o["action"] === "string" ? o["action"] : "";
  const dflt = (PROMPT_DEFAULTS as Record<string, Record<PromptDevice, string>>)[action];
  const problems: string[] = [];
  if (!action) problems.push("The prompt has no action (Accept, Cancel, Up, Down, Left, Right or your own name).");
  const glyphs: Partial<Record<PromptDevice, string>> = {};
  const allowed: Record<PromptDevice, (g: string) => boolean> = { keyboard: (g) => KEY_LABEL.test(g), xbox: (g) => (XBOX_GLYPHS as readonly string[]).includes(g), playstation: (g) => (PS_GLYPHS as readonly string[]).includes(g) };
  for (const d of PROMPT_DEVICES) {
    const g = typeof o[d] === "string" && o[d] !== "" ? (o[d] as string) : dflt?.[d];
    if (g === undefined) { if (action) problems.push(`No ${d} glyph: "${action}" has no default, so set one.`); continue; }
    if (!allowed[d](g)) problems.push(d === "keyboard" ? `Keyboard glyph "${g}" must be 1 to 8 printable ASCII characters.` : `"${g}" is not a ${d} glyph (${(d === "xbox" ? XBOX_GLYPHS : PS_GLYPHS).join(", ")}).`);
    else glyphs[d] = g;
  }
  return { glyphs, problems };
}
