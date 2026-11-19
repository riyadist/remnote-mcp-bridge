import {
  BuiltInPowerupCodes, RemHierarchyEditorTree, RemRichTextEditor, renderWidget, useLocalStorageState, usePlugin,
  useTrackerPlugin, WidgetLocation, type RNPlugin,
} from '@remnote/plugin-sdk';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  addTask, completeTask, groupTasks, loadBoard, moveTask, plainFromRichText, EISENHOWER_DOC_STORAGE_KEY, EISENHOWER_TAGS_STORAGE_KEY, resolveQuadrants, type TagIdMap,
  type BoardApi, type BoardQuadrant, type Task,
} from '../eisenhower/core';

const CSS = `
html,body{margin:0;padding:0;background:transparent}
.eh{--panel:#26262c;--line-c:#33333b;--txt:#e6e6ea;--mut:#8d8d98;color:var(--txt);font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif,"Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol";font-weight:400;padding:0 0 8px;user-select:none}
.eh .sub{color:var(--mut);font-size:14px;line-height:24px;margin:0 0 16px}
.eh .sub b{color:#c9c9cf}
.eh .grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px}
.eh .q{--pad:16px;min-width:0;background:var(--panel);border-radius:10px;padding:16px var(--pad) 8px;min-height:192px;border-top:3px solid var(--c);box-sizing:border-box;transition:background .15s}
@media (min-width:1100px){.eh .grid{gap:24px}.eh .grid>.q{--pad:24px}}
@media (max-width:699.98px){.eh .grid{grid-template-columns:minmax(0,1fr);gap:8px}.eh .grid>.q{--pad:12px;min-height:0}}
/* Eksenler (kutu iç kenarından): tutamak 0-12, ok 12-28, kutu sütunu 28-52, metin 56'dan başlar. */
.eh{--g-hd:12px;--g-ar:16px;--g-cb:24px;--g-gap:4px;--g-text:calc(var(--g-hd) + var(--g-ar) + var(--g-cb) + var(--g-gap));--line:24px}
.eh .qh{display:flex;align-items:center;gap:8px;height:24px;margin:0 0 8px;min-width:0;white-space:nowrap}
.eh .ic{width:20px;height:20px;border-radius:50%;background:var(--c);color:#16161a;font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;flex:none}
.eh .qt{color:var(--c);font-weight:700;font-size:15px;line-height:24px;white-space:nowrap;flex:none}
.eh .tag{margin-left:auto;font-size:12px;line-height:24px;color:var(--mut);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.eh .cnt{font-size:12px;line-height:18px;color:var(--mut);background:#1d1d22;border-radius:9px;padding:0 8px}
.eh .row{display:grid;grid-template-columns:var(--g-hd) var(--g-ar) var(--g-cb) minmax(0,1fr) 20px;column-gap:0;align-items:start;padding:8px 0;border-bottom:1px solid var(--line-c,#33333b);min-width:0;border-radius:6px;transition:background .15s,box-shadow .15s;background:var(--panel)}
.eh .row:hover{background:#2d2d34}
.eh .row.drag{opacity:.35}
.eh .row .ed{min-width:0;padding-left:var(--g-gap)}
.eh .hd,.eh .ar,.eh .cbw,.eh .op{height:var(--line);display:flex;align-items:center;justify-content:center}
.eh .hd{color:#5a5a64;font-size:13px;cursor:grab;opacity:0;transition:opacity .15s;letter-spacing:-2px;touch-action:none}
.eh .row:hover .hd{opacity:1}
.eh .hd:hover{color:var(--txt)}
.eh .op{color:#5a5a64;font-size:12px;cursor:pointer;opacity:0;transition:opacity .15s}
.eh .row:hover .op{opacity:1}
.eh .op:hover{color:var(--txt)}
.eh .cb{width:13px;height:13px;border:1.7px solid var(--c);border-radius:3.5px;cursor:pointer;transition:background .2s;box-sizing:content-box}
.eh .cb:hover{background:var(--c)}
.eh .empty{color:#6c6c76;font-size:14px;line-height:var(--line);padding:8px 0 8px var(--g-text)}
.eh .add{display:grid;grid-template-columns:var(--g-hd) var(--g-ar) var(--g-cb) minmax(0,1fr);align-items:center;color:var(--mut);font-size:13px;line-height:var(--line);padding:8px 0 0;cursor:pointer}
.eh .add .plus{grid-column:3;text-align:center;color:var(--c);font-weight:600}
.eh .add b{grid-column:4;padding-left:var(--g-gap);color:var(--c);font-weight:600}
.eh .add .inp{grid-column:3 / 5}
.eh .add input{width:100%;box-sizing:border-box;background:#1d1d22;color:var(--txt);border:1px solid var(--c);border-radius:6px;padding:4px 8px;font:inherit;font-size:14px;line-height:14px;height:var(--line);outline:none}
.eh .q.over{background:#2b2b33;outline:2px dashed var(--c);outline-offset:-4px}
.eh .task.done{animation:ehdone .45s ease forwards;overflow:hidden}
.eh .gh{display:grid;grid-template-columns:var(--g-hd) var(--g-ar) var(--g-cb) minmax(0,1fr);align-items:center;height:var(--line);margin:16px 0 0;color:var(--mut);font-size:13.5px;white-space:nowrap;min-width:0}
.eh .qh+.empty,.eh .qh+.gh{margin-top:0}
.eh .gh .gi{grid-column:3;font-size:14.5px;text-align:center;line-height:var(--line)}
.eh .gh .gp{grid-column:4;padding-left:var(--g-gap);overflow:hidden;text-overflow:ellipsis}
.eh .gh .sep{color:#5a5a64;margin:0 6px}
.eh .ar{color:#5a5a64;font-size:10px;cursor:default;border-radius:4px}
.eh .ar.has{color:var(--mut);cursor:pointer}
.eh .ar.has:hover{color:var(--txt);background:#34343c}
.eh .ar i{font-style:normal;display:inline-block;transition:transform .2s ease}
.eh .ar.open i{transform:rotate(90deg)}
.eh .ar.none{visibility:hidden}
/* Alt ağaç: yükseklik animasyonu yok (gömme katmanları kaymasın); yalnız saydamlık.
   Sol girinti: RemNote ağacı metni 24 px madde imi sütunundan sonra başlatır; böylece alt
   satır metni görev metniyle aynı sütunda (g-text) başlar. */
.eh .kids{display:none;padding:0 0 8px calc(var(--g-text) - 24px);border-bottom:1px solid var(--line-c,#33333b)}
.eh .kids.open{display:block;animation:ehfade .2s ease}
@keyframes ehfade{from{opacity:0}to{opacity:1}}
.eh .imk{color:var(--mut);font-size:12px;margin-left:6px;white-space:nowrap}
@keyframes ehdone{to{opacity:0;transform:translateX(20px);height:0;padding:0;border:0}}
.eh-ghost{position:fixed;pointer-events:none;z-index:9;box-shadow:0 12px 30px rgba(0,0,0,.55);transform:rotate(1.5deg) scale(1.03);background:#30303a;border-radius:8px;padding:9px 12px;display:flex;gap:10px;font-size:15px;color:#e6e6ea;max-width:520px;font-family:Inter,"Segoe UI",sans-serif}
.eh-ghost .cb{width:15px;height:15px;border:2px solid var(--c);border-radius:4px;flex:none;margin-top:2px}
.eh-toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%) translateY(20px);background:#2d2d34;color:#fff;padding:10px 16px;border-radius:8px;font-size:14px;opacity:0;transition:.25s;pointer-events:none;font-family:Inter,"Segoe UI",sans-serif;z-index:10}
.eh-toast.on{opacity:1;transform:translateX(-50%) translateY(0)}
.eh-toast.err{background:#5a2a2e}
`;

