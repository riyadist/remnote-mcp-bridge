'use strict';

// Only editable text leaves are transformed; links, clozes and references stay intact.
function textLeaves(raw) {
  if (!Array.isArray(raw)) throw new Error('Desteklenmeyen metin yapısı.');
  return raw.flatMap((item, index) => typeof item === 'string'
    ? [{ index, text: item }]
    : item && item.i === 'm' && typeof item.text === 'string'
      ? [{ index, text: item.text }] : []);
}
function replaceLeaves(raw, values) {
  const leaves = textLeaves(raw);
  if (!Array.isArray(values) || values.length !== leaves.length ||
      values.some(x => typeof x !== 'string' || x.length > 24000)) {
    throw new Error('AI yanıtının metin yapısı geçersiz. Not değiştirilmedi.');
  }
  const copy = JSON.parse(JSON.stringify(raw));
  leaves.forEach((leaf, i) => {
    if (typeof copy[leaf.index] === 'string') copy[leaf.index] = values[i];
    else copy[leaf.index].text = values[i];
  });
  return copy;
}
module.exports = { textLeaves, replaceLeaves };
