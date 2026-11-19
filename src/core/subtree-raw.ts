// Read-only: a Rem and all its descendants with their RAW rich text
// (formatting such as b / l / tc kept exactly as RemNote stores it) and back
// text, gathered inside the plugin in one request instead of one bridge call
// per Rem. Used by the bridge action `read_subtree_raw` and by the control core
// method `core.readTreeRaw`. Never writes anything.
//
// Output is a flat list in document order (pre-order: a Rem, then its
// children's subtrees in order), the same order a per-Rem walk with
// `debug_rem_raw_text` produces. rawText is `rem.text` untouched (as
// `debug_rem_raw_text` returns it); backText is `rem.backText` or null.

export const SUBTREE_RAW_DEFAULT_DEPTH = 10;
export const SUBTREE_RAW_DEFAULT_NODES = 2000;
export const SUBTREE_RAW_MAX_DEPTH = 50;
// The control core marshals at most 2000 array items per reply, so a larger
// list would be cut silently on that path.
export const SUBTREE_RAW_MAX_NODES = 2000;
// SDK calls in flight at once, so a large card does not flood RemNote.
const CONCURRENCY = 24;

export interface RawSubtreeNode {
  remId: string;
  parentId: string | null;
  depth: number;
  order: number;
  rawText: unknown;
  backText: unknown;
  childCount: number;
}

export interface RawSubtreeResult {
  readOnly: true;
  remId: string;
  maxDepth: number;
  maxNodes: number;
  count: number;
  truncated: boolean;
  truncatedBy: Array<'maxDepth' | 'maxNodes'>;
  nodes: RawSubtreeNode[];
}

interface RemLike {
  _id: string;
  text?: unknown;
  backText?: unknown;
  getChildrenRem(): Promise<RemLike[] | undefined>;
}
interface PluginLike {
  rem: { findOne(id: string): Promise<RemLike | undefined> };
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.floor(n), min), max);
}

async function settle(value: unknown): Promise<unknown> {
  return value && typeof (value as any).then === 'function' ? await value : value;
}

// Plain JSON copy: both transports (bridge HTTP and the control core, whose
// marshaller turns undefined fields into null) then give identical output,
// the same shape debug_rem_raw_text has after its JSON trip.
function jsonCopy(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  const text = JSON.stringify(value);
  return text === undefined ? null : JSON.parse(text);
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      out[index] = await fn(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export class SubtreeRawError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

export async function readSubtreeRaw(
  plugin: PluginLike,
  remId: unknown,
  options: { maxDepth?: unknown; maxNodes?: unknown } = {}
): Promise<RawSubtreeResult> {
  if (typeof remId !== 'string' || !remId.trim()) throw new SubtreeRawError('BAD_ARGUMENT', 'read_subtree_raw requires remId');
  const rootId = remId.trim();
  const maxDepth = clampInt(options.maxDepth, SUBTREE_RAW_DEFAULT_DEPTH, 0, SUBTREE_RAW_MAX_DEPTH);
  const maxNodes = clampInt(options.maxNodes, SUBTREE_RAW_DEFAULT_NODES, 1, SUBTREE_RAW_MAX_NODES);

  const root = await plugin.rem.findOne(rootId);
  if (!root) throw new SubtreeRawError('NOT_FOUND', `Rem not found: ${rootId}`);

  // Level by level, each level fetched in parallel; then re-ordered pre-order.
  type Entry = { rem: RemLike; parentId: string | null; depth: number; order: number };
  const nodes = new Map<string, RawSubtreeNode>();
  const kids = new Map<string, string[]>();
  const truncatedBy = new Set<'maxDepth' | 'maxNodes'>();
  const seen = new Set<string>([root._id]);
  let level: Entry[] = [{ rem: root, parentId: null, depth: 0, order: 0 }];

  while (level.length) {
    const room = maxNodes - nodes.size;
    const take = level.slice(0, Math.max(room, 0));
    if (take.length < level.length) truncatedBy.add('maxNodes');
    const read = await mapLimit(take, CONCURRENCY, async (e) => {
      const [rawText, backText, children] = await Promise.all([
        settle(e.rem.text),
        settle(e.rem.backText),
        e.rem.getChildrenRem(),
      ]);
      return { e, rawText, backText, children: (children || []) as RemLike[] };
    });
    const nextLevel: Entry[] = [];
    for (const { e, rawText, backText, children } of read) {
      nodes.set(e.rem._id, {
        remId: e.rem._id,
        parentId: e.parentId,
        depth: e.depth,
        order: e.order,
        rawText: jsonCopy(rawText),
        backText: jsonCopy(backText),
        childCount: children.length,
      });
      const ids: string[] = [];
      if (e.depth >= maxDepth) {
        if (children.length) truncatedBy.add('maxDepth');
      } else {
        children.forEach((child, order) => {
          if (!child || seen.has(child._id)) return; // guard against a cycle
          seen.add(child._id);
          ids.push(child._id);
          nextLevel.push({ rem: child, parentId: e.rem._id, depth: e.depth + 1, order });
        });
      }
      kids.set(e.rem._id, ids);
    }
    level = nextLevel;
  }

  const ordered: RawSubtreeNode[] = [];
  const stack = [root._id];
  while (stack.length) {
    const id = stack.pop() as string;
    const node = nodes.get(id);
    if (!node) continue; // cut by maxNodes
    ordered.push(node);
    const ids = kids.get(id) || [];
    for (let i = ids.length - 1; i >= 0; i -= 1) stack.push(ids[i]);
  }

  return {
    readOnly: true,
    remId: root._id,
    maxDepth,
    maxNodes,
    count: ordered.length,
    truncated: truncatedBy.size > 0,
    truncatedBy: [...truncatedBy],
    nodes: ordered,
  };
}
