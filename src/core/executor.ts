// Control core executor: runs any operation from the generated SDK registry,
// plus a few higher-level "core" helpers.
//
// Wire actions (from the gateway), mutating ones run one at a time:
//   core.describe                     -> registry with safety classes
//   core.preview {op}                 -> what the operation would touch
//   core.capture {op}                 -> state before the change (journaled first)
//   core.execute {op, approved}       -> run it; returns created ids and the state after
//   core.restore {before, created, after}
import type { ReactRNPlugin } from '@remnote/plugin-sdk';
import registryJson from './sdk-registry.generated.json';
import { toSdkArgs, paramKinds, ParamKind, fromSdkValue, collectRemIds, collectResultRemIds, MarshalError } from './marshal';
import { captureRem, captureSubtree, countDescendants, restoreStates, RemState, SUBTREE_LIMIT } from './snapshot';
import { readSubtreeRaw, SubtreeRawError } from './subtree-raw';

export type SafetyClass = 'read' | 'ui' | 'write' | 'destructive' | 'blocked';
interface MethodInfo {
  class: SafetyClass;
  undo?: 'full' | 'partial' | 'none';
  destructiveWhenArg?: { index: number; truthy: true };
  signature?: string;
  description?: string;
}
interface Registry { sdkVersion: string; targets: Record<string, { methods: Record<string, MethodInfo> }> }
export interface Operation { target: string; method: string; args?: unknown[] }
export type OpOrBatch = Operation | { batch: Operation[] };

export const CORE_VERSION = '1.5.0';
const AFTER_CAPTURE_LIMIT = 2000;
const CAPTURE_TOTAL_LIMIT = 5000;
const REM_ID_SHAPE = /^[A-Za-z0-9_-]{8,40}$/;
// Time limits, shortest inside: one SDK call (30 s) < one queued job (150 s) <
// gateway change timeout (MUTATION_TIMEOUT_MS 180 s, remnote-core
// src/gateway/service.js) < MCP client. The single-call limit also stays under
// the gateway's default request timeout (60 s) used for ui calls.
// A call past its limit is "stuck": the queue is released at once, the executor
// is marked stalled and every later change is refused with QUEUE_STALLED (naming
// the stuck method) until a plain read answers again. The stuck call may still
// finish inside RemNote, so its outcome is reported as unknown, never as failed.
// Changes that waited in the queue longer than the job limit are dropped unrun:
// the gateway has given up on them already.
export const SDK_CALL_TIMEOUT_MS = 30000;
export const SERIAL_TIMEOUT_MS = 150000;
// Deepest parent chain walked when checking an archive for cycles.
const ANCESTOR_LIMIT = 500;
const GET_REMS_LIMIT = 200;
// Same as the gateway's bulk-write limit, so one archive call cannot move more
// Rems than a batch could without approval.
const ARCHIVE_LIMIT = 20;

export class CoreError extends Error {
  constructor(public code: string, message: string, public details?: unknown) { super(message); }
}

const own = (obj: unknown, key: string): boolean => obj != null && Object.prototype.hasOwnProperty.call(obj, key);

