// Öğren ekranı: kelime kartı ayrıştırıcı. YALNIZ OKUR; RemNote'a hiçbir şey yazmaz.
// Girdi, readSubtreeRaw (src/core/subtree-raw.ts) çıktısındaki düz düğüm listesidir
// (kart kökü depth 0). İki şablon desteklenir:
//  - eski: "Kelime ve telaffuz" ("Israelites, n., /ˈɪzrəlaɪts/ (İZ-rı-layts)") + ayrı "Seviye"
//  - v2:   "Kelime, telaffuz ve seviye" (3 satır), docs/project_notes/remnote-ingilizce-kelime-sablonu-v2.md
// SDK'yı çalışma anında içe aktarmaz (node testinde esbuild ile yüklenir).

export interface RawNode {
  remId: string;
  parentId: string | null;
  depth: number;
  order: number;
  rawText: unknown;
  backText: unknown;
  childCount: number;
}

/** Zengin metnin görünür parçası: kalın, italik, altı çizili, kod, yazı rengi (tc) ve vurgu (h) korunur. */
export interface Seg {
  text: string;
  b?: boolean;
  l?: boolean;
  u?: boolean;
  code?: boolean;
  tc?: number | string;
  h?: number | string;
}

/** Tanıtım ekranının altındaki "Detaylar" bölümü: kartın bir başlığı ve içerik satırları. */
export interface DetailItem {
  remId: string;
  segs: Seg[];
  /** Satır bir resim içeriyorsa resim öğesi (RemNote'un salt okunur gösterimiyle çizilir). */
  image: any[] | null;
}
export interface DetailSection {
  title: string;
  key: string;
  items: DetailItem[];
}

export interface WordCard {
  remId: string;
  word: string;
  meaning: string;
  context: string;
  ipa: string;
  okunus: string;
  tur: string;
  seviye: string;
  sentence: string;
  sentenceTarget: string;
  sentenceTr: Seg[];
  example: string;
  mnemonic: Seg[];
  gorselIpucu: string;
  dizide: string;
  /** Kartın alt ağacındaki ilk resim öğesi (RemNote'un kendi gösterimiyle çizilir). */
  image: { remId: string; rich: any[] } | null;
  /** Kartın "Detaylar" altındaki bütün başlıklar, şablon sırasıyla; Context Translator en sonda. */
  details: DetailSection[];
  /** Ekleme yerleri: "Detaylar" düğümü ve varsa "Mnemonic" / "Görsel ipucu" başlıkları. */
  anchors?: { detay: string; mnemonic?: string; gorsel?: string };
}

function asArray(rt: unknown): any[] {
  return Array.isArray(rt) ? rt : typeof rt === 'string' ? [rt] : [];
}

export function segments(rt: unknown): Seg[] {
  const out: Seg[] = [];
  for (const x of asArray(rt)) {
    if (typeof x === 'string') { out.push({ text: x }); continue; }
    if (!x || typeof x !== 'object') continue;
    if (typeof x.text === 'string' && (x.i === 'm' || x.i === 'q' || x.i === undefined)) {
      const s: Seg = { text: x.text };
      if (x.b) s.b = true;
      if (x.l) s.l = true;
      if (x.u) s.u = true;
      if (x.code) s.code = true;
      if (x.tc !== undefined && x.tc !== null) s.tc = x.tc;
      if (x.h !== undefined && x.h !== null) s.h = x.h;
      out.push(s);
    }
  }
  return out;
}

