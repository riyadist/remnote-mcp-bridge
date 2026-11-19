// Öğren ekranının RemNote SDK bağlantısı. Okuma: belge çocukları, kart alt ağacı
// (forest.ts: kat kat toplu findMany; readSubtreeRaw ile aynı düğüm biçimi), forward kartın tekrar geçmişi. Yazma: YALNIZ
// saveApi().forwardCard(...).update(score) -> card.updateCardRepetitionStatus(score) ve
// addApi().appendChild: kullanıcının "Karta ekle" ile seçtiği resim/hikâye için başlığın altına
// YENİ satır ekleme. Var olan not, kart içeriği ya da görsel değiştirilmez, silinmez.

import type { RNPlugin } from '@remnote/plugin-sdk';
import { readForest } from './forest';
import { isVocabFirstChild, parseCard, plain, type VocabProbeApi, type WordCard } from './parse';
import type { SaveApi } from './lesson';
import type { AddApi } from './hafiza';

export function probeApi(p: RNPlugin): VocabProbeApi {
  return {
    async childIds(docId) {
      const rem = await p.rem.findOne(docId);
      return ((rem as any)?.children || []) as string[];
    },
    async firstChildTexts(ids) {
      const rems = await p.rem.findMany(ids);
      const byId = new Map<string, any>((rems || []).map((r: any) => [r._id, r]));
      const firstIds = ids.map((id) => byId.get(id)?.children?.[0]).filter(Boolean) as string[];
      const firsts = firstIds.length ? await p.rem.findMany(firstIds) : [];
      const textOf = new Map<string, string>((firsts || []).map((r: any) => [r._id, plain(r.text)]));
      return ids.map((id) => textOf.get(byId.get(id)?.children?.[0]) || '');
    },
  };
}

export interface DeckCard extends WordCard {
  /** forward kartın tekrar kaydı sayısı; forward kart yoksa null. */
  historyCount: number | null;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

async function forwardOf(p: RNPlugin, remId: string): Promise<any | null> {
  const rem = await p.rem.findOne(remId);
  if (!rem) return null;
  const cards = (await rem.getCards()) || [];
  return cards.find((c: any) => c.type === 'forward') || null;
}

export async function loadDeck(p: RNPlugin, docId: string): Promise<{ title: string; cards: DeckCard[] }> {
  const doc = await p.rem.findOne(docId);
  if (!doc) throw new Error('Belge bulunamadı');
  const probe = probeApi(p);
  const ids = await probe.childIds(docId);
  const firsts: string[] = [];
  for (let i = 0; i < ids.length; i += 50) firsts.push(...(await probe.firstChildTexts(ids.slice(i, i + 50))));
  const vocabIds = ids.filter((_, i) => isVocabFirstChild(firsts[i] || ''));
  const [forest, history] = await Promise.all([
    readForest({ findMany: (x) => p.rem.findMany(x) as any }, vocabIds, 3),
    mapLimit(vocabIds, 12, async (id) => {
      const fwd = await forwardOf(p, id);
      return fwd ? ((fwd.repetitionHistory || []) as unknown[]).length : null;
    }),
  ]);
  const cards = vocabIds.map((id, i) => {
    const nodes = forest.get(id);
    const c = nodes ? parseCard(nodes) : null;
    if (!c || !c.word) return null;
    return { ...c, historyCount: history[i] } as DeckCard;
  });
  return { title: plain(doc.text).trim(), cards: cards.filter(Boolean) as DeckCard[] };
}

export function saveApi(p: RNPlugin): SaveApi {
  return {
    async forwardCard(remId) {
      const fwd = await forwardOf(p, remId);
      if (!fwd) return null;
      // Eldeki nesne eski olabilir: kartı kimliğiyle yeniden çek.
      const fresh: any = (await p.card.findOne(fwd._id)) || fwd;
      return {
        id: fresh._id,
        history: fresh.repetitionHistory || [],
        update: (score: number) => fresh.updateCardRepetitionStatus(score as any),
      };
    },
  };
}

export function addApi(p: RNPlugin): AddApi {
  return {
    async appendChild(parentId, rich) {
      const parent: any = await p.rem.findOne(parentId);
      if (!parent) throw new Error('Eklenecek yer bulunamadı');
      const rem: any = await p.rem.createRem();
      if (!rem) throw new Error('Yeni satır oluşturulamadı');
      await rem.setText(rich as any);
      await rem.setParent(parentId, ((parent.children || []) as string[]).length);
      return rem._id as string;
    },
  };
}