// Higher-level helpers that combine several SDK calls.
const CORE_METHODS: Record<string, MethodInfo> = {
  getRem: { class: 'read', signature: '(remId: string) => RemSummary', description: 'One Rem with text as Markdown, back text, parent, tags, type flags and child ids.' },
  readTree: { class: 'read', signature: '(remId: string, depth?: number = 3, maxNodes?: number = 300) => Tree', description: 'A Rem and its descendants as Markdown text, depth-limited.' },
  readTreeRaw: { class: 'read', signature: '(remId: string, maxDepth?: number = 10, maxNodes?: number = 2000) => {nodes: {remId, parentId, depth, order, rawText, backText, childCount}[], count, truncated, truncatedBy}', description: 'A Rem and its descendants in document order with RAW rich text (formatting kept: b, l, tc...) and raw back text, gathered in one call. Read-only.' },
  search: { class: 'read', signature: '(query: string, limit?: number = 20) => RemSummary[]', description: 'Full-text search over the knowledge base.' },
  getRems: { class: 'read', signature: '(remIds: string[]) => (RemSummary | {remId, missing: true})[]', description: `Several Rems in one call (up to ${GET_REMS_LIMIT}), in the given order.` },
  writeMarkdown: { class: 'write', undo: 'full', signature: '(parentId: string, markdown: string, position?: number) => RemRef[]', description: 'Creates a tree of Rems under parentId from indented Markdown; with position the new top-level Rems are placed there (0 = first) in the same change.' },
  archiveRems: { class: 'write', undo: 'full', signature: '(remIds: string[], title: string, parentId?: string) => {archiveId, manifest}', description: `Reversible removal of up to ${ARCHIVE_LIMIT} Rems: creates an archive Rem titled title (top level, or under parentId), moves the Rems under one child per former parent and returns where each came from. Undo moves them back.` },
  getChildren: { class: 'read', signature: '(remId: string) => RemSummary[]', description: 'Direct children of a Rem in order.' },
  status: { class: 'read', signature: '() => {coreVersion, running: {method, seconds} | null, stalled: {method, seconds} | null, queued, lastRecovered}', description: 'State of the change queue, answered without waiting in it: the change running now, a stuck call that blocks changes (cleared by any successful plain read), and how many changes wait.' },
  addImage: { class: 'write', undo: 'full', signature: '(remId: string, side: "text" | "backText", url: string, options?: {width?, height?, replaceUrl?}) => {remId, side, url, replaced}', description: 'Adds an image (https or RemNote %LOCAL_FILE% url) at the end of the front or back text, keeping the rest; with replaceUrl only the image with that url gets the new url.' },
};
const IMAGE_URL_SHAPE = /^(https?:\/\/|%LOCAL_FILE%)\S+$/;

export function buildRegistry(): Registry {
  const base = registryJson as unknown as Registry;
  return { sdkVersion: base.sdkVersion, targets: { ...base.targets, 'ns:core': { methods: CORE_METHODS } } };
}

function registryKey(target: string): string {
  const colon = target.indexOf(':');
  return colon === -1 ? `ns:${target}` : `obj:${target.slice(0, colon)}`;
}

const isMutating = (cls: SafetyClass) => cls === 'write' || cls === 'destructive';
const opLabel = (op: Operation) => `${op.target.split(':')[0]}.${op.method}`;

export interface ExecutorOptions { callTimeoutMs?: number; serialTimeoutMs?: number }
interface Busy { method: string; since: number }

export class CoreExecutor {
  private registry = buildRegistry();
  private queue: Promise<unknown> = Promise.resolve();
  private queued = 0;
  private running: Busy | null = null;
  private stalled: Busy | null = null;
  private lastRecovered: { method: string; stuckSeconds: number; at: string } | null = null;
  private kinds = new Map<string, ParamKind[] | null>();
  private callTimeoutMs: number;
  private serialTimeoutMs: number;
  constructor(private plugin: ReactRNPlugin, options: ExecutorOptions = {}) {
    this.callTimeoutMs = options.callTimeoutMs ?? SDK_CALL_TIMEOUT_MS;
    this.serialTimeoutMs = options.serialTimeoutMs ?? SERIAL_TIMEOUT_MS;
  }

  describe() {
    return { coreVersion: CORE_VERSION, ...this.registry, queue: this.queueStatus() };
  }

  queueStatus() {
    const secs = (b: Busy | null) => (b ? { method: b.method, seconds: Math.round((Date.now() - b.since) / 1000) } : null);
    return { coreVersion: CORE_VERSION, running: secs(this.running), stalled: secs(this.stalled), queued: this.queued, lastRecovered: this.lastRecovered };
  }

  private stalledError(): CoreError {
    const s = this.stalled as Busy;
    const seconds = Math.round((Date.now() - s.since) / 1000);
    return new CoreError('QUEUE_STALLED',
      `RemNote has not answered ${s.method} for ${seconds} s; nothing was run. Changes stay refused until a plain read answers (for example rem.findOne with a plain id); if reads fail too, reload the plugin.`,
      { method: s.method, seconds });
  }

