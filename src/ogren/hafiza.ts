// Öğren: hafıza yardımı (internetten telifsiz resim + Türkçe ses benzerliği hikâyesi).
// Adaylar köprünün var olan salt okunur komutlarından gelir (seçim asistanıyla aynı):
//   host_translate_image_candidates (Wikimedia Commons), host_translate_mnemonic_candidates.
// Karta yazma YALNIZ kullanıcı bir adayın "Karta ekle" düğmesine bastığında olur ve yalnız
// EKLEME yapar: ilgili başlığın altına yeni bir satır (rem). Var olan hiçbir şey değişmez/silinmez.

export interface ImageCandidate {
  title?: string;
  imageUrl: string;
  thumbUrl?: string;
  pageUrl?: string;
  license?: string;
  creator?: string;
  source?: string;
}

export interface Anchors { detay: string; mnemonic?: string; gorsel?: string }

/** Yeni satırın konacağı yer: kendi başlığı varsa onun altı, yoksa "Detaylar" düğümünün altı. */
export function targetParent(anchors: Anchors, kind: 'resim' | 'hikaye'): string {
  if (kind === 'resim') return anchors.gorsel || anchors.detay;
  return anchors.mnemonic || anchors.detay;
}

function clean(s: unknown, max: number): string {
  return String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Resim satırı: resim öğesi + kaynak/lisans notu (CC BY-SA gibi lisanslar kaynak gösterilmesini ister). */
export function imageRich(c: ImageCandidate): any[] {
  const url = clean(c.imageUrl, 2000);
  if (!/^https:\/\//.test(url)) throw new Error('Geçersiz resim adresi');
  const credit = [clean(c.source, 40) || 'Wikimedia', clean(c.license, 60), clean(c.creator, 80)].filter(Boolean).join(' · ');
  return [{ i: 'i', url, width: 360 }, ' ', { i: 'm', text: `Kaynak: ${credit}`, tc: '#acbfc5' }];
}

/** Hikâye satırı: "kanca = sahne = kelime; ..." metni olduğu gibi, başında 🧠. */
export function mnemonicRich(text: string): any[] {
  const t = clean(text, 500).replace(/;\s*baglamdaki anlam\s*$/i, '');
  if (!t) throw new Error('Boş hikâye');
  return ['🧠 ', t];
}

export interface AddApi {
  /** parentId altına, en sona yeni satır ekler; yeni satırın kimliğini döner. */
  appendChild(parentId: string, rich: any[]): Promise<string>;
}

export async function addToCard(api: AddApi, anchors: Anchors | undefined, kind: 'resim' | 'hikaye', rich: any[]): Promise<string> {
  if (!anchors?.detay) throw new Error('Kartın "Detaylar" bölümü bulunamadı');
  return api.appendChild(targetParent(anchors, kind), rich);
}
