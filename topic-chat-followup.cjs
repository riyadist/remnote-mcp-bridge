const CONTINUATION_PATTERNS = [
  /^(?:evet|evet anlat|olur|olur anlat|tamam|tamam anlat|anlat|anlatsana|devam|devam et)$/,
  /^(?:acikla|aciklar misin|goster|gosterir misin|ornek ver|ornek verir misin)$/,
  /^(?:onu|bunu|sunlari|bunlari)\s+(?:anlat|acikla|goster)$/,
];

const OFFER_PATTERNS = [
  /\bistersen\b/,
  /\b(?:anlatayim|aciklayayim|gostereyim|ornek vereyim|karsilastirayim)\b/,
  /\b(?:farkini|farklarini)\b.{0,80}\b(?:anlat|acikla|goster)/,
  /\b(?:sonraki mesajda|devaminda)\b/,
];

function normalizeIntentText(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isShortContinuationQuestion(question) {
  const normalized = normalizeIntentText(question);
  if (!normalized || normalized.split(' ').length > 5) return false;
  return CONTINUATION_PATTERNS.some((pattern) => pattern.test(normalized));
}

function findLastAssistantMessage(messages) {
  if (!Array.isArray(messages)) return '';
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'assistant') {
      return String(messages[index]?.content || '').trim().slice(0, 900);
    }
  }
  return '';
}

function hasExplicitAssistantOffer(message) {
  const normalized = normalizeIntentText(message);
  return Boolean(normalized) && OFFER_PATTERNS.some((pattern) => pattern.test(normalized));
}

function resolveTopicChatFollowUp(question, messages) {
  const previousAssistant = findLastAssistantMessage(messages);
  const isFollowUp = isShortContinuationQuestion(question) && hasExplicitAssistantOffer(previousAssistant);
  return {
    isFollowUp,
    previousAssistant: isFollowUp ? previousAssistant : '',
  };
}

module.exports = {
  findLastAssistantMessage,
  hasExplicitAssistantOffer,
  isShortContinuationQuestion,
  normalizeIntentText,
  resolveTopicChatFollowUp,
};
