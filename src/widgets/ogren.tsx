import { renderWidget, RichText, useLocalStorageState, usePlugin, WidgetLocation } from '@remnote/plugin-sdk';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { addApi, loadDeck, saveApi, type DeckCard } from '../ogren/adapter';
import { addToCard, imageRich, mnemonicRich, type ImageCandidate } from '../ogren/hafiza';
import { hostKeyHeaders, primeHostKey } from '../core/host-key';
import { nextProgress, pickLesson, saveGrades, Session, type Grade, type Progress, type SaveResult, type Step } from '../ogren/lesson';
import type { DetailSection, Seg, WordCard } from '../ogren/parse';
import { detectMobile } from '../features/platform';

// Öğren ekranı (açılır pencere / popup içinde açılır; bölme (pane) yolu RemNote 1.28'de pencere dizgisini bozuyordu). Onaylı taslak: C:\PS6\Programs\Temp\remnote-ogren-taslak.html.
// RemNote'a yazma YALNIZ ders sonunda "RemNote'a kaydet" düğmesiyle olur (forward kartın
// tekrar kaydı). Yarıda bırakma, pencereyi kapatma ya da pratik turu hiçbir şey yazmaz.
// İlerleme (kaçıncı ders) yalnız plugin.storage (synced) içinde tutulur.

const LESSON_SIZE = 5;
const PROGRESS_KEY = 'ogren-ilerleme';

