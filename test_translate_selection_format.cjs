const assert = require('node:assert/strict');
const test = require('node:test');

const {
  TERM_SECTION_LABELS,
  buildCoreTranslationPrompt,
  buildDetailEtymologyPrompt,
  buildDetailTranslationPrompt,
  buildDetailUsagePrompt,
  buildFullCardTranslationPrompt,
  buildQuickTranslationPrompt,
  buildTranslationPrompt,
  classifyTranslationSelection,
  cleanTranslationText,
  detectContextPhraseForSelection,
  extractContextSentence,
  formatTranslationSectionsText,
  isWeakMnemonic,
  mergeDetailTranslationOutputs,
  normalizeCoreTranslationOutput,
  normalizeDetailTranslationOutput,
  normalizeQuickTranslationOutput,
  normalizeTranslationOutput,
  resolveTranslationSelectionTarget,
} = require('./translate-selection-format.cjs');

test('CT full card keeps core and teaching details in one prompt without mnemonic', () => {
  const prompt = buildFullCardTranslationPrompt('mull', 'I need to mull over your proposal.');
  for (const field of ['sentenceTranslation', 'contextExplanation', 'explanation', 'generalMeanings', 'naturalPatterns', 'verbPatterns', 'etymology']) {
    assert.ok(prompt.includes(`"${field}"`), field);
  }
  assert.match(prompt, /EXACTLY 3/);
  assert.match(prompt, /grammatical English example = Turkish example/);
  assert.match(prompt, /No mnemonic/);
  assert.match(prompt, /mull over/);
  const phrasal = buildFullCardTranslationPrompt('looking', "and i'm looking to move up.");
  assert.ok(phrasal.includes('explanation'));
  assert.doesNotMatch(prompt, /Use the supplied high-quality core/);
});

test('CT full card leaves ordinary sentence-only translation unchanged', () => {
  const sentence = 'Why atoms take this trouble is a bit of a puzzle.';
  assert.equal(buildFullCardTranslationPrompt(sentence, sentence), buildTranslationPrompt(sentence, sentence));
});

test('sentence selections return only a direct sentence translation', () => {
  const selectedText = 'Why atoms take this trouble is a bit of a puzzle.';
  const result = normalizeTranslationOutput(
    '{"mode":"sentence","translation":"Atomlarin bu zahmete girmesi biraz muamma."}',
    selectedText,
    ''
  );

  assert.equal(classifyTranslationSelection(selectedText).mode, 'sentence');
  assert.equal(result.selectionMode, 'sentence');
  assert.equal(result.translation, 'Atomlarin bu zahmete girmesi biraz muamma.');
  assert.deepEqual(result.translationSections, []);
});

test('term selections return ordered study sections with direct translation first', () => {
  const selectedText = 'trouble';
  const contextText = 'Why atoms take this trouble is a bit of a puzzle.';
  const result = normalizeTranslationOutput(
    JSON.stringify({
      mode: 'term',
      directTranslation: 'zahmet',
      sentenceTranslation: 'Atomlarin bu zahmete girmesi biraz muamma.',
      generalMeanings: [
        '1) n.: zahmet, uğraş veya güçlük',
        '2) n.: sorun, sıkıntı veya problem',
        '3) v.: rahatsız etmek veya zahmete sokmak',
      ],
      contextualMeaning: 'Bu baglamda bir sey icin girilen ugrasi anlatir.',
      englishSynonyms: ['effort', 'difficulty', 'problem'],
      mnemonic: 'trouble / trabıl = TROUBLE yazili agir yuku iterken herkes ugrasiyor = trouble; zahmet',
    }),
    selectedText,
    contextText
  );

  assert.equal(classifyTranslationSelection(selectedText).mode, 'term');
  assert.equal(result.selectionMode, 'term');
  assert.equal(result.translation, 'zahmet');
  assert.deepEqual(
    result.translationSections.map((section) => section.key),
    ['directTranslation', 'sentenceTranslation', 'generalMeanings', 'englishSynonyms', 'contextualMeaning', 'explanation', 'mnemonic']
  );
  const formatted = formatTranslationSectionsText(result);
  assert.match(formatted, /Direkt çeviri: zahmet/);
  assert.match(formatted, /Cümle çevirisi: Atomlarin bu zahmete girmesi biraz muamma\./);
  assert.match(formatted, /Genel anlamları: 1\) n\.: zahmet, uğraş veya güçlük/);
  assert.match(formatted, /2\) n\.: sorun, sıkıntı veya problem/);
  assert.match(formatted, /3\) v\.: rahatsız etmek veya zahmete sokmak/);
  assert.match(formatted, /Bağlamdaki anlamı: Bu baglamda bir sey icin girilen ugrasi anlatir\./);
  assert.match(formatted, /Açıklama: - \*\*trouble:\*\*/);
  assert.match(formatted, /Mnemonic: trouble \/ trabıl/);
  assert.match(formatted, /İngilizce eş anlamlıları: effort, difficulty, problem/);
});

test('term prompt requests distinct multi-sense general meanings with POS labels', () => {
  const prompt = buildTranslationPrompt('defect', 'The engineer chose to defect to a rival company.');
  assert.match(prompt, /"generalMeanings":\[\]/);
  assert.match(prompt, /generalMeanings REQUIRED/i);
  assert.match(prompt, /2-5 numbered DIFFERENT senses\+POS/i);
  assert.match(prompt, /not paraphrases/i);
  assert.match(prompt, /context first/i);
  assert.match(prompt, /include other common senses/i);
});

test('general meanings stay on separate numbered lines for different senses and parts of speech', () => {
  const result = normalizeTranslationOutput(
    JSON.stringify({
      mode: 'term',
      directTranslation: 'taraf değiştirmek',
      sentenceTranslation: 'Mühendis rakip şirkete TARAF DEĞİŞTİRDİ.',
      generalMeanings: [
        'v.: bir gruptan ayrılıp karşı tarafa geçmek',
        'n.: kusur veya eksiklik',
        'v.: görevini bırakıp başka ülkeye ya da kuruma sığınmak',
      ],
      contextualMeaning: 'Burada bir şirketten ayrılıp rakip şirkete geçmek.',
      englishSynonyms: ['switch sides', 'desert', 'flaw'],
    }),
    'defect',
    'The engineer chose to defect to a rival company.'
  );

  assert.equal(
    result.generalMeanings,
    [
      '1) v.: bir gruptan ayrılıp karşı tarafa geçmek',
      '2) n.: kusur veya eksiklik',
      '3) v.: görevini bırakıp başka ülkeye ya da kuruma sığınmak',
    ].join('\n')
  );
  const section = result.translationSections.find((item) => item.key === 'generalMeanings');
  assert.equal(section?.label, TERM_SECTION_LABELS.generalMeanings);
  assert.equal(section?.value.split('\n').length, 3);
  assert.ok(
    result.translationSections.findIndex((item) => item.key === 'generalMeanings')
      < result.translationSections.findIndex((item) => item.key === 'contextualMeaning')
  );
});

test('partial JSON recovery preserves a truncated general meanings array', () => {
  const result = normalizeTranslationOutput(
    '{"mode":"term","directTranslation":"lanetli","sentenceTranslation":"Bu LANETLİ bir makale.","generalMeanings":["adj.: lanetlenmiş veya uğursuz","adj.: çok kötü ya da berbat","v.: lanetlemek fiilinin geçmiş biçimi"',
    'cursed',
    'This is a cursed paper.'
  );
  assert.equal(result.generalMeanings.split('\n').length, 3);
  assert.match(result.generalMeanings, /1\) adj\.: lanetlenmiş veya uğursuz/);
  assert.match(result.generalMeanings, /3\) v\.: lanetlemek fiilinin geçmiş biçimi/);
});

test('term sections include natural patterns after contextual meaning', () => {
  const result = normalizeTranslationOutput(
    JSON.stringify({
      mode: 'term',
      directTranslation: 'iftira',
      sentenceTranslation: 'Bu iftiraya katlanmak zorunda degilim.',
      contextualMeaning: 'Birine asilsiz ve kotuleyici soz soylemek ya da bunu kabul ettirmek.',
      naturalPatterns: [
        'take slander = iftiraya katlanmak; He refused to take the slander. = Iftiraya katlanmayi reddetti.',
        'face slander = iftirayla yuzlesmek; She had to face slander after the rumor spread. = Soylenti yayilinca iftirayla yuzlesmek zorunda kaldi.',
        'spread slander = iftira yaymak; They spread slander to ruin her reputation. = Itibarini bozmak icin iftira yaydilar.',
        'slander someone as a liar = birini yalanci diye karalamak; They slandered him as a liar. = Onu yalanci diye karaladilar.',
        'defend against slander = iftiraya karsi kendini savunmak; He defended himself against slander. = Iftiraya karsi kendini savundu.',
      ],
      englishSynonyms: ['defamation', 'libel', 'false accusation'],
      mnemonic: 'arkadan fisildanan camur dolu notlar = birini kotuleyip asilsiz konusmak = iftira',
    }),
    'slander',
    "I don't have to take this slander."
  );

  assert.deepEqual(
    result.translationSections.map((section) => section.key),
    ['directTranslation', 'sentenceTranslation', 'englishSynonyms', 'contextualMeaning', 'explanation', 'naturalPatterns', 'mnemonic']
  );
  const naturalPatternsSection = result.translationSections.find((section) => section.key === 'naturalPatterns');
  assert.equal(naturalPatternsSection?.label, TERM_SECTION_LABELS.naturalPatterns);
  assert.match(naturalPatternsSection?.value || '', /take slander = iftiraya katlanmak/);
  assert.match(naturalPatternsSection?.value || '', /face slander = iftirayla yuzlesmek/);
  assert.match(naturalPatternsSection?.value || '', /spread slander = iftira yaymak/);
  assert.match(naturalPatternsSection?.value || '', /slander someone as a liar = birini yalanci diye karalamak/);
  assert.match(naturalPatternsSection?.value || '', /defend against slander = iftiraya karsi kendini savunmak/);
  assert.ok(
    (naturalPatternsSection?.value || '').split('\n').filter((line) => /=/.test(line)).length >= 5,
    'natural patterns should keep at least five English usage rows'
  );
});

