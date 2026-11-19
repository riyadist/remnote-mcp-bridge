// Eisenhower panosu: SDK'dan bağımsız saf mantık (test edilebilir).
// RemNote'a yazan bütün adımlar burada; widget yalnız çizer ve bunları çağırır.

// Pano belgesi artık sabit değil: kullanıcı "Eisenhower: bu belgeyi pano yap" komutuyla seçer,
// kimlik eşitlenen depoda (synced storage) bu anahtarla durur. Pazar yeri paketine kişisel kimlik gömülmez.
export const EISENHOWER_DOC_STORAGE_KEY = 'eisenhower_doc_id';

export interface Quadrant {
  key: string;
  tagId: string;
  roman: string;
  title: string;
  tagName: string;
  hint: string;
  color: string;
  emptyText: string;
}

// Etiket kimlikleri koda gömülmez (pazar yeri paketinde kişisel kimlik yok). Kutular çalışma anında
// resolveQuadrants ile çözülür: önce eşitlenen depodaki kimlikler, yoksa RemNote'ta adla arama.
export const EISENHOWER_TAGS_STORAGE_KEY = 'eisenhower_tag_ids';
export type TagIdMap = Partial<Record<string, string>>;

export const QUADRANTS: Quadrant[] = [
  { key: 'critical', tagId: '', roman: 'I', title: 'Acil ve Önemli', tagName: 'Critical', hint: 'bugün yap', color: '#ef5b5b', emptyText: 'Görev yok 🎉' },
  { key: 'high', tagId: '', roman: 'II', title: 'Önemli, Acil Değil', tagName: 'High', hint: 'planla', color: '#f2a33a', emptyText: 'Görev yok' },
  { key: 'medium', tagId: '', roman: 'III', title: 'Acil, Önemsiz', tagName: 'Medium', hint: 'kısa tut', color: '#5b8def', emptyText: 'Görev yok' },
  { key: 'low', tagId: '', roman: 'IV', title: 'Ne Acil Ne Önemli', tagName: 'Low', hint: 'boş vakitte', color: '#3fc48a', emptyText: 'Görev yok' },
];

// RemNote SDK'nın kullandığımız küçük alt kümesi (gerçek ya da sahte nesne).
export interface RemLike {
  _id: string;
  text?: unknown[];
  /** SDK'nın hazır alt Rem kimlik listesi (ek çağrı gerektirmez). */
  children?: string[];
  addTag(tag: string): Promise<void>;
  removeTag(tagId: string, removeProperties?: boolean): Promise<void>;
  isTodo(): Promise<boolean>;
  setIsTodo(v: boolean): Promise<void>;
  getTodoStatus(): Promise<'Finished' | 'Unfinished' | undefined>;
  setTodoStatus(s: 'Finished' | 'Unfinished'): Promise<void>;
  setText(t: any): Promise<void>;
  setParent(p: string): Promise<void>;
  getParentRem(): Promise<RemLike | undefined>;
  isDocument(): Promise<boolean>;
  taggedRem(): Promise<RemLike[]>;
}

export interface BoardApi {
  findOne(id: string): Promise<RemLike | undefined>;
  createRem(): Promise<RemLike | undefined>;
  toString(rt: any): Promise<string>;
  /** Belgenin RemNote ikonu (Document powerup 'b' yuvası); yoksa ''. */
  docIcon?(rem: RemLike): Promise<string>;
  /** Adla Rem bulma (SDK rem.findByName, üst düzey). Yoksa adla arama yapılmaz. */
  findByName?(name: string): Promise<RemLike | undefined>;
}

export interface ResolvedQuadrants {
  quadrants: Quadrant[];
  /** Bulunamayan etiket adları (ör. ['Critical']). Boşsa pano çizilebilir. */
  missing: string[];
}

function nameVariants(name: string): string[] {
  const lower = name.toLowerCase();
  const cap = lower.charAt(0).toUpperCase() + lower.slice(1);
  return [...new Set([name, cap, lower, name.toUpperCase()])];
}

