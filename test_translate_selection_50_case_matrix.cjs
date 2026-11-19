const assert = require('node:assert/strict');
const test = require('node:test');

const {
  isWeakMnemonic,
  normalizeTranslationOutput,
} = require('./translate-selection-format.cjs');

const cases = [
  ['absurd', 'sacma', 'sacma bir fikir'],
  ['arbitrary', 'keyfi', 'keyfi bir karar'],
  ['arcane', 'gizemli', 'gizemli bilgi'],
  ['beneficiary', 'yararlanan kisi', 'yararlanan kisi'],
  ['bewildered', 'kafasi karismis', 'kafasi karismis halde'],
  ['comprehensible', 'anlasilir', 'butunuyle anlasilir'],
  ['conceive', 'tasavvur etmek', 'tasavvur etmek'],
  ['decline', 'azalmak', 'giderek azalmak'],
  ['deft', 'usta', 'usta bir hareket'],
  ['devoted', 'adanmis', 'adanmis dikkat'],
  ['disassemble', 'parcalara ayirmak', 'parcalara ayirmak'],
  ['drifting', 'suruklenen', 'suruklenen atomlar'],
  ['elaborate', 'ayrintili', 'ayrintili duzen'],
  ['enigmatic', 'gizemli', 'gizemli aciklama'],
  ['elsewhere', 'baska yerde', 'baska yerde olmak'],
  ['fleeting', 'kisa sureli', 'kisa sureli an'],
  ['fickle', 'kararsiz', 'kararsiz atomlar'],
  ['forebears', 'atalar', 'atalar'],
  ['gratifying', 'tatmin edici', 'tatmin edici deneyim'],
  ['intricate', 'karmasik', 'karmasik duzen'],
  ['milestone', 'donum noktasi', 'donum noktasi'],
  ['modest', 'mutevazi', 'mutevazi hedef'],
  ['mound', 'yigin', 'yigin'],
  ['mundane', 'siradan', 'siradan hayat'],
  ['obliging', 'yardimsever', 'yardimsever tutum'],
  ['possessors', 'sahipler', 'bilgi sahipleri'],
  ['privileged', 'ayricalikli', 'ayricalikli bilgi'],
  ['pronouncement', 'aciklama', 'resmi aciklama'],
  ['rigid', 'sert', 'sert tepki'],
  ['slander', 'iftira', 'iftira'],
  ['thereabouts', 'o civarda', 'o civarda'],
  ['transfixed', 'buyulenmis', 'buyulenmis halde'],
  ['tweezers', 'cimbiz', 'cimbiz'],
  ['uncomplainingly', 'sikayet etmeden', 'sikayet etmeden yapmak'],
  ['underappreciated', 'degeri bilinmeyen', 'degeri bilinmeyen durum'],
  ['tenuous', 'zayif', 'zayif bag'],
  ['discrete', 'ayri', 'ayri katmanlar'],
  ['dismaying', 'moral bozucu', 'moral bozucu haber'],
  ['cooperative', 'isbirlikci', 'isbirlikci cabalar'],
  ['arresting', 'dikkat cekici', 'dikkat cekici fikir'],
  ['impulse', 'ani istek', 'ani istek'],
  ['intact', 'saglam', 'saglam kalmak'],
  ['particles', 'parcaciklar', 'parcaciklar'],
  ['arrangement', 'duzenleme', 'ozel duzenleme'],
  ['peculiar', 'tuhaf', 'tuhaf durum'],
  ['atomic', 'atomik', 'atomik seviye'],
  ['obscure', 'belirsiz', 'belirsiz bilgi'],
  ['immense', 'muazzam', 'muazzam buyukluk'],
  ['fleetingly', 'gecici bicimde', 'gecici bicimde'],
  ['nonetheless', 'yine de', 'yine de'],
];

assert.equal(cases.length, 50, 'matrix must contain exactly 50 translation cases');

for (const [word, directTranslation, phrase] of cases) {
  test(`translation formatter keeps full term card fields: ${word}`, () => {
    const result = normalizeTranslationOutput(
      JSON.stringify({
        mode: 'term',
        directTranslation,
        sentenceTranslation: `Bu cumlede ${phrase} anlaminda kullaniliyor.`,
        sentenceHighlightText: phrase,
        contextualMeaning: `${directTranslation} anlamini bu baglamda dogal bicimde verir.`,
        naturalPatterns: [
          `${word} context = baglamda ${directTranslation}; This is a ${word} case. = Bu ${directTranslation} bir durumdur.`,
          `${word} example = ${directTranslation} ornegi; He noticed the ${word} detail. = ${directTranslation} ayrintiyi fark etti.`,
          `${word} use = ${directTranslation} kullanimi; The word sounds ${word}. = Kelime ${directTranslation} duyulur.`,
          `${word} phrase = ${directTranslation} kalibi; Keep the ${word} meaning. = ${directTranslation} anlami koru.`,
        ],
        englishSynonyms: ['near match', 'contextual equivalent', 'related word'],
        mnemonic: '',
      }),
      word,
      `The selected word is ${word}.`
    );

    assert.equal(result.selectionMode, 'term');
    assert.equal(result.directTranslation, directTranslation);
    assert.deepEqual(
      result.translationSections.map((section) => section.key),
      ['directTranslation', 'sentenceTranslation', 'englishSynonyms', 'contextualMeaning', 'explanation', 'naturalPatterns', 'mnemonic']
    );

    const explanation = result.translationSections.find((section) => section.key === 'explanation');
    assert.ok(explanation?.value.includes(`**${word}:**`), `${word} should keep an explanation fallback`);

    const naturalPatterns = result.translationSections.find((section) => section.key === 'naturalPatterns');
    assert.ok(naturalPatterns?.value.includes(`${word} context =`));
    assert.ok(naturalPatterns?.value.split('\n').length >= 4);

    const mnemonic = result.translationSections.find((section) => section.key === 'mnemonic');
    assert.ok(mnemonic, `${word} should keep a mnemonic section`);
    assert.equal(isWeakMnemonic(word, mnemonic.value), false, `${word} mnemonic is weak: ${mnemonic.value}`);
  });
}
