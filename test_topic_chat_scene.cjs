const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { sceneEvidence } = require('./topic-chat-scene.cjs');

// Exercise the real host prompt without starting its HTTP/WebSocket servers.
const host = fs.readFileSync(require.resolve('./bridge-host.cjs'), 'utf8');
const promptCode = host.slice(host.indexOf('function normalizeTopicChatMessages('), host.indexOf('async function getTranslateTopicChat('));
const build = vm.runInNewContext(promptCode + '\nbuildTranslateTopicChatPrompt', {
  TRANSLATE_TOPIC_CHAT_HISTORY_LIMIT: 10,
  compactText: (value, limit) => String(value || '').trim().slice(0, limit),
  topicChatIntent: require('./topic-chat-intent.cjs'),
  topicChatFollowup: require('./topic-chat-followup.cjs'),
  sceneEvidence,
});
const scene = {
  mediaTitle: 'Example S02E02', timestamp: '00:05:32', currentSubtitle: 'It is reciprocal respect.',
  previousSubtitles: [{ timestamp: '00:05:20', text: 'Teacher: We listen to each other.' }],
};

test('broad film discussion permits known episode context without invented visual evidence', () => {
  const prompt = build({question:'neden boyle yapti',sceneContext:scene});
  const local = require('./topic-chat-research.cjs').localSceneInstructions();
  assert.match(prompt,/guvenle bildigin yapim ve bolum bilgisi/);
  assert.match(prompt,/en fazla 500 kelime/);
  assert.match(local,/Guvenle bildigin yapim\/bolum bilgisini/);
  assert.doesNotMatch(local,/Yapim hafizandan.*ekleme|2 kisa paragrafta/);
  assert.match(local,/olmayan bir goruntuyu gordugunu soyleme/);
  assert.match(local,/emin olmadigin bolum ayrintisini tahminle doldurma/);
  assert.match(local,/Sonraki olaylari anlatma/);
});

test('image identity request is a scene conversation with no dictionary or absent-image contradiction', () => {
  const prompt = build({ question: 'bu sahnedki adam kim', selectedText: 'reciprocal', sceneFrame: {},
    sceneContext: scene, contextText: 'Bu pakette video karesi yok', result: { directTranslation: 'SOZLUK_KARTI' } });
  assert.match(prompt, /film\/dizi anlatim asistanisin/);
  assert.match(prompt, /SAHNEDEKI KISI/);
  assert.match(prompt, /karakterin bu sahnedeki rolu/);
  assert.match(prompt, /Example S02E02/);
  assert.doesNotMatch(prompt, /Ingilizce ogretmenisin|SOZLUK_KARTI|video karesi yok|EKLI DEGIL|dil bilgisini yine acikla/);
});

test('text-only scene does not claim visual evidence or treat model memory as verification', () => {
  const prompt = build({ question: 'Bu sahneyi detayli anlat', sceneContext: scene });
  assert.match(prompt, /video karesi EKLI DEGIL/);
  assert.match(prompt, /Onceki asistan cevabi bagimsiz dogrulama kaniti degildir/);
  assert.match(prompt, /alt metni/);
});

test('nearest dialogue and selected line survive budget; future lines are excluded', () => {
  const rows = Array.from({ length: 38 }, (_, i) => ({ timestamp: '00:04:00', text: `ROW_${i}: ${'x'.repeat(670)}` }));
  rows.push({ timestamp: '00:05:31', text: 'NEAREST: I teach your class.' });
  rows.push({ timestamp: '00:05:40', text: 'FUTURE_SPOILER' });
  for (const quick of [true, false]) {
    const result = sceneEvidence({ sceneContext: { ...scene, dialogueTimeline: rows } }, { quick });
    assert.ok(result.length <= (quick ? 6000 : 12000));
    assert.match(result, /Example S02E02/);
    assert.match(result, /reciprocal respect/);
    assert.match(result, /NEAREST/);
    assert.doesNotMatch(result, /FUTURE_SPOILER|ROW_0:/);
  }
});

test('legacy context retains heading and closest tail rather than only old subtitles', () => {
  const result = sceneEvidence({ contextText: 'YAPIM: Test\n' + 'old '.repeat(4000) + '\nNEAREST_DIALOGUE' });
  assert.ok(result.length <= 12000);
  assert.match(result, /^YAPIM: Test/);
  assert.match(result, /NEAREST_DIALOGUE$/);
});

test('short scene follow-up does not reactivate dictionary card', () => {
  const prompt = build({ question: 'daha detayli', sceneContext: scene,
    messages: [{ role: 'user', content: 'Bu sahnede ne oluyor?' }], result: { directTranslation: 'SOZLUK_KARTI' } });
  assert.match(prompt, /SAHNENIN OLAYI/);
  assert.doesNotMatch(prompt, /SOZLUK_KARTI/);
});

test('all three reported turns receive film prompt and research; preserve full motivation history', () => {
  const research = require('./topic-chat-research.cjs');
  const classify = require('./topic-chat-intent.cjs').classifyTopicChatIntent;
  const currentScene = {...scene,currentSubtitle:'You know what? Forget it. It is fine.'};
  const history = [];
  for (const question of ['burada olay ne', 'yahu bu sahneyi niye cekmisler anlat. bu sahnenin amaci ne',
    'alt tarafi istedigi yemegi bulamadi.niye bu kadar dert etti bu kari']) {
    const payload = {question,selectedText:'forget',sceneContext:currentScene,messages:history,result:{directTranslation:'DICTIONARY_CARD'}};
    const prompt = build(payload);
    assert.match(prompt,/film sohbetidir, altyazi dersi degil/);
    assert.match(prompt,/sahnenin asil derdini/);
    assert.doesNotMatch(prompt,/Ingilizce ogretmenisin|DICTIONARY_CARD/);
    assert.ok(research.researchRequest(payload,classify(question,history,currentScene).kind,false));
    if (history.length) assert.match(prompt,/RELATIONSHIP_MOTIVATION_AT_END/);
    history.push({role:'user',content:question},{role:'assistant',content:'Relevant story context. '.repeat(45)+'RELATIONSHIP_MOTIVATION_AT_END'});
  }
});