test('term sections include a long explanation before natural patterns', () => {
  const result = normalizeTranslationOutput(
    JSON.stringify({
      mode: 'term',
      directTranslation: 'habersiz doguya giden suruculerin akisi',
      sentenceTranslation: 'Ilk ilgim, habersiz doguya giden suruculerin akisi gibi bir goruntuye dayaniyordu.',
      contextualMeaning: 'Bir grubun farkinda olmadan ayni yone dogru ilerlemesini canli bir metaforla anlatir.',
      explanation: [
        '- **streams:** burada fiziksel dere degil, pes pese akan kalabalik hareketini anlatir.',
        '- **unsuspecting:** tehlikenin veya durumun farkinda olmayan kisiler icin kullanilir.',
        '- **eastbound motorists:** doguya dogru giden suruculer demektir.',
        '',
        'Birlesince ifade, **streams of unsuspecting eastbound motorists** sozunu yogun ve habersiz bir trafik akisi gibi kurar.',
      ].join('\n'),
      etymology: [
        '- Bu ifade tek kelime kokunden cok compound phrase mantigiyla okunur.',
        'stream | akis | Eski Ingilizce stream, akan su/hat',
        'unsuspecting | habersiz | un- olumsuzluk + suspect fark etmek/suphelenmek',
        'eastbound | doguya giden | east + bound, bir yone bagli/giden',
      ].join('\n'),
      naturalPatterns: [
        'unsuspecting motorists = durumdan habersiz suruculer; Unsuspecting motorists drove into the storm. = Habersiz suruculer firtinaya dogru gitti.',
        'streams of traffic = trafik akislari; Streams of traffic filled the road. = Trafik akislari yolu doldurdu.',
      ],
      englishSynonyms: ['traffic flow', 'unaware drivers', 'eastbound traffic'],
      mnemonic: 'streams + unsuspecting + eastbound = STREAMS tabelali trafik su gibi akiyor; suruculer habersiz doguya gidiyor = habersiz doguya giden surucu akisi',
    }),
    'streams of unsuspecting eastbound motorists',
    'My initial interest was based on streams of unsuspecting eastbound motorists.'
  );

  assert.deepEqual(
    result.translationSections.map((section) => section.key),
    ['directTranslation', 'sentenceTranslation', 'englishSynonyms', 'contextualMeaning', 'explanation', 'naturalPatterns', 'mnemonic', 'etymology']
  );
  const explanationSection = result.translationSections.find((section) => section.key === 'explanation');
  assert.equal(explanationSection?.label, TERM_SECTION_LABELS.explanation);
  assert.match(explanationSection?.value || '', /\*\*streams:\*\*/);
  assert.match(explanationSection?.value || '', /Birlesince ifade/);
  const etymologySection = result.translationSections.find((section) => section.key === 'etymology');
  assert.equal(etymologySection?.label, TERM_SECTION_LABELS.etymology);
  assert.match(etymologySection?.value || '', /stream \| akis \|/);
  assert.match(etymologySection?.value || '', /eastbound \| doguya giden \|/);
  assert.equal(result.translationSections.at(-1)?.key, 'etymology');
});

test('term sections include a sentence highlight when the direct translation appears in the sentence', () => {
  const result = normalizeTranslationOutput(
    JSON.stringify({
      mode: 'term',
      directTranslation: 'karmaşık',
      sentenceTranslation: 'Bu, karmaşık ve özel bir düzendi.',
      contextualMeaning: 'İnce ayrıntılarla düzenlenmiş.',
      englishSynonyms: ['intricate', 'elaborate', 'complex'],
    }),
    'intricate',
    'It is an intricate arrangement.'
  );

  const sentenceSection = result.translationSections.find((section) => section.key === 'sentenceTranslation');
  assert.equal(sentenceSection?.label, 'Cümle çevirisi');
  assert.equal(sentenceSection?.highlightText, 'karmaşık');
});

test('term sections use model-provided sentence highlight text when the direct translation is paraphrased', () => {
  const result = normalizeTranslationOutput(
    JSON.stringify({
      mode: 'term',
      directTranslation: 'karmaşık',
      sentenceTranslation: 'Bu, özel ve ayrıntılı bir düzenlemedir.',
      sentenceHighlightText: 'özel ve ayrıntılı',
      contextualMeaning: 'İnce ayrıntılarla düzenlenmiş.',
      englishSynonyms: ['intricate', 'elaborate', 'complex'],
    }),
    'intricate',
    'It is an intricate arrangement.'
  );

  const sentenceSection = result.translationSections.find((section) => section.key === 'sentenceTranslation');
  assert.equal(sentenceSection?.highlightText, 'özel ve ayrıntılı');
});

test('single-word terms can highlight a safe paraphrased Turkish meaning', () => {
  const result = normalizeTranslationOutput(
    JSON.stringify({
      mode: 'term',
      directTranslation: 'gizemli, sirlarla dolu, sadece az kisinin bildigi',
      sentenceTranslation:
        'Bilginin dogrulugundan bir an bile kusku duymuyordum; yine de bilim insanlarinin aciklamalarina cerrahlar ve tesisatcilar kadar gizli/ayricalikli bilgi sahibi diger kisiler gibi guvenmeye devam ediyordum.',
      contextualMeaning: 'gizli, sirli ve uzman olmayanlarin kolay anlayamadigi bilgi',
      englishSynonyms: ['mysterious', 'secret', 'esoteric'],
    }),
    'arcane',
    'I trust the pronouncements of scientists in the way I trust those of surgeons, plumbers and other possessors of arcane and privileged knowledge.'
  );

  const sentenceSection = result.translationSections.find((section) => section.key === 'sentenceTranslation');
  assert.equal(sentenceSection?.highlightText, 'gizli');
});

test('mystifying highlights its contextual Turkish paraphrase in the sentence', () => {
  const result = normalizeTranslationOutput(
    JSON.stringify({
      mode: 'term',
      directTranslation: 'şaşırtıcı biçimde anlaşılmaz',
      sentenceTranslation:
        'Ders kitabı yazarları arasında, ele aldıkları malzemenin asla açıkça heyecan verici alana kaymamasını sağlamak için sanki gizemli bir evrensel komplo varmış gibi görünüyordu.',
      sentenceHighlightText: 'şaşırtıcı biçimde anlaşılmaz',
      contextualMeaning: 'şaşırtıcı derecede anlaşılmaz, insanı afallatan',
      englishSynonyms: ['puzzling', 'bewildering', 'perplexing'],
    }),
    'mystifying',
    'There seemed to be a mystifying universal conspiracy among textbook authors.'
  );

  const sentenceSection = result.translationSections.find((section) => section.key === 'sentenceTranslation');
  assert.equal(sentenceSection?.highlightText, 'gizemli');
});

test('multi-word direct translations do not highlight a lone shared word', () => {
  const result = normalizeTranslationOutput(
    JSON.stringify({
      mode: 'term',
      directTranslation: 'ezelden beri',
      sentenceTranslation: 'Zamanin baslangicindan beri var olmus milyarlarca canli turunun cogu yok olmustur.',
      contextualMeaning: 'cok eski zamandan beri',
      englishSynonyms: ['since the beginning of time', 'from time immemorial'],
    }),
    'dawn of time',
    'Of the billions of species that have existed since the dawn of time, most are gone.'
  );

  const sentenceSection = result.translationSections.find((section) => section.key === 'sentenceTranslation');
  assert.equal(sentenceSection?.highlightText, undefined);
});

test('multi-word direct translations keep full model-provided phrase highlights', () => {
  const result = normalizeTranslationOutput(
    JSON.stringify({
      mode: 'term',
      directTranslation: 'ezelden beri',
      sentenceTranslation: 'Zamanin baslangicindan beri var olmus milyarlarca canli turunun cogu yok olmustur.',
      sentenceHighlightText: 'Zamanin baslangicindan beri',
      contextualMeaning: 'cok eski zamandan beri',
      englishSynonyms: ['since the beginning of time', 'from time immemorial'],
    }),
    'dawn of time',
    'Of the billions of species that have existed since the dawn of time, most are gone.'
  );

  const sentenceSection = result.translationSections.find((section) => section.key === 'sentenceTranslation');
  assert.equal(sentenceSection?.highlightText, 'Zamanin baslangicindan beri');
});