function adapter(p: RNPlugin): BoardApi {
  return {
    findOne: (id) => p.rem.findOne(id) as any,
    createRem: () => p.rem.createRem() as any,
    // Etiketi adla bulma (yalnız okur; hiçbir şey oluşturmaz).
    findByName: (name: string) => p.rem.findByName([name], null) as any,
    toString: (rt) => p.richText.toString(rt),
    docIcon: async (rem: any) => {
      if (typeof rem?.call !== 'function') return '';
      const v = await rem.call('getPowerupProperty', { powerupCode: BuiltInPowerupCodes.Document, powerupSlot: 'b' });
      return typeof v === 'string' ? v : plainFromRichText(v);
    },
  };
}

const REMNOTE_ROW_CLASSES = 'rn-editor rn-editor__rem__body__text rem-text text-base leading-[var(--rn-line-height)]';

// Etiket adı çözülmüş kutulardan bulunur (kimlikler koda gömülü değil).

function EisenhowerBoard() {
  const plugin = usePlugin();
  const docId = useTrackerPlugin(async (rp) => {
    const ctx = await rp.widget.getWidgetContext<WidgetLocation.DocumentBelowTitle>();
    return ctx?.documentId || '';
  }, []);
  // Pano belgesi kullanıcının seçtiği belge (eşitlenen depo); kod içinde sabit kimlik yok.
  const boardDocId = useTrackerPlugin(async (rp) => (await rp.storage.getSynced<string>(EISENHOWER_DOC_STORAGE_KEY)) || '', []) || '';
  const boardState = useTrackerPlugin(async (rp) => {
    const ctx = await rp.widget.getWidgetContext<WidgetLocation.DocumentBelowTitle>();
    const target = (await rp.storage.getSynced<string>(EISENHOWER_DOC_STORAGE_KEY)) || '';
    if (!target || ctx?.documentId !== target) return null;
    const api = adapter(rp);
    // Etiketler: önce eşitlenen depodaki kimlikler, yoksa adla (Critical/High/Medium/Low). Oluşturma yok.
    const resolved = await resolveQuadrants(api, await rp.storage.getSynced<TagIdMap>(EISENHOWER_TAGS_STORAGE_KEY));
    if (resolved.missing.length) return { missing: resolved.missing, board: null as BoardQuadrant[] | null };
    return { missing: [] as string[], board: (await loadBoard(api, resolved.quadrants)) as BoardQuadrant[] | null };
  }, []);

  const board = boardState ? boardState.board : null;
  const missingTags = boardState?.missing || [];
  const tagName = (tagId: string) => (board || []).find((q) => q.tagId === tagId)?.tagName.toLowerCase() || '';

  // İyimser (optimistic) görünüm: RemNote cevabı gelene kadar kullanıcının gördüğü hâl.
  const [moved, setMoved] = useState<Record<string, string>>({});
  const [done, setDone] = useState<Record<string, true>>({});
  const [leaving, setLeaving] = useState<Record<string, true>>({});
  const [adding, setAdding] = useState<string>('');
  // Açık/kapalı durumu: eklentinin bu cihazdaki yerel deposu (iframe sandbox'ında
  // tarayıcı localStorage'ı yasak). Not verisine yazmaz.
  const [storedOpen, setStoredOpen] = useLocalStorageState<Record<string, true>>('eh-open', {});
  const [openLocal, setOpenLocal] = useState<Record<string, true> | null>(null);
  const open = openLocal || storedOpen || {};
  const openRef = useRef(open);
  openRef.current = open;
  const [draft, setDraft] = useState('');
  const [toast, setToast] = useState<{ text: string; err: boolean; on: boolean }>({ text: '', err: false, on: false });
  const toastTimer = useRef<any>(null);
  const root = useRef<HTMLDivElement>(null);
  const flipRects = useRef<Map<string, DOMRect> | null>(null);
  const flashId = useRef<string>('');

  // RemNote'un sahte gömme (fake embed) katmanları yerlerini yalnız pano DOM'u değişince
  // (MutationObserver) ya da kendi boyutları değişince yeniden ölçer. CSS animasyonu sürerken
  // satırlar kayar ama DOM değişmez: katmanlar eski yerde kalıp üst üste biniyordu. Animasyon
  // boyunca her karede kökteki bir özniteliği değiştirip yeniden ölçümü tetikliyoruz.
  const reflowUntil = useRef(0);
  const kickReflow = useCallback((ms = 450) => {
    const el = root.current;
    if (!el) return;
    const already = reflowUntil.current > performance.now();
    reflowUntil.current = Math.max(reflowUntil.current, performance.now() + ms);
    if (already) return;
    let n = 0;
    const bump = () => el.setAttribute('data-reflow', String(++n));
    const tick = () => {
      bump();
      if (performance.now() < reflowUntil.current) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    // Pencere arka plandayken requestAnimationFrame durur; son ölçüm zamanlayıcıyla da yapılır.
    setTimeout(bump, ms + 60);
  }, []);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const on = () => kickReflow(120);
    el.addEventListener('transitionend', on);
    el.addEventListener('animationend', on);
    const ro = new ResizeObserver(() => kickReflow(200));
    ro.observe(el);
    return () => { el.removeEventListener('transitionend', on); el.removeEventListener('animationend', on); ro.disconnect(); };
  });

  const toggleOpen = useCallback((id: string) => {
    const n = { ...openRef.current };
    if (n[id]) delete n[id]; else n[id] = true;
    openRef.current = n;
    setOpenLocal(n);
    setStoredOpen(n).catch(() => { /* yalnız görünüm durumu; hata önemsiz */ });
    kickReflow(500);
  }, [setStoredOpen, kickReflow]);

  const showToast = useCallback((text: string, err = false) => {
    setToast({ text, err, on: true });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, on: false })), err ? 3200 : 1600);
  }, []);

  // RemNote verisi iyimser hâle yetişince geçici kayıtları temizle.
  useEffect(() => {
    if (!board) return;
    const where = new Map<string, string>();
    board.forEach((q) => q.tasks.forEach((t) => where.set(t.id, q.tagId)));
    setMoved((m) => {
      const n = { ...m };
      let ch = false;
      for (const id of Object.keys(n)) if (where.get(id) === n[id] || !where.has(id)) { delete n[id]; ch = true; }
      return ch ? n : m;
    });
    setDone((d) => {
      const n = { ...d };
      let ch = false;
      for (const id of Object.keys(n)) if (!where.has(id)) { delete n[id]; ch = true; }
      return ch ? n : d;
    });
  }, [board]);

  const captureRects = () => {
    const m = new Map<string, DOMRect>();
    root.current?.querySelectorAll<HTMLElement>('.task[data-id]').forEach((r) => m.set(r.dataset.id!, r.getBoundingClientRect()));
    flipRects.current = m;
  };

  // FLIP: satırlar yeni yerine 0,28 sn'de kayar.
  useLayoutEffect(() => {
    const before = flipRects.current;
    if (!before) return;
    flipRects.current = null;
    root.current?.querySelectorAll<HTMLElement>('.task[data-id]').forEach((r) => {
      const o = before.get(r.dataset.id!);
      if (!o) return;
      const n = r.getBoundingClientRect();
      const dx = o.left - n.left, dy = o.top - n.top;
      if (dx || dy) {
        r.style.transition = 'none';
        r.style.transform = `translate(${dx}px,${dy}px)`;
        requestAnimationFrame(() => {
          r.style.transition = 'transform .28s cubic-bezier(.2,.8,.2,1)';
          r.style.transform = '';
        });
        kickReflow(400);
      }
      if (r.dataset.id === flashId.current) {
        flashId.current = '';
        r.animate([{ background: '#3a3a44' }, { background: '#26262c' }], { duration: 700 });
      }
    });
  });

  const view: BoardQuadrant[] | null = board
    ? (() => {
        const all = new Map<string, { t: Task; tag: string }>();
        board.forEach((q) => q.tasks.forEach((t) => all.set(t.id, { t, tag: q.tagId })));
        return board.map((q) => ({
          ...q,
          tasks: [...all.values()]
            .filter(({ t, tag }) => !done[t.id] && (moved[t.id] || tag) === q.tagId)
            .map(({ t }) => t),
        }));
      })()
    : null;

  const doMove = useCallback(async (id: string, from: string, to: string) => {
    if (from === to) return;
    captureRects();
    flashId.current = id;
    setMoved((m) => ({ ...m, [id]: to }));
    try {
      await moveTask(adapter(plugin), id, from, to);
      showToast('Etiket değişti → ##' + tagName(to));
    } catch (e) {
      captureRects();
      setMoved((m) => { const n = { ...m }; delete n[id]; return n; });
      showToast('Taşınamadı: ' + (e instanceof Error ? e.message : String(e)), true);
    }
  }, [plugin, showToast, board]);

  const doComplete = useCallback(async (id: string) => {
    setLeaving((l) => ({ ...l, [id]: true }));
    const anim = new Promise((r) => setTimeout(r, 450));
    try {
      await completeTask(adapter(plugin), id);
      await anim;
      captureRects();
      setDone((d) => ({ ...d, [id]: true }));
      showToast('Tamamlandı ✓');
    } catch (e) {
      await anim;
      showToast('Tamamlanamadı: ' + (e instanceof Error ? e.message : String(e)), true);
    } finally {
      setLeaving((l) => { const n = { ...l }; delete n[id]; return n; });
    }
  }, [plugin, showToast]);

  const doOpen = useCallback(async (id: string) => {
    try {
      const rem = await plugin.rem.findOne(id);
      if (!rem) throw new Error('Görev bulunamadı');
      await plugin.window.openRem(rem);
    } catch (e) {
      showToast('Açılamadı: ' + (e instanceof Error ? e.message : String(e)), true);
    }
  }, [plugin, showToast]);

  const doAdd = useCallback(async (tagId: string) => {
    const text = draft.trim();
    if (!text) { setAdding(''); return; }
    setDraft('');
    setAdding('');
    try {
      await addTask(adapter(plugin), text, tagId, boardDocId);
      showToast('Görev eklendi → ##' + tagName(tagId));
    } catch (e) {
      setDraft(text);
      setAdding(tagId);
      showToast('Eklenemedi: ' + (e instanceof Error ? e.message : String(e)), true);
    }
  }, [draft, plugin, showToast, boardDocId, board]);

  // Sürükle-bırak: tutamaktan, 4 px hareketten sonra başlar.
  const drag = useRef<{ id: string; text: string; from: string; x: number; y: number; row: HTMLElement; ghost: HTMLElement | null; over: HTMLElement | null } | null>(null);

  const onRowPointerDown = (e: React.PointerEvent<HTMLDivElement>, t: Task, from: string) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('.cb')) { e.preventDefault(); void doComplete(t.id); return; }
    if (target.closest('.ar')) { e.preventDefault(); if (t.childCount) toggleOpen(t.id); return; }
    if (target.closest('.op')) { e.preventDefault(); void doOpen(t.id); return; }
    // Sürükleme yalnız tutamaktan (⋮⋮) başlar; metin RemNote düzenleyicisine aittir.
    if (!target.closest('.hd')) return;
    e.preventDefault();
    drag.current = { id: t.id, text: t.text, from, x: e.clientX, y: e.clientY, row: e.currentTarget, ghost: null, over: null };
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      if (!d.ghost) {
        if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) < 4) return;
        const g = document.createElement('div');
        g.className = 'eh-ghost';
        const q = d.row.closest<HTMLElement>('.q');
        if (q) g.style.setProperty('--c', q.style.getPropertyValue('--c'));
        g.innerHTML = '<span class="cb"></span>';
        const name = document.createElement('span');
        name.textContent = d.text;
        g.appendChild(name);
        document.body.appendChild(g);
        d.ghost = g;
        d.row.classList.add('drag');
      }
      d.ghost.style.left = e.clientX + 12 + 'px';
      d.ghost.style.top = e.clientY - 14 + 'px';
      const q = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('.q') || null;
      if (q !== d.over) { d.over?.classList.remove('over'); d.over = q; q?.classList.add('over'); }
    };
    const up = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      drag.current = null;
      if (!d.ghost) return;
      d.ghost.remove();
      d.row.classList.remove('drag');
      d.over?.classList.remove('over');
      const to = d.over?.dataset.tag;
      if (to && to !== d.from) void doMove(d.id, d.from, to);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    return () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); };
  }, [doMove]);

  if (boardDocId && docId === boardDocId && missingTags.length) {
    return (
      <div className="eh">
        <style>{CSS}</style>
        <div className="sub">
          Eisenhower: etiketler bulunamadı ({missingTags.join(', ')}). Bu adlarla etiket oluşturun; pano kendiliğinden hiçbir şey oluşturmaz.
        </div>
      </div>
    );
  }
  if (!boardDocId || docId !== boardDocId || !view) return null;

  return (
    <div className="eh" ref={root}>
      <style>{CSS}</style>
      <div className="sub">
        Eisenhower Matrisi · görev eklemek için satırın sonuna <b>##critical</b>, <b>##high</b>, <b>##medium</b> ya da <b>##low</b> yazın
      </div>
      <div className="grid">
        {view.map((q) => (
          <div key={q.key} className="q" data-tag={q.tagId} style={{ ['--c' as any]: q.color }}>
            <div className="qh">
              <span className="ic">{q.roman}</span>
              <span className="qt">{q.title}</span>
              <span className="cnt">{q.tasks.length}</span>
              <span className="tag">{q.tagName} · {q.hint}</span>
            </div>
            {q.tasks.length === 0 ? <div className="empty">{q.emptyText}</div> : null}
            {groupTasks(q.tasks).map((g) => (
              <React.Fragment key={g.id || 'kok'}>
                <div className="gh" title={g.path.join(' › ')}>
                  <span className="gi">{g.icon || ''}</span>
                  <span className="gp">
                    {g.path.map((part, i) => (
                      <React.Fragment key={i}>
                        {i > 0 ? <span className="sep">›</span> : null}
                        <span>{part}</span>
                      </React.Fragment>
                    ))}
                  </span>
                </div>
                {g.tasks.map((t) => {
                  const has = t.childCount > 0;
                  const isOpen = has && !!open[t.id];
                  return (
                    <div key={t.id} data-id={t.id} className={'task' + (leaving[t.id] ? ' done' : '')}>
                      <div className="row" onPointerDown={(e) => onRowPointerDown(e, t, q.tagId)}>
                        <span className="hd" title="Sürükleyip başka kutuya bırakın">⋮⋮</span>
                        <span className={'ar' + (has ? ' has' : ' none') + (isOpen ? ' open' : '')} title={has ? (isOpen ? 'Kapat' : 'Alt satırları aç') : ''}><i>▶</i></span>
                        <span className="cbw"><span className="cb" title="Tamamlandı yap" /></span>
                        <div className="ed">
                          {/* RemNote'un kendi satır sınıfları: renk .rn-editor'dan, satır aralığı
                              rem-text/leading sınıfından gelir; tek başına çizilen düzenleyici
                              bunları almadığı için beyaz ve sıkışık görünüyordu. */}
                          <RemRichTextEditor remId={t.id} width="100%" className={REMNOTE_ROW_CLASSES} />
                        </div>
                        <span className="op" title="RemNote'ta aç">↗</span>
                      </div>
                      {has ? (
                        <div className={'kids' + (isOpen ? ' open' : '')}>
                          <div>{isOpen ? <RemHierarchyEditorTree remId={t.id} width="100%" height="auto" /> : null}</div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
            {adding === q.tagId ? (
              <div className="add">
                <span className="inp"><input
                  autoFocus
                  value={draft}
                  placeholder="Görev yazın, Enter ile ekleyin"
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); void doAdd(q.tagId); }
                    if (e.key === 'Escape') { setAdding(''); setDraft(''); }
                  }}
                  onBlur={() => { if (!draft.trim()) setAdding(''); }}
                /></span>
              </div>
            ) : (
              <div className="add" onClick={() => { setAdding(q.tagId); setDraft(''); }}><span className="plus">+</span><b>Görev ekle</b></div>
            )}
          </div>
        ))}
      </div>
      <div className={'eh-toast' + (toast.on ? ' on' : '') + (toast.err ? ' err' : '')}>{toast.text}</div>
    </div>
  );
}

renderWidget(EisenhowerBoard);
