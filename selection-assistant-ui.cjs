'use strict';
// Serialized into the existing overlay; no second watcher or global key binding.
module.exports = function openSelectionAssistant(api, surface) {
  const capture = api.capture();
  const capturing = api.call('host_assistant_capture', { surface, selectedText: capture.selectedText });
  const make = (tag, cls, text) => {
    const el = document.createElement(tag); if (cls) el.className = cls;
    if (text) el.textContent = text; return el;
  };
  const root = make('section', 'mcp-selection-assistant');
  const diagnosticStages = new Set(['chat_start', 'chat_wait', 'chat_render', 'explain_summary', 'explain_images', 'image_load', 'provider']);
  const diagnosticCodes = new Set(['OK', 'CODEX_TIMEOUT', 'EXPLAIN_TIMEOUT', 'CANCELLED', 'CAPACITY_LIMIT', 'BRIDGE_UNAVAILABLE', 'INVALID_RESPONSE', 'IMAGES_EMPTY', 'IMAGE_LOAD_FAILED', 'UNKNOWN_ERROR']);
  // Side-band metadata only: reporting never gates an answer or reports its own failure.
  const report = (stage, code, started, requestId) => {
    if (!diagnosticStages.has(stage) || !diagnosticCodes.has(code)) return;
    const payload = { stage, code, durationMs: Math.max(0, Math.round(performance.now() - started)), visibility: document.visibilityState === 'hidden' ? 'hidden' : 'visible' };
    if (typeof requestId === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(requestId)) payload.requestId = requestId;
    void Promise.resolve().then(() => api.call('host_assistant_report', payload)).catch(() => {});
  };
  const failureCode = (error, explain = false) => {
    const message = String(error?.message || error || '');
    // The HTTP helper can preserve only Error(message), not error.code. Accept
    // exact enum tokens in either location; never forward raw input to telemetry.
    const classifyToken = value => {
      const token = String(value || '').trim();
      if (!/^[A-Z][A-Z0-9_]{1,79}$/.test(token)) return null;
      if (/^(?:ASSISTANT_JOB_CAPACITY|ASSISTANT_WAITER_CAPACITY|CAPACITY_LIMIT)$/.test(token)) return 'CAPACITY_LIMIT';
      if (/^(?:ASSISTANT_TIMEOUT|CODEX_TIMEOUT|EXPLAIN_TIMEOUT|EXPLAIN_SUMMARY_TIMEOUT|EXPLAIN_IMAGES_TIMEOUT)$/.test(token)) return explain ? 'EXPLAIN_TIMEOUT' : 'CODEX_TIMEOUT';
      if (/^(?:EXPLAIN_IMAGE_PROVIDER_ERROR|BRIDGE_UNAVAILABLE|ASSISTANT_BRIDGE_UNAVAILABLE|ECONNREFUSED|ECONNRESET|FETCH_FAILED|NETWORK_ERROR)$/.test(token)) return 'BRIDGE_UNAVAILABLE';
      if (/^(?:EXPLAIN_INVALID_RESPONSE|ASSISTANT_INVALID_RESPONSE|INVALID_RESPONSE|MALFORMED_RESPONSE)$/.test(token)) return 'INVALID_RESPONSE';
      if (diagnosticCodes.has(token) && token !== 'OK' && token !== 'IMAGES_EMPTY') return token;
      return null;
    };
    const classified = classifyToken(error?.code) || classifyToken(message);
    if (classified) return classified;
    if (/\bkapasite\b/i.test(message)) return 'CAPACITY_LIMIT';
    if (/timeout|timed.out|zaman.aş|süre/i.test(message)) return explain ? 'EXPLAIN_TIMEOUT' : 'CODEX_TIMEOUT';
    if (/failed to fetch|network|connection|ECONN|bridge.*unavailable/i.test(message)) return 'BRIDGE_UNAVAILABLE';
    return 'UNKNOWN_ERROR';
  };
  const explainFailure = (error, lane) => {
    const code = failureCode(error, true);
    const label = lane === 'images' ? 'Görsel' : 'Açıklama';
    if (code === 'EXPLAIN_TIMEOUT') return `${label} bekleme süresi doldu. Tekrar deneyebilirsin.`;
    if (code === 'BRIDGE_UNAVAILABLE') return `${label} servisine bağlantı kurulamadı. Tekrar deneyebilirsin.`;
    if (code === 'INVALID_RESPONSE') return `${label} yanıtının biçimi geçerli değil. Tekrar deneyebilirsin.`;
    if (code === 'CAPACITY_LIMIT') return `${label} servisi kapasite sınırına ulaştı. Biraz sonra tekrar deneyebilirsin.`;
    return String(error?.message || error || `${label} alınamadı. Tekrar deneyebilirsin.`);
  };
  root.setAttribute('aria-label', 'AI Asistanı');
  const css = make('style');
  css.textContent = `
    .mcp-selection-assistant{display:flex;flex-direction:column;gap:14px;max-height:calc(100vh - 100px);font:14px/1.5 "Segoe UI",sans-serif;color:#e7e7ef;min-width:0}
    .mcp-selection-assistant *{box-sizing:border-box}
    .mcp-selection-assistant .sa-mcp{display:flex;flex-direction:column;gap:10px;min-height:0}
    .mcp-selection-assistant .sa-mcp[hidden]{display:none}
    .mcp-selection-assistant .sa-mcp-log{display:flex;flex-direction:column;overflow:auto;max-height:32vh;min-height:60px;white-space:pre-wrap;overflow-wrap:anywhere;border:1px solid #454057;border-radius:12px;padding:12px;background:#1b1b24}
    .mcp-selection-assistant .sa-mcp-approval{max-height:20vh;overflow:auto;white-space:pre-wrap;font-size:12px;background:#302a3c;border:1px solid #71608b;border-radius:10px;padding:10px}
    .mcp-selection-assistant .sa-header,.mcp-selection-assistant .sa-footer,.mcp-selection-assistant .sa-result-head{display:flex;align-items:center;gap:10px;flex-shrink:0}
    .mcp-selection-assistant .sa-mark{display:grid;place-items:center;width:38px;height:38px;border-radius:12px;background:linear-gradient(135deg,#7861db,#4e57ac);color:#fff;font-size:23px}
    .mcp-selection-assistant .sa-heading{flex:1;font-weight:650;font-size:17px;letter-spacing:-.3px;position:relative}
    .mcp-selection-assistant .sa-help{border:1px solid #646078;border-radius:50%;padding:0;width:19px;height:19px;font-size:12px;margin-left:9px;vertical-align:2px;background:transparent;color:#b8b0d4}
    .mcp-selection-assistant .sa-info{position:absolute;top:30px;left:0;width:320px;max-width:calc(100vw - 105px);padding:14px;background:#292633;border:1px solid #585168;border-radius:12px;box-shadow:0 12px 34px #0008;z-index:5;font:12px/1.6 "Segoe UI",sans-serif;letter-spacing:0;color:#c3bdd5}
    .mcp-selection-assistant .sa-info[hidden]{display:none}
    .mcp-selection-assistant .sa-info-body{white-space:pre-wrap;overflow-wrap:anywhere}
    .mcp-selection-assistant .sa-info button{font-size:11px;margin-top:10px;padding:4px 9px}
    .mcp-selection-assistant .sa-subtitle{display:block;font-size:12px;color:#9999b1;font-weight:400;letter-spacing:0;margin-top:1px}
    .mcp-selection-assistant button{font:inherit;border:1px solid transparent;border-radius:8px;padding:7px 12px;background:#2d2d3c;color:#dcdcea;cursor:pointer;transition:background .12s,border-color .12s;white-space:nowrap}
    .mcp-selection-assistant button:hover:not(:disabled){background:#39394e;border-color:#5d5879}
    .mcp-selection-assistant button:focus-visible,.mcp-selection-assistant textarea:focus-visible{outline:2px solid #a49cff;outline-offset:2px}
    .mcp-selection-assistant button:disabled{opacity:.38;cursor:default}
    .mcp-selection-assistant .sa-close{font-size:22px;line-height:1;background:transparent;padding:6px 9px;color:#aaaabe}
    .mcp-selection-assistant .sa-presets{display:flex;gap:6px;flex-wrap:wrap;flex-shrink:0}
    .mcp-selection-assistant .sa-modes{display:flex;gap:4px;align-self:flex-start;background:#17171f;border:1px solid #393647;padding:3px;border-radius:10px;flex-shrink:0}
    .mcp-selection-assistant .sa-modes button{font-size:12px;background:transparent;color:#a7a1b9;padding:5px 14px}
    .mcp-selection-assistant .sa-modes button[aria-pressed=true]{background:#403651;color:#efe5ff}
    .mcp-selection-assistant .sa-presets[hidden],.mcp-selection-assistant .sa-tabs[hidden]{display:none}
    .mcp-selection-assistant .sa-presets button{padding:5px 10px;border-radius:20px;font-size:12px;background:#282835;border-color:#414053;color:#bebbd8}
    .mcp-selection-assistant .sa-composer{display:flex;align-items:flex-end;gap:8px;background:#17171f;border:1px solid #3c3b50;border-radius:12px;padding:10px;flex-shrink:0}
    .mcp-selection-assistant textarea{width:100%;min-width:0;border:0;background:transparent;color:#ececf5;font:14px/1.5 "Segoe UI",sans-serif;resize:none;outline:none;padding:2px 3px}
    .mcp-selection-assistant textarea::placeholder{color:#7d7d95}
    .mcp-selection-assistant .sa-run{background:#36314f;color:#cfc6ff;font-size:13px;padding:7px 11px}
    .mcp-selection-assistant .sa-status{color:#9797b0;font-size:12px;min-height:18px;flex-shrink:0}
    .mcp-selection-assistant .sa-status[data-kind=error]{color:#ffb7bd}
    .mcp-selection-assistant .sa-status[data-kind=success]{color:#98ddbc}
    .mcp-selection-assistant .sa-status[data-kind=busy]::before{content:'';display:inline-block;width:9px;height:9px;border:1.5px solid #656078;border-top-color:#c1b4ff;border-radius:50%;margin-right:8px;animation:sa-spin .8s linear infinite}
    @keyframes sa-spin{to{transform:rotate(360deg)}}
    @media(prefers-reduced-motion:reduce){.mcp-selection-assistant .sa-status[data-kind=busy]::before{animation:none}}
    .mcp-selection-assistant .sa-result-shell{display:flex;flex-direction:column;min-height:0;border:1px solid #373746;border-radius:12px;overflow:hidden;background:#1b1b24}
    .mcp-selection-assistant .sa-result-shell[hidden]{display:none}
    .mcp-selection-assistant .sa-result-head{padding:9px 12px;border-bottom:1px solid #333340;background:#24242f}
    .mcp-selection-assistant .sa-result-title{font-size:11px;letter-spacing:1px;color:#aaa7c0;flex:1}
    .mcp-selection-assistant .sa-tabs{display:flex;gap:3px}
    .mcp-selection-assistant .sa-tabs button{padding:3px 8px;font-size:11px;background:transparent;border-radius:5px;color:#8e8ba4}
    .mcp-selection-assistant .sa-tabs button[aria-pressed=true]{background:#3a344f;color:#e2d9ff}
    .mcp-selection-assistant .sa-result{padding:14px 16px;overflow:auto;max-height:32vh;min-height:55px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.75;font-size:14px;scrollbar-width:thin;scrollbar-color:#4a465e transparent}
    .mcp-selection-assistant .sa-result.sa-conversation{white-space:normal;padding:16px;display:flex;flex-direction:column;gap:20px}
    .mcp-selection-assistant .sa-message{max-width:94%;min-width:0;flex-shrink:0}
    .mcp-selection-assistant .sa-message-user{align-self:flex-end;max-width:86%}
    .mcp-selection-assistant .sa-message-assistant{align-self:flex-start;width:94%}
    .mcp-selection-assistant .sa-message-label{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:600;letter-spacing:.25px;color:#a6a0b9;margin:0 3px 6px}
    .mcp-selection-assistant .sa-message-user .sa-message-label{justify-content:flex-end;color:#b7a9e5}
    .mcp-selection-assistant .sa-message-body{white-space:pre-wrap;overflow-wrap:anywhere;padding:12px 15px;border-radius:13px;line-height:1.75}
    .mcp-selection-assistant .sa-message-user .sa-message-body{background:#39304f;border:1px solid #55456f;border-top-right-radius:4px;color:#f0eafa}
    .mcp-selection-assistant .sa-message-assistant .sa-message-body{background:#22222d;border:1px solid #353542;border-top-left-radius:4px;color:#dedee9}
    .mcp-selection-assistant .sa-message-body strong{font-weight:650;color:#f5f1ff}
    .mcp-selection-assistant .sa-footer{justify-content:flex-end;border-top:1px solid #343342;padding-top:12px}
    .mcp-selection-assistant .sa-note{font-size:11px;color:#85859d;flex:1;white-space:normal}
    .mcp-selection-assistant .sa-apply{background:#8070e0;color:white;font-weight:600;box-shadow:0 2px 10px #4a38852b}
    .mcp-selection-assistant .sa-apply:hover:not(:disabled){background:#9383ef;border-color:transparent}
    @media(max-width:480px){.mcp-selection-assistant{gap:10px}.mcp-selection-assistant .sa-note{display:none}.mcp-selection-assistant .sa-result{padding:10px;font-size:13px}}
  `;
  const header = make('div', 'sa-header');
  const heading = make('div', 'sa-heading', 'AI Asistanı');
  const subtitle = make('span', 'sa-subtitle', surface === 'pdf' ? 'PDF üzerinde düşün, dönüştür, çevir' : 'Seçili metnin üzerinde çalış');
  heading.append(subtitle); header.append(make('span', 'sa-mark', '✦'), heading);
  const presets = make('div', 'sa-presets');
  const composer = make('div', 'sa-composer');
  const command = make('textarea', 'mcp-cdp-cevir-chat-input');
  command.placeholder = 'Bu metinle ne yapalım?'; command.rows = 2;
  command.setAttribute('aria-label', 'Seçili metin için komut');
  const status = make('div', 'sa-status', 'Seçim okunuyor…');
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const setStatus = (text, kind = '') => { status.textContent = text; status.dataset.kind = kind; };
  const shell = make('div', 'sa-result-shell'); shell.hidden = true;
  const resultHead = make('div', 'sa-result-head');
  const tabs = make('div', 'sa-tabs');
  resultHead.append(make('span', 'sa-result-title', 'ÖNİZLEME'), tabs);
  const result = make('div', 'sa-result'); result.tabIndex = 0;
  shell.append(resultHead, result);
  const footer = make('div', 'sa-footer');
  const note = make('span', 'sa-note', surface === 'pdf' ? 'PDF metni değiştirilmez.' : 'Sen uygulayana kadar notun değişmez.');
  footer.append(note);
  const button = (parent, label, fn, cls = '') => {
    const el = make('button', cls, label); el.type = 'button'; el.onclick = fn;
    parent.append(el); return el;
  };
  const close = button(header, '×', () => { cancelChat(); cancelExplain(); api.close(); }, 'sa-close');
  close.setAttribute('aria-label', 'Kapat'); close.title = 'Kapat';
  const info = make('div', 'sa-info'); info.hidden = true;
  const infoBody = make('div', 'sa-info-body');
  const help = button(heading, '?', () => {
    info.hidden = !info.hidden;
    help.setAttribute('aria-expanded', String(!info.hidden));
    if (!info.hidden) void loadInfo();
  }, 'sa-help');
  heading.insertBefore(help, subtitle);
  help.setAttribute('aria-label', 'Model ve bağlantı bilgisi'); help.setAttribute('aria-expanded', 'false');
  info.setAttribute('role', 'region'); info.setAttribute('aria-label', 'Model ve bağlantı durumu');
  info.append(infoBody); heading.append(info);
  const refreshInfo = button(info, 'Bağlantıyı kontrol et', () => loadInfo());
  const diagnosticBody = make('div', 'sa-diagnostics'); diagnosticBody.hidden = true;
  diagnosticBody.style.whiteSpace = 'pre-wrap'; diagnosticBody.style.overflowWrap = 'anywhere';
  const diagnosticButton = button(info, 'Tanı kayıtları', async () => {
    diagnosticButton.disabled = true; diagnosticBody.hidden = false; diagnosticBody.textContent = 'Tanı kayıtları okunuyor…';
    try {
      const data = await api.call('host_assistant_diagnostics', {});
      if (!data || data.readOnly !== true || data.mutationApplied !== false || !Array.isArray(data.events)) throw new Error('invalid diagnostics');
      const events = [...data.events, ...(Array.isArray(data.explain) ? data.explain : [])].filter(event => event && diagnosticStages.has(event.stage) && diagnosticCodes.has(event.code)).slice(-128);
      const lines = events.map(event => {
        const timestamp = typeof event.timestamp === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(event.timestamp) && Number.isFinite(Date.parse(event.timestamp)) ? event.timestamp : 'Zaman bilinmiyor';
        const duration = Number.isFinite(event.durationMs) && event.durationMs >= 0 ? `${(event.durationMs / 1000).toFixed(3)} sn` : 'Süre bilinmiyor';
        return `${event.stage} · ${event.code} · ${timestamp} · ${duration}`;
      });
      diagnosticBody.textContent = lines.join('\n') || 'Henüz tanı kaydı yok.';
    } catch { diagnosticBody.textContent = 'Tanı kayıtlarına ulaşılamadı; bu host sürümü desteklemiyor olabilir.'; }
    finally { diagnosticButton.disabled = false; }
  });
  info.append(diagnosticBody);
  let infoBusy = false;
  const renderInfo = data => {
    const connection = data.connection;
    const effort = { low: 'Low (düşük)', medium: 'Medium (orta)', high: 'High (yüksek)' }[data.reasoningEffort] || data.reasoningEffort || 'Bilinmiyor';
    infoBody.textContent = `Model: ${data.model || 'Bilinmiyor'}\nDüşünme seviyesi: ${effort}\n\nYerel servis: Bağlı\nRemNote eklentisi: ${data.pluginConnected ? 'Bağlı' : 'Bağlı değil'}\nAI yanıt testi: ${connection ? (connection.ok ? 'Başarılı' : 'Başarısız') : 'Henüz yapılmadı'}` +
      (connection ? `\nKontrol: ${new Date(connection.checkedAt).toLocaleTimeString('tr-TR')} · ${(connection.durationMs / 1000).toFixed(1)} sn` : '') +
      (connection?.error ? `\n${connection.error}` : '') + '\n\nBu bilgi imla / metin komutları içindir. PDF çeviri kartı farklı modeller kullanabilir. Test 60 sn önbellekte tutulur.';
  };
  async function loadInfo() {
    if (infoBusy) return;
    infoBusy = true; refreshInfo.disabled = true; infoBody.textContent = 'Model ve bağlantı kontrol ediliyor…';
    try {
      renderInfo(await api.call('host_assistant_status', {}));
      refreshInfo.textContent = 'AI yanıtı bekleniyor…';
      renderInfo(await api.call('host_assistant_status', { check: true }));
    } catch { infoBody.textContent = 'Yerel servise ulaşılamadı. Model ve AI bağlantısı doğrulanamadı.'; }
    finally { infoBusy = false; refreshInfo.disabled = false; refreshInfo.textContent = 'Bağlantıyı kontrol et'; }
  }
  root.addEventListener('pointerdown', event => {
    if (!info.contains(event.target) && event.target !== help) { info.hidden = true; help.setAttribute('aria-expanded', 'false'); }
  });
  let snapshot = null, plan = null, busy = false, outputText = '', originalText = '', mode = 'edit', captureError = '';
  let chatJob = null, chatGeneration = 0;
  const panelAlive = () => {
    if (!root.isConnected) return false;
    for (let el = root; el; el = el.parentElement) {
      if (el.hidden || getComputedStyle(el).display === 'none') return false;
    }
    return true;
  };
  const stopWatching = job => {
    job.observer?.disconnect();
    if (job.timer) clearTimeout(job.timer);
    job.wake?.(); job.wake = null; job.timer = null;
  };
  const sendCancel = async job => {
    if (!job.requestId || job.cancelSent) return;
    job.cancelSent = true;
    try {
      const data = await api.call('host_assistant_job_cancel', { requestId: job.requestId });
      if (panelAlive() && chatGeneration === job.generation + 1 && !chatJob) {
        setStatus(data.status === 'cancelled' ? 'Yanıt iptal edildi. Sorun korunuyor.' : 'İş zaten tamamlanmış; yanıt gösterilmedi. Sorun korunuyor.');
      }
    } catch {
      if (panelAlive() && chatGeneration === job.generation + 1 && !chatJob) setStatus('İptal sunucuda doğrulanamadı. Sorun korunuyor; otomatik tekrar gönderilmedi.', 'error');
    }
  };
  function cancelChat() {
    const job = chatJob;
    if (!job) return;
    reportChat(job, job.stage || 'chat_start', 'CANCELLED');
    job.cancelled = true; chatJob = null; chatGeneration++;
    stopWatching(job); setBusy(false); cancelButton.hidden = true;
    if (panelAlive()) setStatus('İptal isteği gönderiliyor… Sorun korunuyor.');
    void sendCancel(job);
  }
  root.addEventListener('sa-close', cancelChat);
  root.addEventListener('sa-close', () => cancelExplain());
  const activeChat = job => chatJob === job && !job.cancelled && job.generation === chatGeneration && panelAlive();
  function reportChat(job, stage, code) {
    job.reported ||= new Set();
    if (job.reported.has(stage)) return;
    job.reported.add(stage); report(stage, code, job.stageStarted || job.started, job.requestId);
  }
  const pendingStatus = data => setStatus(`Yanıt bekleniyor… ${Math.max(0, Number(data.elapsedMs) || 0) / 1000} sn geçti.`, 'busy');
  const messages = [], drafts = { edit: '', chat: '', remnote: '' };
  const modes = make('div', 'sa-modes');
  modes.setAttribute('aria-label', 'Asistan çalışma modu');
  const mcp = make('div', 'sa-mcp'); mcp.hidden = true;
  const mcpHint = make('div', 'sa-note', 'Mevcut MCP köprüsü · Arama ve okuma doğrudan; değişiklikler onaylı. Silme ve uygulama ayarları bu modda yok.');
  const mcpLog = make('div', 'sa-mcp-log', 'Örnek: “Psikoloji notlarımı bul” veya “Şu notun altına yeni bir madde ekle”.');
  mcpLog.setAttribute('role', 'log');
  const mcpApproval = make('div', 'sa-mcp-approval'); mcpApproval.hidden = true;
  const mcpComposer = make('div', 'sa-composer');
  const mcpInput = make('textarea', 'mcp-cdp-cevir-chat-input');
  mcpInput.rows = 2; mcpInput.placeholder = 'RemNote ile ne yapalım?';
  mcpInput.setAttribute('aria-label', 'RemNote isteği'); mcpInput.dataset.saChat = 'true';
  const mcpStatus = make('div', 'sa-status'); mcpStatus.setAttribute('role', 'status');
  let mcpSession = null, mcpPlan = null;
  const mcpMessages = [];
  const addMcpMessage = (role, content) => {
    mcpMessages.push({ role, content });
    if (mcpMessages.length > 16) mcpMessages.splice(0, 2);
    mcpLog.replaceChildren();
    for (const msg of mcpMessages) {
      const card = make('div', `sa-message sa-message-${msg.role}`);
      card.style.marginBottom = '14px';
      card.append(make('div', 'sa-message-label', msg.role === 'user' ? 'SEN' : '✦ REMNOTE ASİSTANI'), make('div', 'sa-message-body', msg.content));
      mcpLog.append(card);
    }
    mcpLog.scrollTop = mcpLog.scrollHeight;
  };
  const mcpBusy = value => {
    setBusy(value); mcpInput.disabled = value; mcpSend.disabled = value;
    mcpApprove.disabled = value || !mcpPlan; mcpCancel.disabled = value;
  };
  const clearMcpPlan = () => { mcpPlan = null; mcpApproval.hidden = true; mcpApprove.hidden = true; mcpCancel.hidden = true; };
  const mcpRun = async () => {
    if (busy || !mcpInput.value.trim()) return;
    const question = mcpInput.value.trim(); clearMcpPlan(); mcpBusy(true);
    mcpStatus.textContent = 'MCP üzerinden araştırılıyor… Birkaç okuma adımı gerekebilir.';
    try {
      const data = await api.call('host_assistant_remnote_chat', { sessionId: mcpSession, question });
      if (!root.isConnected) return;
      mcpSession = data.sessionId;
      addMcpMessage('user', question); addMcpMessage('assistant', data.answer);
      mcpInput.value = '';
      mcpStatus.textContent = data.trace?.length ? 'Gerçek okuma işlemleri: ' + data.trace.map(x => x.action).join(' → ') : 'Yanıt hazır.';
      if (data.approval) {
        mcpPlan = data.approval;
        mcpApproval.textContent = 'ONAY BEKLEYEN İŞLEM — henüz uygulanmadı\n' + mcpPlan.action + '\n\nHedefler:\n' + mcpPlan.targets.map(x => `${x.title} (${x.remId})`).join('\n') + '\n\nTam işlem içeriği:\n' + JSON.stringify(mcpPlan.payload, null, 2);
        mcpApproval.hidden = false; mcpApprove.hidden = false; mcpCancel.hidden = false;
      }
    } catch (error) { mcpStatus.textContent = String(error.message || error); }
    finally { mcpBusy(false); if (root.isConnected) mcpInput.focus(); }
  };
  mcpComposer.append(mcpInput);
  const mcpSend = button(mcpComposer, 'Gönder ↑', mcpRun, 'sa-run'); mcpSend.setAttribute('aria-label', 'RemNote isteğini gönder');
  const mcpActions = make('div', 'sa-presets');
  const mcpApprove = button(mcpActions, 'Onayla ve uygula', async () => {
    if (busy || !mcpPlan) return;
    const planId = mcpPlan.planId; mcpBusy(true); clearMcpPlan();
    mcpStatus.textContent = 'Onaylanan işlem uygulanıyor…';
    try {
      const data = await api.call('host_assistant_remnote_approve', { sessionId: mcpSession, planId, confirm: 'APPROVE_REMNOTE_ACTION' });
      addMcpMessage('assistant', data.answer); mcpStatus.textContent = 'İşlem sonucu RemNote köprüsünden alındı.';
    } catch (error) { mcpStatus.textContent = String(error.message || error); }
    finally { mcpBusy(false); }
  }, 'sa-mcp-confirm');
  const mcpCancel = button(mcpActions, 'Vazgeç', async () => {
    clearMcpPlan(); mcpBusy(true);
    try { await api.call('host_assistant_remnote_cancel', { sessionId: mcpSession }); mcpStatus.textContent = 'Onay planı iptal edildi; işlem uygulanmadı.'; }
    catch { mcpStatus.textContent = 'Yerel onay temizlendi; sunucuya ulaşılamadı. İşlem gönderilmedi.'; }
    finally { mcpBusy(false); }
  });
  clearMcpPlan();
  mcpInput.addEventListener('sa-send', () => { if (mode === 'remnote') void mcpRun(); });
  mcpInput.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey && !event.isComposing) {
      event.preventDefault(); event.stopPropagation(); void mcpRun();
    }
  });
  mcp.append(mcpHint, mcpLog, mcpApproval, mcpActions, mcpComposer, mcpStatus);
  const renderChat = () => {
    result.classList.add('sa-conversation');
    result.replaceChildren();
    for (const message of messages) {
      const user = message.role === 'user';
      const row = make('div', `sa-message sa-message-${user ? 'user' : 'assistant'}`);
      row.setAttribute('aria-label', user ? 'Senin mesajın' : 'AI yanıtı');
      const label = make('div', 'sa-message-label', user ? 'SEN' : '✦ AI ASİSTANI');
      const body = make('div', 'sa-message-body');
      if (user) body.textContent = message.content;
      else {
        // Only **bold** is interpreted; HTML and all other text stay inert.
        const parts = message.content.split(/(\*\*[^*\n]+\*\*)/g);
        for (const part of parts) {
          if (part.startsWith('**') && part.endsWith('**') && part.length > 4) body.append(make('strong', '', part.slice(2, -2)));
          else body.append(document.createTextNode(part));
        }
      }
      row.append(label, body); result.append(row);
    }
    result.scrollTop = result.scrollHeight;
  };
  const setMode = next => {
    if (busy) return;
    cancelExplain(); explainPanel.hidden = true;
    composer.hidden = false; status.hidden = false; footer.hidden = false;
    drafts[mode] = command.value; mode = next; command.value = drafts[mode];
    editMode.setAttribute('aria-pressed', String(mode === 'edit'));
    chatMode.setAttribute('aria-pressed', String(mode === 'chat'));
    remnoteMode.setAttribute('aria-pressed', String(mode === 'remnote'));
    mcp.hidden = mode !== 'remnote';
    for (const el of [presets, composer, status, shell, footer]) el.style.display = mode === 'remnote' ? 'none' : '';
    if (mode === 'remnote') { mcpInput.focus(); return; }
    presets.hidden = mode === 'chat'; tabs.hidden = mode === 'chat';
    apply.hidden = mode === 'chat' || surface === 'pdf'; apply.disabled = !plan || !plan.editable;
    runButton.textContent = mode === 'chat' ? 'Gönder ↑' : 'Çalıştır ↑';
    runButton.setAttribute('aria-label', mode === 'chat' ? 'Mesajı gönder' : 'Komutu çalıştır');
    command.dataset.saChat = String(mode === 'chat');
    command.placeholder = mode === 'chat' ? 'Sohbete devam et…' : 'Bu metinle ne yapalım?';
    command.title = mode === 'chat' ? 'Enter: gönder · Shift+Enter: yeni satır' : '';
    root.insertBefore(composer, mode === 'chat' ? footer : status);
    root.querySelector('.sa-result-title').textContent = mode === 'chat' ? 'SOHBET' : 'ÖNİZLEME';
    note.textContent = mode === 'chat' ? 'Enter: gönder · Shift+Enter: yeni satır' : surface === 'pdf' ? 'PDF metni değiştirilmez.' : 'Sen uygulayana kadar notun değişmez.';
    shell.hidden = mode === 'chat' ? !messages.length : !outputText;
    copy.disabled = mode === 'chat' ? !messages.some(m => m.role === 'assistant') : !outputText;
    if (mode === 'chat') renderChat(); else showResult(false);
    setBusy(false);
    if (mode === 'edit' && captureError) setStatus(captureError, 'error');
    else setStatus(mode === 'chat' ? 'Genel bilgi sorabilir, cevabın ardından devam sorusu yazabilirsin.' : 'Hızlı bir komut seç veya kendi isteğini yaz.');
  };
  const editMode = button(modes, 'Düzenle', () => setMode('edit'));
  const chatMode = button(modes, 'Soru sor', () => setMode('chat'));
  const remnoteMode = button(modes, 'RemNote · MCP', () => setMode('remnote'));
  remnoteMode.setAttribute('aria-pressed', 'false');
  editMode.setAttribute('aria-pressed', 'true'); chatMode.setAttribute('aria-pressed', 'false');
  const presetButtons = [];
  const setBusy = value => {
    busy = value; command.disabled = value; runButton.disabled = value || (mode === 'edit' && !snapshot);
    editMode.disabled = value; chatMode.disabled = value; remnoteMode.disabled = value;
    presetButtons.forEach(el => { el.disabled = value || !snapshot; });
  };
  const showResult = before => {
    result.classList.remove('sa-conversation');
    result.textContent = before ? originalText : outputText;
    beforeButton.setAttribute('aria-pressed', String(before));
    afterButton.setAttribute('aria-pressed', String(!before));
  };
  const beforeButton = button(tabs, 'Önce', () => showResult(true));
  const afterButton = button(tabs, 'Sonra', () => showResult(false));
  const run = async () => {
    if (mode === 'chat') {
      if (busy || !command.value.trim()) return;
      const question = command.value.trim();
      const job = { generation: ++chatGeneration, requestId: null, cancelled: false, cancelSent: false, stage: 'chat_start', started: performance.now(), reported: new Set() };
      chatJob = job;
      job.observer = new MutationObserver(() => { if (!panelAlive()) cancelChat(); });
      job.observer.observe(document.body, { childList: true, subtree: true });
      for (let el = root; el; el = el.parentElement) job.observer.observe(el, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
      setBusy(true); cancelButton.hidden = false; setStatus('Yanıt hazırlanıyor… 0 sn geçti.', 'busy');
      try {
        let data = await api.call('host_assistant_chat', { captureId: explainChatContext ? undefined : snapshot?.captureId, question, messages, async: true });
        job.requestId = data?.requestId;
        if (!activeChat(job)) { if (!job.cancelled) cancelChat(); await sendCancel(job); return; }
        if (!job.requestId || data.status !== 'running') throw Object.assign(new Error('Asistan işi başlatılamadı; geçerli iş kimliği alınamadı.'), { code: 'INVALID_RESPONSE' });
        reportChat(job, 'chat_start', 'OK');
        const statusWait = data.statusWait === true;
        job.stage = 'chat_wait'; job.stageStarted = performance.now();
        pendingStatus(data);
        while (activeChat(job)) {
          if (!statusWait) {
            await new Promise(resolve => { job.wake = resolve; job.timer = setTimeout(resolve, 750); });
            job.timer = null; job.wake = null;
          }
          if (!activeChat(job)) { if (!job.cancelled) cancelChat(); return; }
          data = await api.call('host_assistant_job_status', { requestId: job.requestId, ...(statusWait ? { waitMs: 20000 } : {}) });
          if (!activeChat(job)) { if (!job.cancelled) cancelChat(); return; }
          if (!data || data.requestId !== job.requestId) throw Object.assign(new Error('Yanıtın iş kimliği eşleşmedi.'), { code: 'INVALID_RESPONSE' });
          if (data.status === 'running') { pendingStatus(data); continue; }
          if (data.status === 'cancelled') { reportChat(job, 'chat_wait', 'CANCELLED'); setStatus('Yanıt iptal edildi. Sorun korunuyor.'); return; }
          if (data.status === 'error') {
            const error = new Error(data.error || 'Asistan yanıtı alınamadı.'); error.code = data.code; throw error;
          }
          if (data.status !== 'completed' || typeof data.answer !== 'string') throw Object.assign(new Error('Asistan geçerli bir yanıt döndürmedi.'), { code: 'INVALID_RESPONSE' });
          break;
        }
        if (!activeChat(job)) return;
        reportChat(job, 'chat_wait', 'OK');
        job.stage = 'chat_render'; job.stageStarted = performance.now();
        messages.push({ role: 'user', content: question }, { role: 'assistant', content: data.answer });
        if (messages.length > 16) messages.splice(0, messages.length - 16);
        shell.hidden = false; renderChat(); copy.disabled = false;
        command.value = ''; drafts.chat = ''; setStatus('Yanıt hazır. Devam sorusu sorabilirsin.', 'success');
        reportChat(job, 'chat_render', 'OK');
      } catch (error) {
        if (activeChat(job)) {
          reportChat(job, job.stage, failureCode(error));
          void sendCancel(job);
          const code = failureCode(error);
          const message = code === 'CODEX_TIMEOUT' ? 'Yanıt bekleme süresi doldu. Sorun korunuyor; istersen yeniden gönderebilirsin.' :
            code === 'CAPACITY_LIMIT' ? 'Asistan kapasite sınırına ulaştı. Sorun korunuyor; biraz sonra yeniden gönderebilirsin.' :
            code === 'BRIDGE_UNAVAILABLE' ? 'Asistan servisine bağlantı kurulamadı. Sorun korunuyor; yeniden deneyebilirsin.' :
            code === 'INVALID_RESPONSE' ? 'Asistan yanıtının biçimi geçerli değil. Sorun korunuyor; yeniden deneyebilirsin.' : String(error.message || error);
          setStatus(message, 'error');
        }
      } finally {
        stopWatching(job);
        if (chatJob === job) { chatJob = null; cancelButton.hidden = true; setBusy(false); if (panelAlive()) command.focus(); }
      }
      return;
    }
    if (!snapshot || busy || !command.value.trim()) return;
    setBusy(true); plan = null; apply.disabled = true; copy.disabled = true;
    setStatus('Metin hazırlanıyor…', 'busy');
    try {
      const data = await api.call('host_assistant_preview', { captureId: snapshot.captureId, command: command.value });
      if (!root.isConnected) return;
      plan = data;
      outputText = data.segments.map(row => row.join('')).join('\n\n');
      originalText = data.original.map(row => row.join('')).join('\n\n');
      shell.hidden = false; showResult(false); copy.disabled = false;
      setStatus('Hazır. Önce / Sonra ile karşılaştırabilirsin.', 'success');
      apply.disabled = !data.editable;
    } catch (error) { if (root.isConnected) setStatus(String(error.message || error), 'error'); }
    finally { setBusy(false); }
  };
  for (const [label, instruction] of [
    ['İmla düzelt', 'İmla ve noktalama hatalarını düzelt. Anlamı ve teknik terimleri koru.'],
    ['Daha akıcı', 'Anlamı koruyarak daha akıcı ve doğal yaz.'],
    ['Kısalt', 'Ana bilgileri ve anlamı koruyarak her paragrafı daha kısa yaz.'],
  ]) presetButtons.push(button(presets, label, () => { command.value = instruction; void run(); }));
  // Explain owns only its panel and read-only host calls, never an edit plan.
  const explainPanel = make('section', 'sa-explain'); explainPanel.hidden = true;
  explainPanel.setAttribute('aria-label', 'Kavram açıklaması');
  const explainTitle = make('h2', 'sa-explain-title');
  const explainSummary = make('div', 'sa-explain-summary');
  const summaryStatus = make('div', 'sa-explain-summary-status'); summaryStatus.setAttribute('role', 'status');
  const imageStatus = make('div', 'sa-explain-image-status'); imageStatus.setAttribute('role', 'status');
  const imageNotice = make('div', 'sa-explain-image-notice'); imageNotice.setAttribute('role', 'status'); imageNotice.hidden = true;
  const gallery = make('div', 'sa-explain-gallery'); gallery.hidden = true;
  gallery.setAttribute('aria-label', 'Kavram görselleri');
  const mainImage = button(gallery, '', () => enlargeImage(), 'sa-explain-main');
  mainImage.setAttribute('aria-label', 'Görseli büyüt');
  const navigation = make('div', 'sa-explain-navigation');
  const prevImage = button(navigation, '←', () => selectImage(imageIndex - 1)); prevImage.setAttribute('aria-label', 'Önceki görsel');
  const imageCounter = make('span', 'sa-explain-counter'); imageCounter.setAttribute('aria-live', 'polite');
  navigation.append(imageCounter);
  const nextImage = button(navigation, '→', () => selectImage(imageIndex + 1)); nextImage.setAttribute('aria-label', 'Sonraki görsel');
  const thumbnails = make('div', 'sa-explain-thumbnails');
  const caption = make('div', 'sa-explain-caption');
  gallery.append(navigation, thumbnails, caption);
  // Keep alternatives discoverable before a tall photo, even in a short popup.
  gallery.prepend(navigation, thumbnails);
  const explainActions = make('div', 'sa-explain-actions');
  const retrySummary = button(explainActions, 'Özeti tekrar dene', () => requestSummary(explainJob)); retrySummary.hidden = true;
  const retryImages = button(explainActions, 'Görselleri tekrar dene', () => requestImages(explainJob, explainCache.summary?.visualQuery, true)); retryImages.hidden = true;
  const followup = button(explainActions, 'Daha detaylı sor', () => {
    const data = explainCache.summary;
    if (!data) return;
    // This is conversation context, not a request to alter the PDF or a note.
    messages.push({ role: 'user', content: `Kavram: ${explainText}` }, { role: 'assistant', content: data.summary });
    explainChatContext = true;
    if (messages.length > 16) messages.splice(0, messages.length - 16);
    setMode('chat'); command.focus();
  }); followup.disabled = true;
  explainPanel.append(explainTitle, explainSummary, summaryStatus, imageStatus, imageNotice, gallery, explainActions);
  const explainText = String(capture.selectedText || '').trim().slice(0, 300);
  const explainContext = String(capture.contextText || '').trim().slice(0, 600);
  const explainCache = { summary: null, images: null, rawImages: null, imageNotice: '' };
  let explainJob = null, explainGeneration = 0, imageGeneration = 0, imageIndex = 0, imageCandidates = [], enlarged = null, explainChatContext = false;
  let imageSnapshot = '';
  const failedPreviews = new Set();
  const safeWebUrl = value => {
    try { const url = new URL(String(value)); return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url.href : null; }
    catch { return null; }
  };
  const activeExplain = job => job && explainJob === job && job.generation === explainGeneration && panelAlive() && !explainPanel.hidden;
  function closeEnlarged() {
    if (!enlarged) return;
    enlarged.remove(); enlarged = null;
    if (panelAlive() && !explainPanel.hidden) mainImage.focus();
  }
  function cancelExplain() {
    clearTimeout(explainJob?.imagePollTimer);
    explainGeneration++; explainJob?.observer.disconnect(); explainJob = null;
    closeEnlarged();
  }
  function selectImage(index) {
    if (!imageCandidates.length) return;
    imageIndex = (index + imageCandidates.length) % imageCandidates.length;
    const item = imageCandidates[imageIndex];
    const img = make('img'); img.alt = item.title || explainText;
    img.referrerPolicy = 'no-referrer';
    const job = explainJob;
    const currentImage = () => activeExplain(job) && mainImage.firstChild === img;
    const label = (explainCache.images?.provisional ? 'İlk görsel sonuçları · kavram bağlamı henüz doğrulanmadı' : 'Kaynak görseli') +
      (explainCache.images?.rankingPending ? ' · Sıralama hazırlanıyor' : explainCache.images?.ranker === 'OpenCLIP' ? ' · OpenCLIP sıralı' : '');
    const loadStarted = performance.now(); let loadFailureReported = false;
    imageStatus.textContent = `${label} · Görsel yükleniyor…`;
    img.onload = () => { if (currentImage()) imageStatus.textContent = `${label} · Görsel hazır · büyütmek için tıkla`; };
    img.onerror = () => {
      if (!currentImage()) return;
      imageStatus.textContent = 'Bu görsel yüklenemedi; başka görsel seçebilirsin.';
      if (!loadFailureReported) { loadFailureReported = true; report('image_load', 'IMAGE_LOAD_FAILED', loadStarted); }
      // Only a native undecoded failure may auto-advance. A synthetic error
      // on an already decoded image retains the existing manual error/load flow.
      if (!img.complete || img.naturalWidth !== 0) return;
      failedPreviews.add(item.thumbnailUrl || item.imageUrl);
      if (failedPreviews.size < 5) {
        for (let step = 1; step < imageCandidates.length; step++) {
          const next = (imageIndex + step) % imageCandidates.length;
          const preview = imageCandidates[next].thumbnailUrl;
          // Automatic recovery never requests a full original in place of a
          // supplied thumbnail, nor retries duplicate failed preview URLs.
          if (preview && !failedPreviews.has(preview)) { selectImage(next); return; }
        }
      }
      imageStatus.textContent = 'Görsel önizlemeleri yüklenemedi. Görselleri tekrar deneyebilirsin.';
      retryImages.hidden = false;
    };
    // Use the provider's validated preview; fetch full quality only on explicit enlargement.
    img.src = item.thumbnailUrl || item.imageUrl;
    mainImage.replaceChildren(img); imageCounter.textContent = `${imageIndex + 1}/${imageCandidates.length}`;
    prevImage.disabled = nextImage.disabled = imageCandidates.length < 2;
    thumbnails.replaceChildren();
    imageCandidates.forEach((candidate, i) => {
      const thumb = button(thumbnails, '', () => selectImage(i));
      thumb.setAttribute('aria-label', `Görsel ${i + 1}`); thumb.setAttribute('aria-pressed', String(i === imageIndex));
      const small = make('img'); small.src = candidate.thumbnailUrl || candidate.imageUrl; small.alt = ''; small.referrerPolicy = 'no-referrer';
      thumb.append(small);
    });
    caption.replaceChildren();
    const source = make('a', '', item.title || 'Görsel kaynağı'); source.href = item.sourceUrl; source.target = '_blank'; source.rel = 'noopener noreferrer';
    caption.append(source, document.createTextNode(` · ${item.license || 'Lisans belirtilmedi'}${item.creator ? ' · ' + item.creator : ''}`));
  }
  gallery.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation(); selectImage(imageIndex + (event.key === 'ArrowRight' ? 1 : -1));
  });
  function enlargeImage() {
    if (!imageCandidates.length || enlarged) return;
    const item = imageCandidates[imageIndex];
    enlarged = make('dialog', 'sa-explain-enlarged'); enlarged.setAttribute('aria-label', 'Büyütülmüş görsel');
    const shut = button(enlarged, 'Kapat', closeEnlarged); shut.setAttribute('aria-label', 'Büyütülmüş görseli kapat');
    const img = make('img'); img.alt = item.title || explainText; img.referrerPolicy = 'no-referrer';
    const quality = item.previewOnly ? 'Önizleme' : 'Orijinal görsel';
    const modalStatus = make('div', 'sa-explain-enlarged-status', `${quality} yükleniyor…`); modalStatus.setAttribute('role', 'status');
    const dialog = enlarged, job = explainJob;
    const currentModal = () => activeExplain(job) && enlarged === dialog && dialog.isConnected && imageCandidates[imageIndex]?.imageUrl === item.imageUrl;
    const modalLoadStarted = performance.now(); let modalFailureReported = false;
    img.onload = () => { if (currentModal()) modalStatus.textContent = `${quality} hazır.`; };
    img.onerror = () => {
      if (!currentModal()) return;
      modalStatus.textContent = `${quality} yüklenemedi; kapatıp başka görsel seçebilirsin.`;
      if (!modalFailureReported) { modalFailureReported = true; report('image_load', 'IMAGE_LOAD_FAILED', modalLoadStarted); }
    };
    img.src = item.imageUrl;
    enlarged.append(img, modalStatus, make('div', '', `${item.title || explainText} · ${item.license || 'Lisans belirtilmedi'}`));
    enlarged.addEventListener('cancel', event => { event.preventDefault(); closeEnlarged(); });
    enlarged.addEventListener('keydown', event => {
      if (event.key === 'Tab') { event.preventDefault(); event.stopPropagation(); shut.focus(); }
    });
    root.append(enlarged); enlarged.showModal(); shut.focus();
  }
  function renderSummary(data) {
    explainTitle.textContent = data.term || explainText; explainSummary.textContent = data.summary;
    summaryStatus.textContent = data.uncertain ? 'Bağlam sınırlı; bu açıklama kesin olmayabilir.' : 'Kısa açıklama · salt okunur';
    retrySummary.hidden = true; followup.disabled = false;
  }
  function renderImages(data) {
    imageNotice.textContent = explainCache.imageNotice; imageNotice.hidden = !explainCache.imageNotice;
    const previousImage = imageCandidates[imageIndex]?.imageUrl;
    const nextCandidates = (Array.isArray(data.candidates) ? data.candidates : []).filter(item => safeWebUrl(item.imageUrl) && safeWebUrl(item.sourceUrl)).slice(0, 5)
      .map(item => ({ ...item, imageUrl: safeWebUrl(item.imageUrl), sourceUrl: safeWebUrl(item.sourceUrl), thumbnailUrl: safeWebUrl(item.thumbnailUrl) }));
    const snapshot = JSON.stringify([nextCandidates, data.provisional, data.rankingPending, data.ranker, explainJob?.generation]);
    // Polling an unchanged cache must not reload images or steal keyboard focus.
    if (snapshot === imageSnapshot && !failedPreviews.size) return;
    imageSnapshot = snapshot; failedPreviews.clear(); imageCandidates = nextCandidates;
    gallery.hidden = !imageCandidates.length;
    imageStatus.textContent = imageCandidates.length ? (data.provisional ? 'İlk görsel sonuçları · kavram bağlamı henüz doğrulanmadı' : 'Kaynak görselleri · büyütmek için görsele tıkla') : 'Uygun kaynak görseli bulunamadı.';
    retryImages.hidden = !!imageCandidates.length;
    const nextIndex = Math.max(0, imageCandidates.findIndex(item => item.imageUrl === previousImage));
    if (enlarged && imageCandidates[nextIndex]?.imageUrl !== previousImage) closeEnlarged();
    if (imageCandidates.length) selectImage(nextIndex); else { mainImage.replaceChildren(); thumbnails.replaceChildren(); caption.replaceChildren(); imageCounter.textContent = ''; }
  }
  const usableImages = data => Array.isArray(data?.candidates) && data.candidates.some(item => item && safeWebUrl(item.imageUrl) && safeWebUrl(item.sourceUrl));
  const setImageNotice = text => {
    explainCache.imageNotice = text; imageNotice.textContent = text; imageNotice.hidden = !text;
  };
  function showRawImages(job) {
    if (!activeExplain(job) || !usableImages(explainCache.rawImages)) return false;
    explainCache.images = explainCache.rawImages; renderImages(explainCache.images);
    retryImages.hidden = false;
    return true;
  }
  function recoverRawImages(job) {
    if (!activeExplain(job) || job.rawState === 'pending' || job.rawState === 'empty' || job.rawRecoveryAttempted) return;
    job.rawRecoveryAttempted = true; job.imagePending = false;
    requestImages(job, '');
  }
  function requestImages(job, visualQuery, forceRefresh = false, pollAttempt = 0) {
    if (!activeExplain(job) || job.imagePending) return;
    clearTimeout(job.imagePollTimer);
    if (!pollAttempt) job.imagePollDeadline = performance.now() + 45000;
    let pollAgain = false;
    const started = performance.now();
    const query = String(visualQuery || '').trim().slice(0, 160);
    const raw = !query;
    if (raw) job.rawState = 'pending';
    else { job.wantRawFallback = false; job.refinedEmpty = false; }
    const generation = ++imageGeneration;
    job.imagePending = true; retryImages.hidden = true;
    if (!pollAttempt) imageStatus.textContent = 'Görseller aranıyor…';
    // No PDF/context enters an image provider; only the short selected term/query.
    const payload = { selectedText: explainText, limit: 5 }; if (query) payload.visualQuery = query;
    if (forceRefresh) payload.forceRefresh = true;
    api.call('host_explain_images', payload).then(data => {
      if (!activeExplain(job)) return;
      if (!data || data.readOnly !== true || data.mutationApplied !== false || !Array.isArray(data.candidates)) throw Object.assign(new Error('Görsel yanıtının salt okunur sözleşmesi doğrulanamadı.'), { code: 'INVALID_RESPONSE' });
      const available = usableImages(data);
      const result = { ...data, provisional: raw, query: query || explainText };
      if (raw) {
        job.rawState = available ? 'success' : 'empty';
        if (available) explainCache.rawImages = result;
        // Keep the original pending lane available for an empty refinement,
        // but never let it replace a successful or still-pending refinement.
        if (generation !== imageGeneration && !job.wantRawFallback) return;
        explainCache.images = result; renderImages(result);
        if (job.wantRawFallback) retryImages.hidden = false;
      } else {
        if (generation !== imageGeneration) return;
        if (available) {
          job.wantRawFallback = false; job.refinedEmpty = false; setImageNotice('');
          explainCache.images = result; renderImages(result);
        } else {
          job.wantRawFallback = true; job.refinedEmpty = true;
          setImageNotice('Bağlama göre daraltılan aramada uygun görsel bulunamadı. İlk sonuçların kavram bağlamı henüz doğrulanmadı.');
          if (!showRawImages(job)) {
            explainCache.images = result; renderImages(result);
            if (job.rawState === 'pending') imageStatus.textContent = 'İlk görsel sonuçları bekleniyor…';
            else recoverRawImages(job);
          }
        }
      }
      pollAgain = data.rankingPending === true && available && generation === imageGeneration &&
        !job.wantRawFallback && pollAttempt < 40 && performance.now() < job.imagePollDeadline;
      report('explain_images', available ? 'OK' : 'IMAGES_EMPTY', started);
    }).catch(error => {
      if (!activeExplain(job)) return;
      if (raw) job.rawState = 'error';
      if (generation !== imageGeneration && !(raw && job.wantRawFallback)) return;
      const failure = explainFailure(error, 'images');
      if (!raw) {
        job.wantRawFallback = true;
        setImageNotice(`${failure} İlk sonuçların kavram bağlamı henüz doğrulanmadı.`);
        showRawImages(job);
      }
      imageStatus.textContent = failure; retryImages.hidden = false;
      report('explain_images', failureCode(error, true), started);
      if (raw && job.wantRawFallback && job.refinedEmpty) recoverRawImages(job);
    }).finally(() => {
      if (!activeExplain(job) || generation !== imageGeneration) return;
      job.imagePending = false;
      if (pollAgain) job.imagePollTimer = setTimeout(() => {
        if (activeExplain(job) && generation === imageGeneration && performance.now() < job.imagePollDeadline)
          requestImages(job, visualQuery, true, pollAttempt + 1);
      }, 1000);
    });
  }
  function requestSummary(job) {
    if (!activeExplain(job) || job.summaryPending) return;
    const started = performance.now();
    job.summaryPending = true; retrySummary.hidden = true; explainSummary.textContent = 'Kısa açıklama hazırlanıyor…';
    api.call('host_explain_summary', { selectedText: explainText, contextText: explainContext }).then(data => {
      if (!activeExplain(job)) return;
      if (!data || data.readOnly !== true || data.mutationApplied !== false || typeof data.summary !== 'string' || !data.summary.trim()) throw Object.assign(new Error('Geçerli salt okunur açıklama alınamadı.'), { code: 'INVALID_RESPONSE' });
      explainCache.summary = data; renderSummary(data);
      report('explain_summary', 'OK', started);
      const refined = String(data.visualQuery || '').trim().slice(0, 160);
      if (refined && refined.toLowerCase() !== explainText.toLowerCase()) {
        // Refined query supersedes the raw lane; late raw replies cannot overwrite it.
        job.imagePending = false; requestImages(job, refined);
      }
    }).catch(error => {
      if (activeExplain(job)) {
        explainSummary.textContent = ''; summaryStatus.textContent = explainFailure(error, 'summary'); retrySummary.hidden = false;
        report('explain_summary', failureCode(error, true), started);
      }
    }).finally(() => { if (activeExplain(job)) job.summaryPending = false; });
  }
  function startExplain() {
    if (busy) return;
    if (activeExplain(explainJob)) return;
    explainPanel.hidden = false; composer.hidden = true; status.hidden = true; shell.hidden = true; footer.hidden = true;
    explainTitle.textContent = explainText || 'Kavram seç';
    if (!explainText) { explainSummary.textContent = surface === 'pdf' ? 'Önce PDF içinde kısa bir kavram seç.' : 'Önce not içinde kısa bir kavram seç.'; return; }
    const job = { generation: ++explainGeneration, summaryPending: false, imagePending: false };
    explainJob = job;
    job.observer = new MutationObserver(() => { if (!panelAlive()) cancelExplain(); });
    job.observer.observe(document.body, { childList: true, subtree: true });
    for (let el = root; el; el = el.parentElement) job.observer.observe(el, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
    summaryStatus.textContent = ''; followup.disabled = !explainCache.summary;
    if (explainCache.summary) renderSummary(explainCache.summary); else requestSummary(job);
    const desiredQuery = String(explainCache.summary?.visualQuery || '').trim().slice(0, 160);
    if (explainCache.images) {
      renderImages(explainCache.images);
      // A mode switch cancels UI ownership of the pending lane, not the need
      // for its sense-refined result. Reuse only a cache from that query.
      if (desiredQuery && (explainCache.images.provisional || explainCache.images.query.toLowerCase() !== desiredQuery.toLowerCase())) requestImages(job, desiredQuery);
      else if (explainCache.images.rankingPending) requestImages(job, explainCache.images.provisional ? '' : explainCache.images.query, true);
    } else requestImages(job, desiredQuery);
  }
  if (surface === 'pdf') {
    button(presets, 'Çeviri kartı ↗', () => api.translate(capture));
  }
  button(presets, 'Açıkla', startExplain);
  css.textContent += `
    .mcp-selection-assistant .sa-explain{overflow:auto;min-height:0;padding:12px;border:1px solid #454057;border-radius:12px;background:#1b1b24}
    .mcp-selection-assistant .sa-explain[hidden],.mcp-selection-assistant .sa-explain-gallery[hidden],.mcp-selection-assistant [hidden]{display:none}
    .mcp-selection-assistant .sa-explain-title{font-size:15px;margin:0 0 8px;overflow-wrap:anywhere}
    .mcp-selection-assistant .sa-explain-summary{line-height:1.65;overflow-wrap:anywhere}
    .mcp-selection-assistant .sa-explain-summary-status,.mcp-selection-assistant .sa-explain-image-status,.mcp-selection-assistant .sa-explain-image-notice{font-size:12px;color:#c3bdd5;margin:8px 0;overflow-wrap:anywhere}
    .mcp-selection-assistant .sa-explain-main{display:block;width:100%;padding:0;background:#14141c;overflow:hidden}
    .mcp-selection-assistant .sa-explain-main img{display:block;width:100%;height:200px;object-fit:contain}
    .mcp-selection-assistant .sa-explain-navigation{display:flex;align-items:center;justify-content:center;gap:12px;margin:8px 0}
    .mcp-selection-assistant .sa-explain-thumbnails{display:flex;gap:6px;overflow:auto;padding:3px}
    .mcp-selection-assistant .sa-explain-thumbnails button{padding:2px;flex:0 0 50px;border:2px solid transparent}
    .mcp-selection-assistant .sa-explain-thumbnails button[aria-pressed=true]{border-color:#a49cff}
    .mcp-selection-assistant .sa-explain-thumbnails img{display:block;width:42px;height:36px;object-fit:cover}
    .mcp-selection-assistant .sa-explain-caption{font-size:11px;color:#c3bdd5;overflow-wrap:anywhere;margin:8px 0}
    .mcp-selection-assistant .sa-explain-caption a{color:#cec7ff}
    .mcp-selection-assistant .sa-explain-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
    .mcp-selection-assistant .sa-explain-actions button{font-size:12px;white-space:normal}
    .mcp-selection-assistant .sa-explain-enlarged{background:#1b1b24;color:#e7e7ef;border:1px solid #777087;border-radius:12px;max-width:94vw;max-height:90vh;padding:16px}
    .mcp-selection-assistant .sa-explain-enlarged::backdrop{background:#000b}
    .mcp-selection-assistant .sa-explain-enlarged img{display:block;max-width:85vw;max-height:70vh;object-fit:contain;margin:8px 0}
    @media(max-width:480px){.mcp-selection-assistant .sa-modes{flex-wrap:wrap}.mcp-selection-assistant .sa-explain-main img{height:150px}}
  `;
  composer.append(command);
  const runButton = button(composer, 'Çalıştır ↑', run, 'sa-run');
  const cancelButton = button(composer, 'İptal', cancelChat, 'sa-cancel');
  cancelButton.setAttribute('aria-label', 'Yanıtı iptal et'); cancelButton.hidden = true;
  runButton.setAttribute('aria-label', 'Komutu çalıştır');
  const copy = button(footer, 'Kopyala', async () => {
    try { await navigator.clipboard.writeText(mode === 'chat' ? [...messages].reverse().find(m => m.role === 'assistant')?.content || '' : outputText); setStatus('Sonuç panoya kopyalandı.', 'success'); }
    catch { setStatus('Kopyalanamadı; sonucu seçip kopyalayabilirsin.', 'error'); }
  }); copy.disabled = true;
  const apply = button(footer, 'Uygula', async () => {
    if (mode !== 'edit' || !plan || busy) return;
    setBusy(true); apply.disabled = true; setStatus('Seçili satırlar güncelleniyor…', 'busy');
    try {
      const data = await api.call('host_assistant_apply', { planId: plan.planId, confirm: 'APPLY_SELECTION_ASSISTANT' });
      setStatus(data.success ? `${data.changedRows} satır güncellendi.` : 'Uygulama doğrulanamadı.', data.success ? 'success' : 'error');
      if (data.success) { apply.textContent = 'Uygulandı ✓'; note.textContent = 'Değişiklikler notuna kaydedildi.'; }
      plan = null;
    } catch (error) { setStatus(String(error.message || error), 'error'); }
    finally { busy = false; }
  }, 'sa-apply');
  apply.disabled = true;
  if (surface === 'pdf') apply.hidden = true;
  command.addEventListener('input', () => { if (mode === 'edit') { plan = null; apply.disabled = true; } });
  command.addEventListener('sa-send', () => { if (mode === 'chat') void run(); });
  command.addEventListener('keydown', event => {
    if (mode === 'chat' && event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey && !event.isComposing) {
      event.preventDefault(); event.stopPropagation(); void run();
    }
  });
  setBusy(false);
  root.append(css, header, modes, presets, composer, status, shell, explainPanel, footer, mcp);
  api.show('', { sticky: true, contentNode: root, assistant: true });
  command.focus();
  capturing.then(data => {
    if (!root.isConnected) return;
    snapshot = data; if (!busy) setBusy(false);
    subtitle.textContent = surface === 'pdf' ? 'PDF seçimi · salt okunur' : `${data.segments.length} satır seçili · biçim korunur`;
    if (mode === 'edit' && !busy) setStatus('Hızlı bir komut seç veya kendi isteğini yaz.');
  }).catch(error => {
    captureError = String(error.message || error);
    if (root.isConnected && mode === 'edit') setStatus(captureError, 'error');
  });
};
