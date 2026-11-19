// Captures the state of Rems before a change and restores it for undo.
// Only the official SDK is used. Limits are explicit: a deleted Rem is restored
// as a new Rem (new id) with the same text, back text, tags and structure;
// flashcard history, properties and references to the old id cannot be restored.
import type { ReactRNPlugin } from '@remnote/plugin-sdk';

export const SUBTREE_LIMIT = 2000;

// Restorable fields: name -> [getter on the Rem object, setter on the Rem object].
// text/backText are properties, handled separately.
const FIELDS: Record<string, [string, string]> = {
  isDocument: ['isDocument', 'setIsDocument'],
  isFolder: ['isFolder', 'setIsFolder'],
  type: ['getType', 'setType'],
  isCardItem: ['isCardItem', 'setIsCardItem'],
  enablePractice: ['getEnablePractice', 'setEnablePractice'],
  practiceDirection: ['getPracticeDirection', 'setPracticeDirection'],
  isTodo: ['isTodo', 'setIsTodo'],
  todoStatus: ['getTodoStatus', 'setTodoStatus'],
  fontSize: ['getFontSize', 'setFontSize'],
  highlightColor: ['getHighlightColor', 'setHighlightColor'],
  isListItem: ['isListItem', 'setIsListItem'],
  isQuote: ['isQuote', 'setIsQuote'],
  isCode: ['isCode', 'setIsCode'],
  isSlot: ['isSlot', 'setIsSlot'],
  isProperty: ['isProperty', 'setIsProperty'],
};

// Empties a field the Rem did not have before the change; these setters do
// not accept "nothing".
const CLEAR: Record<string, (rem: any) => Promise<unknown>> = {
  fontSize: (rem) => rem.setFontSize(undefined),
  highlightColor: (rem) => rem.removePowerup('h'),
};

export interface RemState {
  remId: string;
  exists: boolean;
  text?: unknown;
  backText?: unknown;
  parentId?: string | null;
  position?: number | null;
  tagIds?: string[];
  sourceIds?: string[];
  fields?: Record<string, unknown>;
  // Present when the Rem is about to be deleted: its whole subtree.
  subtree?: TreeNode;
}

export interface TreeNode {
  remId: string;
  text?: unknown;
  backText?: unknown;
  isDocument?: boolean;
  tagIds?: string[];
  children: TreeNode[];
  truncated?: boolean;
}

async function tryGet<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try { return await fn(); } catch { return undefined; }
}

function idsOf(list: unknown): string[] | undefined {
  return Array.isArray(list) ? list.map((r: any) => r?._id).filter((id) => typeof id === 'string') : undefined;
}

export async function captureRem(plugin: ReactRNPlugin, remId: string): Promise<RemState> {
  const rem: any = await plugin.rem.findOne(remId);
  if (!rem) return { remId, exists: false };
  const parent: any = await tryGet(() => rem.getParentRem());
  const fields: Record<string, unknown> = {};
  for (const [name, [getter]] of Object.entries(FIELDS)) {
    if (typeof rem[getter] !== 'function') continue;
    let value: unknown;
    try { value = await rem[getter](); } catch { continue; }
    // An empty field is kept as null, so undo can clear a value the change set.
    fields[name] = value ?? null;
  }
  return {
    remId,
    exists: true,
    text: rem.text,
    backText: rem.backText,
    parentId: parent?._id ?? null,
    position: (await tryGet(() => rem.positionAmongstSiblings())) ?? null,
    tagIds: idsOf(await tryGet(() => rem.getTagRems())),
    sourceIds: idsOf(await tryGet(() => rem.getSources())),
    fields,
  };
}

// Returns undefined when the Rem does not exist; marks `truncated` when the
// subtree is larger than the budget (callers must refuse to delete then).
export async function captureSubtree(plugin: ReactRNPlugin, remId: string, budget = { nodes: SUBTREE_LIMIT }): Promise<TreeNode | undefined> {
  const rem: any = await plugin.rem.findOne(remId);
  if (!rem) return undefined;
  budget.nodes -= 1;
  const node: TreeNode = {
    remId, text: rem.text, backText: rem.backText,
    isDocument: await tryGet(() => rem.isDocument()),
    tagIds: idsOf(await tryGet(() => rem.getTagRems())),
    children: [],
  };
  const children: any[] = (await tryGet(() => rem.getChildrenRem())) || [];
  for (const child of children) {
    if (budget.nodes <= 0) { node.truncated = true; break; }
    const sub = await captureSubtree(plugin, child._id, budget);
    if (sub) {
      node.children.push(sub);
      if (sub.truncated) { node.truncated = true; break; }
    }
  }
  return node;
}

export async function countDescendants(plugin: ReactRNPlugin, remId: string): Promise<number | null> {
  const rem: any = await plugin.rem.findOne(remId);
  if (!rem) return null;
  const all = await tryGet(() => rem.getDescendants());
  return Array.isArray(all) ? all.length : null;
}