const CSS = `
html,body{margin:0;padding:0;background:#1c1c21}
.og{--bg:#1c1c21;--panel:#26262c;--line:#34343c;--txt:#e4e4e8;--mut:#8e8e99;--acc:#f2a33a;--ok:#3fc48a;--bad:#ef5b5b;--blue:#5b8def;--yel:#ffe08a;
 background:var(--bg);color:var(--txt);font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif,"Apple Color Emoji","Segoe UI Emoji";box-sizing:border-box;border-radius:12px;overflow:hidden}
.og .stage{min-height:420px}
.og *{box-sizing:border-box}
.og .top{display:flex;align-items:center;gap:12px;padding:12px 18px;border-bottom:1px solid var(--line);flex-wrap:wrap}
.og .top .t{font-weight:700;color:var(--acc)}
.og .top .s{color:var(--mut);font-size:13px}
.og .top .x{margin-left:auto;color:var(--mut);font-size:13px;cursor:pointer;background:none;border:0;font:inherit}
.og .top .x:hover{color:var(--txt)}
.og .bar{height:6px;background:#2c2c34}
.og .bar i{display:block;height:100%;background:var(--acc);transition:width .35s}
.og .dots{display:flex;gap:6px;padding:10px 18px 0}
.og .dot{flex:1;height:4px;border-radius:2px;background:#2c2c34}
.og .dot.on{background:var(--blue)}.og .dot.ok{background:var(--ok)}
.og .stage{padding:26px 34px 30px;max-width:900px;margin:0 auto}
.og .lbl{font-size:12px;letter-spacing:.06em;color:var(--mut);text-transform:uppercase;margin-bottom:6px}
.og .word{font-size:40px;font-weight:700;color:var(--yel);display:flex;align-items:center;gap:14px;word-break:break-word}
.og .spk{border:1px solid var(--line);background:#2b2b33;color:#fff;border-radius:50%;width:40px;height:40px;cursor:pointer;font-size:18px;flex:none}
.og .ipa{color:#8fb4ff;font-size:17px;margin:6px 0 2px}.og .ipa span{color:var(--mut)}
.og .mean{font-size:22px;font-weight:600;margin:16px 0 4px}
.og .grid{display:grid;grid-template-columns:1.2fr 1fr;gap:22px;margin-top:18px}
.og .col{display:grid;gap:12px;align-content:start}
.og .box{background:var(--panel);border-radius:10px;padding:14px 16px;font-size:15px;line-height:1.55}
.og .box h4{margin:0 0 6px;font-size:12px;color:var(--mut);letter-spacing:.06em;text-transform:uppercase;font-weight:600}
.og .img{background:var(--panel);border-radius:10px;overflow:hidden;display:block}
.og .img img.ci{display:block;width:100%;aspect-ratio:4/3;object-fit:cover}
.og .di .img img.ci{aspect-ratio:auto;max-height:320px;object-fit:contain;background:#111}
.og .mark{background:#f7c02a33;color:var(--yel);border-radius:4px;padding:0 4px;font-weight:700}
.og .btns{display:flex;gap:12px;margin-top:24px;justify-content:flex-end;flex-wrap:wrap}
.og button.b{border:0;border-radius:8px;padding:11px 20px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit}
.og button.b:disabled{opacity:.5;cursor:default}
.og .go{background:var(--acc);color:#1a1a1a}.og .ghost{background:#2b2b33;color:#ddd;border:1px solid var(--line)!important}
.og .q{font-size:15px;color:var(--mut);margin-bottom:12px}
.og .qw{font-size:30px;font-weight:700;margin-bottom:22px;display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.og .qs{font-size:24px;font-weight:500;margin-bottom:22px}
.og .qs .tr{font-size:15px;color:var(--mut);margin-top:6px;font-style:normal}
.og .opts{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.og .opt{background:var(--panel);border:2px solid var(--line);border-radius:10px;padding:14px 16px;font-size:16px;cursor:pointer;text-align:left;color:var(--txt);font-family:inherit}
.og .opt:hover{border-color:#55556a}
.og .opt.ok{border-color:var(--ok);background:#1f3a2e}.og .opt.bad{border-color:var(--bad);background:#3a2024}
.og input.ty{width:100%;background:var(--panel);border:2px solid var(--line);border-radius:10px;padding:14px 16px;font-size:20px;color:#fff;outline:none;font-family:inherit}
.og input.ty:focus{border-color:var(--blue)}
.og .fb{margin-top:16px;border-radius:10px;padding:12px 16px;font-size:15px;line-height:1.5}
.og .fb.ok{background:#1f3a2e;color:#b9f0d5}.og .fb.bad{background:#3a2024;color:#ffc9cc}
.og .sum{display:grid;gap:8px;margin-top:14px}
.og .row{display:flex;align-items:center;gap:12px;background:var(--panel);border-radius:8px;padding:10px 14px;flex-wrap:wrap}
.og .row .w{font-weight:700;min-width:120px}.og .row .r{color:var(--mut);font-size:14px}.og .row .g{margin-left:auto;font-weight:700}
.og .muted{color:var(--mut)}
.og .err{background:#3a2024;color:#ffc9cc;border-radius:10px;padding:12px 16px;margin-top:14px;line-height:1.5}
.og .okbox{background:#1f3a2e;color:#b9f0d5;border-radius:10px;padding:12px 16px;margin-top:14px;line-height:1.5}
.og .list{color:var(--mut);margin-top:10px;line-height:1.7}
.og .list b{color:var(--txt)}
.og .scroll{overflow-y:auto;overscroll-behavior:contain}
.og .det{margin-top:26px;border-top:1px solid var(--line);padding-top:14px}
.og .dh{display:flex;align-items:center;gap:12px;margin-bottom:6px}
.og .dh .x{margin-left:auto;color:var(--mut);font-size:13px;cursor:pointer;background:none;border:0;font:inherit}
.og .dh .x:hover{color:var(--txt)}
.og .ds{border-radius:8px}
.og .dt{display:flex;align-items:center;gap:6px;padding:5px 6px;cursor:pointer;border-radius:6px;font-size:15px;line-height:24px;user-select:none}
.og .dt:hover{background:#2a2a31}
.og .dt .ar{width:18px;height:24px;display:flex;align-items:center;justify-content:center;color:var(--mut);font-size:10px;flex:none}
.og .dt .ar i{font-style:normal;display:inline-block;transition:transform .15s}
.og .ds.open .dt .ar i{transform:rotate(90deg)}
.og .dt .dn{font-size:13px;font-weight:400}
.og .di{padding:2px 6px 10px 30px;display:grid;gap:6px}
.og .dl{font-size:15px;line-height:1.6;white-space:pre-wrap;word-break:break-word;position:relative;padding-left:14px}
.og .dl::before{content:"";position:absolute;left:0;top:.72em;width:5px;height:5px;border-radius:50%;background:#6c6c76}
.og code{background:#2b2b33;border-radius:4px;padding:0 4px;font-size:.92em}
.og .hy{margin-top:22px;background:var(--panel);border-radius:10px;padding:14px 16px}
.og .hy h4{margin:0 0 12px;font-size:12px;color:var(--mut);letter-spacing:.06em;text-transform:uppercase;font-weight:600}
.og .hy h4 span{text-transform:none;letter-spacing:0;font-weight:400}
.og .hy .row2{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
.og .hy button.s{border:1px solid var(--line);background:#2b2b33;color:#ddd;border-radius:7px;padding:7px 12px;font-size:13px;cursor:pointer;font-family:inherit}
.og .hy button.s:disabled{opacity:.5;cursor:default}
.og .hy button.add{background:var(--acc);color:#1a1a1a;border:0;font-weight:700}
.og .thumbs{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px}
.og .th{background:#1f1f25;border:2px solid var(--line);border-radius:8px;overflow:hidden;cursor:pointer;display:flex;flex-direction:column;padding:0;font-family:inherit;color:inherit;text-align:left}
.og .th.on{border-color:var(--blue)}
.og .th img{width:100%;aspect-ratio:4/3;object-fit:cover;display:block;background:#111}
.og .th span{font-size:11px;color:var(--mut);padding:4px 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.og .big{margin-top:12px;display:grid;grid-template-columns:minmax(0,1fr) 200px;gap:14px;align-items:end}
.og .big img{width:100%;max-height:300px;object-fit:contain;background:#111;border-radius:8px;display:block}
.og .big .side{display:grid;gap:8px;justify-items:start}
.og .st{display:grid;gap:8px;margin-top:12px}
.og .stl{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;background:#1f1f25;border-radius:8px;padding:9px 12px;font-size:15px;line-height:1.5}
.og .done{color:var(--ok);font-size:13px;font-weight:700}
.og .tiny{font-size:12px;color:var(--mut);line-height:1.5}
.og .tiles{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.og .tile{min-width:44px;height:48px;padding:0 10px;border-radius:9px;border:2px solid var(--line);background:#2b2b33;color:#fff;font-size:22px;font-weight:700;cursor:pointer;font-family:inherit}
.og .tile:hover{border-color:#55556a}
.og .tile.used{opacity:.25;cursor:default}
.og .tile.ctl{font-size:15px;font-weight:600;color:#ccc}
@media (max-width:640px){.og .big{grid-template-columns:1fr}}
@media (max-width:640px){.og .grid,.og .opts{grid-template-columns:1fr}.og .stage{padding:20px 16px}.og .word{font-size:32px}}
`;

