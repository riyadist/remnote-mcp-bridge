const assert = require('node:assert/strict');
const test = require('node:test');

const followup = require('./topic-chat-followup.cjs');

const offeredComparison = [
  {
    role: 'assistant',
    content: 'Istersen bir sonraki mesajda sana prose / prose style / prose writer farkini da cok basit sekilde anlatayim.',
  },
];

test('short acceptance resolves to the previous assistant offer', () => {
  for (const question of ['anlat', 'evet anlat', 'olur', 'devam et', 'bunu acikla']) {
    const result = followup.resolveTopicChatFollowUp(question, offeredComparison);
    assert.equal(result.isFollowUp, true, question);
    assert.match(result.previousAssistant, /prose style/);
  }
});

test('a substantive new question does not get forced into the old offer', () => {
  const result = followup.resolveTopicChatFollowUp(
    'prose burada neden lucid ile birlikte kullanilmis?',
    offeredComparison
  );
  assert.equal(result.isFollowUp, false);
  assert.equal(result.previousAssistant, '');
});

test('a short command without an explicit assistant offer stays independent', () => {
  const result = followup.resolveTopicChatFollowUp('anlat', [
    { role: 'assistant', content: 'Prose burada akici duz yazi anlaminda kullaniliyor.' },
  ]);
  assert.equal(result.isFollowUp, false);
});

test('Turkish characters and punctuation are normalized safely', () => {
  assert.equal(followup.isShortContinuationQuestion('Açıklar mısın?'), true);
  assert.equal(followup.isShortContinuationQuestion('Örnek verir misin?'), true);
});