/**
 * Dört kutunun etiket Rem'ini bulur. Sıra: depodaki kimlik (Rem hâlâ varsa) → ad (büyük/küçük
 * harf varyantları). Hiçbir şey OLUŞTURMAZ ve hiçbir şey YAZMAZ; bulunamayanlar missing'te döner.
 */
export async function resolveQuadrants(api: BoardApi, stored: TagIdMap | null | undefined): Promise<ResolvedQuadrants> {
  const quadrants: Quadrant[] = [];
  const missing: string[] = [];
  for (const q of QUADRANTS) {
    let tagId = '';
    const fromStore = stored && typeof stored[q.key] === 'string' ? String(stored[q.key]) : '';
    if (fromStore) {
      try { if (await api.findOne(fromStore)) tagId = fromStore; } catch { /* yok say */ }
    }
    if (!tagId && api.findByName) {
      for (const variant of nameVariants(q.tagName)) {
        try {
          const rem = await api.findByName(variant);
          if (rem?._id) { tagId = rem._id; break; }
        } catch { /* yok say */ }
      }
    }
    if (tagId) quadrants.push({ ...q, tagId });
    else missing.push(q.tagName);
  }
  return { quadrants, missing };
}


export interface Task {
  id: string;
  text: string;
  hasImage: boolean;
  source: string;
  /** Gruplama anahtarı: görevin doğrudan üst Rem'i. */
  groupId: string;
  /** Kökten üst Rem'e kadar yol (breadcrumb). */
  path: string[];
  icon: string;
  /** Alt satır sayısı; alt ağacın kendisini RemHierarchyEditorTree çizer. */
  childCount: number;
}

export interface TaskGroup {
  id: string;
  path: string[];
  icon: string;
  tasks: Task[];
}

export interface BoardQuadrant extends Quadrant {
  tasks: Task[];
}

export function richTextHasImage(rt: unknown): boolean {
  return Array.isArray(rt) && rt.some((el) => !!el && typeof el === 'object' && (el as any).i === 'i');
}

export function plainFromRichText(rt: unknown): string {
  if (!Array.isArray(rt)) return '';
  return rt
    .map((el) => (typeof el === 'string' ? el : el && typeof el === 'object' && (el as any).i === 'm' ? String((el as any).text ?? '') : ''))
    .join('');
}


const EMOJI_RE = /^((?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:\uFE0F|\u200D|\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator})*)\s*/u;

/** Metnin başındaki emojiyi ayırır: ['📈', 'Trading']. */
export function leadingEmoji(text: string): [string, string] {
  const m = EMOJI_RE.exec(text || '');
  return m ? [m[1], text.slice(m[0].length)] : ['', text || ''];
}

export function groupTasks(tasks: Task[]): TaskGroup[] {
  const map = new Map<string, TaskGroup>();
  for (const t of tasks) {
    let g = map.get(t.groupId);
    if (!g) { g = { id: t.groupId, path: t.path, icon: t.icon, tasks: [] }; map.set(t.groupId, g); }
    g.tasks.push(t);
  }
  return [...map.values()];
}

interface PlaceInfo { groupId: string; path: string[]; icon: string; source: string }

async function placeOf(api: BoardApi, rem: RemLike, cache: Map<string, PlaceInfo>): Promise<PlaceInfo> {
  const parent = await rem.getParentRem();
  if (!parent) return { groupId: '', path: [], icon: '', source: '' };
  const hit = cache.get(parent._id);
  if (hit) return hit;
  // Kökten üst Rem'e kadar zincir.
  const chain: RemLike[] = [];
  for (let cur: RemLike | undefined = parent, i = 0; cur && i < 20; i++) {
    chain.unshift(cur);
    cur = await cur.getParentRem();
  }
  const path: string[] = [];
  const emojis: string[] = [];
  let icon = '';
  let source = '';
  for (const r of chain) {
    const [emo, rest] = leadingEmoji(await remText(api, r));
    path.push(rest.trim() || '(adsız)');
    emojis.push(emo);
  }
  // İkon: üst Rem'e en yakın belgenin RemNote ikonu; yoksa yoldaki ilk emoji.
  for (let i = chain.length - 1; i >= 0; i--) {
    if (await chain[i].isDocument()) {
      if (!source) source = path[i];
      let ic = '';
      try { ic = api.docIcon ? String((await api.docIcon(chain[i])) || '') : ''; } catch { ic = ''; }
      if (ic && !icon) icon = ic;
      if (icon) break;
    }
  }
  if (!icon) icon = emojis.find((e) => e) || '';
  const info = { groupId: parent._id, path: path.slice(-3), icon, source: source || path[path.length - 1] || '' };
  cache.set(parent._id, info);
  return info;
}