// An empty list counts as no value: undo writes [] where RemNote refuses undefined.
const norm = (v: unknown) => (v == null || (Array.isArray(v) && v.length === 0) ? null : v);

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

function subtreeIds(node: TreeNode, out: Set<string>) {
  for (const child of node.children) { out.add(child.remId); subtreeIds(child, out); }
}

async function recreate(plugin: ReactRNPlugin, node: TreeNode, parentId: string | null, position: number | null, created: string[]): Promise<string | undefined> {
  const rem: any = await plugin.rem.createRem();
  if (!rem) return undefined;
  created.push(rem._id);
  if (node.text !== undefined) await rem.setText(node.text);
  if (node.backText !== undefined && node.backText !== null) await rem.setBackText(node.backText);
  if (node.isDocument) await rem.setIsDocument(true);
  for (const tagId of node.tagIds || []) await tryGet(() => rem.addTag(tagId));
  if (parentId) {
    const parent = await plugin.rem.findOne(parentId);
    if (parent) await rem.setParent(parent, position ?? undefined);
  }
  for (let i = 0; i < node.children.length; i += 1) {
    // A child that still exists (e.g. moved out before its parent was deleted)
    // is never copied; the place pass puts it back if it was captured.
    if (await tryGet(() => plugin.rem.findOne(node.children[i].remId))) continue;
    await recreate(plugin, node.children[i], rem._id, i, created);
  }
  return rem._id;
}

export interface RestoreReport {
  restored: string[];
  recreated: { oldId: string; newId: string }[];
  removed: string[];
  conflicts: string[];
  problems: string[];
}

const byPosition = (a: RemState, b: RemState) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER);

