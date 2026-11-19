// Öğren ekranı: birçok kartın alt ağacını TEK SEFERDE, kat kat okur. YALNIZ OKUR.
// Neden: readSubtreeRaw her düğüm için ayrı getChildrenRem çağrısı yapar; 36 kartta
// ~1.400 ayrı SDK gidiş-dönüşü eder ve eklenti penceresinde dakikalar sürebiliyordu.
// Burada her kat için yalnız rem.findMany (100'lük paketler) çağrılır: 36 kart, 4 kat
// için ~10 çağrı. Çıktı readSubtreeRaw düğüm biçimiyle aynıdır (kart kökü depth 0).
// Bütün başlıklar (Context Translator cevabı dahil) okunur: tanıtım ekranındaki "Detaylar" bölümü hepsini gösterir.

import type { RawNode } from './parse';

export interface ForestRem {
  _id: string;
  text?: unknown;
  backText?: unknown;
  children?: string[];
}
export interface ForestApi {
  findMany(ids: string[]): Promise<ForestRem[] | undefined>;
}

const CHUNK = 100;

async function findAll(api: ForestApi, ids: string[]): Promise<Map<string, ForestRem>> {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
  const res = await Promise.all(chunks.map((c) => api.findMany(c)));
  const out = new Map<string, ForestRem>();
  for (const list of res) for (const r of list || []) if (r && r._id) out.set(r._id, r);
  return out;
}

/** Her kök için alt ağaç düğümleri (önce-sıra: düğüm, sonra çocukları sırayla). */
export async function readForest(api: ForestApi, rootIds: string[], maxDepth = 3): Promise<Map<string, RawNode[]>> {
  type Entry = { id: string; root: string; parentId: string | null; depth: number; order: number };
  const nodes = new Map<string, RawNode>();
  const kids = new Map<string, string[]>();
  const seen = new Set<string>(rootIds);
  let level: Entry[] = rootIds.map((id) => ({ id, root: id, parentId: null, depth: 0, order: 0 }));
  while (level.length) {
    const rems = await findAll(api, level.map((e) => e.id));
    const next: Entry[] = [];
    for (const e of level) {
      const r = rems.get(e.id);
      if (!r) continue;
      const children = Array.isArray(r.children) ? r.children : [];
      nodes.set(e.id, {
        remId: e.id, parentId: e.parentId, depth: e.depth, order: e.order,
        rawText: r.text ?? null, backText: r.backText ?? null, childCount: children.length,
      });
      const ids: string[] = [];
      if (e.depth < maxDepth) {
        children.forEach((c, order) => {
          if (!c || seen.has(c)) return;
          seen.add(c);
          ids.push(c);
          next.push({ id: c, root: e.root, parentId: e.id, depth: e.depth + 1, order });
        });
      }
      kids.set(e.id, ids);
    }
    level = next;
  }
  const out = new Map<string, RawNode[]>();
  for (const root of rootIds) {
    const list: RawNode[] = [];
    const stack = [root];
    while (stack.length) {
      const id = stack.pop() as string;
      const n = nodes.get(id);
      if (!n) continue;
      list.push(n);
      const ids = kids.get(id) || [];
      for (let i = ids.length - 1; i >= 0; i--) stack.push(ids[i]);
    }
    if (list.length) out.set(root, list);
  }
  return out;
}
