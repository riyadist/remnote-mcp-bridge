const { normalizeIntentText, isShortContinuationQuestion } = require('./topic-chat-followup.cjs');

const SCENE_IDENTITY_PATTERNS = [
  /\b(?:sahnedeki|sahnedki|buradaki|ekrandaki|goruntudeki|soldaki|sagdaki)\s+(?:bu\s+)?(?:kadin|adam|kisi|karakter|cocuk)\b.{0,35}\bkim(?:di|dir)?\b/,
  /\b(?:bu|o)\s+(?:kadin|adam|kisi|karakter)\s+kim(?:di)?\b/,
  /\bkimdi\s+bu\b/,
  /\bhangi\s+karakter\b/,
  /\bkimden\s+bahsediyor\b/,
  /^(?:bu\s+)?kim(?:di)?$/,
];

const SCENE_EXPLANATION_PATTERNS = [
  /\b(?:sahne|sahneyi|sahnede|sahnenin|sahnedeki|sahnedki|filmde|dizide|goruntude|ekranda)\b/,
  /\bbu sahnede ne oluyor\b/,
  /\bburada ne oluyor\b/,
  /\b(?:burada|burdaki|buradaki)\s+(?:asil\s+)?(?:olay|mesele|amac)\b/,
  /\bbu sahne(?:yi|nin)?\b.{0,70}\b(?:anlat|acikla|olayi|baglami|ne oluyor)\b/,
  /\bsahne(?:nin)?\b.{0,70}\b(?:olayi|baglami)\s+ne\b/,
  /\bbu (?:soz|replik)\b.{0,70}\bneden (?:soyleniyor|soylendi|diyor)\b/,
];

const CONTEXTUAL_PATTERNS = [
  /\bbu cumlede\b/,
  /\bburada\b.{0,70}\b(?:ne demek|ne anlama|neden boyle|nasil kullan)/,
  /\b(?:ifade|kelime|kalip)\b.{0,70}\b(?:ne demek|ne anlama|neden boyle|nasil kullan)/,
  /\b(?:yazar|konusmaci)\b.{0,70}\b(?:ne demek|neyi kast|neden soyle)/,
  /\bbu anlamda\b/,
  /\bbu kullanim\b/,
];

const LEXICAL_PATTERNS = [
  /\b(?:ne demek|anlami ne|turkcesi ne)\b/,
  /\b(?:es anlam|zit anlam|benzer kelime|farki ne)\b/,
  /\b(?:ornek cumle|dogal ornek|nasil kullanilir)\b/,
  /\b(?:phrasal verb|fiil kalibi|dil bilgisi)\b/,
];

const FACTUAL_QUESTION_PATTERNS = [
  /^(?:neden|nasil|nicin)\b/,
  /\b(?:neden|nicin)\b/,
  /\b(?:sebebi|nedeni)\s+ne\b/,
  /\bgercekte\b.{0,80}\b(?:neden|nasil)\b/,
];

function hasVideoContext(scene) {
  if (!scene || typeof scene !== 'object') return false;
  return Boolean(scene.mediaPath || /llplayer|youtube|netflix|video/i.test(String(scene.source || '')) ||
    (scene.timestamp && /(?:s\d{1,2}e\d{1,2}|\d{1,2}x\d{1,2})/i.test(String(scene.mediaTitle || ''))));
}

function classifyTopicChatIntent(question, messages = [], scene = null) {
  const normalized = normalizeIntentText(question);
  if (!normalized) {
    return { kind: 'general', reason: 'empty_question' };
  }
  if (/\b(?:konudan bagimsiz|filmden bagimsiz|diziden bagimsiz)\b/.test(normalized)) {
    return { kind: 'world_knowledge', reason: 'explicit_topic_change' };
  }
  if (SCENE_IDENTITY_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return { kind: 'scene_identity', reason: 'person_or_character_identity' };
  }
  if (hasVideoContext(scene) && /\b(?:ne demek istiyor|ne demeye calisiyor|neyi kastediyor)\b/.test(normalized)) {
    return { kind: 'scene_explanation', reason: 'character_intention' };
  }
  if (/\b(?:sahnede|filmde|dizide)\b/.test(normalized) && LEXICAL_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return { kind: 'contextual_usage', reason: 'scene_language_question' };
  }
  if (SCENE_EXPLANATION_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return { kind: 'scene_explanation', reason: 'scene_event_or_line_purpose' };
  }
  if (isShortContinuationQuestion(question) || /^(?:daha detayli|detaylandir|biraz daha anlat|peki neden|neden|aralarindaki iliski ne)$/.test(normalized)) {
    const priorUsers = Array.isArray(messages) ? messages.filter((item) => item?.role === 'user').slice(-6) : [];
    for (const message of priorUsers.reverse()) {
      const prior = classifyTopicChatIntent(message.content);
      if (prior.kind.startsWith('scene_')) return { kind: 'scene_explanation', reason: 'scene_followup' };
      if (prior.kind !== 'general') break;
    }
  }
  if (CONTEXTUAL_PATTERNS.some((pattern) => pattern.test(normalized)) &&
      (!hasVideoContext(scene) || /\b(?:kelime|kalip|ifade|cumlede|kullanim|turkce|ingilizce)\b/.test(normalized))) {
    return { kind: 'contextual_usage', reason: 'explicit_context_language' };
  }
  if (LEXICAL_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return { kind: 'lexical', reason: 'explicit_language_question' };
  }
  if (/\b(?:genel olarak|bilimsel olarak|gercekte)\b/.test(normalized)) {
    return { kind: 'world_knowledge', reason: 'explicit_general_question' };
  }
  // The active video defines the conversation, not a magic word in each new question.
  if (hasVideoContext(scene)) {
    return { kind: 'scene_explanation', reason: 'active_video_conversation' };
  }
  if (FACTUAL_QUESTION_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return { kind: 'world_knowledge', reason: 'causal_or_process_question' };
  }
  return { kind: 'general', reason: 'open_question' };
}