test('multi-word direct translations reject model-provided lone-word highlights', () => {
  const result = normalizeTranslationOutput(
    JSON.stringify({
      mode: 'term',
      directTranslation: 'ezelden beri',
      sentenceTranslation: 'Zamanin baslangicindan beri var olmus milyarlarca canli turunun cogu yok olmustur.',
      sentenceHighlightText: 'beri',
      contextualMeaning: 'cok eski zamandan beri',
      englishSynonyms: ['since the beginning of time', 'from time immemorial'],
    }),
    'dawn of time',
    'Of the billions of species that have existed since the dawn of time, most are gone.'
  );

  const sentenceSection = result.translationSections.find((section) => section.key === 'sentenceTranslation');
  assert.equal(sentenceSection?.highlightText, undefined);
});

test('multi-word direct translations can highlight a substantial contextual head word', () => {
  const result = normalizeTranslationOutput(
    JSON.stringify({
      mode: 'term',
      directTranslation: 'akislarin goruntusu',
      sentenceTranslation: 'Ilk ilgim gizli bir goruntuye dayaniyordu; ama zamanla dikkatim yavas yavas degisti.',
      contextualMeaning: 'Arka arkaya akan cok sayida seyin zihindeki gorseli',
      englishSynonyms: ['flow image', 'stream picture', 'visual impression'],
    }),
    'image of streams',
    'My initial interest was based on an image of streams.'
  );

  const sentenceSection = result.translationSections.find((section) => section.key === 'sentenceTranslation');
  assert.equal(sentenceSection?.highlightText, 'goruntuye');
});

test('multi-word contextual head highlights preserve Turkish characters', () => {
  const result = normalizeTranslationOutput(
    JSON.stringify({
      mode: 'term',
      directTranslation: 'ak\u0131\u015flar\u0131n g\u00f6r\u00fcnt\u00fcs\u00fc',
      sentenceTranslation: '\u0130lk ilgim gizli bir g\u00f6r\u00fcnt\u00fcye dayan\u0131yordu.',
      contextualMeaning: 'Arka arkaya akan cok sayida seyin zihindeki gorseli',
      englishSynonyms: ['flow image', 'stream picture', 'visual impression'],
    }),
    'image of streams',
    'My initial interest was based on an image of streams.'
  );

  const sentenceSection = result.translationSections.find((section) => section.key === 'sentenceTranslation');
  assert.equal(sentenceSection?.highlightText, 'g\u00f6r\u00fcnt\u00fcye');
});

test('model HTML markup is stripped from translation sections and highlights', () => {
  const result = normalizeTranslationOutput(
    JSON.stringify({
      mode: 'term',
      directTranslation: 'kararsız',
      sentenceTranslation: 'Kötü haber şu ki atomlar oldukça <span style="color: #d14;">KARARSIZDIR</span> ve süreleri kısadır.',
      sentenceHighlightText: '<span>KARARSIZDIR</span>',
      contextualMeaning: 'Burada <strong>sabit kalmayan</strong> bir yapıyı anlatır.',
      englishSynonyms: ['unstable', '<em>changeable</em>', 'flighty'],
      mnemonic: '<span style="color:red">fickle / fikir</span> = FICKLE yazili zar fikrini surekli degistiriyor = fickle; kararsiz',
    }),
    'fickle',
    'The bad news is that atoms are fickle and their time of devotion is fleeting.'
  );

  const formatted = formatTranslationSectionsText(result);
  assert.doesNotMatch(formatted, /<\/?(?:span|strong|em)\b/i);
  assert.doesNotMatch(formatted, /style=/i);
  assert.match(formatted, /KARARSIZDIR/);
  assert.match(formatted, /fickle \/ fikir = FICKLE yazili zar fikrini surekli degistiriyor/);

  const sentenceSection = result.translationSections.find((section) => section.key === 'sentenceTranslation');
  assert.equal(sentenceSection?.highlightText, 'KARARSIZDIR');
  assert.equal(cleanTranslationText('&lt;span style="color:red"&gt;kirli&lt;/span&gt;'), 'kirli');
});

test('definition-like mnemonics are replaced with a keyword memory scene', () => {
  const result = normalizeTranslationOutput(
    JSON.stringify({
      mode: 'term',
      directTranslation: 'o civarda',
      sentenceTranslation: 'Bu olay biraz o civarda baska bir anda olur.',
      contextualMeaning: 'Bir zamanin, yerin ya da sayinin tam degil, yaklasik olarak o cevresinde oldugunu anlatir.',
      englishSynonyms: ['around', 'approximately', 'roughly', 'about', 'near'],
      mnemonic: "Thereabouts = tam nokta degil, o noktanin civari. Turkcede 'o civarda' diye dusun.",
    }),
    'thereabouts',
    'And at about that moment, or somewhere thereabouts, atoms will shut you down.'
  );

  const mnemonicSection = result.translationSections.find((section) => section.key === 'mnemonic');
  assert.ok(mnemonicSection, 'mnemonic section should stay visible through a stronger fallback');
  assert.match(mnemonicSection.value, /there \+ about/i);
  assert.match(mnemonicSection.value, /tam nokta/i);
  assert.doesNotMatch(mnemonicSection.value, /gibi dusun|diye dusun/i);
});

test('raw prefix fallback is replaced with a usable cue for mundane', () => {
  const result = normalizeTranslationOutput(
    JSON.stringify({
      mode: 'term',
      directTranslation: 'siradan',
      sentenceTranslation: 'Kimya duzeyinde yasam son derece siradan bir seydir.',
      contextualMeaning: 'Gundelik, olagan, gosterissiz; ozel ya da buyulu olmayan.',
      englishSynonyms: ['ordinary', 'everyday', 'plain', 'commonplace', 'prosaic'],
      mnemonic: 'mund = MUND yazili kart, siradan fikrini tek bir resim gibi gosteriyor = mundane; siradan',
    }),
    'mundane',
    'Life at the chemical level is utterly mundane.'
  );

  const mnemonicSection = result.translationSections.find((section) => section.key === 'mnemonic');
  assert.ok(mnemonicSection, 'mundane should get a usable memory hook');
  assert.match(mnemonicSection.value, /mundane \/ monday/i);
  assert.match(mnemonicSection.value, /siradan/i);
  assert.doesNotMatch(mnemonicSection.value, /^mund\s*=/i);
});

test('rejoice gets a concrete re plus joy mnemonic when model omits it', () => {
  const result = normalizeTranslationOutput(
    JSON.stringify({
      mode: 'term',
      directTranslation: 'sevinmek',
      sentenceTranslation: 'Yine de bunun hiç olmazsa gerçekleşmesine SEVİNEBİLİRSİN.',
      contextualMeaning: 'Bir şeyin olması yüzünden içten memnun olmak.',
      englishSynonyms: ['be glad', 'delight', 'celebrate', 'be pleased', 'cheer'],
      mnemonic: '',
    }),
    'rejoice',
    'You might rejoice that it happened at all.'
  );

  const mnemonicSection = result.translationSections.find((section) => section.key === 'mnemonic');
  assert.ok(mnemonicSection, 'rejoice should get a usable memory hook');
  assert.match(mnemonicSection.value, /re \+ joy/i);
  assert.match(mnemonicSection.value, /sevin/i);
  assert.doesNotMatch(mnemonicSection.value, /gibi dusun|diye dusun/i);
});

test('known words recover missing natural patterns when model omits them', () => {
  const result = normalizeTranslationOutput(
    JSON.stringify({
      mode: 'term',
      directTranslation: 'esrarengiz',
      sentenceTranslation: 'Aciklama, bilim insani anlatsa bile esrarengiz kaldi.',
      contextualMeaning: 'Anlami acik olmayan, tam cozulemeyen, gizemli.',
      englishSynonyms: ['mysterious', 'cryptic', 'puzzling'],
      mnemonic: '',
    }),
    'enigmatic',
    'The explanation remained enigmatic.'
  );

  const naturalPatternsSection = result.translationSections.find((section) => section.key === 'naturalPatterns');
  assert.ok(naturalPatternsSection, 'enigmatic should recover natural patterns');
  assert.match(naturalPatternsSection.value, /an enigmatic explanation =/);
  assert.match(naturalPatternsSection.value, /remain enigmatic =/);

  const mnemonicSection = result.translationSections.find((section) => section.key === 'mnemonic');
  assert.ok(mnemonicSection, 'enigmatic should also recover mnemonic');
  assert.match(mnemonicSection.value, /enigma \+ attic/i);
});

test('verb pen recovers natural patterns when model omits them', () => {
  const result = normalizeTranslationOutput(
    JSON.stringify({
      mode: 'term',
      directTranslation: 'kaleme almak',
      sentenceTranslation:
        'Simdi, en anlasilir ve heyecan verici yazilari kaleme alan cok sayida mutlu bilim yazari oldugunu biliyorum.',
      sentenceHighlightText: 'kaleme alan',
      contextualMeaning: 'yazmak; bir metni kaleme almak',
      englishSynonyms: ['write', 'compose', 'draft', 'author', 'scribble'],
      mnemonic: '',
    }),
    'pen',
    'There is a happy abundance of science writers who pen the most lucid and thrilling prose.'
  );

  const naturalPatternsSection = result.translationSections.find((section) => section.key === 'naturalPatterns');
  assert.ok(naturalPatternsSection, 'pen should recover natural patterns');
  assert.match(naturalPatternsSection.value, /pen a book =/);
  assert.match(naturalPatternsSection.value, /pen lucid prose =/);
  assert.match(naturalPatternsSection.value, /pen something for someone =/);

  const inflectedResult = normalizeTranslationOutput(
    JSON.stringify({
      mode: 'term',
      directTranslation: 'kaleme almak',
      sentenceTranslation: 'Yazar bu kitabi gecen yil kaleme aldi.',
      contextualMeaning: 'yazmak',
      englishSynonyms: ['write', 'compose'],
      mnemonic: '',
    }),
    'penned',
    'The author penned this book last year.'
  );
  assert.match(
    inflectedResult.translationSections.find((section) => section.key === 'naturalPatterns')?.value || '',
    /pen a book =/
  );
});