async function remText(api: BoardApi, rem: RemLike | undefined): Promise<string> {
  if (!rem) return '';
  const rt = Array.isArray(rem.text) ? rem.text : [];
  let s = '';
  try {
    s = await api.toString(rt);
  } catch {
    s = plainFromRichText(rt);
  }
  return String(s || '').replace(/\s+/g, ' ').trim();
}

async function must(api: BoardApi, remId: string): Promise<RemLike> {
  const rem = await api.findOne(remId);
  if (!rem) throw new Error('Görev bulunamadı');
  return rem;
}

/** Bir görevi başka kutuya taşır: önce yeni etiket, sonra eski etiket kaldırılır. */
export async function moveTask(api: BoardApi, remId: string, fromTagId: string, toTagId: string): Promise<'noop' | 'moved'> {
  if (fromTagId === toTagId) return 'noop';
  const rem = await must(api, remId);
  await rem.addTag(toTagId);
  try {
    await rem.removeTag(fromTagId, false);
  } catch (err) {
    // Görev iki kutuda kalmasın: eklenen etiketi geri al.
    try { await rem.removeTag(toTagId, false); } catch { /* geri alma da olmadı */ }
    throw err;
  }
  return 'moved';
}

/** Görevi todo olarak tamamlar. Silmez. */
export async function completeTask(api: BoardApi, remId: string): Promise<void> {
  const rem = await must(api, remId);
  const wasTodo = await rem.isTodo();
  if (!wasTodo) await rem.setIsTodo(true);
  try {
    await rem.setTodoStatus('Finished');
  } catch (err) {
    if (!wasTodo) { try { await rem.setIsTodo(false); } catch { /* yok say */ } }
    throw err;
  }
}

/** To-Do List sayfası altına yeni görev oluşturur ve kutunun etiketini ekler. */
export async function addTask(api: BoardApi, text: string, tagId: string, parentId: string): Promise<string> {
  const clean = String(text || '').trim();
  if (!clean) throw new Error('Görev metni boş');
  if (!parentId) throw new Error('Pano belgesi seçilmemiş');
  const rem = await api.createRem();
  if (!rem) throw new Error('Görev oluşturulamadı');
  await rem.setText([clean]);
  await rem.setParent(parentId);
  await rem.addTag(tagId);
  return rem._id;
}

/** Dört kutuyu ve içindeki tamamlanmamış görevleri okur. */
export async function loadBoard(api: BoardApi, quadrants: Quadrant[] = QUADRANTS): Promise<BoardQuadrant[]> {
  const seen = new Set<string>();
  const places = new Map<string, PlaceInfo>();
  const out: BoardQuadrant[] = [];
  for (const q of quadrants) {
    const tasks: Task[] = [];
    const tag = q.tagId ? await api.findOne(q.tagId) : undefined;
    const tagged = tag ? await tag.taggedRem() : [];
    for (const rem of tagged || []) {
      if (!rem || seen.has(rem._id)) continue;
      if ((await rem.getTodoStatus()) === 'Finished') continue;
      seen.add(rem._id);
      const rt = Array.isArray(rem.text) ? rem.text : [];
      const place = await placeOf(api, rem, places);
      tasks.push({
        id: rem._id,
        text: (await remText(api, rem)) || '(adsız görev)',
        hasImage: richTextHasImage(rt),
        source: place.source,
        groupId: place.groupId,
        path: place.path,
        icon: place.icon,
        childCount: Array.isArray(rem.children) ? rem.children.length : 0,
      });
    }
    out.push({ ...q, tasks });
  }
  return out;
}
