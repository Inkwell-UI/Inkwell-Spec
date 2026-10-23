import { z } from "zod";
import { Node, NodeId, type Swf } from "./ir.js";

export const PatchOp = z.discriminatedUnion("op", [
  z.object({ op: z.literal("upsert"), node: Node }),
  z.object({ op: z.literal("remove"), id: NodeId }),
  z.object({ op: z.literal("move"), id: NodeId, parent: NodeId, index: z.number().int().optional() }),
]);
export const Patch = z.object({ ops: z.array(PatchOp) });
export type PatchOp = z.infer<typeof PatchOp>;
export type Patch = z.infer<typeof Patch>;

type Nodes = Swf["nodes"];

function detach(nodes: Nodes, id: NodeId, parent: NodeId | null) {
  const p = parent === null ? undefined : nodes[parent];
  if (p) nodes[p.id] = { ...p, children: p.children.filter((c) => c !== id) };
}
function attach(nodes: Nodes, id: NodeId, parent: NodeId | null, index?: number) {
  const p = parent === null ? undefined : nodes[parent];
  if (!p) return;
  const kids = p.children.filter((c) => c !== id);
  kids.splice(index ?? kids.length, 0, id);
  nodes[p.id] = { ...p, children: kids };
}

/** Pure: returns a new Swf; only touched nodes are copied. Keeps parent/children consistent. */
export function applyPatch(swf: Swf, patch: Patch): Swf {
  const nodes: Nodes = { ...swf.nodes };
  for (const op of patch.ops) {
    if (op.op === "upsert") {
      const old = nodes[op.node.id];
      if (old && old.parent !== op.node.parent) detach(nodes, old.id, old.parent);
      nodes[op.node.id] = op.node;
      const p = op.node.parent === null ? undefined : nodes[op.node.parent];
      // an existing sibling keeps its position
      if (p && !p.children.includes(op.node.id)) attach(nodes, op.node.id, op.node.parent);
    } else if (op.op === "remove") {
      const n = nodes[op.id];
      if (!n) continue;
      detach(nodes, n.id, n.parent);
      const stack = [n.id];
      while (stack.length) {
        const cur = nodes[stack.pop()!];
        if (!cur) continue;
        delete nodes[cur.id];
        stack.push(...cur.children);
      }
    } else {
      const n = nodes[op.id];
      // unknown ids are ignored: out-of-order patches must not crash the editor
      if (!n || !nodes[op.parent]) continue;
      detach(nodes, n.id, n.parent);
      nodes[n.id] = { ...n, parent: op.parent };
      attach(nodes, n.id, op.parent, op.index);
    }
  }
  return { ...swf, nodes };
}