test('comprehensible gets a concrete comprehend root mnemonic when model omits it', () => {
  const result = normalizeTranslationOutput(
    JSON.stringify({
      mode: 'term',
      directTranslation: 'anlasilir',
      sentenceTranslation: 'Aslinda butunuyle anlasilir degildi.',
      sentenceHighlightText: 'butunuyle anlasilir',
      contextualMeaning: 'Kolayca anlasilan, acik ve net olan; ama burada tam oyle degildi.',
      naturalPatterns: [
        'The instructions are comprehensible. -> Talimatlar anlasilir.',
        'The report is comprehensible to a general reader. -> Rapor genel bir okur icin anlasilir.',
      ],
      englishSynonyms: ['understandable', 'clear', 'intelligible'],
      mnemonic: '',
    }),
    'comprehensible',
    'It was not entirely comprehensible.'
  );

  const mnemonicSection = result.translationSections.find((section) => section.key === 'mnemonic');
  assert.ok(mnemonicSection, 'comprehensible should recover a mnemonic section');
  assert.match(mnemonicSection.value, /comprehend\/kavramak \+ -ible\/yapılabilir/i);
  assert.match(mnemonicSection.value, /anlasilir/i);
  assert.equal(isWeakMnemonic('comprehensible', mnemonicSection.value), false);
});

test('evidently gets an evident root mnemonic when model omits it', () => {
  const result = normalizeTranslationOutput(
    JSON.stringify({
      mode: 'term',
      directTranslation: 'anlasilan',
      sentenceTranslation:
        'Boyle bir illustrasyonu daha once hic gormedigimi dusunmek zor, ama ANLASILAN gormemisim.',
      contextualMeaning: 'kanita bakinca bunun dogru oldugu anlasiliyor',
      naturalPatterns: [
        'It was evidently true. = Anlasilan dogruydu.',
        'She was evidently tired. = Belli ki cok yorgundu.',
        'He is evidently lying. = Acikca yalan soyluyor.',
        'Evidently, they missed the train. = Anlasilan treni kacirmislar.',
      ],
      englishSynonyms: ['clearly', 'obviously', 'plainly', 'apparently', 'manifestly'],
      mnemonic: '',
    }),
    'evidently',
    'It is hard to believe I had not seen it before, but evidently I had not.'
  );

  const mnemonicSection = result.translationSections.find((section) => section.key === 'mnemonic');
  assert.ok(mnemonicSection, 'evidently should recover a mnemonic section');
  assert.match(mnemonicSection.value, /evident \+ -ly/i);
  assert.match(mnemonicSection.value, /anlasilan/i);
  assert.equal(isWeakMnemonic('evidently', mnemonicSection.value), false);
});

test('aroused gets a concrete wake-up mnemonic when model output is missing or weak', () => {
  const result = normalizeTranslationOutput(
    JSON.stringify({
      mode: 'term',
      directTranslation: 'kiskirtti; uyandirdi',
      sentenceTranslation: 'Cizimin merakli bir zihinde uyandirdigi sorulara cevap vermiyordu.',
      contextualMeaning: 'soru ve merak uyandirmak',
      englishSynonyms: ['provoked', 'awakened', 'stirred'],
      mnemonic: '',
    }),
    'aroused',
    'It answered none of the questions it aroused in an ordinarily inquisitive mind.'
  );
  const mnemonic = result.translationSections.find((section) => section.key === 'mnemonic');
  assert.ok(mnemonic, 'aroused should not lose the mnemonic section');
  assert.match(mnemonic.value, /horoz/i);
  assert.equal(isWeakMnemonic('aroused', mnemonic.value), false);
});

test('forebears gets a concrete ancestor mnemonic when model omits it', () => {
  const result = normalizeTranslationOutput(
    JSON.stringify({
      mode: 'term',
      directTranslation: 'atalar',
      sentenceTranslation:
        "8 milyar yil boyunca hem anne hem baba tarafindaki tum ATALARIN es bulacak kadar cekici olmasi gerekir.",
      contextualMeaning: 'Bir kisinin soyagacindaki onceki nesiller.',
      englishSynonyms: ['ancestors', 'forefathers', 'predecessors', 'progenitors'],
      mnemonic: '',
    }),
    'forebears',
    'Your forebears on both sides must have lived long enough to reproduce.'
  );

  const mnemonicSection = result.translationSections.find((section) => section.key === 'mnemonic');
  assert.ok(mnemonicSection, 'forebears should get a usable memory hook');
  assert.match(mnemonicSection.value, /fore \+ bears/i);
  assert.match(mnemonicSection.value, /atalar/i);
  assert.doesNotMatch(mnemonicSection.value, /gibi dusun|diye dusun|turkcede/i);
});

test('transfixed gets a concrete fixed-gaze mnemonic when model omits it', () => {
  const result = normalizeTranslationOutput(
    JSON.stringify({
      mode: 'term',
      directTranslation: 'buyulenmis',
      sentenceTranslation:
        'O ani cok net, BUYULENMIS HALDE gecirdigimi hatirliyorum.',
      contextualMeaning:
        'Bir seye gozunu ayiramayacak kadar guclu bicimde dikkat kesilmek, adeta donup kalmak.',
      englishSynonyms: ['spellbound', 'mesmerized', 'fascinated', 'entranced', 'riveted'],
      mnemonic: '',
    }),
    'transfixed',
    'I remember the moment so clearly because I was transfixed.'
  );

  const mnemonicSection = result.translationSections.find((section) => section.key === 'mnemonic');
  assert.ok(mnemonicSection, 'transfixed should get a usable memory hook');
  assert.match(mnemonicSection.value, /trans \+ fixed/i);
  assert.match(mnemonicSection.value, /sabit/i);
  assert.match(mnemonicSection.value, /buyulen/i);
  assert.doesNotMatch(mnemonicSection.value, /gibi dusun|diye dusun|turkcede|yazili kart/i);
});

test('unknown words do not get meaningless raw-letter fallback mnemonics', () => {
  const result = normalizeTranslationOutput(
    JSON.stringify({
      mode: 'term',
      directTranslation: 'siradan',
      sentenceTranslation: 'Bu sey siradandir.',
      contextualMeaning: 'Ozel olmayan, gundelik bir anlam.',
      englishSynonyms: ['ordinary'],
      mnemonic: '',
    }),
    'qzvornate',
    'This is qzvornate.'
  );

  assert.equal(
    result.translationSections.some((section) => section.key === 'mnemonic'),
    false
  );
});

const BROAD_MNEMONIC_CASES = [
  ['absurd', 'sacma'],
  ['arbitrary', 'keyfi'],
  ['arcane', 'gizemli'],
  ['beneficiary', 'yararlanan kisi'],
  ['bewildered', 'kafasi karismis'],
  ['conceive', 'tasavvur etmek'],
  ['decline', 'azalmak'],
  ['deft', 'usta'],
  ['devoted', 'adanmis'],
  ['disassemble', 'parcalara ayirmak'],
  ['drifting', 'suruklenen'],
  ['elaborate', 'ayrintili'],
  ['elsewhere', 'baska yerde'],
  ['fleeting', 'kisa sureli'],
  ['fickle', 'kararsiz'],
  ['forebears', 'atalar'],
  ['gratifying', 'tatmin edici'],
  ['intricate', 'karmasik'],
  ['milestone', 'donum noktasi'],
  ['modest', 'mutevazi'],
  ['mound', 'yigin'],
  ['mundane', 'siradan'],
  ['obliging', 'yardimsever'],
  ['possessors', 'sahipler'],
  ['privileged', 'ayricalikli'],
  ['pronouncement', 'aciklama'],
  ['rigid', 'sert'],
  ['slander', 'iftira'],
  ['thereabouts', 'o civarda'],
  ['transfixed', 'buyulenmis'],
  ['tweezers', 'cimbiz'],
  ['uncomplainingly', 'sikayet etmeden'],
  ['underappreciated', 'degeri bilinmeyen'],
  ['tenuous', 'zayif'],
  ['discrete', 'ayri'],
  ['dismaying', 'moral bozucu'],
  ['cooperative', 'isbirlikci'],
  ['arresting', 'dikkat cekici'],
  ['impulse', 'ani istek'],
  ['intact', 'saglam'],
  ['particles', 'parcaciklar'],
  ['arrangement', 'duzenleme'],
  ['peculiar', 'tuhaf'],
  ['atomic', 'atomik'],
  ['obscure', 'belirsiz'],
  ['immense', 'muazzam'],
  ['fleetingly', 'gecici bicimde'],
  ['nonetheless', 'yine de'],
  ['astonishing', 'sasirici'],
  ['perilous', 'tehlikeli'],
];