function topicChatIntentInstructions(intent) {
  if (intent?.kind === 'scene_identity') {
    return [
      'SORU NIYETI: SAHNEDEKI KISI VEYA KARAKTER KIMLIGI',
      'YAPIM / BOLUM, TIKLAMA ZAMANI, tiklanan altyazi ve onceki altyazilari birincil kanit olarak kullan.',
      'Kisinin adini ancak bu kanitlar veya guvenilir yapim bilgisi yeterliyse soyle.',
      'Kanit yetmiyorsa isim uydurma; gorulebilen rol ve iliskiyi acikla, kesin kimlik icin goruntunun veya daha fazla altyazinin gerektigini belirt.',
      'Secili kelimenin sozluk anlamina sapma; kullanicinin sahnedeki kisi sorusunu dogrudan yanitla.',
      'Isim/oyuncu eslestirmesiyle bitirme: kanit varsa karakterin bu sahnedeki rolu, kiminle iliskisi, ne istedigi ve hangi replik/davranisin bunu gosterdigini de acikla.',
      'Bolum adi veya model hafizasi tek basina bu karedeki kisiyi dogrulamaz. Dogrulanmamis yapim bilgisini kesin kimlik veya kaynak gibi sunma; aktor biyografisine sapma.',
      'Ekli kare varsa yeniden ekran goruntusu isteme. Birden fazla olasi kisi varsa konum/kiyafet ayrimini kullan veya tek bir netlestirici soru sor.',
    ].join('\n');
  }
  if (intent?.kind === 'scene_explanation') {
    return [
      'SORU NIYETI: SAHNENIN OLAYI VE REPLIGIN ISLEVI',
      'Bu bir film sohbetidir, altyazi dersi degil. Olay ne sorusunda ilk cumlede sahnenin asil derdini acikla; yuzeydeki eylem, karakter motivasyonu ve iliskide/oykude gosterdigi gerilimi birbirine bagla.',
      'Kullanici daha acik istemeden de sahnenin anlatidaki islevini ve alt metnini anlat. Altyazi eslesen sahneyi bulmak icin capadir, cevabin konusu degildir.',
      'Uzun, gunluk dille yazilmis itirazlari da onceki film konusmasinin devami kabul et. Son sorunun itirazina dogrudan cevap ver; onceki sahne ozetini veya secili kelimeyi yeniden anlatma.',
      'Kelimenin cevirisini, forget it = ... turu kalip dersini ve tam replik alintisini kullanici acikca istemedikce ekleme.',
      'Bir tepkinin nedenini aciklamak onu hakli bulmak degildir: karakterin olasi gerekcesini, davranisin baskasina etkisini ve alternatif yorumu ayir. Kullaniciya sirf katilmak icin karakteri kotuleme veya zorla savunma.',
      'Sahnenin islevi ve niyet yorumu ile dogrulanmis olayi ayir; yonetmenin amacini resmi aciklama varmis gibi kesin soyleme. Bir yorum yapabilmek icin ayni seyin altyazida acikca soylenmesini sart kosma.',
      'Secili kelimeyi sozluk maddesi gibi anlatma; kelime bu soruda yalnizca sahnedeki tiklama noktasidir.',
      'YAPIM / BOLUM, TIKLAMA ZAMANI, tiklanan altyazi ve onceki altyazilari birincil kanit olarak kullan.',
      'Kim kime ne yapiyor, neden, onceki olaylarla iliskisi ve anlatidaki islevi sorularini dogal, gerektigi kadar genis bir cevapla ele al. Zorunlu baslik veya2-3paragraf siniri yok.',
      'Konusan ve muhatabi kanit varsa adlariyla anlat. Kanitta yalniz rol varsa adi yerine o rolu yaz.',
      'Konusmaci veya muhatap kanitla belirlenemiyorsa belirsizligi bir kez belirt; isim uydurma. Her cumleyi belirsizlik uyarisina cevirme.',
      'Altyazida kisi adi veya rol etiketi varken "bir taraf", "diger taraf", "iki kisi" gibi belirsiz ikameler kullanma.',
      'Sahnede olan bolumunde anlik eylemi, catismayi ve duygusal durumu somut kisilere baglayarak acikla.',
      'Repligin amaci bolumunde sozun neden soylendigini ve karsi kiside ne etki yaratmak istedigini dogrudan belirt.',
      'Name: ile baslayan altyazi etiketi, yeni bir konusmaci etiketi gelene kadar takip eden kisa altyazi parcalarinin ayni kisiden gelebilecegini gosterir.',
      'KONUSMACI BLOKLARI verilmisse ham satirlar yerine bu bloklari konusmaci zinciri icin esas al.',
      'Once <<TIKLANAN>> parcayi ayni konusmaci blogundaki hemen onceki ve sonraki parcalarla tek cumle olarak tamamla.',
      'Yeni konusmaci etiketi yeni bir konusma turudur; sonraki kisinin veya ayni kisinin daha sonraki turundeki repligi tiklanan cumlenin amacina karistirma.',
      'Cevapta eslesen sahne kaynagi, bu ana kadarki ilgili olaylar ve varsa goruntuyle desteklenen eylemi anlat; ek meslek, prosedur, hukuk veya maliyet gerekcesi uydurma.',
      'Genel kelime anlamina sapma.',
      'Altyaziyi sadece yeniden soyleme: kim ne istiyor, neden bu cevabi veriyor, aralarindaki iliski ve sahnenin alt metni nedir sorularini mevcut kanit olcusunde acikla.',
      'Goruntu varsa mimik, durus, nesne ve mekani repliklerle birlikte degerlendir. Duygu/niyet yorumunu gozlenen olgudan ayir; kesin olmayan yorumu "bu, ... dusunduruyor" diye belirt.',
      'Bolumun ilerleyen olaylarini acma; bu sahneye kadar verilen bilgiyle kal. Detay isteginde desteklenen yeni bilgi ekle, ayni ozeti uzatma.',
    ].join('\n');
  }
  if (intent?.kind === 'world_knowledge') {
    return [
      'SORU NIYETI: GERCEK DUNYA BILGISI',
      'Kullanici cumlede anilan olgunun gercekte neden veya nasil oldugunu soruyor.',
      'Soruyu ilk cumleden itibaren dogrudan yanitla ve temel neden-sonuc mekanizmasini acikla.',
      'Orijinal baglami yalnizca hangi olgunun soruldugunu anlamak icin kullan.',
      '"Yazar burada sunu soruyor" diye cumleyi yeniden anlatma; secili kelimenin dil bilgisini ancak soruyla dogrudan ilgiliyse en sonda kisaca ekle.',
    ].join('\n');
  }
  if (intent?.kind === 'contextual_usage') {
    return [
      'SORU NIYETI: BAGLAMSAL KULLANIM',
      'Secili ifade veya kalibin bu cumlede neden bu anlamda kullanildigini acikla.',
      'Cumle baglamini birincil kanit olarak kullan; genel anlamlari baglamdaki anlamdan ayir.',
    ].join('\n');
  }
  if (intent?.kind === 'lexical') {
    return [
      'SORU NIYETI: KELIME VE KALIP BILGISI',
      'Kelimenin veya kalibin anlam, kullanim, fark ya da ornek talebini dogrudan karsila.',
      'Phrasal verb varsa parcayi tek basina degil butun kalibi esas al.',
    ].join('\n');
  }
  return [
    'SORU NIYETI: ACIK SORU',
    'Kullanicinin son sorusunu ana talep kabul et; karti ve sayfa baglamini sadece gerekli oldugu kadar kullan.',
  ].join('\n');
}

