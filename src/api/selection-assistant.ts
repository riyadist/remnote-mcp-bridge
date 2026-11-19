// Snapshots stay in this plugin runtime, never in RemNote's database.
const { textLeaves, replaceLeaves } = require('../../selection-assistant-core.cjs');
const snapshots = new Map<string, any>();
const clone = (x: any) => JSON.parse(JSON.stringify(x));
const equal = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);

export async function selectionAssistant(plugin: any, action: string, payload: any) {
  for (const [id, value] of snapshots) if (Date.now() - value.created > 900000) snapshots.delete(id);
  if (action === 'assistant_capture') {
    const selection = await plugin.editor.getSelection();
    const ids = selection?.type === 'Rem' ? selection.remIds : selection?.type === 'Text' ? [selection.remId] : [];
    if (!ids.length || ids.length > 40) throw new Error('1–40 not satırı veya bir metin aralığı seç.');
    const rows = [];
    for (const id of [...new Set(ids)]) {
      const rem = await plugin.rem.findOne(id);
      if (!rem) throw new Error('Seçili not bulunamadı.');
      const original = clone(await rem.text);
      let raw = original, prefix: any[] = [], suffix: any[] = [];
      if (selection.type === 'Text') {
        const { start, end } = selection.range;
        if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) throw new Error('Seçim aralığı geçersiz.');
        raw = await plugin.richText.substring(original, start, end);
        prefix = await plugin.richText.substring(original, 0, start);
        suffix = await plugin.richText.substring(original, end, await plugin.richText.length(original));
        // Editor selections include transient elementId/decorations wrappers.
        // Compare visible text here; retain the full stored snapshot for write safety.
        const [storedText, selectedText] = await Promise.all([
          plugin.richText.toString(raw), plugin.richText.toString(selection.richText),
        ]);
        if (storedText !== selectedText) throw new Error('Seçim değişti; yeniden seç.');
      }
      rows.push({ id, original, raw, prefix, suffix, fontSize: await rem.getFontSize() });
    }
    const segments = rows.map(row => textLeaves(row.raw).map((leaf: any) => leaf.text));
    if (JSON.stringify(segments).length > 24000) throw new Error('Seçim çok uzun; daha az satır seç.');
    const captureId = crypto.randomUUID();
    if (snapshots.size >= 20) snapshots.delete(snapshots.keys().next().value!);
    snapshots.set(captureId, { rows, created: Date.now(), busy: false });
    return { captureId, segments, readOnly: true, mutationApplied: false };
  }
  const snapshot = snapshots.get(payload.captureId);
  if (!snapshot) throw new Error('Seçimin süresi doldu; yeniden seç.');
  if (action !== 'assistant_apply' || payload.confirm !== 'APPLY_SELECTION_ASSISTANT') throw new Error('Uygula onayı gerekli.');
  if (snapshot.busy) throw new Error('Bu seçim zaten uygulanıyor.');
  if (!Array.isArray(payload.segments) || payload.segments.length !== snapshot.rows.length) throw new Error('Satır sayısı değişmiş.');
  snapshot.busy = true;
  const changed: any[] = [];
  try {
    const plans = [];
    for (let i = 0; i < snapshot.rows.length; i++) {
      const row = snapshot.rows[i];
      const rem = await plugin.rem.findOne(row.id);
      if (!rem || !equal(await rem.text, row.original) || await rem.getFontSize() !== row.fontSize) throw new Error('Not sonradan değişti. Yeniden seçip çalıştır; eski sonuç uygulanmadı.');
      const combined = [...row.prefix, ...replaceLeaves(row.raw, payload.segments[i]), ...row.suffix];
      const next = await plugin.richText.normalize(combined);
      plans.push({ ...row, rem, next });
    }
    for (const plan of plans) {
      const current = await plugin.rem.findOne(plan.id);
      if (!current || !equal(await current.text, plan.original)) throw new Error('Not işlem sırasında değişti.');
      if (equal(plan.next, plan.original)) continue;
      changed.push(plan);
      await plan.rem.setText(plan.next);
      await plan.rem.setFontSize(plan.fontSize);
      const saved = await plugin.rem.findOne(plan.id);
      if (!saved || !equal(await saved.text, plan.next)) throw new Error('Yazma doğrulanamadı.');
    }
    snapshots.delete(payload.captureId);
    return { success: true, mutationApplied: changed.length > 0, changedRows: changed.length };
  } catch (error) {
    let rollbackIncomplete = false;
    for (const plan of changed.reverse()) {
      try {
        const current = await plugin.rem.findOne(plan.id);
        if (current && equal(await current.text, plan.next)) {
          await current.setText(plan.original);
          await current.setFontSize(plan.fontSize);
          const restored = await plugin.rem.findOne(plan.id);
          if (!restored || !equal(await restored.text, plan.original)) rollbackIncomplete = true;
        } else if (!current || !equal(await current.text, plan.original)) rollbackIncomplete = true;
      } catch { rollbackIncomplete = true; }
    }
    if (rollbackIncomplete) throw new Error('İşlem yarıda kaldı; bazı satırlar geri alınamadı. Tekrar uygulama, notları kontrol et.');
    throw error;
  } finally { snapshot.busy = false; }
}