  // Races work against a time limit. On timeout the caller gets SDK_TIMEOUT at
  // once and, for anything but a plain read, the executor is marked stalled.
  private limit<T>(label: string, work: Promise<T>, ms: number, marksStall: boolean): Promise<T> {
    const since = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    work.catch(() => undefined); // a late failure of an abandoned call is not unhandled
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        if (marksStall && !this.stalled) this.stalled = { method: label, since };
        reject(new CoreError('SDK_TIMEOUT',
          `RemNote did not answer ${label} within ${Math.round(ms / 1000)} s; it may still happen inside RemNote, so read the target before trying again.${marksStall ? ' Further changes are refused until a plain read answers.' : ''}`,
          { method: label, seconds: Math.round(ms / 1000) }));
      }, ms);
    });
    return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
  }

  // Mutating work runs strictly one at a time so captured states never interleave.
  private serial<T>(label: string, fn: () => Promise<T>): Promise<T> {
    if (this.stalled) return Promise.reject(this.stalledError());
    const queuedAt = Date.now();
    this.queued += 1;
    const guarded = async () => {
      this.queued -= 1;
      if (this.stalled) throw this.stalledError();
      if (Date.now() - queuedAt > this.serialTimeoutMs) {
        throw new CoreError('QUEUE_STALLED', 'This change waited too long behind a stuck one and was not run');
      }
      this.running = { method: label, since: Date.now() };
      try { return await this.limit(label, fn(), this.serialTimeoutMs, true); } finally { this.running = null; }
    };
    const run = this.queue.then(guarded, guarded);
    this.queue = run.then(() => undefined, () => undefined);
    return run;
  }

  private kindsOf(op: Operation): ParamKind[] | null {
    const key = `${registryKey(op.target)}.${op.method}`;
    if (!this.kinds.has(key)) this.kinds.set(key, paramKinds(this.info(op).signature));
    return this.kinds.get(key) as ParamKind[] | null;
  }

  info(op: Operation): MethodInfo {
    const target = this.registry.targets[registryKey(op.target)];
    if (!own(this.registry.targets, registryKey(op.target)) || !own(target.methods, op.method)) {
      throw new CoreError('UNKNOWN_METHOD', `${op.target}.${op.method} is not in the registry`);
    }
    return target.methods[op.method];
  }

  classOf(op: Operation): SafetyClass {
    const info = this.info(op);
    const rule = info.destructiveWhenArg;
    if (rule && Array.isArray(op.args) && Boolean(op.args[rule.index])) return 'destructive';
    return info.class;
  }

  private ops(input: OpOrBatch): Operation[] {
    if (input && Array.isArray((input as any).batch)) return (input as any).batch;
    return [input as Operation];
  }

  // Every operation is checked before anything runs: one blocked or unknown step
  // refuses the whole request.
  private validate(ops: Operation[]): SafetyClass[] {
    return ops.map((op) => {
      if (!op || typeof op.target !== 'string' || typeof op.method !== 'string') throw new CoreError('BAD_OPERATION', 'target and method are required');
      const cls = this.classOf(op);
      if (cls === 'blocked') throw new CoreError('BLOCKED', `${op.target}.${op.method} is not available to remote control`);
      return cls;
    });
  }

  private async resolveTarget(target: string): Promise<any> {
    const colon = target.indexOf(':');
    if (colon === -1) {
      if (target === 'core') return null;
      if (!own(this.plugin, target)) throw new CoreError('UNKNOWN_TARGET', `Unknown namespace ${target}`);
      return (this.plugin as any)[target];
    }
    const kind = target.slice(0, colon);
    const id = target.slice(colon + 1);
    if (!id) throw new CoreError('BAD_TARGET', `Missing id in ${target}`);
    if (kind === 'rem') {
      const rem = await this.plugin.rem.findOne(id);
      if (!rem) throw new CoreError('NOT_FOUND', `Rem ${id} not found`);
      return rem;
    }
    if (kind === 'card') {
      const card = await this.plugin.card.findOne(id);
      if (!card) throw new CoreError('NOT_FOUND', `Card ${id} not found`);
      return card;
    }
    throw new CoreError('UNKNOWN_TARGET', `Unknown object kind ${kind}`);
  }

  // Rems whose state must be captured before this operation runs: the target,
  // every {$rem} argument and every plain string argument that is an existing
  // Rem id (many SDK methods take ids as strings, e.g. merge, moveRems, addTag).
  private async affectedRemIds(op: Operation): Promise<string[]> {
    const ids = new Set<string>();
    if (op.target.startsWith('rem:')) ids.add(op.target.slice(4));
    collectRemIds(op.args || [], ids);
    const strings: string[] = [];
    const walk = (v: unknown, depth: number) => {
      if (depth > 3) return;
      if (typeof v === 'string' && REM_ID_SHAPE.test(v)) strings.push(v);
      else if (Array.isArray(v)) v.forEach((x) => walk(x, depth + 1));
    };
    walk(op.args || [], 0);
    for (const s of strings) {
      if (ids.has(s)) continue;
      if (await this.plugin.rem.findOne(s).catch(() => undefined)) ids.add(s);
    }
    return [...ids];
  }

  private async markdownOf(text: unknown): Promise<string> {
    if (!Array.isArray(text)) return '';
    try { return await this.plugin.richText.toMarkdown(text as any); } catch { return ''; }
  }

  private async summary(rem: any) {
    const parent: any = await rem.getParentRem().catch(() => undefined);
    const tags: any[] = (await rem.getTagRems().catch(() => [])) || [];
    const children: any[] = (await rem.getChildrenRem().catch(() => [])) || [];
    return {
      remId: rem._id,
      text: await this.markdownOf(rem.text),
      backText: rem.backText ? await this.markdownOf(rem.backText) : null,
      parentId: parent?._id ?? null,
      tagIds: tags.map((t) => t._id),
      isDocument: await rem.isDocument().catch(() => undefined),
      type: await rem.getType().catch(() => undefined),
      childIds: children.map((c) => c._id),
    };
  }

  private async runCore(method: string, args: unknown[]): Promise<unknown> {
    const p = this.plugin;
    switch (method) {
      case 'getRem': {
        const rem = await p.rem.findOne(String(args[0] ?? ''));
        if (!rem) throw new CoreError('NOT_FOUND', `Rem ${args[0]} not found`);
        return this.summary(rem);
      }
      case 'status':
        return this.queueStatus();
      case 'getChildren': {
        const rem: any = await p.rem.findOne(String(args[0] ?? ''));
        if (!rem) throw new CoreError('NOT_FOUND', `Rem ${args[0]} not found`);
        const children: any[] = (await rem.getChildrenRem()) || [];
        return Promise.all(children.map((c) => this.summary(c)));
      }
      case 'readTree': {
        const depth = Math.min(Math.max(Number(args[1] ?? 3), 0), 12);
        const budget = { nodes: Math.min(Math.max(Number(args[2] ?? 300), 1), 3000) };
        const walk = async (rem: any, level: number): Promise<any> => {
          budget.nodes -= 1;
          const node: any = { remId: rem._id, text: await this.markdownOf(rem.text) };
          if (rem.backText) node.backText = await this.markdownOf(rem.backText);
          const children: any[] = (await rem.getChildrenRem().catch(() => [])) || [];
          if (level >= depth) { if (children.length) node.moreChildren = children.length; return node; }
          node.children = [];
          for (const child of children) {
            if (budget.nodes <= 0) { node.truncated = true; break; }
            node.children.push(await walk(child, level + 1));
          }
          return node;
        };
        const root = await p.rem.findOne(String(args[0] ?? ''));
        if (!root) throw new CoreError('NOT_FOUND', `Rem ${args[0]} not found`);
        return walk(root, 0);
      }
      case 'readTreeRaw': {
        try {
          return await readSubtreeRaw(p as any, String(args[0] ?? ''), { maxDepth: args[1], maxNodes: args[2] });
        } catch (e) {
          if (e instanceof SubtreeRawError) throw new CoreError(e.code, e.message);
          throw e;
        }
      }
      case 'search': {
        const query = String(args[0] ?? '').trim();
        if (!query) throw new CoreError('BAD_ARGUMENT', 'Empty search query');
        const limit = Math.min(Math.max(Number(args[1] ?? 20), 1), 100);
        const text = await p.richText.parseFromMarkdown(query);
        const results: any[] = (await (p.search as any).search(text, undefined, { numResults: limit })) || [];
        return Promise.all(results.slice(0, limit).map((r) => this.summary(r)));
      }
      case 'getRems': {
        const ids = args[0];
        if (!Array.isArray(ids) || ids.length === 0 || ids.length > GET_REMS_LIMIT) throw new CoreError('BAD_ARGUMENT', `remIds must be an array of 1-${GET_REMS_LIMIT} ids`);
        const out = [];
        for (const id of ids) {
          const rem = await p.rem.findOne(String(id));
          out.push(rem ? await this.summary(rem) : { remId: String(id), missing: true });
        }
        return out;
      }
      case 'writeMarkdown': {
        const parent: any = await p.rem.findOne(String(args[0] ?? ''));
        if (!parent) throw new CoreError('NOT_FOUND', `Parent Rem ${args[0]} not found`);
        let markdown = String(args[1] ?? '');
        if (!markdown.trim()) throw new CoreError('BAD_ARGUMENT', 'Empty markdown');
        // RemNote reads a lone "- item" line as plain text and keeps the dash, so drop it here.
        const lines = markdown.split('\n').filter((l) => l.trim());
        if (lines.length === 1) markdown = lines[0].replace(/^\s*[-*+]\s+/, '');
        const position = args[2];
        if (position != null && !(Number.isInteger(position) && (position as number) >= 0)) throw new CoreError('BAD_ARGUMENT', 'position must be a whole number >= 0');
        const created: any[] = (await p.rem.createTreeWithMarkdown(markdown, parent._id)) || [];
        if (typeof position === 'number') {
          // Only the new top-level Rems move; their children come along.
          const createdIds = new Set(created.map((r) => r?._id));
          const children: any[] = (await parent.getChildrenRem()) || [];
          const top = children.filter((c) => createdIds.has(c._id)).map((c) => c._id);
          if (top.length) await p.rem.moveRems(top, parent._id, position);
        }
        return created;
      }
      case 'archiveRems': {
        const ids = args[0];
        if (!Array.isArray(ids) || ids.length === 0 || ids.length > ARCHIVE_LIMIT) throw new CoreError('BAD_ARGUMENT', `remIds must be an array of 1-${ARCHIVE_LIMIT} ids`);
        const title = String(args[1] ?? '').trim();
        if (!title) throw new CoreError('BAD_ARGUMENT', 'Empty archive title');
        const rems: any[] = [];
        for (const id of ids) {
          const rem = await p.rem.findOne(String(id));
          if (!rem) throw new CoreError('NOT_FOUND', `Rem ${id} not found; nothing was archived`);
          rems.push(rem);
        }
        const parentId = args[2] == null ? undefined : String(args[2]);
        const parentRem: any = parentId ? await p.rem.findOne(parentId) : undefined;
        if (parentId && !parentRem) throw new CoreError('NOT_FOUND', `Parent Rem ${parentId} not found`);
        // Moving a Rem under itself (or one archived Rem under another) would make a loop.
        const idSet = new Set(rems.map((r) => r._id as string));
        if (idSet.size !== rems.length) throw new CoreError('BAD_ARGUMENT', 'remIds contains the same Rem twice; nothing was archived');
        const ancestors = async (start: any): Promise<string[]> => {
          const out: string[] = [];
          let cur: any = start;
          while (cur && out.length < ANCESTOR_LIMIT) {
            out.push(cur._id);
            cur = await cur.getParentRem().catch(() => undefined);
          }
          return out;
        };
        if (parentRem && (await ancestors(parentRem)).some((id) => idSet.has(id))) {
          throw new CoreError('BAD_ARGUMENT', 'parentId is one of the archived Rems or inside one; nothing was archived');
        }
        for (const rem of rems) {
          const parent: any = await rem.getParentRem().catch(() => undefined);
          if (parent && (await ancestors(parent)).some((id) => idSet.has(id))) {
            throw new CoreError('BAD_ARGUMENT', `Rem ${rem._id} is inside another archived Rem; archive only the outer one`);
          }
        }
        const createdRemIds: string[] = [];
        const manifest: any[] = [];
        try {
          const root: any = await p.rem.createSingleRemWithMarkdown(title, parentId);
          if (!root) throw new CoreError('SDK_ERROR', 'Archive Rem could not be created');
          createdRemIds.push(root._id);
          const groups = new Map<string, string>(); // former parent id -> group Rem id
          for (const rem of rems) {
            const from: any = await rem.getParentRem().catch(() => undefined);
            const fromText = from ? (await this.markdownOf(from.text)).slice(0, 200) : '';
            const key = from?._id ?? '';
            let groupId = groups.get(key);
            if (!groupId) {
              const group: any = await p.rem.createSingleRemWithMarkdown(fromText || '(no parent)', root._id);
              if (!group) throw new CoreError('SDK_ERROR', 'Archive group Rem could not be created');
              groupId = group._id as string;
              groups.set(key, groupId);
              createdRemIds.push(groupId);
            }
            const fromPosition = await rem.positionAmongstSiblings().catch(() => undefined);
            await p.rem.moveRems([rem._id], groupId, 0);
            manifest.push({ remId: rem._id, fromParentId: from?._id ?? null, fromParentText: fromText, fromPosition: fromPosition ?? null, groupId });
          }
          return { archiveId: root._id, manifest, createdRemIds };
        } catch (e) {
          // What was already created/moved stays recorded, so undo can reverse it.
          const err = e as any;
          throw new CoreError(err?.code || 'SDK_ERROR', err?.message || String(e), { createdRemIds, manifest });
        }
      }
      case 'addImage': {
        const rem: any = await p.rem.findOne(String(args[0] ?? ''));
        if (!rem) throw new CoreError('NOT_FOUND', `Rem ${args[0]} not found`);
        const side = args[1];
        if (side !== 'text' && side !== 'backText') throw new CoreError('BAD_ARGUMENT', 'side must be "text" or "backText"');
        const url = String(args[2] ?? '');
        if (!IMAGE_URL_SHAPE.test(url)) throw new CoreError('BAD_ARGUMENT', 'url must be an http(s) or %LOCAL_FILE% image url');
        const options: any = args[3] ?? {};
        const size: any = {};
        for (const key of ['width', 'height']) {
          if (options[key] == null) continue;
          if (!(Number.isInteger(options[key]) && options[key] > 0 && options[key] <= 5000)) throw new CoreError('BAD_ARGUMENT', `${key} must be a whole number 1-5000`);
          size[key] = options[key];
        }
        const current: any[] = Array.isArray(rem[side]) ? [...rem[side]] : [];
        const replaceUrl = options.replaceUrl == null ? null : String(options.replaceUrl);
        if (replaceUrl) {
          const at = current.findIndex((e) => e && typeof e === 'object' && e.i === 'i' && e.url === replaceUrl);
          if (at === -1) throw new CoreError('NOT_FOUND', `No image with url ${replaceUrl} in the ${side} of Rem ${rem._id}; nothing was changed`);
          current[at] = { ...current[at], url, ...size };
        } else {
          current.push({ i: 'i', url, ...size });
        }
        if (side === 'text') await rem.setText(current);
        else await rem.setBackText(current);
        return { remId: rem._id, side, url, replaced: Boolean(replaceUrl) };
      }
      default:
        throw new CoreError('UNKNOWN_METHOD', `core.${method}`);
    }
  }

  private async invokeOne(op: Operation): Promise<unknown> {
    const args = await toSdkArgs(this.plugin, op.args || [], this.kindsOf(op));
    if (op.target === 'core') return this.runCore(op.method, args);
    const target = await this.resolveTarget(op.target);
    const fn = target?.[op.method];
    if (typeof fn !== 'function') throw new CoreError('UNKNOWN_METHOD', `${op.target}.${op.method} is not callable in this RemNote build`);
    return fn.apply(target, args);
  }

  async preview(input: OpOrBatch) {
    const ops = this.ops(input);
    const classes = this.validate(ops);
    const items = [];
    for (let i = 0; i < ops.length; i += 1) {
      const op = ops[i];
      const cls = classes[i];
      const info = this.info(op);
      const affected = [];
      for (const id of isMutating(cls) ? await this.affectedRemIds(op) : []) {
        const rem: any = await this.plugin.rem.findOne(id);
        affected.push(rem
          ? { remId: id, text: (await this.markdownOf(rem.text)).slice(0, 300), ...(cls === 'destructive' ? { descendants: await countDescendants(this.plugin, id) } : {}) }
          : { remId: id, missing: true });
      }
      const warnings: string[] = [];
      if (info.undo === 'none') warnings.push('This change cannot be undone by remnote_undo.');
      if (info.undo === 'partial') warnings.push(op.method === 'remove'
        ? 'Undo brings the Rem back as a new Rem (new id) with text, tags and structure; flashcard history, properties and links to the old id are lost.'
        : 'Undo restores this change only partially.');
      if (op.target.startsWith('card:')) warnings.push('Card data (review history) is not captured.');
      items.push({ target: op.target, method: op.method, class: cls, undo: info.undo ?? null, affected, warnings });
    }
    return { items };
  }

  capture(input: OpOrBatch) {
    const ops = this.ops(input);
    return this.serial(`capture ${ops.map((o) => (o && typeof o.target === 'string' ? opLabel(o) : '?')).join(', ').slice(0, 200)}`, async () => {
      const classes = this.validate(ops);
      const before: RemState[] = [];
      const seen = new Set<string>();
      // One node budget for the whole operation keeps the captured state (and
      // the reply over the link) bounded, however many Rems a batch deletes.
      let remaining = CAPTURE_TOTAL_LIMIT;
      for (let i = 0; i < ops.length; i += 1) {
        if (!isMutating(classes[i])) continue;
        const op = ops[i];
        for (const id of await this.affectedRemIds(op)) {
          if (seen.has(id)) continue;
          seen.add(id);
          const state = await captureRem(this.plugin, id);
          if (classes[i] === 'destructive' && state.exists) {
            const budget = { nodes: Math.min(SUBTREE_LIMIT, remaining) };
            const start = budget.nodes;
            state.subtree = await captureSubtree(this.plugin, id, budget);
            remaining -= start - budget.nodes;
            if (state.subtree?.truncated && op.method === 'remove') {
              throw new CoreError('SUBTREE_TOO_LARGE', `The Rems to delete have more than ${Math.min(SUBTREE_LIMIT, CAPTURE_TOTAL_LIMIT)} descendants (per Rem ${SUBTREE_LIMIT}, per operation ${CAPTURE_TOTAL_LIMIT}); delete them in smaller parts so they stay restorable`);
            }
          }
          before.push(state);
        }
      }
      return { before };
    });
  }

  // Only reads skip the queue, so a slow or stuck change never blocks reading;
  // changes and ui calls run one at a time.
  // async, so a refused operation comes back as a rejected promise, never a throw.
  async execute(input: OpOrBatch, approved: boolean) {
    const ops = this.ops(input);
    const classes = this.validate(ops);
    const run = () => this.run(input, ops, classes, approved);
    if (classes.some((c) => c !== 'read')) return this.serial(ops.map(opLabel).join(', ').slice(0, 200), run);
    const out = await run();
    // A plain read that RemNote answered shows the link works again.
    if (this.stalled && ops.some((op) => !(op.target === 'core' && op.method === 'status'))) {
      this.lastRecovered = { method: this.stalled.method, stuckSeconds: Math.round((Date.now() - this.stalled.since) / 1000), at: new Date().toISOString() };
      this.stalled = null;
    }
    return out;
  }

  private async run(input: OpOrBatch, ops: Operation[], classes: SafetyClass[], approved: boolean) {
    if (classes.includes('destructive') && !approved) throw new CoreError('APPROVAL_REQUIRED', 'Destructive operation without gateway approval');
    const created: string[] = [];
    const touched = new Set<string>();
    const results: unknown[] = [];
    const errors: { index: number; code: string; message: string }[] = [];
    const mutating = classes.some(isMutating);

    for (let index = 0; index < ops.length; index += 1) {
      const op = ops[index];
      try {
        if (isMutating(classes[index])) for (const id of await this.affectedRemIds(op)) touched.add(id);
        // Multi-call core reads (readTree, search...) are bounded by the gateway
        // instead; every other operation gets the single-call limit.
        const raw = op.target === 'core' && classes[index] === 'read'
          ? await this.invokeOne(op)
          : await this.limit(opLabel(op), this.invokeOne(op), this.callTimeoutMs, classes[index] !== 'read');
        if (isMutating(classes[index]) && (/^create/.test(op.method) || op.method === 'writeMarkdown')) {
          for (const id of collectResultRemIds(raw)) created.push(id);
        }
        // Core helpers that create Rems besides their main result say so.
        if (isMutating(classes[index]) && op.target === 'core' && Array.isArray((raw as any)?.createdRemIds)) {
          for (const id of (raw as any).createdRemIds) created.push(id);
        }
        results.push(fromSdkValue(raw));
      } catch (e) {
        const err = e as any;
        const code = err.code || (e instanceof MarshalError ? 'BAD_ARGUMENT' : 'SDK_ERROR');
        if (isMutating(classes[index]) && Array.isArray(err?.details?.createdRemIds)) {
          for (const id of err.details.createdRemIds) created.push(id);
        }
        const message = err.message || String(e);
        if (ops.length === 1) {
          const after = mutating ? await this.captureAfter([...touched], created) : { after: [], complete: true };
          throw new CoreError(code, message, mutating ? { created, after: after.after, afterComplete: after.complete } : undefined);
        }
        errors.push({ index, code, message });
        break; // no automatic continuation after a failed step
      }
    }
    const after = mutating ? await this.captureAfter([...touched], created) : { after: [], complete: true };
    const result = 'batch' in (input as any) ? results : results[0];
    return {
      result,
      ...(mutating ? { created, touched: [...touched], after: after.after, afterComplete: after.complete } : {}),
      ...(errors.length ? { partial: results.length > 0 || created.length > 0, errors } : {}),
    };
  }

  // State right after the change, so a later undo can tell what was edited since.
  // A failure here never turns an applied change into a failed one; it only
  // marks the record incomplete (undo then asks for explicit confirmation).
  private async captureAfter(touched: string[], created: string[]): Promise<{ after: RemState[]; complete: boolean }> {
    const all = [...new Set([...touched, ...created])];
    const ids = all.slice(0, AFTER_CAPTURE_LIMIT);
    const out: RemState[] = [];
    let complete = ids.length === all.length;
    for (const id of ids) {
      try { out.push(await captureRem(this.plugin, id)); } catch { complete = false; }
    }
    return { after: out, complete };
  }

  restore(before: RemState[], created: string[], after: RemState[] = []) {
    if (!Array.isArray(before) || !Array.isArray(created) || !Array.isArray(after)) throw new CoreError('BAD_ARGUMENT', 'before/created/after must be arrays');
    return this.serial('restore', () => restoreStates(this.plugin, before, created, after));
  }

  async handle(action: string, payload: Record<string, unknown>): Promise<unknown> {
    switch (action) {
      case 'core.describe': return this.describe();
      case 'core.preview': return this.preview(payload.op as OpOrBatch);
      case 'core.capture': return this.capture(payload.op as OpOrBatch);
      case 'core.execute': return this.execute(payload.op as OpOrBatch, payload.approved === true);
      case 'core.restore': return this.restore(payload.before as RemState[], payload.created as string[], (payload.after as RemState[]) || []);
      default: throw new CoreError('UNKNOWN_ACTION', action);
    }
  }
}