function sceneSpeakerPreview(contextText) {
  const rows = String(contextText || '')
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/^\s*-\s*\[([^\]]+)\]\s*(.*)$/);
      return match ? { speaker: match[1].trim(), text: match[2].trim() } : null;
    })
    .filter(Boolean);
  if (!rows.length) return null;
  let selectedIndex = rows.findIndex((row) => row.text.includes('<<TIKLANAN>>'));
  if (selectedIndex < 0) selectedIndex = 0;
  const speaker = rows[selectedIndex].speaker;
  const addresseeRow = rows.slice(selectedIndex + 1).find((row) => (
    row.speaker && row.speaker !== speaker && row.speaker !== 'ETIKETSIZ'
  ));
  const addressee = addresseeRow?.speaker || 'bilinmiyor';
  if (!speaker || speaker === 'ETIKETSIZ') return null;
  return {
    speaker,
    addressee,
    answer: [
      `Kim kime söylüyor: ${speaker} -> ${addressee}`,
      '',
      'Konuşmacı zinciri altyazı etiketlerinden doğrulandı. Ayrıntılı sahne açıklaması hazırlanıyor.',
    ].join('\n'),
  };
}

module.exports = {
  classifyTopicChatIntent,
  topicChatIntentInstructions,
  sceneSpeakerPreview,
};
