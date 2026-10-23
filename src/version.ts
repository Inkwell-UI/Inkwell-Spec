/** Bump on every IR/overlay change and add a Migration from the previous version. */
export const SPEC_VERSION = 1;

export type Migration = { from: number; to: number; fn: (doc: any) => any };

/** Ordered chain; empty while 1 is the only version. */
export const MIGRATIONS: Migration[] = [];

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
