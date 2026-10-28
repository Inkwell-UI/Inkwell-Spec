/** Bump on every IR/overlay change and add a Migration from the previous version. */
export const SPEC_VERSION = 8;

export type Migration = { from: number; to: number; fn: (doc: any) => any };

/**
 * 1 -> 2: Text layout moved from `extra.text` into real fields. v1 units (the editor's reader): lineHeight = px number,
 * letterSpacing = % of font size, `shrink: 'shrink'|'fit'` -> textFit. Other keys in extra.text (e.g. decoration) stay.
 */
export function textLayoutToFields(doc: any): any {
  if (!doc.nodes) return doc; // overlay docs have no nodes
  const nodes: Record<string, any> = {};
  for (const [id, n] of Object.entries<any>(doc.nodes)) {
    const old = n?.type === "text" && n.extra?.text && typeof n.extra.text === "object" ? n.extra.text : undefined;
    if (!old) { nodes[id] = n; continue; }
    const { align, verticalAlign, lineHeight, letterSpacing, shrink, truncate, ...rest } = old;
    const next: any = { ...n };
    if (align !== undefined && next.align === undefined) next.align = align;
    if (verticalAlign !== undefined && next.verticalAlign === undefined) next.verticalAlign = verticalAlign;
    if (typeof lineHeight === "number" && next.lineHeight === undefined) next.lineHeight = { unit: "px", value: lineHeight };
    if (typeof letterSpacing === "number" && next.letterSpacing === undefined) next.letterSpacing = { unit: "percent", value: letterSpacing };
    if (shrink !== undefined && next.textFit === undefined) next.textFit = shrink;
    if (truncate !== undefined && next.truncate === undefined) next.truncate = truncate;
    const { text: _t, ...extra } = n.extra;
    if (Object.keys(rest).length) extra.text = rest;
    if (Object.keys(extra).length) next.extra = extra; else delete next.extra;
    nodes[id] = next;
  }
  return { ...doc, nodes };
}

/** 2 -> 3: alias FontRef gains optional `styleName`; protocol is per SWF. Nothing to rewrite in stored documents. */
export const noop = (doc: any): any => doc;

/** 3 -> 4 (images): image Fill gains `opacity`, Frame gains optional `fills`, Image gains `fillOpacity`. All optional: nothing to rewrite. */

/** 4 -> 5 (graphs): new graph, pack and packs.lock formats; IR and overlay unchanged. Nothing to rewrite. */

/** 5 -> 6 (runtime formats): new MenuDef, MenuSettings, RuntimeIni, RuntimeMessage; GraphVariable.scope gains `saved`; NodeDef.requiresRuntime; NodeOverlay.list. All optional or new: nothing to rewrite. */

/** 6 -> 7 (localization, V7): NodeOverlay.locKey and .font, the Localization schema (`localization.json`), MenuDef.translations. All optional or new: nothing to rewrite. */

/**
 * 7 -> 8 (contracts, W5): `target.base` ("vanilla" | "skyui") is replaced by `target.layers`, the contract layers a menu replacement is built for.
 * "skyui" meant "check SkyUI 5.2 and 6 too" -> ["engine", "skyui52", "skyui6"]; "vanilla" -> ["engine"]. A target without `base` is left as it is.
 */
export function baseToLayers(doc: any): any {
  const t = doc?.target;
  if (!t || typeof t !== "object" || !("base" in t)) return doc;
  const { base, ...rest } = t;
  return { ...doc, target: { ...rest, layers: rest.layers ?? (base === "skyui" ? ["engine", "skyui52", "skyui6"] : ["engine"]) } };
}

/** Auto layout (still spec 8, no bump: nothing is published and the in-game runtime reads this number): `layout` on every node (sizing per axis, absolute) and `primaryAlign`, `counterAlign`, `wrap` on `autoLayout`. All optional or defaulted: nothing to rewrite. */

/** Ordered chain. */
export const MIGRATIONS: Migration[] = [{ from: 1, to: 2, fn: textLayoutToFields }, { from: 2, to: 3, fn: noop }, { from: 3, to: 4, fn: noop }, { from: 4, to: 5, fn: noop }, { from: 5, to: 6, fn: noop }, { from: 6, to: 7, fn: noop }, { from: 7, to: 8, fn: baseToLayers }];

/** Runs migrations in order until doc.specVersion reaches target. Throws on newer or unreachable versions. */
export function migrate(
  doc: { specVersion: number },
  opts: { chain?: Migration[]; target?: number } = {},
): any {
  const { chain = MIGRATIONS, target = SPEC_VERSION } = opts;
  let cur: any = doc;
  while (cur.specVersion !== target) {
    if (cur.specVersion > target) throw new Error(`specVersion ${cur.specVersion} is newer than ${target}`);
    const step = chain.find((m) => m.from === cur.specVersion);
    if (!step) throw new Error(`no migration from specVersion ${cur.specVersion}`);
    cur = { ...step.fn(cur), specVersion: step.to };
  }
  return cur;
}