// Yazı renkleri: şablon belgesindeki ölçülmüş RemNote değerleri (3 sarı, 6 mavi, 2 turuncu) ve
// kartta doğrudan yazılı onaltılık renkler. Diğer hazır renk numaraları bilinmediği için renksiz kalır.
const TC: Record<string, string> = { '3': '#ffc002', '6': '#768dff', '2': '#ff9a3c' };
function Rich({ segs }: { segs: Seg[] }) {
  return (
    <>
      {segs.map((s, i) => {
        const color = s.tc === undefined ? undefined : typeof s.tc === 'string' && s.tc.startsWith('#') ? s.tc : TC[String(s.tc)];
        let el: React.ReactNode = s.text;
        if (s.code) el = <code>{el}</code>;
        if (s.u) el = <u>{el}</u>;
        if (s.l) el = <i>{el}</i>;
        if (s.b) el = <b>{el}</b>;
        const style: React.CSSProperties = {};
        if (color) style.color = color;
        if (s.h !== undefined) { style.background = typeof s.h === 'string' && s.h.startsWith('#') ? s.h + '44' : 'rgba(255,192,2,.22)'; style.borderRadius = 3; }
        return <span key={i} style={color || s.h !== undefined ? style : undefined}>{el}</span>;
      })}
    </>
  );
}

/**
 * Kartın "Detaylar" alt ağacı, RemNote'taki gibi ▸ oklu açılır satırlar. Salt okunur: kartın ham
 * zengin metninden kendi çizimimiz (renk, kalın, italik, altı çizili, vurgu korunur); düzenleyici
 * bileşen kullanılmadığı için kart yanlışlıkla değişemez. Resimler RemNote'un salt okunur RichText
 * gösterimiyle. Aç/kapat durumu başlık adına göre bu cihazda hatırlanır.
 */
