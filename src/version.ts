/** Bump on every IR/overlay change and add a Migration from the previous version. */
export const SPEC_VERSION = 2;

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

/** Ordered chain. */
export const MIGRATIONS: Migration[] = [{ from: 1, to: 2, fn: textLayoutToFields }];

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
