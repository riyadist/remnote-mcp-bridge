'use strict';
// Öğren (learn-then-test) ekranının mantığı: kart ayrıştırıcı, ders motoru,
// şık üretimi ve RemNote'a kayıt yolu. Sahte SDK nesneleriyle; canlı RemNote'a yazmaz.
// Örnek veri test_ogren_fixture.json: canlı kartların salt okunur dökümü (2026-11-18).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { buildSync } = require('esbuild');

function load(file) {
  const bundle = buildSync({
    entryPoints: [path.join(__dirname, 'src', 'ogren', file)],
    bundle: true, write: false, platform: 'node', format: 'cjs',
    external: ['@remnote/plugin-sdk'],
  }).outputFiles[0].text;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', bundle)(mod, mod.exports, require);
  return mod.exports;
}
const P = load('parse.ts');
const L = load('lesson.ts');
const FX = JSON.parse(fs.readFileSync(path.join(__dirname, 'test_ogren_fixture.json'), 'utf8')).cards;

// Tekrarlanabilir rastgele sayı üreteci (testte sonuç sabit kalsın).
function rng(seed = 7) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// ---------- Ayrıştırıcı ----------

test('Israelites (eski şablon): bütün tanıtım alanları gerçek karttan', () => {
  const c = P.parseCard(FX.Israelites);
  assert.ok(c);
  assert.equal(c.remId, 'lzwRLNeg35ZysWWjY');
  assert.equal(c.word, 'Israelites');
  assert.equal(c.ipa, '/ˈɪzrəlaɪts/');
  assert.equal(c.okunus, 'İZ-rı-layts');
  assert.equal(c.tur, 'isim');
  assert.equal(c.seviye, 'B1 · orta');
  assert.equal(c.meaning, 'İsrail halkı, İsrailoğulları');
  assert.equal(c.context, 'Tarihsel ve dini anlamda İsrail halkı, yani İsrailoğulları.');
  assert.equal(P.plain(c.mnemonic), '"İsra elitleri" = İsra adlı lider, cüppeli elit kalabalığı çölde omuz omuza yürütüyor. = Israelites; İsrailoğulları, tarihsel/dini İsrail halkı');
  assert.equal(c.gorselIpucu, 'Çölde uzun bir kervan halinde, sırtında yükleriyle birlikte yürüyen kalabalık bir halk.');
  assert.equal(c.example, 'The Israelites crossed the desert. = İsrailoğulları çölü geçti.');
  assert.equal(c.sentence, "You're talking about the Israelites.");
  assert.equal(c.sentenceTarget, 'Israelites');
  assert.equal(P.plain(c.sentenceTr), 'İSRAİLOĞULLARINDAN bahsediyorsun.');
  assert.match(c.dizide, /^Euphoria'da gençlerin/);
  assert.equal(c.image, null, 'Israelites kartında görsel yok');
});

test('Israelites: Context Translator bölümündeki metinler alanlara karışmaz', () => {
  const c = P.parseCard(FX.Israelites);
  assert.ok(!/MNEMONIC|GORSEL/.test(P.plain(c.mnemonic) + c.gorselIpucu));
});

test('patties: kartın "Görsel" bölümündeki ilk resim bulunur; tür çoğul', () => {
  const c = P.parseCard(FX.patties);
  assert.ok(c.image);
  assert.equal(c.image.remId, 'usonMTOHSKA8XFd9C');
  assert.equal(c.image.rich[0].i, 'i');
  assert.match(c.image.rich[0].url, /^%LOCAL_FILE%/);
  assert.equal(c.tur, 'isim (çoğul)');
  assert.equal(c.meaning, 'Yassı köfteler');
});

test('parish (yeni şablon v2): "Kelime, telaffuz ve seviye" üç satırı', () => {
  const c = P.parseCard(FX.parish);
  assert.equal(c.word, 'parish');
  assert.equal(c.ipa, '/ˈpærɪʃ/');
  assert.equal(c.okunus, 'pe-riş');
  assert.equal(c.tur, 'isim');
  assert.equal(c.seviye, 'C1 · ileri');
  assert.equal(c.meaning, 'Köy, mahalle halkı');
  assert.equal(c.sentence, 'the prettiest girls in the parish.');
  assert.equal(c.sentenceTarget, 'parish');
});

test("homestead's: telaffuz satırındaki ek açıklama okunuşu bozmaz", () => {
  const c = P.parseCard(FX.homesteads);
  assert.equal(c.ipa, '/ˈhoʊmstɛdz/');
  assert.equal(c.okunus, 'HOUM-stedz');
  assert.equal(c.tur, 'isim');
});

test('kelime kartı tanıma: ilk çocuğu "Detaylar" olan', () => {
  assert.equal(P.isVocabFirstChild('Detaylar'), true);
  assert.equal(P.isVocabFirstChild(' detaylar '), true);
  assert.equal(P.isVocabFirstChild('Bağlam'), false);
  assert.equal(P.parseCard([{ remId: 'x', parentId: null, depth: 0, order: 0, rawText: ['boş'], backText: null, childCount: 0 }]), null);
});

test('belgede en az 3 kelime kartı: erken durur, fazla okumaz', async () => {
  const ids = Array.from({ length: 100 }, (_, i) => 'R' + i);
  const asked = [];
  const api = {
    async childIds() { return ids; },
    async firstChildTexts(batch) { asked.push(...batch); return batch.map((id) => (['R0', 'R2', 'R5'].includes(id) ? 'Detaylar' : 'x')); },
  };
  assert.equal(await P.hasVocabCards(api, 'DOC', 3), true);
  assert.ok(asked.length < 100, 'bütün çocuklar okunmamalı');
  const api2 = { async childIds() { return ['A', 'B']; }, async firstChildTexts(b) { return b.map(() => 'Detaylar'); } };
  assert.equal(await P.hasVocabCards(api2, 'DOC', 3), false);
});

// ---------- Kart detayları (tanıtım ekranının altındaki açılır bölümler) ----------

const SABLON = ['Cümle çevirisi', 'Cümle', 'Bağlamdaki anlamı', 'Genel anlamları', 'Kelime ve telaffuz', 'Açıklama',
  'İngilizce eş anlamlılar', 'Etimoloji', 'Phrasal verb ve fiil kalıpları', 'Doğal kalıplar', 'Mnemonic', 'Görsel ipucu',
  'Örnek cümle', 'Seviye', 'Dizideki yeri', 'Kaynak', 'Context Translator cevabı'];

test('detaylar: bütün başlıklar şablon sırasıyla, içerik biçimiyle; Context Translator en sonda', () => {
  const c = P.parseCard(FX.Israelites);
  assert.deepEqual(c.details.map((d) => d.title), SABLON);
  const dk = c.details.find((d) => d.title === 'Doğal kalıplar');
  assert.equal(dk.items.length, 3);
  const bag = c.details.find((d) => d.title === 'Bağlamdaki anlamı').items[0].segs;
  assert.deepEqual(bag.filter((s) => s.b).map((s) => [s.text, s.tc]), [['İsrail halkı', 3], ['İsrailoğulları', 3]]);
  const cumle = c.details.find((d) => d.title === 'Cümle').items[0].segs;
  assert.ok(cumle.every((s) => s.l), 'altyazı cümlesi italik kalır');
  const et = c.details.find((d) => d.title === 'Etimoloji').items[0].segs;
  assert.ok(et.some((s) => s.tc === '#d98ba3'), 'gül kurusu renk korunur');
  const ct = c.details.at(-1);
  assert.equal(ct.title, 'Context Translator cevabı');
  assert.match(P.plain(ct.items[0].segs), /CUMLE CEVIRISI:/);
});

test('detaylar: v2 şablonu ve şablon dışı "Görsel" bölümü (Context Translator yine en sonda)', () => {
  const pa = P.parseCard(FX.parish);
  assert.equal(pa.details[4].title, 'Kelime, telaffuz ve seviye');
  assert.equal(pa.details.at(-1).title, 'Context Translator cevabı');
  const pt = P.parseCard(FX.patties);
  const titles = pt.details.map((d) => d.title);
  assert.equal(titles.at(-1), 'Context Translator cevabı');
  assert.equal(titles.at(-2), 'Görsel');
  const img = pt.details.at(-2).items.find((i) => i.image);
  assert.equal(img.remId, 'usonMTOHSKA8XFd9C');
});

// ---------- Toplu ağaç okuma (kart başına ayrı okuma yerine kat kat findMany) ----------

test('toplu okuma: birçok kart birkaç findMany çağrısıyla; ayrıştırma sonucu aynı; Context Translator içeriği de okunur', async () => {
  const F = load('forest.ts');
  const rems = new Map();
  for (const nodes of Object.values(FX)) {
    for (const n of nodes) {
      const kids = nodes.filter((k) => k.parentId === n.remId).sort((a, b) => a.order - b.order).map((k) => k.remId);
      rems.set(n.remId, { _id: n.remId, text: n.rawText, backText: n.backText, children: kids });
    }
  }
  const asked = [];
  let calls = 0;
  const api = { async findMany(ids) { calls++; asked.push(...ids); return ids.map((id) => rems.get(id)).filter(Boolean); } };
  const roots = Object.values(FX).map((n) => n[0].remId);
  const forest = await F.readForest(api, roots, 3);
  assert.ok(calls <= 4, 'kat başına bir çağrı: ' + calls);
  for (const [name, nodes] of Object.entries(FX)) {
    assert.deepEqual(P.parseCard(forest.get(nodes[0].remId)), P.parseCard(nodes), name);
  }
  const ctHeading = FX.Israelites.find((n) => P.plain(n.rawText) === 'Context Translator cevabı');
  const ctContent = FX.Israelites.find((n) => n.parentId === ctHeading.remId);
  assert.ok(asked.includes(ctContent.remId), 'Context Translator içeriği detaylarda gösterilir, okunmalı');
});

// ---------- Boşluk sorusu cümlesi ----------

test('boşluk: dizi cümlesi kelimeyi içeriyorsa o; içermiyorsa örnek cümle; ikisi de yoksa yok', () => {
  const isr = L.blankFor(P.parseCard(FX.Israelites));
  assert.equal(isr.text, "You're talking about the ______.");
  assert.equal(isr.answer, 'Israelites');
  assert.equal(isr.source, 'dizi');
  const pat = L.blankFor(P.parseCard(FX.patties));
  assert.equal(pat.source, 'ornek', 'patties cümlesi "-Yeah" kelimeyi içermiyor');
  assert.ok(pat.text.includes('______'));
  assert.ok(!/patties/i.test(pat.text));
  assert.equal(L.blankFor({ word: 'zzz', sentence: 'no', sentenceTarget: '', example: 'none = yok' }), null);
});

// ---------- Şık üretimi ----------

test('şıklar: doğru cevap tam 1 kez, tekrarsız, doğruya eşit yanlış şık yok', () => {
  const pool = ['Popo, kalça', 'popo,  kalça', 'Tazminat', 'Gözaltı', 'İsrailoğulları', 'Eşik', 'Muhbir'];
  for (let seed = 1; seed < 40; seed++) {
    const o = L.buildChoices('İsrailoğulları', pool, rng(seed));
    assert.equal(o.length, 4);
    assert.equal(o.filter((x) => x === 'İsrailoğulları').length, 1);
    const norm = o.map((x) => x.toLowerCase().replace(/\s+/g, ' '));
    assert.equal(new Set(norm).size, 4, 'tekrarsız: ' + o.join(' | '));
  }
});

test('şıklar: yeterli farklı yanlış şık yoksa olan kadar; hiç yoksa soru yok (null)', () => {
  assert.deepEqual(L.buildChoices('a', ['b', 'B', 'a'], rng()).map((x) => x.toLowerCase()).sort(), ['a', 'b']);
  assert.equal(L.buildChoices('a', ['a', ' A '], rng()), null);
});

// ---------- Ders seçimi ----------

const mk = (word, meaning, extra = {}) => ({
  remId: 'id-' + word, word, meaning, ipa: '/x/', okunus: 'x', tur: 'isim', seviye: '',
  context: '', mnemonic: [], gorselIpucu: '', example: '', sentence: `I said ${word} today.`,
  sentenceTarget: word, sentenceTr: [], dizide: '', image: null, ...extra,
});
const DECK = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf'].map((w, i) => mk(w, 'anlam' + i));

test('ders: belge sırasıyla hiç çalışılmamış ilk 5 kelime', () => {
  const studied = new Set(['id-alpha', 'id-delta']);
  const lesson = L.pickLesson(DECK, (c) => studied.has(c.remId), 5);
  assert.deepEqual(lesson.map((c) => c.word), ['bravo', 'charlie', 'echo', 'foxtrot', 'golf']);
  assert.deepEqual(L.pickLesson(DECK, () => true, 5), [], 'yeni kelime kalmadı');
});

// ---------- Ders motoru ----------

function session(words, mode = 'kayit') {
  return new L.Session(words, DECK, rng(3), mode);
}
function answerAll(s, correctFn) {
  let guard = 0;
  while (!s.done && guard++ < 200) {
    const st = s.current;
    if (st.kind === 'tanit') s.next();
    else { s.answer(correctFn(st) ? st.correct : '__yanlis__'); s.next(); }
  }
}

test('akış: kelimeler karışmadan sırayla — tanıtım, seç, boşluk, yaz', () => {
  const s = session(DECK.slice(0, 2));
  const kinds = s.steps.map((x) => `${x.word.word}:${x.kind}`);
  assert.deepEqual(kinds, ['alpha:tanit', 'alpha:sec', 'alpha:bosluk', 'alpha:yaz', 'bravo:tanit', 'bravo:sec', 'bravo:bosluk', 'bravo:yaz']);
});

test('boşluk cümlesi yoksa o soru atlanır', () => {
  const w = mk('hotel', 'otel', { sentence: '-Yeah', example: '' });
  const s = new L.Session([w], DECK, rng(1), 'kayit');
  assert.deepEqual(s.steps.map((x) => x.kind), ['tanit', 'sec', 'yaz']);
});

test('yanlış yapılan soru ders sonunda bir kez daha sorulur (yeniden yanlışta tekrar eklenmez)', () => {
  const s = session(DECK.slice(0, 2));
  s.next(); // alpha tanıtım
  assert.equal(s.current.kind, 'sec');
  s.answer('__yanlis__'); s.next();
  const base = 8;
  assert.equal(s.steps.length, base + 1);
  const last = s.steps[s.steps.length - 1];
  assert.equal(last.kind, 'sec'); assert.equal(last.word.word, 'alpha'); assert.equal(last.retry, true);
  // geri kalanı doğru, tekrar sorusunu da yanlış cevapla
  while (!s.done) {
    const st = s.current;
    if (st.kind === 'tanit') { s.next(); continue; }
    s.answer(st.retry ? '__yanlis__' : st.correct); s.next();
  }
  assert.equal(s.steps.length, base + 1, 'tekrar sorusu ikinci kez eklenmez');
});

test('yazma cevabı: büyük/küçük harf, baş/son boşluk ve kesme işareti duyarsız', () => {
  assert.equal(L.typedMatches('  ISRAELITES ', 'Israelites'), true);
  assert.equal(L.typedMatches('homestead’s', "homestead's"), true);
  assert.equal(L.typedMatches('Israelite', 'Israelites'), false);
});

test('notlandırma: zaten biliyorum EASY, hepsi ilk denemede doğru GOOD, en az bir yanlış HARD', () => {
  const s = session(DECK.slice(0, 3));
  // alpha: zaten biliyorum
  assert.equal(s.current.kind, 'tanit');
  s.knowIt();
  assert.equal(s.current.word.word, 'bravo');
  assert.equal(s.current.kind, 'tanit');
  answerAll(s, (st) => !(st.word.word === 'charlie' && st.kind === 'yaz' && !st.retry));
  const plan = s.savePlan();
  assert.deepEqual(plan.map((g) => [g.word, g.score, g.label]), [
    ['alpha', 1.5, 'EASY'], ['bravo', 1, 'GOOD'], ['charlie', 0.5, 'HARD'],
  ]);
  assert.deepEqual(L.SCORE, { EASY: 1.5, GOOD: 1, HARD: 0.5 });
});

test('yarıda çıkış: ders bitmeden kayıt planı yok, yazma çağrısı yok', async () => {
  const s = session(DECK.slice(0, 2));
  s.next(); s.answer(s.current.correct); s.next();
  assert.equal(s.done, false);
  assert.equal(s.savePlan(), null);
  const calls = [];
  const api = { async forwardCard(id) { calls.push(id); return null; } };
  const r = await L.saveGrades(api, s.savePlan());
  assert.deepEqual(calls, []);
  assert.deepEqual(r, { saved: [], skipped: [], failed: [] });
});

test('pratik turu (kayıtsız): ders bitse de kayıt planı yok', () => {
  const s = session(DECK.slice(0, 1), 'pratik');
  answerAll(s, () => true);
  assert.equal(s.done, true);
  assert.equal(s.savePlan(), null);
});

test('kayıt: kart yeniden okunur; geçmişi doluysa yazılmaz (çift yazma yok); hata kelimeyle bildirilir', async () => {
  const calls = [];
  const cards = {
    'id-alpha': { history: [] },
    'id-bravo': { history: [{ score: 1 }] },
    'id-charlie': { history: [], fail: true },
  };
  const api = {
    async forwardCard(remId) {
      calls.push(['read', remId]);
      const c = cards[remId];
      if (!c) return null;
      return {
        id: 'card-' + remId, history: c.history,
        async update(score) { calls.push(['write', remId, score]); if (c.fail) throw new Error('kilit'); },
      };
    },
  };
  const plan = [
    { remId: 'id-alpha', word: 'alpha', score: 1, label: 'GOOD' },
    { remId: 'id-bravo', word: 'bravo', score: 1.5, label: 'EASY' },
    { remId: 'id-charlie', word: 'charlie', score: 0.5, label: 'HARD' },
    { remId: 'id-yok', word: 'yok', score: 1, label: 'GOOD' },
  ];
  const r = await L.saveGrades(api, plan);
  assert.deepEqual(r.saved, ['alpha']);
  assert.deepEqual(r.skipped, ['bravo']);
  assert.deepEqual(r.failed.map((f) => f.word), ['charlie', 'yok']);
  assert.match(r.failed[0].error, /kilit/);
  assert.deepEqual(calls.filter((c) => c[0] === 'write'), [['write', 'id-alpha', 1], ['write', 'id-charlie', 0.5]]);
  // sırayla: her kelime önce okunur, sonra (gerekirse) yazılır
  assert.deepEqual(calls.slice(0, 2), [['read', 'id-alpha'], ['write', 'id-alpha', 1]]);
});

test('ilerleme kaydı: yalnız ders numarası, belge başına', () => {
  const p0 = {};
  const p1 = L.nextProgress(p0, 'DOC', 1000);
  assert.deepEqual(p1, { DOC: { ders: 1, son: 1000 } });
  assert.deepEqual(L.nextProgress(p1, 'DOC', 2000).DOC, { ders: 2, son: 2000 });
  assert.deepEqual(p0, {}, 'eski nesne değişmez');
});

// ---- Hafıza yardımı: yalnız ekleme, doğru yere ----
const H = load('hafiza.ts');
test('hafıza: resim/hikâye kendi başlığının altına, yoksa Detaylar altına eklenir', async () => {
  assert.equal(H.targetParent({ detay: 'D', gorsel: 'G', mnemonic: 'M' }, 'resim'), 'G');
  assert.equal(H.targetParent({ detay: 'D', gorsel: 'G', mnemonic: 'M' }, 'hikaye'), 'M');
  assert.equal(H.targetParent({ detay: 'D' }, 'resim'), 'D');
  const calls = [];
  const api = { appendChild: async (p, r) => { calls.push([p, r]); return 'yeni'; } };
  assert.equal(await H.addToCard(api, { detay: 'D', mnemonic: 'M' }, 'hikaye', H.mnemonicRich('dik nöbet = asker dimdik = dignity; baglamdaki anlam')), 'yeni');
  assert.deepEqual(calls, [['M', ['🧠 ', 'dik nöbet = asker dimdik = dignity']]]);
  await assert.rejects(() => H.addToCard(api, undefined, 'resim', []), /Detaylar/);
});
test('hafıza: resim satırı https adresi + kaynak/lisans notu; başka adres reddedilir', () => {
  const r = H.imageRich({ imageUrl: 'https://upload.wikimedia.org/a.jpg', license: 'CC BY-SA 4.0', creator: 'X' });
  assert.deepEqual(r[0], { i: 'i', url: 'https://upload.wikimedia.org/a.jpg', width: 360 });
  assert.match(r[2].text, /Wikimedia · CC BY-SA 4\.0 · X/);
  assert.throws(() => H.imageRich({ imageUrl: 'javascript:alert(1)' }), /Geçersiz/);
});
test('ayrıştırıcı: ekleme yerleri (anchors) gerçek kartta bulunur', () => {
  const c = P.parseCard(FX.Israelites);
  assert.ok(c && c.anchors.detay, 'Detaylar kimliği');
});