// Restores captured states in four passes:
//   1. fields (text, back text, tags, sources, flags) of Rems that still exist;
//   2. Rems that no longer exist, parents before children, each subtree once;
//   3. places (parent and position), lowest position first, re-checked at that
//      moment so a sibling that came back in pass 2 is not counted as a move;
//   4. Rems the change created, unless anything else now depends on them.
// When the state right after the change (`after`) is known, a value is only
// restored if it still has the value the change left; anything edited since then
// is reported as a conflict and left alone.
export async function restoreStates(plugin: ReactRNPlugin, before: RemState[], createdIds: string[], after: RemState[] = []): Promise<RestoreReport> {
  const report: RestoreReport = { restored: [], recreated: [], removed: [], conflicts: [], problems: [] };
  const afterById = new Map(after.map((s) => [s.remId, s]));
  const missing: RemState[] = [];
  const places: { state: RemState; was?: RemState; hasAfter: boolean; moved: boolean }[] = [];

  // Pass 1: fields.
  for (const state of [...before].reverse()) {
    if (!state.exists) continue;
    const step = async (label: string, fn: () => Promise<unknown>) => {
      try { await fn(); } catch (e) { report.problems.push(`${state.remId} ${label}: ${(e as Error).message}`); }
    };
    const rem: any = await plugin.rem.findOne(state.remId);
    if (!rem) { missing.push(state); continue; }
    const now = await captureRem(plugin, state.remId);
    const was = afterById.get(state.remId);
    // A field may be restored when it is unchanged since the change (or when the
    // state after the change is unknown) and differs from the captured value.
    const restorable = (label: string, current: unknown, captured: unknown, afterValue: unknown, hasAfter: boolean) => {
      if (same(current, captured)) return false;
      if (hasAfter && !same(current, afterValue)) { report.conflicts.push(`${state.remId} ${label}: changed again after the journaled change; left as is`); return false; }
      return true;
    };
    const hasAfter = Boolean(was && was.exists);
    if (restorable('text', now.text, state.text, was?.text, hasAfter)) await step('text', () => rem.setText(state.text ?? []));
    if (restorable('backText', now.backText, state.backText, was?.backText, hasAfter)) {
      // RemNote refuses undefined; an empty list clears the back text.
      await step('backText', () => rem.setBackText(state.backText ?? []));
    }
    if (state.parentId !== undefined) {
      // Conflicts are judged by parent only: a position also shifts when siblings
      // are added or removed, which is not an edit of this Rem.
      const moved = restorable('parent', now.parentId, state.parentId, was?.parentId, hasAfter);
      const reordered = !moved && now.parentId === state.parentId && hasAfter
        && was!.parentId === state.parentId && was!.position !== state.position && now.position === was!.position;
      if (moved || reordered) places.push({ state, was, hasAfter, moved });
    }
    for (const [label, ids, add, remove] of [
      ['tags', 'tagIds', 'addTag', 'removeTag'],
      ['sources', 'sourceIds', 'addSource', 'removeSource'],
    ] as const) {
      const captured = state[ids];
      if (!captured) continue;
      const current = now[ids] || [];
      if (!restorable(label, [...current].sort(), [...captured].sort(), was?.[ids] ? [...(was[ids] as string[])].sort() : undefined, hasAfter && Boolean(was?.[ids]))) continue;
      for (const id of captured) if (!current.includes(id)) await step(`${add} ${id}`, () => rem[add](id));
      for (const id of current) if (!captured.includes(id)) await step(`${remove} ${id}`, () => rem[remove](id));
    }
    for (const [name, [, setter]] of Object.entries(FIELDS)) {
      if (!state.fields || !(name in state.fields)) continue;
      if (restorable(name, now.fields?.[name], state.fields[name], was?.fields?.[name], hasAfter && Boolean(was?.fields && name in was.fields))) {
        const value = state.fields[name];
        if (value != null) await step(setter, () => rem[setter](value));
        else if (CLEAR[name]) await step(`clear ${name}`, () => CLEAR[name](rem));
        // setIsTodo(false) already clears todoStatus; other empty fields cannot be cleared.
        else if (name !== 'todoStatus') report.problems.push(`${state.remId} clear ${name}: no SDK call empties this field`);
      }
    }
    report.restored.push(state.remId);
  }

  // Pass 2: recreate. A Rem inside the captured subtree of another missing Rem
  // comes back with that ancestor and is not created a second time.
  const covered = new Set<string>();
  for (const state of missing) if (state.subtree) subtreeIds(state.subtree, covered);
  const newIdOf = new Map<string, string>();
  let pending = missing.filter((s) => !covered.has(s.remId));
  while (pending.length) {
    // Parents first: a state is ready when its parent exists or was just recreated.
    const ready: RemState[] = [];
    const waiting: RemState[] = [];
    for (const state of pending) {
      const pid = state.parentId ?? null;
      const parentMissing = pid !== null && pending.some((p) => p.remId === pid);
      (parentMissing ? waiting : ready).push(state);
    }
    if (!ready.length) { ready.push(...waiting.splice(0)); } // cycle guard; never expected
    for (const state of ready.sort(byPosition)) {
      if (!state.subtree || state.subtree.truncated) {
        report.problems.push(`${state.remId}: no longer exists and no complete subtree was captured`);
        continue;
      }
      let parentId = state.parentId ?? null;
      if (parentId && newIdOf.has(parentId)) parentId = newIdOf.get(parentId)!;
      else if (parentId && !(await plugin.rem.findOne(parentId))) {
        report.problems.push(`${state.remId}: original parent ${state.parentId} no longer exists; recreated at the top level`);
        parentId = null;
      }
      try {
        const newIds: string[] = [];
        const newId = await recreate(plugin, state.subtree, parentId, state.position ?? null, newIds);
        if (newId) { report.recreated.push({ oldId: state.remId, newId }); newIdOf.set(state.remId, newId); }
      } catch (e) { report.problems.push(`${state.remId} recreate: ${(e as Error).message}`); }
    }
    pending = waiting;
  }

  // Pass 3: places, lowest position first so siblings land in their old order.
  for (const { state } of places.sort((a, b) => byPosition(a.state, b.state))) {
    try {
      const rem: any = await plugin.rem.findOne(state.remId);
      if (!rem) continue;
      const now = await captureRem(plugin, state.remId);
      if (now.parentId === state.parentId && now.position === state.position) continue;
      if (state.parentId) {
        const target = newIdOf.get(state.parentId) ?? state.parentId;
        const parent = await plugin.rem.findOne(target);
        if (parent) await rem.setParent(parent, state.position ?? undefined);
        else report.problems.push(`${state.remId}: original parent ${state.parentId} no longer exists`);
      } else {
        await rem.setParent(null);
      }
    } catch (e) { report.problems.push(`${state.remId} parent: ${(e as Error).message}`); }
  }

  // Pass 4: remove what the change created.
  const createdSet = new Set(createdIds);
  const keep = new Set(before.filter((s) => s.exists).map((s) => s.remId));
  for (const id of [...createdIds].reverse()) {
    if (keep.has(id)) continue;
    try {
      const rem: any = await plugin.rem.findOne(id);
      if (!rem) continue;
      // Never delete a created Rem that now holds anything this change did not
      // create, and never delete when its contents cannot be checked.
      const descendants = await tryGet(() => rem.getDescendants());
      if (!Array.isArray(descendants)) { report.problems.push(`kept created ${id}: its contents could not be checked`); continue; }
      const holds = (descendants as any[]).find((d) => !createdSet.has(d._id));
      if (holds) { report.problems.push(`kept created ${id}: it now contains ${holds._id}, which this change did not create`); continue; }
      // Edited, moved or tagged after the change: it is the user's now, keep it.
      const was = afterById.get(id);
      if (was?.exists) {
        const now = await captureRem(plugin, id);
        const changed = ['text', 'backText', 'parentId'].filter((k) => !same((now as any)[k], (was as any)[k]));
        if (was.tagIds && !same([...(now.tagIds || [])].sort(), [...was.tagIds].sort())) changed.push('tags');
        if (changed.length) {
          report.conflicts.push(`kept created ${id}: its ${changed.join(', ')} changed after the journaled change`);
          continue;
        }
      }
      await rem.remove();
      report.removed.push(id);
    } catch (e) { report.problems.push(`remove created ${id}: ${(e as Error).message}`); }
  }
  return report;
}