import { renderWidget, usePlugin, useTrackerPlugin, WidgetLocation } from '@remnote/plugin-sdk';
import React from 'react';
import { probeApi } from '../ogren/adapter';
import { hasVocabCards } from '../ogren/parse';

// Belge başlığının altındaki küçük "Öğren" düğmesi. Yalnız çocuklarından en az 3'ü
// "Detaylar" alt başlıklı kelime kartı olan belgelerde görünür; diğerlerinde hiçbir şey
// çizmez. Salt okur; tıklanınca Öğren ekranını açılır pencerede (popup) açar; kullanıcının bölmelerine dokunmaz.

const CSS = `
html,body{margin:0;padding:0;background:transparent;overflow:hidden}
.ob{display:flex;align-items:center;gap:10px;padding:2px 0 6px;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif,"Apple Color Emoji","Segoe UI Emoji"}
.ob button{border:1px solid #4a3a20;background:#2b2418;color:#f2a33a;border-radius:8px;padding:4px 12px;font:inherit;font-size:13px;font-weight:700;cursor:pointer;line-height:20px}
.ob button:hover{background:#3a2f1c;border-color:#f2a33a}
`;

function OgrenButton() {
  const plugin = usePlugin();
  const info = useTrackerPlugin(async (rp) => {
    const ctx = await rp.widget.getWidgetContext<WidgetLocation.DocumentBelowTitle>();
    const docId = ctx?.documentId || '';
    if (!docId) return null;
    try {
      return { docId, ok: await hasVocabCards(probeApi(rp), docId, 3) };
    } catch {
      return { docId, ok: false };
    }
  }, []);

  if (!info?.ok) return null;
  return (
    <div className="ob">
      <style>{CSS}</style>
      <button
        title="Bu belgedeki kelime kartlarıyla ders: önce öğren, sonra test"
        onClick={() => void plugin.widget.openPopup('ogren', { docId: info.docId }, false)}
      >
        🎓 Öğren
      </button>
    </div>
  );
}

renderWidget(OgrenButton);
