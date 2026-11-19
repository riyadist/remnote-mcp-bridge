const assert = require('node:assert/strict');
const test = require('node:test');

const intent = require('./topic-chat-intent.cjs');

test('real-world why questions are not reduced to source-text interpretation', () => {
  for (const question of [
    'bahsettigi gibi neden okyanuslar salty ve goller tatli',
    'Neden okyanuslar tuzlu ama Buyuk Goller tatli?',
    'Gercekte bu olay nasil oluyor?',
  ]) {
    assert.equal(intent.classifyTopicChatIntent(question).kind, 'world_knowledge', question);
  }
  const instructions = intent.topicChatIntentInstructions({ kind: 'world_knowledge' });
  assert.match(instructions, /temel neden-sonuc mekanizmasini acikla/);
  assert.match(instructions, /"Yazar burada sunu soruyor" diye cumleyi yeniden anlatma/);
});

test('contextual and lexical questions keep their language-teaching routes', () => {
  assert.equal(
    intent.classifyTopicChatIntent('Bu cumlede prose neden lucid ile birlikte kullanilmis?').kind,
    'contextual_usage'
  );
  assert.equal(
    intent.classifyTopicChatIntent('Bu kullanim neden boyle?').kind,
    'contextual_usage'
  );
  assert.equal(
    intent.classifyTopicChatIntent('prose ve prose style farki ne?').kind,
    'lexical'
  );
});

test('scene identity questions stay grounded in the captured scene', () => {
  for (const question of [
    'bu kadın kimdi buradaki',
    'o adam kim?',
    'hangi karakter bu',
    'bu kimdi',
    'bu sahnedki adam kim',
    'Bu sahnedeki adam kim?',
    'ekrandaki kadın kimdir',
  ]) {
    assert.equal(intent.classifyTopicChatIntent(question).kind, 'scene_identity', question);
  }
  const instructions = intent.topicChatIntentInstructions({ kind: 'scene_identity' });
  assert.match(instructions, /TIKLAMA ZAMANI/);
  assert.match(instructions, /isim uydurma/);
  assert.match(instructions, /sozluk anlamina sapma/);
});

test('scene explanation questions do not fall back to dictionary teaching', () => {
  for (const question of [
    'Bu sahnede ne oluyor ve bu söz neden söyleniyor?',
    'Burada ne oluyor?',
    'Bu sahneyi anlat',
    'Bu replik neden söyleniyor?',
    'Filmde burada neden tartışıyorlar?',
    'Sahneyi detaylı açıkla, ilişkileri ne?',
  ]) {
    assert.equal(intent.classifyTopicChatIntent(question).kind, 'scene_explanation', question);
  }
  const instructions = intent.topicChatIntentInstructions({ kind: 'scene_explanation' });
  assert.match(instructions, /kelimeyi sozluk maddesi gibi anlatma/);
  assert.match(instructions, /Kim kime ne yapiyor, neden/);
  assert.match(instructions, /onceki olaylarla iliskisi/);
  assert.match(instructions, /anlatidaki islevi/);
  assert.match(instructions, /"bir taraf", "diger taraf", "iki kisi"/);
  assert.match(instructions, /KONUSMACI BLOKLARI/);
  assert.match(instructions, /<<TIKLANAN>> parcayi/);
  assert.match(instructions, /daha sonraki turundeki repligi tiklanan cumlenin amacina karistirma/);
});

test('scene follow-ups retain the scene route without swallowing lexical questions', () => {
  const history = [{ role: 'user', content: 'bu sahnedki adam kim' }, { role: 'assistant', content: 'Kisi belirsiz.' }];
  for (const question of ['anlat', 'daha detaylı', 'peki neden', 'aralarındaki ilişki ne']) {
    assert.equal(intent.classifyTopicChatIntent(question, history).kind, 'scene_explanation');
  }
  assert.equal(intent.classifyTopicChatIntent('reciprocal ne demek', history).kind, 'lexical');
  assert.equal(intent.classifyTopicChatIntent('Bu sahnede reciprocal ne demek?', history).kind, 'contextual_usage');
  assert.equal(intent.classifyTopicChatIntent('anlat', [{ role: 'user', content: 'prose ne demek' }]).kind, 'general');
});

test('scene quick preview reports only evidence-backed speaker order', () => {
  const preview = intent.sceneSpeakerPreview([
    '- [Christian] just a guess / <<TIKLANAN>> Those pearly whites after I make / a few calls',
    '- [Jude] you make that call, Dr. Troy',
    '- [Christian] do it',
  ].join('\n'));
  assert.equal(preview.speaker, 'Christian');
  assert.equal(preview.addressee, 'Jude');
  assert.match(preview.answer, /^Kim kime söylüyor: Christian -> Jude/);
  assert.doesNotMatch(preview.answer, /bir taraf|diger taraf|sigorta|universite/i);
});

test('active video keeps everyday questions and long objections in film conversation', () => {
  const scene = {mediaTitle:'Modern Love S02E02',timestamp:'00:18:47'};
  const history = [{role:'user',content:'burada olay ne'}, {role:'assistant',content:'Sahnenin konusu farkli hayat duzenlerinin gerilimi.'}];
  for (const question of ['burada olay ne', 'yahu bu sahneyi niye cekmisler anlat. bu sahnenin amaci ne',
    'alt tarafi istedigi yemegi bulamadi.niye bu kadar dert etti bu kari',
    'yine de bana abartili geldi', 'burada neden boyle davraniyor', 'ne demek istiyor',
    'adam da haksiz degil ki', 'sence hakli mi', 'neden bu kadar alindi']) {
    assert.equal(intent.classifyTopicChatIntent(question,history,scene).kind,'scene_explanation',question);
  }
});

test('video default is opt-in via video context; explicit language and topic changes survive', () => {
  const scene = {mediaTitle:'A film',mediaPath:'movie.mkv'};
  for (const question of ['forget it ne demek', 'genel olarak forget it ne demek', 'ornek cumle ver']) {
    assert.equal(intent.classifyTopicChatIntent(question,[],scene).kind,'lexical',question);
  }
  assert.equal(intent.classifyTopicChatIntent('Bu cumlede neden boyle kullanilmis',[],scene).kind,'contextual_usage');
  assert.equal(intent.classifyTopicChatIntent('Filmden bagimsiz neden okyanuslar tuzlu',[],scene).kind,'world_knowledge');
  assert.equal(intent.classifyTopicChatIntent('Genel olarak bu uyku duzeni nasil calisir',[],scene).kind,'world_knowledge');
  assert.equal(intent.classifyTopicChatIntent('sence hakli mi',[],{mediaTitle:'Some book',source:'remnote'}).kind,'general');
  assert.equal(intent.classifyTopicChatIntent('sence hakli mi',[],{}).kind,'general');
});