/** Düz metin. Hem RemNote ham zengin metnini hem Seg listesini kabul eder. */
export function plain(rt: unknown): string {
  return segments(rt).map((s) => s.text).join('');
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLocaleLowerCase('tr');

export function isVocabFirstChild(text: string): boolean {
  return norm(text) === 'detaylar';
}

const hasImage = (rt: unknown) => asArray(rt).some((x) => x && typeof x === 'object' && x.i === 'i');

const upperFirst = (s: string) => (s ? s.charAt(0).toLocaleUpperCase('tr') + s.slice(1) : s);

const TUR: Record<string, string> = {
  'n.': 'isim', 'v.': 'fiil', 'adj.': 'sıfat', 'adv.': 'zarf', 'prep.': 'edat', 'conj.': 'bağlaç',
  'pron.': 'zamir', 'interj.': 'ünlem', 'phr.': 'kalıp', 'phr. v.': 'phrasal verb',
};
const SEVIYE: Record<string, string> = { A1: 'başlangıç', A2: 'temel', B1: 'orta', B2: 'orta üstü', C1: 'ileri', C2: 'ustalık' };

function seviyeText(code: string, name = ''): string {
  const c = code.trim().toUpperCase();
  if (!c) return '';
  const n = name.trim() || SEVIYE[c] || '';
  return n ? `${c} · ${n}` : c;
}

/** Eski şablon: "Israelites, n., /ˈɪzrəlaɪts/ (İZ-rı-layts)" ya da "patties, n. (çoğul), /ˈpætiz/ (PE-tiz)". */
function parseOldPron(line: string) {
  const ipaM = line.match(/\/[^/]+\//);
  const ipa = ipaM ? ipaM[0] : '';
  let okunus = '';
  if (ipaM) {
    const after = line.slice((ipaM.index || 0) + ipa.length);
    const o = after.match(/^\s*\(([^)]+)\)/);
    if (o) okunus = o[1].trim();
  }
  let tur = '';
  const head = ipaM ? line.slice(0, ipaM.index) : line;
  const parts = head.split(',').map((x) => x.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const raw = parts[1];
    const m = raw.match(/^([a-z. ]+?\.)\s*(\(.*\))?$/i);
    if (m) tur = (TUR[m[1].toLowerCase()] || m[1]) + (m[2] ? ' ' + m[2] : '');
    else tur = raw;
  }
  return { ipa, okunus, tur };
}

/** v2: "parish  ·  isim" / "/ˈpærɪʃ/  ·  okunuşu pe-riş" / "seviye C1  ileri". */
function parseV2Pron(text: string) {
  const lines = text.split('\n').map((x) => x.trim());
  const l1 = lines[0] || '', l2 = lines[1] || '', l3 = lines[2] || '';
  const tur = (l1.split('·')[1] || '').trim();
  const ipaM = l2.match(/\/[^/]+\//);
  const okM = l2.match(/okunuşu\s+(.+)$/i);
  const svM = l3.match(/seviye\s+([ABC][12])\s*(.*)$/i);
  return {
    ipa: ipaM ? ipaM[0] : '',
    okunus: okM ? okM[1].trim() : '',
    tur,
    seviye: svM ? seviyeText(svM[1], svM[2]) : '',
  };
}

/** Kartın kendi düğümleri (kök depth 0). Kelime kartı değilse null. */
export function parseCard(nodes: RawNode[]): WordCard | null {
  const root = nodes.find((n) => n.depth === 0) || nodes[0];
  if (!root) return null;
  const kids = new Map<string, RawNode[]>();
  for (const n of nodes) {
    if (n.parentId === null) continue;
    if (!kids.has(n.parentId)) kids.set(n.parentId, []);
    kids.get(n.parentId)!.push(n);
  }
  for (const list of kids.values()) list.sort((a, b) => a.order - b.order);
  const detay = (kids.get(root.remId) || [])[0];
  if (!detay || !isVocabFirstChild(plain(detay.rawText))) return null;

  const sec = new Map<string, RawNode[]>();
  const headings = kids.get(detay.remId) || [];
  for (const h of headings) {
    const key = norm(plain(h.rawText));
    if (key && !sec.has(key)) sec.set(key, kids.get(h.remId) || []);
  }
  const first = (k: string) => (sec.get(k) || [])[0];
  const firstPlain = (k: string) => plain(first(k)?.rawText).trim();

  const word = plain(root.rawText).trim();
  const context = plain(root.backText).replace(/^\s*Bağlam:\s*/i, '').trim();

  // Kısa Türkçe anlam: "Bağlamdaki anlamı" kalın parçaları; yoksa "Genel anlamları" 1) maddesinin kalın kısmı.
  const bolds = (rt: unknown) => segments(rt).filter((s) => s.b && s.text.trim()).map((s) => s.text.trim());
  let meaning = bolds(first('bağlamdaki anlamı')?.rawText).slice(0, 2).join(', ');
  if (!meaning) {
    const gen = segments(first('genel anlamları')?.rawText);
    const line1: Seg[] = [];
    for (const s of gen) {
      if (s.text.includes('\n')) { line1.push({ ...s, text: s.text.split('\n')[0] }); break; }
      line1.push(s);
    }
    meaning = line1.filter((s) => s.b && s.text.trim()).map((s) => s.text.trim())[0] || '';
  }
  if (!meaning) meaning = context;
  meaning = upperFirst(meaning);

  let ipa = '', okunus = '', tur = '', seviye = '';
  const v2 = first('kelime, telaffuz ve seviye');
  if (v2) ({ ipa, okunus, tur, seviye } = parseV2Pron(plain(v2.rawText)));
  else ({ ipa, okunus, tur } = parseOldPron(firstPlain('kelime ve telaffuz')));
  if (!seviye) seviye = seviyeText(firstPlain('seviye').split(/\s/)[0] || '');

  const cumle = first('cümle');
  const sentence = plain(cumle?.rawText).trim();
  const target = segments(cumle?.rawText).find((s) => s.tc === 3 && s.text.trim().length > 1);
  const sentenceTarget = target ? target.text.trim() : '';

  const ceviri = segments(first('cümle çevirisi')?.rawText);
  const sentenceTr: Seg[] = [];
  let seen = false;
  for (const s of ceviri) {
    if (seen) { sentenceTr.push(s); continue; }
    const i = s.text.indexOf(' = ');
    if (i >= 0) { seen = true; const rest = s.text.slice(i + 3); if (rest) sentenceTr.push({ ...s, text: rest }); }
  }

  // Görsel: Context Translator bölümü dışındaki ilk resim öğesi.
  let image: WordCard['image'] = null;
  const skip = new Set<string>();
  for (const h of headings) if (norm(plain(h.rawText)) === 'context translator cevabı') skip.add(h.remId);
  const walk = (id: string): boolean => {
    for (const n of kids.get(id) || []) {
      if (skip.has(n.remId)) continue;
      if (hasImage(n.rawText)) {
        image = { remId: n.remId, rich: asArray(n.rawText).filter((x) => x && typeof x === 'object' && x.i === 'i').slice(0, 1) };
        return true;
      }
      if (walk(n.remId)) return true;
    }
    return false;
  };
  walk(root.remId);

  return {
    remId: root.remId,
    word,
    meaning,
    context,
    ipa,
    okunus,
    tur,
    seviye,
    sentence,
    sentenceTarget,
    sentenceTr,
    example: firstPlain('örnek cümle'),
    mnemonic: segments(first('mnemonic')?.rawText),
    gorselIpucu: firstPlain('görsel ipucu'),
    dizide: firstPlain('dizideki yeri'),
    image,
    details: buildDetails(headings, kids),
    anchors: {
      detay: detay.remId,
      mnemonic: headings.find((h) => norm(plain(h.rawText)) === 'mnemonic')?.remId,
      gorsel: headings.find((h) => norm(plain(h.rawText)) === 'görsel ipucu')?.remId,
    },
  };
}

/** Şablon sırası (docs/project_notes/remnote-ingilizce-kelime-sablonu-v2.md); eski ve yeni telaffuz başlığı aynı sırada. */
const DETAIL_ORDER = [
  'cümle çevirisi', 'cümle', 'bağlamdaki anlamı', 'genel anlamları', 'kelime ve telaffuz|kelime, telaffuz ve seviye',
  'açıklama', 'ingilizce eş anlamlılar', 'etimoloji', 'phrasal verb ve fiil kalıpları', 'doğal kalıplar', 'mnemonic',
  'görsel ipucu', 'örnek cümle', 'seviye', 'dizideki yeri', 'kaynak',
];
const CT_KEY = 'context translator cevabı';

function buildDetails(headings: RawNode[], kids: Map<string, RawNode[]>): DetailSection[] {
  const rank = (key: string) => {
    if (key === CT_KEY) return 1000; // her zaman en sonda
    const i = DETAIL_ORDER.findIndex((k) => k.split('|').includes(key));
    return i >= 0 ? i : 500; // şablon dışı başlık (ör. "Görsel"): şablondakilerden sonra, Context Translator'dan önce
  };
  const list = headings
    .map((h, idx) => {
      const title = plain(h.rawText).replace(/\s+/g, ' ').trim();
      const key = norm(title);
      const items: DetailItem[] = (kids.get(h.remId) || []).map((n) => ({
        remId: n.remId,
        segs: segments(n.rawText),
        image: hasImage(n.rawText) ? asArray(n.rawText).filter((x) => x && typeof x === 'object' && x.i === 'i') : null,
      }));
      return { title, key, items, idx };
    })
    .filter((s) => s.title);
  list.sort((a, b) => rank(a.key) - rank(b.key) || a.idx - b.idx);
  return list.map(({ title, key, items }) => ({ title, key, items }));
}

/** Düğme için: belgenin çocuklarından en az `need` tanesi kelime kartı mı? Erken durur. */
export interface VocabProbeApi {
  childIds(docId: string): Promise<string[]>;
  firstChildTexts(ids: string[]): Promise<string[]>;
}
export async function hasVocabCards(api: VocabProbeApi, docId: string, need = 3, batch = 20): Promise<boolean> {
  const ids = await api.childIds(docId);
  if (ids.length < need) return false;
  let found = 0;
  for (let i = 0; i < ids.length; i += batch) {
    const texts = await api.firstChildTexts(ids.slice(i, i + batch));
    for (const t of texts) if (isVocabFirstChild(t || '')) found += 1;
    if (found >= need) return true;
  }
  return false;
}