test('broad mnemonic fallback creates usable hooks for 50 different words', () => {
  assert.equal(BROAD_MNEMONIC_CASES.length, 50, 'this regression gate must keep 50 word cases');

  for (const [word, directTranslation] of BROAD_MNEMONIC_CASES) {
    const result = normalizeTranslationOutput(
      JSON.stringify({
        mode: 'term',
        directTranslation,
        sentenceTranslation: `Bu cumlede ${directTranslation} anlaminda kullaniliyor.`,
        contextualMeaning: `${directTranslation} anlamini bu baglamda hatirlatir.`,
        englishSynonyms: ['contextual equivalent'],
        mnemonic: '',
      }),
      word,
      `The selected word is ${word}.`
    );

    const mnemonicSection = result.translationSections.find((section) => section.key === 'mnemonic');
    assert.ok(mnemonicSection, `${word} should keep a Mnemonic section`);
    assert.equal(isWeakMnemonic(word, mnemonicSection.value), false, `${word} mnemonic is still weak: ${mnemonicSection.value}`);
    assert.match(mnemonicSection.value, new RegExp(directTranslation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
    assert.doesNotMatch(
      mnemonicSection.value,
      /yazili|gibi dusun|diye dusun|aklinda tut|turkcede|tanimi|demektir/i,
      `${word} mnemonic should not be a label/definition trick`
    );
  }
});

test('term prompt expands selected phrasal verb token from context', () => {
  const contextText = 'It was some trick; you just cobbled together these neural networks.';
  const detected = detectContextPhraseForSelection('cobbled', contextText);
  assert.equal(detected?.target, 'cobble together');
  assert.equal(detected?.surface, 'cobbled together');

  const resolved = resolveTranslationSelectionTarget('cobbled', contextText);
  assert.equal(resolved.targetText, 'cobble together');

  const prompt = buildTranslationPrompt('cobbled', contextText);
  assert.match(prompt, /clicked: cobbled/);
  assert.match(prompt, /phraseSurface: cobbled together/);
  assert.match(prompt, /sel: cobble together/);
  assert.match(prompt, /explain the whole phrase/i);

  const quickPrompt = buildQuickTranslationPrompt('cobbled', contextText);
  assert.match(quickPrompt, /sel: cobble together/);
  assert.match(quickPrompt, /translate the whole phrase/i);
});

test('end click exposes end up as the translated target', () => {
  const contextText = 'How did we end up with a Sun in the middle of our planet?';
  const detected = detectContextPhraseForSelection('end', contextText);
  assert.equal(detected?.target, 'end up');
  assert.equal(detected?.surface, 'end up');

  const resolved = resolveTranslationSelectionTarget('end', contextText);
  assert.equal(resolved.selectedText, 'end');
  assert.equal(resolved.targetText, 'end up');

  const result = normalizeQuickTranslationOutput(
    JSON.stringify({
      directTranslation: 'sonunda olmak, sonuçta varmak',
      sentenceTranslation: 'Gezegenimizin ortasında bir Güneşle nasıl karşılaştık?',
    }),
    'end',
    contextText
  );
  assert.equal(result.targetText, 'end up');
  assert.equal(result.contextPhrase?.reason, 'phrasal_verb');
});

test('separable pled it out expands to plead out and exposes the real verb family', () => {
  const contextText = 'Pled it out. When the judge asked him why he did it, he said, "I did not like the kid."';
  const detected = detectContextPhraseForSelection('Pled', contextText);
  assert.equal(detected?.target, 'plead out');
  assert.equal(detected?.surface, 'Pled it out');

  const corePrompt = buildCoreTranslationPrompt('Pled', contextText);
  assert.match(corePrompt, /sel: plead out/);
  assert.match(corePrompt, /phraseSurface: Pled it out/);

  const quick = normalizeQuickTranslationOutput(
    JSON.stringify({ directTranslation: 'taahhüt', sentenceTranslation: 'Suçunu kabul edip anlaştı.' }),
    'Pled',
    contextText
  );
  assert.equal(quick.directTranslation, 'suçunu kabul edip savcılıkla anlaşmak');

  const detailPrompt = buildDetailTranslationPrompt('Pled', contextText, {
    directTranslation: 'suçunu kabul edip savcılıkla anlaşmak',
    sentenceTranslation: 'Suçunu kabul edip savcılıkla anlaştı.',
    contextualMeaning: 'Duruşma yerine suçunu kabul ederek anlaşmaya varmak.',
    englishSynonyms: ['take a plea deal', 'plead guilty'],
  });
  assert.match(detailPrompt, /detected phrase first/i);
  assert.match(detailPrompt, /Never invent combinations merely to cover out\/at\/in/i);

  const normalized = normalizeDetailTranslationOutput(JSON.stringify({
    explanation: '**Bütün kalıp – plead out:** Suçunu kabul ederek savcılıkla anlaşmak.',
    naturalPatterns: [
      'plead out of a case = davada anlaşmalı şekilde suçunu kabul etmek',
      'decide to plead out = anlaşmalı suç kabulüne karar vermek',
      'plead out before trial = duruşmadan önce anlaşmalı suç kabulü yapmak',
    ],
    verbPatterns: ['plead at = uydurma bir kullanım'],
  }), 'Pled', contextText, {
    directTranslation: 'suçunu kabul edip savcılıkla anlaşmak',
    sentenceTranslation: 'Suçunu kabul edip savcılıkla anlaştı.',
    contextualMeaning: 'Duruşma yerine suçunu kabul ederek anlaşmaya varmak.',
    englishSynonyms: ['take a plea deal', 'plead guilty'],
  });

  assert.equal(normalized.targetText, 'plead out');
  assert.match(normalized.verbPatterns, /^plead out =/);
  assert.match(normalized.verbPatterns, /plead guilty =/);
  assert.match(normalized.verbPatterns, /plead with someone =/);
  assert.match(normalized.verbPatterns, /plead for something =/);
  assert.doesNotMatch(normalized.verbPatterns, /plead at/);
  assert.equal(
    normalized.translationSections.some((section) => section.key === 'verbPatterns'),
    true
  );
});

test('common at and in verb patterns expand without treating unrelated words as phrases', () => {
  assert.equal(
    detectContextPhraseForSelection('pointed', 'She pointed at the exit.')?.target,
    'point at'
  );
  assert.equal(
    detectContextPhraseForSelection('checked', 'We checked in at the hotel.')?.target,
    'check in'
  );
  assert.equal(detectContextPhraseForSelection('quiet', 'The room was quiet at night.'), null);
});

test('phrasal verb prompts require whole-phrase meaning and structured explanation', () => {
  const contextText = 'It was some trick; you just cobbled together these neural networks.';
  const corePrompt = buildCoreTranslationPrompt('cobbled', contextText);
  assert.match(corePrompt, /Treat the WHOLE multi-word verb/i);
  assert.match(corePrompt, /generalMeanings, contextualMeaning, synonyms, and examples/i);
  assert.match(corePrompt, /sel: cobble together/);

  const detailPrompt = buildDetailTranslationPrompt('cobbled', contextText, {
    directTranslation: 'eldeki parçaları bir araya getirerek kabaca oluşturmak',
    sentenceTranslation: 'Bu sinir ağlarını eldeki parçaları bir araya getirerek kurmuşsun.',
    contextualMeaning: 'Hazır parçalarla hızlı ve biraz uydurma biçimde oluşturmak.',
    englishSynonyms: ['throw together', 'piece together'],
  });
  assert.match(detailPrompt, /Bütün kalıp – cobble together/);
  assert.match(detailPrompt, /Parçacığın katkısı/);
  assert.match(detailPrompt, /Dilbilgisi/);
  assert.match(detailPrompt, /Bu cümlede/);
  assert.match(detailPrompt, /Every naturalPatterns entry must use the complete phrase/);
});

test('phrasal verb normalizer repairs incomplete model explanations', () => {
  const contextText = 'It was some trick; you just cobbled together these neural networks.';
  const result = normalizeDetailTranslationOutput(
    JSON.stringify({
      explanation: '- **cobble:** parçaları hızlıca birleştirmek.',
      naturalPatterns: [
        'cobble together a solution = eldeki parçalarla bir çözüm oluşturmak',
        'cobble together a team = aceleyle bir ekip kurmak',
        'cobble something together = bir şeyi mevcut parçalarla kabaca oluşturmak',
      ],
      etymology: '',
    }),
    'cobbled',
    contextText,
    {
      directTranslation: 'eldeki parçaları bir araya getirerek kabaca oluşturmak',
      sentenceTranslation: 'Bu sinir ağlarını eldeki parçaları bir araya getirerek kurmuşsun.',
      contextualMeaning: 'Hazır parçalarla hızlı ve biraz uydurma biçimde oluşturmak.',
      englishSynonyms: ['throw together', 'piece together'],
    }
  );

  assert.equal(result.targetText, 'cobble together');
  assert.match(result.explanation, /\*\*Bütün kalıp – cobble together:\*\*/);
  assert.match(result.explanation, /\*\*Parçacığın katkısı – together:\*\*/);
  assert.match(result.explanation, /\*\*Dilbilgisi:\*\*/);
  assert.match(result.explanation, /\*\*Bu cümlede:\*\*/);
  assert.match(result.explanation, /yalnızca ilk fiilin anlamı değildir/);
  assert.doesNotMatch(result.explanation, /anlamında kullanılıyor anlamında/i);
});

test('phrasal verb normalizer removes contradictory grammar disclaimers', () => {
  const result = normalizeDetailTranslationOutput(
    JSON.stringify({
      explanation: [
        '**Bütün kalıp – stray into:** Başka bir alana kaymak.',
        '**Parçacığın katkısı:** into yöneliş bildirir.',
        '**Dilbilgisi:** Ayrılmayan bir kalıptır (ayrılabilirlik güvenle söylenemez); ardından isim gelir.',
        '**Bu cümlede:** Heyecan verici alana kaymamak anlamındadır.',
      ].join('\n'),
      naturalPatterns: [
        'stray into politics = siyasete kaymak',
        'stray into a topic = bir konuya kaymak',
        'stray into danger = tehlikeli bir alana girmek',
      ],
    }),
    'strayed',
    'They never strayed into the realm of the frankly exciting.',
    {
      directTranslation: 'bir alana kaymak',
      sentenceTranslation: 'Açıkça heyecan verici alana hiç kaymadılar.',
      contextualMeaning: 'Heyecan verici alana geçmemek.',
    }
  );

  assert.match(result.explanation, /\*\*Dilbilgisi:\*\* Ayrılmayan bir kalıptır; ardından isim gelir/);
  assert.doesNotMatch(result.explanation, /güvenle söylenemez/i);
});

test('phrasal verb sentence highlight matches Turkish inflected verb forms', () => {
  const contextText =
    'They dealt with the material and never strayed into the realm of the frankly exciting.';
  const detected = detectContextPhraseForSelection('strayed', contextText);
  assert.equal(detected?.target, 'stray into');
  assert.equal(detected?.surface, 'strayed into');

  const selectedPhrase = detectContextPhraseForSelection('strayed into', contextText);
  assert.equal(selectedPhrase?.target, 'stray into');

  const result = normalizeTranslationOutput(
    JSON.stringify({
      mode: 'term',
      directTranslation: 'kaymak, sapmak, icine suruklenmek',
      sentenceTranslation:
        'Ders kitabi yazarlarinin ele aldiklari konunun acikca heyecan verici alana asla kaymamasini saglamak icin tuhaf bir gizli anlasma varmis gibiydi.',
      contextualMeaning: 'Bir konunun sinirini asarak baska bir alana dogru istemsizce yonelmesi.',
      englishSynonyms: ['wander into', 'drift into', 'veer into'],
      mnemonic: '',
    }),
    'strayed',
    contextText
  );

  assert.equal(result.targetText, 'stray into');
  const sentenceSection = result.translationSections.find((section) => section.key === 'sentenceTranslation');
  assert.equal(sentenceSection?.highlightText, 'kaymamasini');

  const naturalPatternsSection = result.translationSections.find((section) => section.key === 'naturalPatterns');
  assert.match(naturalPatternsSection?.value || '', /stray into the realm of something =/);
});

test('term normalization uses expanded phrasal verb for fallbacks', () => {
  const result = normalizeTranslationOutput(
    JSON.stringify({
      mode: 'term',
      directTranslation: 'eldeki parcalarla hizlica kurmak',
      sentenceTranslation: 'Bu sinir aglarini eldeki parcalari bir araya getirerek kurmussun.',
      contextualMeaning: 'Bir seyi hazir parcalardan aceleyle ve biraz uyduruk bicimde olusturmak.',
      englishSynonyms: ['throw together', 'piece together', 'improvise'],
      mnemonic: '',
    }),
    'cobbled',
    'You just cobbled together these neural networks.'
  );

  assert.equal(result.targetText, 'cobble together');
  assert.equal(result.contextPhrase?.surface, 'cobbled together');
  const naturalPatternsSection = result.translationSections.find((section) => section.key === 'naturalPatterns');
  assert.ok(naturalPatternsSection, 'cobble together should recover natural patterns');
  assert.match(naturalPatternsSection.value, /cobble together a solution =/);

  const mnemonicSection = result.translationSections.find((section) => section.key === 'mnemonic');
  assert.ok(mnemonicSection, 'cobble together should recover a mnemonic');
  assert.match(mnemonicSection.value, /cobble \+ together/i);
  assert.equal(isWeakMnemonic('cobble together', mnemonicSection.value), false);
});

test('phrasal verb expansion avoids unrelated plain words', () => {
  assert.equal(
    detectContextPhraseForSelection('precedes', 'It precedes the noun in this sentence.'),
    null
  );
  const prompt = buildTranslationPrompt('precedes', 'It precedes the noun in this sentence.');
  assert.match(prompt, /sel: precedes/);
  assert.doesNotMatch(prompt, /phraseSurface/);
});

test('term explanation strips leaked EN/TR labels before popup rendering', () => {
  const result = normalizeTranslationOutput(
    JSON.stringify({
      mode: 'term',
      directTranslation: 'akademik',
      sentenceTranslation: 'Daha sonra dikkatimi daha akademik bir sekilde bilimsel oneme yoneltti.',
      contextualMeaning: 'akademik, bilimsel ciddiyet tasiyan, arastirmaci uslupta',
      explanation: [
        '- **EN:** *scholarly* = connected to serious study and learning. **TR:** *scholarly* = ciddi arastirma ve ogrenmeyle ilgili, akademik.',
        '- **EN:** It is often used for writing or tone. **TR:** Sikca yazi, uslup ya da dusunce tarzi icin kullanilir.',
      ].join('\n'),
      englishSynonyms: ['academic', 'learned'],
      mnemonic: '',
    }),
    'scholarly',
    'then turned in a more scholarly manner to the scientific import of the drawing'
  );

  const explanationSection = result.translationSections.find((section) => section.key === 'explanation');
  assert.ok(explanationSection, 'explanation section should survive cleanup');
  assert.doesNotMatch(explanationSection.value, /\*\*EN:\*\*|\*\*TR:\*\*|\bEN:|\bTR:/);
  assert.doesNotMatch(explanationSection.value, /connected to serious study/i);
  assert.match(explanationSection.value, /ciddi arastirma ve ogrenmeyle ilgili/);
  assert.match(explanationSection.value, /Sikca yazi/);
});

test('term explanation replaces literal placeholder labels with target text', () => {
  const result = normalizeTranslationOutput(
    JSON.stringify({
      mode: 'term',
      directTranslation: 'terk etmek',
      sentenceTranslation: 'Beni yalniz birakiyorsun.',
      contextualMeaning: 'birini desteksiz birakmak',
      explanation: [
        '- **piece:** Birini **yalniz ve desteksiz** birakma vurgusu.',
        'actual EN part: Cumlede duygusal suclama tonu var.',
      ].join('\n'),
      englishSynonyms: ['leave', 'desert'],
      mnemonic: '',
    }),
    'abandon',
    'You abandon me to handle this alone.'
  );

  const explanationSection = result.translationSections.find((section) => section.key === 'explanation');
  assert.ok(explanationSection, 'explanation section should survive cleanup');
  assert.doesNotMatch(explanationSection.value, /\bpiece\b|actual EN part/i);
  assert.match(explanationSection.value, /\*\*abandon:\*\*/);
});

test('term explanation replaces leaked English parca meta labels with real phrase labels', () => {
  const result = normalizeTranslationOutput(
    JSON.stringify({
      mode: 'term',
      directTranslation: 'sarilmak',
      sentenceTranslation: 'Sen sarilmayi ve ic saka yapmayi seversin.',
      contextualMeaning: 'samimi fiziksel yakinlik ve grup ici saka sevgisi',
      explanation: [
        '- **English parca:** snuggling = sarilarak yakin ve rahat bir fiziksel yakinlasma eylemi.',
        'English parca: inside jokes = yalnizca belli bir grup tarafindan anlasilabilen ozel sakalar.',
      ].join('\n'),
      englishSynonyms: ['cuddle', 'nestle'],
      mnemonic: '',
    }),
    'snuggling',
    'You like snuggling and inside jokes.'
  );

  const explanationSection = result.translationSections.find((section) => section.key === 'explanation');
  assert.ok(explanationSection, 'explanation section should survive cleanup');
  assert.doesNotMatch(explanationSection.value, /English parca|English part|actual EN part|piece/i);
  assert.match(explanationSection.value, /\*\*snuggling:\*\* sarilarak yakin/);
  assert.match(explanationSection.value, /\*\*inside jokes:\*\* yalnizca belli/);
});

test('term formatter recovers partial JSON without showing raw JSON as translation', () => {
  const result = normalizeTranslationOutput(
    '{"mode":"term","directTranslation":"terk etmek","sentenceTranslation":"Aramayi gormezden gelerek beni terk ediyorsun.","sentenceHighlightText":"terk ediyorsun","contextualMeaning":"birini zor anda yalniz birakmak","explanation":"- **piece:** Birini geride birakma',
    'abandon',
    'By ignoring the call, you abandon me in the middle of the crisis.'
  );

  assert.equal(result.partial, true);
  assert.equal(result.detailStatus, 'partial_json_recovered');
  assert.equal(result.directTranslation, 'terk etmek');
  assert.doesNotMatch(result.directTranslation, /^\{/);
  assert.match(result.sentenceTranslation, /Aramayi/);
  const explanationSection = result.translationSections.find((section) => section.key === 'explanation');
  assert.ok(explanationSection, 'partial explanation should be recovered if present');
  assert.doesNotMatch(explanationSection.value, /\bpiece\b/i);
});

test('term formatter creates Context Translator style explanation fallback when model omits explanation', () => {
  const result = normalizeTranslationOutput(
    JSON.stringify({
      mode: 'term',
      directTranslation: 'terk etmek; birakip gitmek',
      sentenceTranslation: 'Kaptan, firtinada ekibi terk etmeyi reddetti.',
      sentenceHighlightText: 'terk etmeyi',
      contextualMeaning: 'zor durumda olan birini kendi haline birakip gitmek',
      englishSynonyms: ['leave', 'desert'],
      naturalPatterns: ['abandon someone = birini kaderine birakmak'],
      explanation: '',
    }),
    'abandon',
    'The captain refused to abandon the crew during the storm.'
  );

  const explanationSection = result.translationSections.find((section) => section.key === 'explanation');
  assert.ok(explanationSection, 'fallback explanation should create a visible section');
  assert.match(explanationSection.value, /- \*\*abandon:\*\*/);
  assert.match(explanationSection.value, /- \*\*bağlam:\*\*|- \*\*baglam:\*\*/i);
  assert.match(explanationSection.value, /Özet:|Ozet:/);
});

test('term prompt asks for structured fields and sentence prompt does not', () => {
  const termPrompt = buildTranslationPrompt('trouble', 'Why atoms take this trouble is a bit of a puzzle.');
  assert.match(termPrompt, /directTranslation/);
  assert.match(termPrompt, /sentenceTranslation/);
  assert.match(termPrompt, /sentenceHighlightText/);
  assert.match(termPrompt, /contextualMeaning/);
  assert.match(termPrompt, /contextExplanation/);
  assert.match(termPrompt, /explanation/);
  assert.match(termPrompt, /etymology/);
  assert.match(termPrompt, /naturalPatterns/);
  assert.match(termPrompt, /englishSynonyms/);
  assert.match(termPrompt, /mnemonic/);
  assert.match(termPrompt, /explanation=2-4/i);
  assert.match(termPrompt, /"\*\*exact EN:\*\* TR"/i);
  assert.match(termPrompt, /no meta/i);
  assert.match(termPrompt, /naturalPatterns=4-5 "EN=TR"/i);
  assert.match(termPrompt, /no EN-only/i);
  assert.doesNotMatch(termPrompt, /\*\*EN:\*\*/);
  assert.doesNotMatch(termPrompt, /\*\*TR:\*\*/);
  assert.match(termPrompt, /phonetic cue=concrete TR scene=meaning/);
  assert.match(termPrompt, /no raw letters/i);
  assert.match(termPrompt, /Markdown only expl\/etym/i);
  assert.match(termPrompt, /no HTML/i);
  assert.doesNotMatch(termPrompt, /\bspan\b/i);

  const sentencePrompt = buildTranslationPrompt(
    'Why atoms take this trouble is a bit of a puzzle.',
    'Why atoms take this trouble is a bit of a puzzle.'
  );
  assert.match(sentencePrompt, /"mode"\s*:\s*"sentence"/);
  assert.doesNotMatch(sentencePrompt, /englishSynonyms/);
  assert.doesNotMatch(sentencePrompt, /mnemonic/);
  assert.ok(sentencePrompt.length <= 280, `sentence prompt was too long: ${sentencePrompt.length}`);
});

test('context explanation uses nearby sentences and survives detail enrichment separately', () => {
  const contextText = [
    'The science writers I admire never wrote a textbook I used.',
    'Sadly, none of them wrote any textbook I ever used.',
    'All mine were written by men, and it was always men, who made everything formulaic.',
    'The author is criticizing the dull textbooks from his school years.',
  ].join(' ');
  const prompt = buildCoreTranslationPrompt('mine', contextText);
  assert.match(prompt, /contextExplanation REQUIRED/i);
  assert.match(prompt, /none of them wrote any textbook I ever used/i);
  assert.match(prompt, /All mine were written by men/i);
  assert.match(prompt, /author is criticizing the dull textbooks/i);

  const core = normalizeCoreTranslationOutput(JSON.stringify({
    directTranslation: 'benimkiler; benim kullandıklarım',
    sentenceTranslation: 'Benim kullandığım kitapların hepsi erkekler tarafından yazılmıştı.',
    sentenceHighlightText: 'Benim kullandığım kitapların',
    generalMeanings: ['pron.: benimki, benim olan', 'n.: maden'],
    contextualMeaning: 'Yazarın okulda kullandığı ders kitapları',
    contextExplanation: 'Buradaki “mine” tek başına genel olarak “benimkiler” demektir. Önceki cümlede söz edilen “textbook I ever used” ifadesi nedeniyle burada yazarın kullandığı ders kitaplarının yerini tutar.',
    englishSynonyms: ['my ones'],
  }), 'mine', contextText);

  const contextSection = core.translationSections.find((section) => section.key === 'contextExplanation');
  assert.equal(contextSection?.label, 'Bağlama göre açıklama');
  assert.match(contextSection?.value || '', /ders kitaplarının yerini tutar/);

  const detailed = normalizeDetailTranslationOutput(JSON.stringify({
    explanation: '**mine:** “my” zamirinin tek başına kullanılan biçimidir.',
    naturalPatterns: [
      'a friend of mine = arkadaşlarımdan biri',
      'mine is here = benimki burada',
      'that book is mine = o kitap benim',
    ],
    verbPatterns: [],
    etymology: '',
  }), 'mine', contextText, core);
  assert.equal(detailed.contextExplanation, core.contextExplanation);
  assert.match(detailed.explanation, /“my” zamirinin/);
  assert.notEqual(detailed.contextExplanation, detailed.explanation);
  assert.ok(
    detailed.translationSections.findIndex((section) => section.key === 'contextExplanation') <
      detailed.translationSections.findIndex((section) => section.key === 'explanation')
  );
});

test('bare natural pattern rows get Turkish fallback details', () => {
  const result = normalizeTranslationOutput(
    JSON.stringify({
      mode: 'term',
      directTranslation: 'hirpalanmis',
      sentenceTranslation: 'Kitap hirpalanmisti.',
      contextualMeaning: 'yipranmis ve ustu basi bozulmus bir nesneyi anlatir',
      naturalPatterns: [
        'battered old book',
        'a battered car',
        'battered by the storm',
      ],
      englishSynonyms: ['worn', 'damaged'],
      mnemonic: '',
    }),
    'battered',
    'The book was battered and unloved.'
  );

  const naturalPatternsSection = result.translationSections.find((section) => section.key === 'naturalPatterns');
  assert.match(naturalPatternsSection?.value || '', /battered old book = hirpalanmis anlam.ndaki kullan.m/);
  assert.match(naturalPatternsSection?.value || '', /a battered car = hirpalanmis anlam.ndaki kullan.m/);
  assert.match(naturalPatternsSection?.value || '', /battered by the storm = hirpalanmis anlam.ndaki kullan.m/);
});

test('term prompt stays bounded while preserving context explanation and the structured schema', () => {
  const prompt = buildTranslationPrompt(
    'uncomplainingly',
    'For the next many years these tiny particles will uncomplainingly engage in all the billions of deft, cooperative efforts necessary to keep you intact.'
  );

  assert.ok(prompt.length <= 1400, `prompt was too long: ${prompt.length}`);
  assert.match(prompt, /directTranslation/);
  assert.match(prompt, /sentenceTranslation/);
  assert.match(prompt, /sentenceHighlightText/);
  assert.match(prompt, /contextualMeaning/);
  assert.match(prompt, /contextExplanation/);
  assert.match(prompt, /etymology/);
  assert.match(prompt, /naturalPatterns/);
  assert.match(prompt, /englishSynonyms/);
  assert.match(prompt, /mnemonic/);
});

test('quick term prompt returns only first-visible translation fields', () => {
  const quickPrompt = buildQuickTranslationPrompt(
    'comprehensible',
    'It was not entirely comprehensible.'
  );
  const fullPrompt = buildTranslationPrompt(
    'comprehensible',
    'It was not entirely comprehensible.'
  );

  assert.ok(quickPrompt.length < fullPrompt.length, 'quick prompt should be shorter than full prompt');
  assert.match(quickPrompt, /"directTranslation"/);
  assert.match(quickPrompt, /"sentenceTranslation"/);
  assert.match(quickPrompt, /directTranslation=selected term\/phrase only/);
  assert.match(quickPrompt, /sentenceTranslation=full context sentence/);
  assert.doesNotMatch(quickPrompt, /naturalPatterns/);
  assert.doesNotMatch(quickPrompt, /etymology/);
  assert.doesNotMatch(quickPrompt, /englishSynonyms/);
  assert.doesNotMatch(quickPrompt, /mnemonic/);

  const normalized = normalizeQuickTranslationOutput(
    '{"directTranslation":"anlaşılır","sentenceTranslation":"Aslında bütünüyle anlaşılır değildi."}',
    'comprehensible',
    'It was not entirely comprehensible.'
  );
  assert.equal(normalized.partial, true);
  assert.equal(normalized.detailStatus, 'loading');
  assert.deepEqual(normalized.translationSections.map((section) => section.key), [
    'directTranslation',
    'sentenceTranslation',
  ]);
});

test('progressive core keeps the quality model focused on translation and meanings', () => {
  const prompt = buildCoreTranslationPrompt(
    'perspicacious',
    'Her perspicacious analysis exposed assumptions that the committee had missed.'
  );
  assert.match(prompt, /high-quality core/i);
  assert.match(prompt, /generalMeanings/);
  assert.match(prompt, /contextualMeaning/);
  assert.match(prompt, /englishSynonyms/);
  assert.doesNotMatch(prompt, /naturalPatterns/);
  assert.doesNotMatch(prompt, /"mnemonic"/);

  const normalized = normalizeCoreTranslationOutput(JSON.stringify({
    directTranslation: 'keskin kavrayisli',
    sentenceTranslation: 'Onun keskin kavrayisli analizi, komitenin kacirdigi varsayimlari ortaya cikardi.',
    sentenceHighlightText: 'keskin kavrayisli',
    generalMeanings: [
      { pos: 'adj.', meaning: 'keskin kavrayisli' },
      { partOfSpeech: 'adj.', definition: 'ongorulu' },
    ],
    contextualMeaning: 'Gizli varsayimlari fark edecek kadar guclu kavrayisa sahip.',
    englishSynonyms: ['perceptive', 'astute'],
  }), 'perspicacious', 'Her perspicacious analysis exposed assumptions that the committee had missed.');
  assert.equal(normalized.partial, true);
  assert.equal(normalized.detailStatus, 'core_complete');
  assert.match(normalized.generalMeanings, /1\) adj\.: keskin kavrayisli/);
  assert.match(normalized.generalMeanings, /2\) adj\.: ongorulu/);
  assert.deepEqual(normalized.translationSections.map((section) => section.key), [
    'directTranslation',
    'sentenceTranslation',
    'generalMeanings',
    'englishSynonyms',
    'contextualMeaning',
  ]);
  assert.equal(normalized.translationSections.some((section) => section.key === 'explanation'), false);
  assert.equal(normalized.translationSections.some((section) => section.key === 'contextualMeaning'), true);
});

test('progressive details merge focused enrichment into the quality core', () => {
  const core = {
    directTranslation: 'keskin kavrayisli',
    sentenceTranslation: 'Onun keskin kavrayisli analizi varsayimlari ortaya cikardi.',
    sentenceHighlightText: 'keskin kavrayisli',
    generalMeanings: '1) adj.: keskin kavrayisli\n2) adj.: ongorulu',
    contextualMeaning: 'Gizli varsayimlari fark eden.',
    englishSynonyms: ['perceptive', 'astute'],
  };
  const prompt = buildDetailTranslationPrompt('perspicacious', 'Her perspicacious analysis exposed assumptions.', core);
  assert.match(prompt, /supplied high-quality core/i);
  assert.match(prompt, /EXACTLY 3/);
  assert.doesNotMatch(prompt, /"mnemonic"/);

  const normalized = normalizeDetailTranslationOutput(JSON.stringify({
    explanation: '**perspicacious analysis:** sakli varsayimlari fark eden derin analiz.',
    etymology: 'perspicere|iyice gormek|Latin',
    naturalPatterns: [
      'perspicacious analysis=isabetli analiz',
      'perspicacious observer=keskin gozlemci',
      'perspicacious insight=derin kavrayis',
    ],
  }), 'perspicacious', 'Her perspicacious analysis exposed assumptions.', core);
  assert.equal(normalized.partial, false);
  assert.equal(normalized.detailStatus, 'complete');
  assert.equal(normalized.directTranslation, core.directTranslation);
  assert.ok(normalized.explanation);
  assert.equal(normalized.translationSections.some((section) => section.key === 'naturalPatterns'), true);
  assert.equal(normalized.translationSections.some((section) => section.key === 'mnemonic'), false);
});

test('progressive details split usage and etymology into mergeable parallel prompts', () => {
  const core = {
    directTranslation: 'cokmek; sarkmak',
    sentenceTranslation: 'Dunyanin bir kismi bosluga cokebilir.',
    generalMeanings: '1) verb: cokmek\n2) noun: gerileme',
    contextualMeaning: 'destegini kaybedip asagi cokmek',
    englishSynonyms: ['collapse', 'sink'],
  };
  const usagePrompt = buildDetailUsagePrompt('slump', 'Will some of the Earth slump into the void?', core);
  const etymologyPrompt = buildDetailEtymologyPrompt('slump', 'Will some of the Earth slump into the void?', core);
  assert.match(usagePrompt, /ONLY the usage half/i);
  assert.match(usagePrompt, /EXACTLY 3/);
  assert.doesNotMatch(usagePrompt, /historical form or affix/i);
  assert.match(etymologyPrompt, /ONLY the etymology half/i);
  assert.match(etymologyPrompt, /historical form or affix/i);
  assert.doesNotMatch(etymologyPrompt, /naturalPatterns=EXACTLY 3/i);

  const merged = JSON.parse(mergeDetailTranslationOutputs(
    JSON.stringify({
      explanation: '**slump:** destegini kaybedip birden asagi cokmek.',
      naturalPatterns: ['prices slump = fiyatlar duser'],
      verbPatterns: ['slump into = icine cokmek'],
    }),
    JSON.stringify({ etymology: 'slump|cokmek|Orta Ingilizce' })
  ));
  assert.match(merged.explanation, /slump/);
  assert.deepEqual(merged.naturalPatterns, ['prices slump = fiyatlar duser']);
  assert.match(merged.etymology, /Orta Ingilizce/);
});

test('phonetic mnemonic hooks accept close whole sounds without accepting the target alone', () => {
  assert.equal(
    isWeakMnemonic('slump', 'slop diye cok = Dev kaya slop diye bosluga cokuyor = slump; cokmek'),
    false
  );
  assert.equal(
    isWeakMnemonic('slump', 'slump = Dev kaya bosluga cokuyor = slump; cokmek'),
    true
  );
  assert.equal(
    isWeakMnemonic('languish', 'langirt = Langirt masasinin altindaki saksi gunes gormeyince solup gelisemedi = languish; gucten dusmek'),
    false
  );
});

test('etymology prompt requires a real language chain and enquiring repairs shallow rows', () => {
  const core = {
    directTranslation: 'meraklı; sorgulayan',
    sentenceTranslation: 'Normal ve meraklı bir zihin bunun nasıl bilindiğini sorar.',
    generalMeanings: '1) adj.: meraklı, sorgulayıcı\n2) adj.: araştıran, soruşturan',
    contextualMeaning: 'Sürekli soru soran ve öğrenmeye çalışan bir zihni anlatır.',
    englishSynonyms: ['curious', 'inquisitive', 'questioning'],
  };
  const prompt = buildDetailTranslationPrompt(
    'enquiring',
    'A normal enquiring mind asks how on earth we know this.',
    core
  );
  assert.match(prompt, /Distinguish Middle English from Old English/i);
  assert.match(prompt, /never present the modern spelling as its own Old English source/i);
  assert.match(prompt, /explain inflectional morphology separately/i);
  assert.match(prompt, /Ban vague notes/i);

  const normalized = normalizeDetailTranslationOutput(JSON.stringify({
    explanation: '**enquiring:** meraklı ve soru soran.',
    etymology: [
      'enquire | soru sormak, araştırmak | Eski İngilizce inquire/enqueren çizgisi',
      'ing | sıfat yapan ek | İngilizce fiil kökenli sıfat',
    ],
    naturalPatterns: [
      'an enquiring mind = meraklı bir zihin',
      'an enquiring look = sorgulayıcı bir bakış',
      'an enquiring child = meraklı bir çocuk',
    ],
  }), 'enquiring', 'A normal enquiring mind asks how on earth we know this.', core);

  assert.match(normalized.etymology, /Orta İngilizce enqueren\/inquiren/);
  assert.match(normalized.etymology, /Eski Fransızca enquerre/);
  assert.match(normalized.etymology, /Latince in-/);
  assert.match(normalized.etymology, /quaerere/);
  assert.match(normalized.etymology, /Eski İngilizce -ende/);
  assert.doesNotMatch(normalized.etymology, /Eski İngilizce inquire\/enqueren/);
  assert.doesNotMatch(normalized.etymology, /sıfat yapan ek/);
});

test('term prompt keeps the selected sentence plus bounded neighboring context', () => {
  const contextText = [
    'Welcome. And congratulations.',
    'Why atoms take this trouble is a bit of a puzzle.',
    'Being you is not a gratifying experience at the atomic level.',
  ].join(' ');

  assert.equal(
    extractContextSentence('trouble', contextText),
    'Why atoms take this trouble is a bit of a puzzle.'
  );

  const prompt = buildTranslationPrompt('trouble', contextText);
  assert.match(prompt, /Why atoms take this trouble is a bit of a puzzle\./);
  assert.match(prompt, /contextWindow:/);
  assert.match(prompt, /Welcome\. And congratulations\./);
  assert.match(prompt, /Being you is not a gratifying experience/);
});