function Details({ word, open, setOpen }: { word: { details?: DetailSection[] }; open: Record<string, boolean>; setOpen: (v: Record<string, boolean>) => void }) {
  const secs = word.details;
  if (!secs || !secs.length) return null;
  const allOpen = secs.every((d) => open[d.key]);
  const toggleAll = () => {
    const n = { ...open };
    for (const d of secs) n[d.key] = !allOpen;
    setOpen(n);
  };
  return (
    <div className="det">
      <div className="dh">
        <span className="lbl" style={{ margin: 0 }}>Detaylar</span>
        <button className="x" onClick={toggleAll}>{allOpen ? 'Hepsini kapat' : 'Hepsini aç'}</button>
      </div>
      {secs.map((d) => {
        const isOpen = !!open[d.key];
        return (
          <div key={d.key} className={'ds' + (isOpen ? ' open' : '')}>
            <div className="dt" onClick={() => setOpen({ ...open, [d.key]: !isOpen })}>
              <span className="ar"><i>▶</i></span><b>{d.title}</b>{!isOpen && d.items.length > 1 ? <span className="muted dn"> · {d.items.length}</span> : null}
            </div>
            {isOpen ? (
              <div className="di">
                {d.items.map((it) => (
                  <div key={it.remId} className="dl">
                    {it.image ? <CardImage rich={it.image as any[]} /> : null}
                    {it.segs.length ? <div><Rich segs={it.segs} /></div> : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

// ---- Kart resmi: kendi <img> öğemizle (RemNote'un RichText resmi pencerenin ÜSTÜNDE ayrı bir
// katman olarak çiziliyor ve kaydırırken geride kalıyordu). %LOCAL_FILE% resimlerin bulut kopyası
// kullanılır; açılamazsa RemNote'un kendi gösterimine dönülür.
const S3 = 'https://remnote-user-data.s3.amazonaws.com/';
function imageUrlOf(rich: any[] | null | undefined): string {
  const el = (rich || []).find((x: any) => x && typeof x === 'object' && x.i === 'i');
  const u = String(el?.url || '');
  if (u.startsWith('%LOCAL_FILE%')) return S3 + u.slice('%LOCAL_FILE%'.length);
  return /^https:\/\//.test(u) ? u : '';
}
function CardImage({ rich }: { rich: any[] }) {
  const url = imageUrlOf(rich);
  const [bad, setBad] = useState(false);
  if (!url || bad) return <div className="img" style={{ padding: 8 }}><RichText text={rich as any} width="100%" /></div>;
  return <div className="img"><img className="ci" src={url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(true)} /></div>;
}

// ---- Hafıza yardımı: telifsiz resim + Türkçe ses benzerliği hikâyesi ----
const HOST_CALL_URL = 'http://127.0.0.1:3400/call';
async function hostCall<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const r = await fetch(HOST_CALL_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await hostKeyHeaders()) }, body: JSON.stringify({ action, payload }) });
  const d = await r.json().catch(() => null);
  if (!r.ok || d?.ok !== true) throw new Error(d?.error || `${action} başarısız (${r.status})`);
  return d.result as T;
}
// Aynı kelime için tekrar sorulmasın (pratikte aynı kelime yeniden gelebilir).
const imgCache = new Map<string, ImageCandidate[]>();
const storyCache = new Map<string, string[]>();
const ADDED_KEY = 'ogren-eklenenler';
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function HafizaYardim({ w }: { w: WordCard }) {
  const plugin = usePlugin();
  const ctxText = [w.meaning, w.sentence, w.example].filter(Boolean).join(' | ');
  const [imgs, setImgs] = useState<ImageCandidate[] | null>(imgCache.get(w.remId) || null);
  const [imgBusy, setImgBusy] = useState(false);
  const [imgMsg, setImgMsg] = useState('');
  const [sel, setSel] = useState(0);
  const [stories, setStories] = useState<string[] | null>(storyCache.get(w.remId) || null);
  const [storyBusy, setStoryBusy] = useState(false);
  const [storyMsg, setStoryMsg] = useState('');
  const [added, setAdded] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState('');

  const findImages = async () => {
    if (imgBusy) return;
    setImgBusy(true); setImgMsg('Telifsiz resim aranıyor (Wikimedia)…');
    try {
      const r = await hostCall<{ candidates?: ImageCandidate[] }>('host_translate_image_candidates', { selectedText: w.word, contextText: ctxText, limit: 6 });
      const list = (r.candidates || []).filter((c) => c && /^https:\/\//.test(c.imageUrl || ''));
      imgCache.set(w.remId, list); setImgs(list); setSel(0);
      setImgMsg(list.length ? '' : 'Uygun resim bulunamadı. Soyut kelimelerde hafıza hikâyesi daha iyi çalışır.');
    } catch (e) { setImgMsg('Resim aranamadı: ' + errText(e)); }
    finally { setImgBusy(false); }
  };
  const findStories = async () => {
    if (storyBusy) return;
    setStoryBusy(true); setStoryMsg('Hafıza hikâyesi yazılıyor (yaklaşık 30 sn)…');
    try {
      const r = await hostCall<{ candidates?: string[] }>('host_translate_mnemonic_candidates', { selectedText: w.word, contextText: ctxText, source: 'default', modelTier: 'default', limit: 4 });
      const list = (r.candidates || []).map((x) => String(x || '').replace(/;\s*baglamdaki anlam\s*$/i, '').trim()).filter(Boolean);
      storyCache.set(w.remId, list); setStories(list);
      setStoryMsg(list.length ? '' : 'Hikâye üretilemedi.');
    } catch (e) { setStoryMsg('Hikâye üretilemedi: ' + errText(e)); }
    finally { setStoryBusy(false); }
  };

  useEffect(() => {
    primeHostKey(plugin);
    // Kartın kendi resmi yoksa resimleri kendiliğinden ara (yalnız okuma, karta yazmaz).
    if (!w.image && !imgCache.has(w.remId)) void findImages();
  }, [w.remId]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = async (key: string, kind: 'resim' | 'hikaye', rich: any[]) => {
    if (adding || added[key]) return;
    setAdding(key);
    try {
      const id = await addToCard(addApi(plugin), w.anchors, kind, rich);
      setAdded((a) => ({ ...a, [key]: true }));
      try {
        const cur = (await plugin.storage.getSynced<any[]>(ADDED_KEY)) || [];
        await plugin.storage.setSynced(ADDED_KEY, [...cur, { remId: id, kart: w.remId, kelime: w.word, tur: kind, zaman: Date.now() }].slice(-500));
      } catch { /* yalnız iz kaydı */ }
    } catch (e) {
      const m = 'Eklenemedi: ' + errText(e);
      if (kind === 'resim') setImgMsg(m); else setStoryMsg(m);
    } finally { setAdding(''); }
  };

  const cur = imgs ? imgs[sel] : undefined;
  const curKey = cur ? 'img:' + cur.imageUrl : '';
  return (
    <div className="hy">
      <h4>🧠 Hafıza yardımı <span>· beğendiğini "Karta ekle" ile kaydet; kartta başka hiçbir şey değişmez</span></h4>
      <div className="row2">
        <button className="s" disabled={imgBusy} onClick={() => void findImages()}>{imgBusy ? 'Resim aranıyor…' : imgs ? '🔄 Resimleri yeniden ara' : '🖼️ İnternetten resim bul'}</button>
        <button className="s" disabled={storyBusy} onClick={() => void findStories()}>{storyBusy ? 'Hikâye yazılıyor…' : stories ? '🔄 Yeni hikâyeler' : '💡 Hafıza hikâyesi öner'}</button>
      </div>
      {imgMsg ? <div className="tiny">{imgMsg}</div> : null}
      {imgs && imgs.length ? (
        <>
          <div className="thumbs">
            {imgs.map((c, i) => (
              <button key={c.imageUrl} className={'th' + (i === sel ? ' on' : '')} onClick={() => setSel(i)} title={c.title || ''}>
                <img src={c.thumbUrl || c.imageUrl} alt={c.title || 'resim'} loading="lazy" referrerPolicy="no-referrer" />
                <span>{c.title || 'resim'}</span>
              </button>
            ))}
          </div>
          {cur ? (
            <div className="big">
              <img src={cur.thumbUrl || cur.imageUrl} alt={cur.title || 'resim'} referrerPolicy="no-referrer" />
              <div className="side">
                <span className="tiny">{[cur.source || 'Wikimedia', cur.license, cur.creator].filter(Boolean).join(' · ')}</span>
                {added[curKey] ? <span className="done">✓ Karta eklendi</span>
                  : <button className="s add" disabled={!!adding} onClick={() => void add(curKey, 'resim', imageRich(cur))}>{adding === curKey ? 'Ekleniyor…' : 'Bu resmi karta ekle'}</button>}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
      {storyMsg ? <div className="tiny" style={{ marginTop: 10 }}>{storyMsg}</div> : null}
      {stories && stories.length ? (
        <div className="st">
          {stories.map((t) => (
            <div key={t} className="stl">
              <div>{t}</div>
              {added['st:' + t] ? <span className="done">✓ Eklendi</span>
                : <button className="s add" disabled={!!adding} onClick={() => void add('st:' + t, 'hikaye', mnemonicRich(t))}>{adding === 'st:' + t ? '…' : 'Karta ekle'}</button>}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Marked({ text, target }: { text: string; target: string }) {
  const i = target ? text.toLowerCase().indexOf(target.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<span className="mark">{text.slice(i, i + target.length)}</span>{text.slice(i + target.length)}</>;
}

const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window && typeof (window as any).SpeechSynthesisUtterance === 'function';
function say(word: string) {
  if (!canSpeak || !word) return;
  try {
    const u = new SpeechSynthesisUtterance(word);
    u.lang = 'en-US';
    u.rate = 0.9;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch { /* ses yoksa sessiz geç */ }
}
function Speaker({ word }: { word: string }) {
  if (!canSpeak) return null;
  return <button className="spk" title="Yalnız kelimeyi okur" onClick={() => say(word)}>🔊</button>;
}

function seeded(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0; return (h >>> 0) / 4294967296; };
}
/** Memrise "harf dizme" sorusu: kelimenin harfleri (boşluk/tire hariç) + 3 şaşırtıcı harf, karışık. */
export function letterTiles(word: string): string[] {
  const rnd = seeded(word.toLowerCase());
  const letters = [...word].filter((c) => c.trim() && c !== '-');
  const pool = 'aeioulnrstdmkbcgpy'.split('').filter((c) => !letters.includes(c));
  const extra: string[] = [];
  while (extra.length < Math.min(3, pool.length)) {
    const c = pool[Math.floor(rnd() * pool.length)];
    if (!extra.includes(c)) extra.push(c);
  }
  const all = [...letters, ...extra];
  for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
  return all;
}

const GRADE_COLOR: Record<string, string> = { EASY: 'var(--ok)', GOOD: 'var(--ok)', HARD: 'var(--acc)' };
const QNAME: Record<string, string> = { sec: 'anlam seç', bosluk: 'boşluk doldur', yaz: 'kendin yaz' };

type View =
  | { k: 'yukleniyor' }
  | { k: 'hata'; msg: string }
  | { k: 'baslangic' }
  | { k: 'ders' }
  | { k: 'ozet'; saving?: boolean; result?: SaveResult };

function Ogren() {
  const plugin = usePlugin();
  // Cihaz bilgisayar olduğu doğrulanana kadar hafıza yardımı çizilmez (telefonda hiç).
  const [onDesktop, setOnDesktop] = useState(false);
  useEffect(() => { let alive = true; void detectMobile(plugin).then((m) => { if (alive) setOnDesktop(!m); }); return () => { alive = false; }; }, [plugin]);
  const [docId, setDocId] = useState('');
  const [title, setTitle] = useState('');
  const [deck, setDeck] = useState<DeckCard[]>([]);
  const [progress, setProgress] = useState<Progress>({});
  const [view, setView] = useState<View>({ k: 'yukleniyor' });
  const [practiceFrom, setPracticeFrom] = useState(0);
  const sess = useRef<Session | null>(null);
  const [, setTick] = useState(0);
  const rerender = () => setTick((t) => t + 1);
  const [typed, setTyped] = useState('');
  const [hint, setHint] = useState(0);
  const [usedTiles, setUsedTiles] = useState<number[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollTick = useRef(0);
  // Detaylar aç/kapat: varsayılan hepsi kapalı; son durum bu cihazdaki eklenti deposunda
  // (iframe'de tarayıcı localStorage yasak). Not verisine yazmaz.
  const [detStored, setDetStored] = useLocalStorageState<Record<string, boolean>>('ogren-detay-acik', {});
  const [detLocal, setDetLocal] = useState<Record<string, boolean> | null>(null);
  const detOpen = detLocal || detStored || {};
  const setDetOpenBoth = (v: Record<string, boolean>) => {
    setDetLocal(v);
    setDetStored(v).catch(() => { /* yalnız görünüm durumu */ });
  };

  const reload = useCallback(async (id: string) => {
    setView({ k: 'yukleniyor' });
    try {
      const [d, p] = await Promise.all([loadDeck(plugin, id), plugin.storage.getSynced<Progress>(PROGRESS_KEY)]);
      setTitle(d.title);
      setDeck(d.cards);
      setProgress(p || {});
      setView(d.cards.length ? { k: 'baslangic' } : { k: 'hata', msg: 'Bu belgede "Detaylar" alt başlıklı kelime kartı bulunamadı.' });
    } catch (e) {
      setView({ k: 'hata', msg: 'Kartlar okunamadı: ' + (e instanceof Error ? e.message : String(e)) });
    }
  }, [plugin]);

  useEffect(() => {
    (async () => {
      const ctx = await plugin.widget.getWidgetContext<WidgetLocation.Popup>();
      const id = ctx?.contextData?.docId || '';
      if (!id) { setView({ k: 'hata', msg: 'Hangi belgenin açılacağı bilinmiyor. Belgedeki "Öğren" düğmesini kullanın.' }); return; }
      setDocId(id);
      await reload(id);
    })();
  }, [plugin, reload]);

  const newWords = pickLesson(deck, (c) => c.historyCount === null || c.historyCount > 0, LESSON_SIZE);
  const dersNo = (progress[docId]?.ders || 0) + 1;
  const s = sess.current;
  const st: Step | undefined = s && !s.done ? s.current : undefined;

  // Tanıtım açılınca kelime bir kez okunur.
  const stepKey = s ? `${s.idx}:${st?.kind}:${st?.word.remId}` : '';
  useEffect(() => {
    setTyped('');
    setHint(0);
    setUsedTiles([]);
    if (st?.kind === 'tanit') say(st.word.word);
    if (st?.kind === 'yaz') setTimeout(() => inputRef.current?.focus(), 30);
  }, [stepKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = (mode: 'kayit' | 'pratik', from = 0) => {
    const words = mode === 'kayit' ? newWords : deck.slice(from, from + LESSON_SIZE);
    if (!words.length) return;
    sess.current = new Session(words, deck, Math.random, mode);
    if (mode === 'pratik') setPracticeFrom(from);
    setView({ k: 'ders' });
    rerender();
  };

  const quit = () => { sess.current = null; setView({ k: 'baslangic' }); };

  const advance = () => {
    const ss = sess.current;
    if (!ss) return;
    ss.next();
    if (ss.done) setView({ k: 'ozet' });
    rerender();
  };

  const answer = (given: string) => {
    const ss = sess.current;
    if (!ss || ss.answered) return;
    ss.answer(given);
    say(ss.current.word.word);
    rerender();
  };

  const doSave = async () => {
    const ss = sess.current;
    if (!ss || view.k !== 'ozet' || view.saving || view.result) return;
    const plan = ss.savePlan();
    if (!plan) return;
    setView({ k: 'ozet', saving: true });
    const result = await saveGrades(saveApi(plugin), plan);
    if (result.saved.length) {
      try {
        const cur = (await plugin.storage.getSynced<Progress>(PROGRESS_KEY)) || {};
        const nx = nextProgress(cur, docId, Date.now());
        await plugin.storage.setSynced(PROGRESS_KEY, nx);
        setProgress(nx);
      } catch { /* ilerleme sayacı yalnız görünüm içindir */ }
    }
    setView({ k: 'ozet', result });
  };

  const header = (sub: string) => {
    const total = s ? s.steps.length : 1;
    const doneN = s ? Math.min(s.idx, total) : 0;
    const wordSteps = s && st ? s.steps.filter((x) => x.wordIdx === st.wordIdx && !x.retry) : [];
    const pos = st ? wordSteps.indexOf(st) : -1;
    return (
      <>
        <div className="top">
          <span className="t">Öğren · {title || 'belge'}</span>
          <span className="s">{sub}</span>
          {view.k === 'ders' ? <button className="x" onClick={quit} title="Hiçbir şey kaydedilmez">↺ Bırak (kayıt yok)</button> : null}
          <button className="x" style={view.k === 'ders' ? { marginLeft: 0 } : undefined} onClick={() => void plugin.widget.closePopup()} title="Kapat; kaydedilmemiş ders yazılmaz">✕ Kapat</button>
        </div>
        <div className="bar"><i style={{ width: (view.k === 'ozet' ? 100 : (doneN / total) * 100) + '%' }} /></div>
        {view.k === 'ders' && st && !st.retry ? (
          <div className="dots">{wordSteps.map((x, k) => <div key={k} className={'dot' + (k < pos ? ' ok' : k === pos ? ' on' : '')} />)}</div>
        ) : null}
      </>
    );
  };

  const feedback = (step: Step) => {
    const a = s?.answered;
    if (!a) return null;
    const w = step.word;
    if (a.ok) return <div className="fb ok">✓ Doğru.{step.kind === 'bosluk' && step.blank?.source === 'dizi' ? ' Dizideki cümlenin kendisi.' : ''}</div>;
    return (
      <div className="fb bad">
        {step.kind === 'yaz' ? <>✗ Senin cevabın: <b>{a.given || '—'}</b><br /></> : '✗ '}
        Doğrusu: <b>{step.correct}</b>{step.correct !== w.word ? <> · <b>{w.word}</b></> : null} {w.ipa} {w.okunus ? `(${w.okunus})` : ''}
        {!step.retry ? <><br />Bu soru ders sonunda bir kez daha gelecek.</> : null}
      </div>
    );
  };

  const nextBtn = (s?.answered ? <div className="btns"><button className="b go" autoFocus onClick={advance}>Devam →</button></div> : null);

  const choice = (step: Step) => (
    <>
      <div className="opts">
        {(step.options || []).map((o) => {
          const a = s?.answered;
          const cls = a ? (o === step.correct ? ' ok' : o === a.given ? ' bad' : '') : '';
          return <button key={o} className={'opt' + cls} disabled={!!a} onClick={() => answer(o)}>{o}</button>;
        })}
      </div>
      {feedback(step)}
      {nextBtn}
    </>
  );

  let body: React.ReactNode = null;
  if (view.k === 'yukleniyor') body = <><div className="top"><span className="t">Öğren</span></div><div className="stage muted">Kartlar okunuyor…</div></>;
  else if (view.k === 'hata') body = <><div className="top"><span className="t">Öğren</span></div><div className="stage"><div className="err">{view.msg}</div></div></>;
  else if (view.k === 'baslangic') {
    const studied = deck.filter((c) => (c.historyCount || 0) > 0).length;
    body = (
      <>
        {header(`${deck.length} kelime kartı · ${studied} tanesi çalışılmış`)}
        <div className="stage">
          {newWords.length ? (
            <>
              <div className="lbl">Ders {dersNo}</div>
              <div className="word" style={{ fontSize: 30, color: '#fff' }}>{newWords.length} yeni kelime</div>
              <div className="list">{newWords.map((w, i) => <React.Fragment key={w.remId}>{i ? ' · ' : ''}<b>{w.word}</b></React.Fragment>)}</div>
              <div className="box" style={{ marginTop: 16 }}>Sıra: her kelime için <b>tanıtım</b> → <b>4 şıktan anlam</b> → <b>dizi cümlesinde boşluk</b> → <b>kendin yaz</b>. Yanlış yapılan soru ders sonunda bir kez daha gelir. Ders sonunda "RemNote'a kaydet" derseniz sonuç kartların tekrar kaydına yazılır; yarıda bırakırsanız hiçbir şey yazılmaz.</div>
              <div className="btns">
                <button className="b ghost" onClick={() => start('pratik', 0)} title="Baştan, çalışılmış kelimelerle de; RemNote'a hiçbir şey yazmaz">Baştan pratik (kayıt yok)</button>
                <button className="b go" onClick={() => start('kayit')}>Derse başla →</button>
              </div>
            </>
          ) : (
            <>
              <div className="word" style={{ fontSize: 30, color: '#fff' }}>Yeni kelime kalmadı</div>
              <div className="muted" style={{ marginTop: 8 }}>Bu belgedeki bütün kartlar en az bir kez çalışılmış. Tekrarları RemNote'un kendi kuyruğu getirir.</div>
              <div className="btns"><button className="b go" onClick={() => start('pratik', 0)}>Baştan öğrenme turu (kayıt yok) →</button></div>
            </>
          )}
        </div>
      </>
    );
  } else if (view.k === 'ders' && s && st) {
    const w = st.word;
    const total = s.words.length;
    const label = s.mode === 'kayit' ? `Ders ${dersNo}` : 'Pratik (kayıt yok)';
    const qn = st.kind === 'tanit' ? 'tanıtım' : st.retry ? `tekrar · ${QNAME[st.kind]}` : `soru · ${QNAME[st.kind]}`;
    let stage: React.ReactNode = null;
    if (st.kind === 'tanit') {
      stage = (
        <>
          <div className="lbl">Yeni kelime</div>
          <div className="word">{w.word}<Speaker word={w.word} /></div>
          <div className="ipa">{w.ipa} {w.okunus ? <><span>· okunuşu</span> <b>{w.okunus}</b></> : null} <span>{w.tur ? `· ${w.tur}` : ''}{w.seviye ? ` · seviye ${w.seviye}` : ''}</span></div>
          <div className="mean">{w.meaning}</div>
          {w.context ? <div className="muted">{w.context}</div> : null}
          <div className="grid">
            <div className="col">
              {w.mnemonic.length ? <div className="box"><h4>Mnemonic</h4><Rich segs={w.mnemonic} /></div> : null}
              {w.sentence ? <div className="box"><h4>Dizide</h4><i><Marked text={w.sentence} target={w.sentenceTarget || w.word} /></i>{w.sentenceTr.length ? <><br /><span className="muted"><Rich segs={w.sentenceTr.map((x) => ({ ...x, tc: undefined }))} /></span></> : null}</div> : null}
              {w.example ? <div className="box"><h4>Örnek</h4>{w.example}</div> : null}
            </div>
            <div className="col">
              {w.image ? <CardImage rich={w.image.rich} /> : null}
              {w.gorselIpucu ? <div className="box"><h4>Görsel ipucu</h4>{w.gorselIpucu}</div> : null}
              {w.dizide ? <div className="box"><h4>Dizideki yeri</h4>{w.dizide}</div> : null}
            </div>
          </div>
          {/* Resim/hikâye önerisi yerel host (127.0.0.1:3400) ister: yalnız bilgisayarda, telefonda hiç istek atılmaz. */}
          {onDesktop ? <HafizaYardim key={w.remId} w={w} /> : null}
          <div className="btns">
            <button className="b ghost" onClick={() => { s.knowIt(); if (s.done) setView({ k: 'ozet' }); rerender(); }}>Zaten biliyorum</button>
            <button className="b go" onClick={advance}>Öğrendim, test et →</button>
          </div>
          <Details word={w} open={detOpen || {}} setOpen={setDetOpenBoth} />
        </>
      );
    } else if (st.kind === 'sec') {
      stage = <><div className="q">Doğru anlamı seç</div><div className="qw">{w.word} <Speaker word={w.word} /></div>{choice(st)}</>;
    } else if (st.kind === 'bosluk') {
      const hintTr = st.blank?.source === 'dizi' ? w.sentenceTr.map((x) => x.text).join('') : st.blank?.hint || '';
      stage = (
        <>
          <div className="q">{st.blank?.source === 'dizi' ? 'Dizideki cümlede boşluğa hangi kelime gelir?' : 'Örnek cümlede boşluğa hangi kelime gelir?'}</div>
          <div className="qs"><i>{st.blank?.text}</i>{hintTr ? <div className="tr">{hintTr}</div> : null}</div>
          {choice(st)}
        </>
      );
    } else if (st.kind === 'yaz') {
      const check = () => { if (!s.answered) answer(typed); else advance(); };
      const tiles = letterTiles(w.word);
      // Kelimedeki boşluk ve tireler kendiliğinden eklenir; kullanıcı yalnız harfleri dizer.
      const withSeparators = (txt: string) => {
        let out = txt;
        while (out.length < w.word.length && (w.word[out.length] === ' ' || w.word[out.length] === '-')) out += w.word[out.length];
        return out;
      };
      const tapTile = (i: number) => {
        if (s.answered || usedTiles.includes(i)) return;
        setUsedTiles([...usedTiles, i]);
        setTyped(withSeparators(withSeparators(typed) + tiles[i]));
      };
      const backspace = () => {
        if (s.answered) return;
        setUsedTiles(usedTiles.slice(0, -1));
        let t = typed.replace(/[\s-]+$/, '');
        t = t.slice(0, -1);
        setTyped(t);
      };
      stage = (
        <>
          <div className="q">İngilizcesini yaz</div>
          <div className="qw">{w.meaning}</div>
          <input
            ref={inputRef}
            className="ty"
            value={typed}
            readOnly={!!s.answered}
            placeholder="Harflere tıkla, ya da yaz / sesle söyle ve Enter"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => { setTyped(e.target.value); setUsedTiles([]); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); check(); } }}
          />
          {!s.answered ? (
            <div className="tiles">
              {tiles.map((c, i) => <button key={i} className={'tile' + (usedTiles.includes(i) ? ' used' : '')} disabled={usedTiles.includes(i)} onClick={() => tapTile(i)}>{c}</button>)}
              <button className="tile ctl" onClick={backspace} title="Son harfi sil">⌫ Sil</button>
            </div>
          ) : null}
          {feedback(st)}
          <div className="btns">
            {!s.answered ? <button className="b ghost" onClick={() => answer('')} title="Yanlış sayılır; soru ders sonunda bir kez daha gelir">Bilmiyorum, göster</button> : null}
            {!s.answered ? <button className="b ghost" onClick={() => { const h = Math.min(hint + 1, w.word.length); setHint(h); setTyped(w.word.slice(0, h)); setUsedTiles([]); inputRef.current?.focus(); }}>İpucu (bir harf)</button> : null}
            <button className="b go" onClick={check}>{s.answered ? 'Devam →' : 'Kontrol et'}</button>
          </div>
        </>
      );
    }
    body = <>{header(`${label} · kelime ${st.wordIdx + 1}/${total} · ${qn}`)}<div className="stage">{stage}</div></>;
  } else if (view.k === 'ozet' && s) {
    const grades: Grade[] = s.grades();
    const r = view.result;
    const kayit = s.mode === 'kayit';
    body = (
      <>
        {header(kayit ? `Ders ${dersNo} · bitti` : 'Pratik · bitti')}
        <div className="stage">
          <div className="word" style={{ fontSize: 30, color: '#fff' }}>{kayit ? 'Ders tamamlandı 🎉' : 'Pratik tamamlandı'}</div>
          <div className="sum">
            {grades.map((g) => (
              <div className="row" key={g.remId}>
                <span className="w">{g.word}</span><span className="r">{g.reason}</span>
                <span className="g" style={{ color: kayit ? GRADE_COLOR[g.label] : 'var(--mut)' }}>{kayit ? `→ ${g.label === 'EASY' ? 'Easy' : g.label === 'GOOD' ? 'Good' : 'Hard'}` : 'kayıt yok'}</span>
              </div>
            ))}
          </div>
          {kayit ? (
            r ? (
              <>
                {r.saved.length ? <div className="okbox">RemNote'a yazıldı: <b>{r.saved.join(', ')}</b>. Sonraki tekrar gününü RemNote kendisi hesaplar.</div> : null}
                {r.skipped.length ? <div className="box" style={{ marginTop: 14 }}>Atlandı (bu arada başka yerde çalışılmış, çift yazılmadı): <b>{r.skipped.join(', ')}</b></div> : null}
                {r.failed.length ? <div className="err">Yazılamadı: {r.failed.map((f) => <div key={f.word}><b>{f.word}</b> — {f.error}</div>)}</div> : null}
                <div className="btns"><button className="b go" onClick={() => { sess.current = null; void reload(docId); }}>Sonraki ders →</button></div>
              </>
            ) : (
              <>
                <div className="box" style={{ marginTop: 16 }}>Bu notlar <b>RemNote'un tekrar kaydına</b> yazılır; sonraki tekrar gününü RemNote kendisi hesaplar. Kaydetmeden çıkarsanız hiçbir şey yazılmaz.</div>
                <div className="btns">
                  <button className="b ghost" disabled={view.saving} onClick={quit}>Kaydetmeden çık</button>
                  <button className="b go" disabled={view.saving} onClick={() => void doSave()}>{view.saving ? 'Kaydediliyor…' : "RemNote'a kaydet ve sonraki ders →"}</button>
                </div>
              </>
            )
          ) : (
            <div className="btns">
              <button className="b ghost" onClick={quit}>Başa dön</button>
              {practiceFrom + LESSON_SIZE < deck.length ? <button className="b go" onClick={() => start('pratik', practiceFrom + LESSON_SIZE)}>Sonraki {LESSON_SIZE} (kayıt yok) →</button> : null}
            </div>
          )}
        </div>
      </>
    );
  }

  // Popup ekrandan uzun olursa içeride kaydırılır. RemNote'un resim katmanları (fake embed) yerlerini
  // yalnız DOM değişince yeniden ölçer; kaydırırken kökte bir öznitelik değiştirip ölçümü tetikliyoruz
  // (Eisenhower panosundaki aynı yöntem).
  const maxH = Math.max(480, Math.round(((typeof window !== 'undefined' && window.screen?.availHeight) || 900) * 0.8));
  const onScroll = () => { const el = rootRef.current; if (el) el.setAttribute('data-scroll', String((scrollTick.current += 1))); };

  return (
    <div className="og" ref={rootRef}>
      <style>{CSS}</style>
      <div className="scroll" style={{ maxHeight: maxH }} onScroll={onScroll}>{body}</div>
    </div>
  );
}

renderWidget(Ogren);
