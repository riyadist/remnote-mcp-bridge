// Converts between JSON sent over the wire and live SDK objects.
//   {"$rem": "<id>"}  <->  Rem object
//   {"$card": "<id>"} <->  Card object
// Everything else is plain JSON (RichText is already JSON in the SDK).
import type { ReactRNPlugin } from '@remnote/plugin-sdk';

export type RemRef = { $rem: string };
export type CardRef = { $card: string; remId?: string };

const MAX_DEPTH = 8;
const MAX_ARRAY = 2000;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isRemObject(value: unknown): value is { _id: string } {
  return isPlainObject(value) && typeof value._id === 'string' && typeof (value as any).getChildrenRem === 'function';
}

export function isCardObject(value: unknown): value is { _id: string; remId?: string } {
  return isPlainObject(value) && typeof value._id === 'string' && typeof (value as any).getRem === 'function'
    && typeof (value as any).getChildrenRem !== 'function';
}

export class MarshalError extends Error {
  code = 'BAD_ARGUMENT';
}

// What a {"$rem"}/{"$card"} reference must become for one SDK parameter:
//   object - the parameter type admits a live object (RemObject, PluginRem, Rem, Card)
//   id     - it takes only an id (RemId, RemId[], string, ...): pass the plain id string
// A live object given to an id-only parameter cannot be copied over the plugin's
// postMessage link; the SDK swallows that error and the call never answers
// (seen 2026-11-17 with rem.removeTag). So the kind is derived from the SDK
// signature text stored in the registry (generated from the installed
// @remnote/plugin-sdk .d.ts by scripts/gen-core-registry.cjs), not from a list
// of method names.
export type ParamKind = 'object' | 'id';
const OBJECT_TYPE = /\b(RemObject|PluginRem|Rem|Card)\b/;

// Splits "(a: X, b?: Y<Z, W>) => R" into parameter kinds. null when the
// signature is missing or cut off; callers then keep the old behaviour.
export function paramKinds(signature: string | undefined): ParamKind[] | null {
  if (typeof signature !== 'string') return null;
  let i = 0;
  const s = signature.trim();
  const closing: Record<string, string> = { '(': ')', '[': ']', '{': '}', '<': '>' };
  // Skips a balanced bracket group starting at s[i]; returns the index after it, or -1.
  const skipGroup = (start: number): number => {
    const stack: string[] = [];
    for (let k = start; k < s.length; k += 1) {
      const c = s[k];
      if (c === '>' && s[k - 1] === '=') continue; // arrow "=>"
      if (closing[c]) stack.push(closing[c]);
      else if (c === stack[stack.length - 1]) { stack.pop(); if (!stack.length) return k + 1; }
    }
    return -1;
  };
  if (s[i] === '<') { i = skipGroup(i); if (i < 0) return null; }
  while (s[i] === ' ') i += 1;
  if (s[i] !== '(') return null;
  const end = skipGroup(i);
  if (end < 0) return null;
  const inner = s.slice(i + 1, end - 1);
  if (!inner.trim()) return [];
  const parts: string[] = [];
  let depth = 0; let from = 0;
  for (let k = 0; k < inner.length; k += 1) {
    const c = inner[k];
    if (c === '>' && inner[k - 1] === '=') continue;
    if (c === '(' || c === '[' || c === '{' || c === '<') depth += 1;
    else if (c === ')' || c === ']' || c === '}' || c === '>') depth -= 1;
    else if (c === ',' && depth === 0) { parts.push(inner.slice(from, k)); from = k + 1; }
  }
  parts.push(inner.slice(from));
  const kinds: ParamKind[] = [];
  for (const part of parts) {
    const m = /^\s*(\.\.\.)?[A-Za-z_$][\w$]*\??\s*:\s*([\s\S]+)$/.exec(part);
    if (!m || m[1]) return null; // unnamed or rest parameter: unknown shape
    kinds.push(OBJECT_TYPE.test(m[2]) ? 'object' : 'id');
  }
  return kinds;
}

export async function toSdkValue(plugin: ReactRNPlugin, value: unknown, depth = 0, kind: ParamKind = 'object'): Promise<unknown> {
  if (depth > MAX_DEPTH) throw new MarshalError('Argument nesting is too deep');
  if (Array.isArray(value)) return Promise.all(value.map((v) => toSdkValue(plugin, v, depth + 1, kind)));
  if (!isPlainObject(value)) return value;
  const keys = Object.keys(value);
  if (keys.length === 1 && keys[0] === '$rem') {
    const id = value.$rem;
    if (typeof id !== 'string' || !id) throw new MarshalError('$rem must be a Rem id string');
    const rem = await plugin.rem.findOne(id);
    if (!rem) throw new MarshalError(`Rem ${id} not found`);
    return kind === 'id' ? id : rem;
  }
  if (keys.length === 1 && keys[0] === '$card') {
    const id = value.$card;
    if (typeof id !== 'string' || !id) throw new MarshalError('$card must be a Card id string');
    const card = await plugin.card.findOne(id);
    if (!card) throw new MarshalError(`Card ${id} not found`);
    return kind === 'id' ? id : card;
  }
  const out: Record<string, unknown> = {};
  for (const key of keys) out[key] = await toSdkValue(plugin, value[key], depth + 1, kind);
  return out;
}

// Positional arguments for one method. Without a usable signature every
// reference becomes a live object (the behaviour before 2026-11-17).
export async function toSdkArgs(plugin: ReactRNPlugin, args: unknown[], kinds: ParamKind[] | null): Promise<unknown[]> {
  const out: unknown[] = [];
  for (let i = 0; i < args.length; i += 1) out.push(await toSdkValue(plugin, args[i], 1, kinds?.[i] ?? 'object'));
  return out;
}

// Results go back as JSON: SDK objects become references, functions are dropped.
export function fromSdkValue(value: unknown, depth = 0): unknown {
  if (value === undefined) return null;
  if (depth > MAX_DEPTH) return '[depth limit]';
  if (isRemObject(value)) return { $rem: value._id };
  if (isCardObject(value)) return { $card: value._id, ...(typeof value.remId === 'string' ? { remId: value.remId } : {}) };
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY).map((v) => fromSdkValue(v, depth + 1));
    return value.length > MAX_ARRAY ? { items, truncated: true, total: value.length } : items;
  }
  if (typeof value === 'function') return null;
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === 'function') continue;
      out[k] = fromSdkValue(v, depth + 1);
    }
    return out;
  }
  return value;
}

// Collects every {$rem} id mentioned in raw (wire) arguments.
export function collectRemIds(value: unknown, into: Set<string> = new Set(), depth = 0): Set<string> {
  if (depth > MAX_DEPTH) return into;
  if (Array.isArray(value)) value.forEach((v) => collectRemIds(v, into, depth + 1));
  else if (isPlainObject(value)) {
    if (typeof value.$rem === 'string' && Object.keys(value).length === 1) into.add(value.$rem);
    else Object.values(value).forEach((v) => collectRemIds(v, into, depth + 1));
  }
  return into;
}

// Collects Rem ids out of an SDK result (live objects or already-marshalled refs).
export function collectResultRemIds(value: unknown, into: Set<string> = new Set(), depth = 0): Set<string> {
  if (depth > MAX_DEPTH || value === null || value === undefined) return into;
  if (isRemObject(value)) into.add(value._id);
  else if (Array.isArray(value)) value.forEach((v) => collectResultRemIds(v, into, depth + 1));
  else if (isPlainObject(value) && typeof value.$rem === 'string') into.add(value.$rem);
  return into;
}
