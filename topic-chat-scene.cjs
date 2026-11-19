function clean(value, limit) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, limit) : '';
}

function seconds(value) {
  const text = clean(value, 20);
  if (!/^\d{1,2}:\d{2}(?::\d{2})?$/.test(text)) return null;
  return text.split(':').reduce((total, part) => total * 60 + Number(part), 0);
}

function sceneEvidence(payload, { quick = false } = {}) {
  const scene = payload.sceneContext;
  const budget = quick ? 6000 : 12000;
  if (!scene || typeof scene !== 'object' || !clean(scene.currentSubtitle, 700)) {
    const raw = String(payload.contextText || payload.result?.contextText || '').trim();
    // Legacy callers carry metadata first, but the closest dialogue is at the end.
    return raw.length <= budget ? raw : raw.slice(0, 1800) + '\n[Eski baglam kisaltildi]\n' + raw.slice(-(budget - 1850));
  }
  const title = clean(scene.mediaTitle, 220);
  const timestamp = clean(scene.timestamp, 40);
  const cutoff = seconds(timestamp);
  const timeline = Array.isArray(scene.dialogueTimeline) && scene.dialogueTimeline.length
    ? scene.dialogueTimeline : (Array.isArray(scene.previousSubtitles) ? scene.previousSubtitles : []);
  const allRows = timeline.slice(-40).map((item) => {
    const text = clean(typeof item === 'string' ? item : item?.text, 700);
    const time = clean(item?.timestamp, 40);
    return { text, time, selected: item?.selected === true };
  }).filter((item) => item.text && !(cutoff !== null && seconds(item.time) !== null && seconds(item.time) > cutoff));
  const header = [
    `YAPIM / BOLUM: ${title && !/^\d+$/.test(title) ? title : 'bilinmiyor'}`,
    `TIKLAMA ZAMANI: ${timestamp || 'bilinmiyor'}`,
    `TIKLANAN ALTYAZI: ${clean(scene.currentSubtitle, 700)}`,
    'ALTYAZI AKISI (eskiden yeniye; isim etiketleri varsa konusmaci kanitidir):',
  ].join('\n');
  const kept = [];
  let length = header.length;
  for (const item of allRows.slice().reverse()) {
    const row = `- ${item.time ? `[${item.time}] ` : ''}${item.selected ? '<<TIKLANAN>> ' : ''}${item.text}`;
    if (length + row.length + 1 > budget - 100) break;
    kept.unshift(row);
    length += row.length + 1;
  }
  return [header, kept.length < allRows.length ? '[En eski satirlar boyut siniri nedeniyle cikarildi]' : '', ...kept].filter(Boolean).join('\n');
}

module.exports = { sceneEvidence };
