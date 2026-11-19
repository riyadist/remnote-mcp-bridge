// Todo Alarm penceresi (RemNote_Alarm 0.2.4 popup.tsx'ten taşındı). Değişen: servis adresi mutlak,
// eşitlenen depolama anahtarı 'alarm_todo:<remId>' (eskisi 'todo-alarm:<remId>' eski eklenti kimliğinde kalır).
import React, { useEffect, useState } from 'react';
import { renderWidget, usePlugin, WidgetLocation } from '@remnote/plugin-sdk';
import { alarmUrl, authenticatedAlarmFetch } from '../features/alarm/api';

type Occurrence = { id: string; atUtc: string };
type Alarm = { remId: string; title: string; occurrences: Occurrence[]; status: string };
type ApiResult = { ok: boolean; alarm?: Alarm | null; cleanupErrors?: string[]; error?: string };
const surface: React.CSSProperties = { boxSizing: 'border-box', width: '100%', height: '100dvh', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#23242d', color: '#f3f2f9', fontFamily: 'Arial, sans-serif', fontSize: 13 };
const button: React.CSSProperties = { border: '1px solid #55586d', borderRadius: 8, padding: '7px 10px', background: '#30323f', color: '#f5f4fa', cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap' };
const muted: React.CSSProperties = { color: '#aeb0c1', fontSize: 11, lineHeight: 1.4 };

function localValue(date: Date) {
  const part = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}T${part(date.getHours())}:${part(date.getMinutes())}`;
}
function nextHour() {
  const date = new Date(Date.now() + 3600_000);
  date.setMinutes(0, 0, 0);
  return localValue(date);
}
function nextSlot(times: string[]) {
  const last = new Date(times[times.length - 1] || nextHour());
  const candidate = new Date(Math.max(last.getTime(), new Date(nextHour()).getTime()) + 3600_000);
  return localValue(candidate);
}
function display(iso: string) {
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/Istanbul' }).format(new Date(iso));
}

function AlarmPopup() {
  const plugin = usePlugin();
  const [remId, setRemId] = useState('');
  const [title, setTitle] = useState('');
  const [token, setToken] = useState('');
  const [times, setTimes] = useState<string[]>([nextHour()]);
  const [saved, setSaved] = useState<Alarm | null>(null);
  const [preview, setPreview] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const context = await plugin.widget.getWidgetContext<WidgetLocation.Popup>();
        const id = context.contextData?.remId;
        if (typeof id !== 'string' || !id) throw new Error('Todo kimliği bulunamadı.');
        const rem = await plugin.rem.findOne(id);
        if (!rem || !(await rem.isTodo())) throw new Error('Bu Rem artık Todo değil.');
        const name = ((await plugin.richText.toString(rem.text || [])) || 'Başlıksız Todo').trim().slice(0, 80);
        const session = await fetch(alarmUrl('/api/session'), { cache: 'no-store' });
        if (!session.ok) throw new Error('Yerel alarm servisine bağlanılamadı.');
        const key = (await session.json() as { token: string }).token;
        let activeKey = key;
        const response = await authenticatedAlarmFetch(fetch, `/api/alarm?remId=${encodeURIComponent(id)}`, {}, key, (refreshed) => { activeKey = refreshed; setToken(refreshed); });
        const data = await response.json() as ApiResult;
        if (!response.ok || !data.ok) throw new Error(data.error || 'Alarm durumu okunamadı.');
        if (!active) return;
        setRemId(id); setTitle(name); setToken(activeKey); setSaved(data.alarm || null);
        if (data.alarm?.occurrences.length) setTimes(data.alarm.occurrences.map((item) => localValue(new Date(item.atUtc))));
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : 'Alarm açılamadı.');
      }
    }
    void load();
    return () => { active = false; };
  }, [plugin]);

  function validatedTimes() {
    if (!times.length || times.length > 8) throw new Error('1–8 tarih/saat seç.');
    const values = times.map((value) => {
      const date = new Date(value);
      if (!value || Number.isNaN(date.getTime())) throw new Error('Geçerli tarih/saat seç.');
      if (date.getTime() < Date.now() + 60_000) throw new Error('Alarm en az 1 dakika sonra olmalı.');
      if (date.getTime() > Date.now() + 365 * 86400_000) throw new Error('Alarm en fazla 1 yıl sonrası olabilir.');
      return date.toISOString();
    });
    if (new Set(values).size !== values.length) throw new Error('Aynı saat iki kez seçilemez.');
    return values;
  }

  async function request(path: string, payload: object) {
    const response = await authenticatedAlarmFetch(fetch, path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }, token, setToken);
    const data = await response.json() as ApiResult;
    if (!response.ok || !data.ok) throw new Error(data.error || 'Windows alarm işlemi başarısız.');
    return data;
  }

  async function apply() {
    setBusy(true); setError(''); setNotice('');
    try {
      const rem = await plugin.rem.findOne(remId);
      if (!rem || !(await rem.isTodo())) throw new Error('Todo değişti veya silindi; alarm kurulmadı.');
      const data = await request('/api/alarm', { remId, title, timezone: 'Europe/Istanbul', timesUtc: validatedTimes() });
      setSaved(data.alarm || null); setPreview(false); setPendingDelete(null);
      let result = 'Windows alarmları planlandı. RemNote kapalıyken de, bilgisayar ve Windows oturumu açıkken çalışır.';
      try { await plugin.storage.setSynced(`alarm_todo:${remId}`, data.alarm || null); }
      catch { result += ' RemNote eşitlemesi başarısız; yerel alarm kayıtlı.'; }
      if (data.cleanupErrors?.length) result += ' Eski görevlerin temizliği kontrol edilmeli.';
      setNotice(result);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Alarm kurulamadı.'); }
    finally { setBusy(false); }
  }

  async function cancel() {
    setBusy(true); setError(''); setNotice('');
    try {
      const data = await request('/api/cancel', { remId });
      setSaved(null); setPreview(false); setPendingDelete(null); setTimes([nextHour()]);
      try { await plugin.storage.setSynced(`alarm_todo:${remId}`, null); } catch { /* local cancellation remains authoritative */ }
      setNotice(data.cleanupErrors?.length ? 'Alarm kaydı silindi; Windows görevi temizliği kontrol edilmeli.' : 'Kurulu alarmların tümü silindi.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'İptal başarısız.'); }
    finally { setBusy(false); }
  }

  async function cancelOccurrence(occurrenceId: string) {
    setBusy(true); setError(''); setNotice('');
    try {
      const data = await request('/api/cancel-occurrence', { remId, occurrenceId });
      const remaining = data.alarm || null;
      setSaved(remaining); setPreview(false); setPendingDelete(null);
      setTimes(remaining?.occurrences.length ? remaining.occurrences.map((item) => localValue(new Date(item.atUtc))) : [nextHour()]);
      try { await plugin.storage.setSynced(`alarm_todo:${remId}`, remaining); }
      catch { /* local alarm state remains authoritative */ }
      setNotice(data.cleanupErrors?.length ? 'Alarm kaydı silindi; Windows görevi temizliği kontrol edilmeli.' : 'Seçilen alarm silindi.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Alarm silinemedi.'); }
    finally { setBusy(false); }
  }

  return <main style={surface}>
    <style>{'html,body{height:100%;margin:0;overflow:hidden}button:disabled{cursor:not-allowed;opacity:.48}button:focus-visible,input:focus-visible{outline:2px solid #aaa1ff;outline-offset:2px}'}</style>
    <header style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 16px 10px', borderBottom: '1px solid #383a49' }}>
      <div style={{ minWidth: 0 }}><h2 style={{ margin: 0, fontSize: 17, letterSpacing: '-.01em' }}>Todo Alarm</h2><div style={{ ...muted, marginTop: 2 }}>Seçili görev için Windows hatırlatması</div></div>
      <button type="button" aria-label="Kapat" onClick={() => plugin.widget.closePopup()} style={{ ...button, flexShrink: 0, fontSize: 16, lineHeight: 1, width: 31, height: 31, padding: 0 }}>×</button>
    </header>
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 16px 6px' }}>
      {error && <p role="alert" style={{ margin: '0 0 10px', padding: 9, borderRadius: 7, background: '#503238', color: '#ffe4e6' }}>{error}</p>}
      {notice && <p role="status" style={{ margin: '0 0 10px', padding: 9, borderRadius: 7, background: '#244438', color: '#d8fae5' }}>{notice}</p>}
      {remId && <>
        <div title={title} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, padding: '8px 10px', borderRadius: 8, background: '#2c2e3b', marginBottom: 12, border: '1px solid #3c3e4e' }}>
          <span aria-hidden="true" style={{ color: '#a8a1e8' }}>☑</span><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        </div>
        {saved && <section aria-label="Kurulu alarmlar" style={{ padding: 10, border: '1px solid #555a70', borderRadius: 8, background: '#292c39', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
            <strong>Kurulu alarmlar</strong>
            <button type="button" disabled={busy} onClick={() => setPendingDelete('all')} style={{ ...button, color: '#f1c4c7' }}>Tümünü sil</button>
          </div>
          {saved.occurrences.map((item) => <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 0', borderTop: '1px solid #3c4050' }}>
            <span style={{ minWidth: 0 }}>🔔 {display(item.atUtc)}</span>
            <button type="button" disabled={busy} aria-label={`${display(item.atUtc)} alarmını sil`} onClick={() => setPendingDelete(item.id)} style={{ ...button, color: '#f1c4c7' }}>Sil</button>
          </div>)}
          {pendingDelete && <div role="alert" style={{ marginTop: 8, padding: 8, borderRadius: 7, background: '#443338' }}>
            <div style={{ marginBottom: 7 }}>{pendingDelete === 'all' ? 'Bütün kurulu alarmlar silinsin mi?' : 'Seçilen alarm silinsin mi?'}</div>
            <div style={{ display: 'flex', gap: 7 }}>
              <button type="button" disabled={busy} onClick={() => setPendingDelete(null)} style={button}>Vazgeç</button>
              <button type="button" disabled={busy} onClick={() => void (pendingDelete === 'all' ? cancel() : cancelOccurrence(pendingDelete))} style={{ ...button, background: '#683e48', color: '#fff' }}>Evet, sil</button>
            </div>
          </div>}
        </section>}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}><strong>Ne zaman hatırlatayım?</strong><span style={muted}>İstanbul saati</span></div>
        {times.map((value, index) => <div key={index} style={{ display: 'flex', gap: 6, marginBottom: 7 }}>
          <input type="datetime-local" aria-label={`Alarm ${index + 1} tarih ve saat`} value={value}
            onChange={(event) => { const next = [...times]; next[index] = event.target.value; setTimes(next); setPreview(false); }}
            style={{ boxSizing: 'border-box', flex: 1, minWidth: 0, height: 35, background: '#1b1d26', color: '#fff', border: '1px solid #62657b', borderRadius: 7, padding: '5px 9px', colorScheme: 'dark', fontSize: 12 }} />
          <button type="button" aria-label={`Alarm ${index + 1} saatini kaldır`} disabled={times.length === 1 || busy}
            onClick={() => { setTimes(times.filter((_, i) => i !== index)); setPreview(false); }} style={{ ...button, width: 35, padding: 0 }}>−</button>
        </div>)}
        <button type="button" disabled={times.length >= 8 || busy} onClick={() => { setTimes([...times, nextSlot(times)]); setPreview(false); }} style={{ ...button, borderStyle: 'dashed', color: '#c8c5f4', marginTop: 1 }}>+ Bir saat daha</button>
        <p style={{ ...muted, margin: '9px 0' }}>Bilgisayar ve Windows oturumu açık olmalı; RemNote kapalı olabilir.</p>
        {preview && <section aria-label="Alarm önizlemesi" style={{ border: '1px solid #595b77', background: '#292a39', borderRadius: 8, padding: 9, marginBottom: 8 }}>
          <strong style={{ fontSize: 12 }}>Önizleme · henüz kurulmadı</strong>
          <ol style={{ margin: '6px 0 0', paddingLeft: 20, fontSize: 12 }}>{times.map((value, index) => <li key={index} style={{ marginBottom: 3 }}>{display(new Date(value).toISOString())}</li>)}</ol>
        </section>}
        <p style={{ ...muted, margin: '7px 0 2px' }}>Başka cihazda tamamlanan veya silinen Todo’ların yerel alarmı otomatik iptal edilmeyebilir.</p>
      </>}
    </div>
    <footer data-alarm-footer="" style={{ boxSizing: 'border-box', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderTop: '1px solid #404151', background: '#282a36' }}>
      <span style={{ ...muted, marginRight: 'auto' }}>Kurana kadar not değişmez</span>
      <button type="button" disabled={busy || !token} onClick={() => {
        try { validatedTimes(); setError(''); setPreview(true); }
        catch (reason) { setError(reason instanceof Error ? reason.message : 'Geçersiz saat.'); }
      }} style={button}>Önizle</button>
      <button type="button" disabled={busy || !token || !remId} onClick={() => void apply()} style={{ ...button, background: '#7567c5', borderColor: '#9284df', fontWeight: 700 }}>Alarmları kur</button>
    </footer>
  </main>;
}

renderWidget(AlarmPopup);
