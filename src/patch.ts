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

export class PatchError extends Error {
  constructor(public code: "unknown_node" | "unknown_parent", public id: NodeId, public opIndex: number) {
    super(`${code}: ${id} (op ${opIndex})`);
    this.name = "PatchError";
  }
}

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

/**
 * Pure: returns a new Swf; only touched nodes are copied. Keeps parent/children consistent.
 * `remove` deletes the node's whole subtree; removing an unknown id is a no-op.
 * `move` with an unknown node or parent throws PatchError. Ops run on a private copy and the
 * result is only returned if all succeed, so a bad op never leaves a partially applied patch.
 */
export function applyPatch(swf: Swf, patch: Patch): Swf {
  const nodes: Nodes = { ...swf.nodes };
  for (const [i, op] of patch.ops.entries()) {
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
      if (!n) throw new PatchError("unknown_node", op.id, i);
      if (!nodes[op.parent]) throw new PatchError("unknown_parent", op.parent, i);
      detach(nodes, n.id, n.parent);
      nodes[n.id] = { ...n, parent: op.parent };
      attach(nodes, n.id, op.parent, op.index);
    }
  }
  return { ...swf, nodes };
}
