'use strict';
// Koprunun urettigi kancalari ContextTranslator/mnemonic_gate.py kurallarindan gecirir.
// Kapi kapali calisir: Python, sozluk veya yardimci surec yoksa hicbir kanca gecmez.
const { spawn } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline');

const UNAVAILABLE_CODE = 'MNEMONIC_GATE_UNAVAILABLE';

function defaultPythonPath() {
  return process.env.REMNOTE_MNEMONIC_GATE_PYTHON
    || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Programs', 'Python', 'Python312', 'python.exe');
}

function unavailable(detail) {
  const error = new Error(`Turkce kanca kapisi calismiyor: ${detail}`);
  error.code = UNAVAILABLE_CODE;
  return error;
}

const stripMarkup = (value) => String(value || '').replace(/\[\[\w+:|\]\]/g, '').replace(/\*\*|\*/g, '');

// Kartta kuyruk "kanca = sahne; anlam" olarak yazilir; kapi uc parcali bicim bekler.
// Modeller Turkce harfsiz yazabildigi icin sahnedeki soyletme fiilleri kapinin tanidigi bicime cevrilir.
// Kanca hic degistirilmez: sozluk kararini mnemonic_gate.py ham kanca uzerinden verir.
function gateInputText(word, value) {
  const plain = stripMarkup(value).trim();
  const parts = plain.split(/\s*(?:=>|->|=|→)\s*/).filter(Boolean);
  let text = plain;
  if (parts.length === 2) {
    const semicolon = parts[1].lastIndexOf(';');
    const scene = semicolon >= 0 ? parts[1].slice(0, semicolon).trim() : parts[1];
    const meaning = semicolon >= 0 ? parts[1].slice(semicolon + 1).trim() : '';
    text = `${parts[0]} = ${scene} = ${word}${meaning ? `; ${meaning}` : ''}`;
  }
  const split = text.match(/^(.*?\s*(?:=>|->|=|→)\s*)([\s\S]*)$/);
  if (!split) return text;
  const scene = split[2]
    .replace(/\byazi/gi, 'yazı')
    .replace(/\bbagir/gi, 'bağır')
    .replace(/\bfisilda/gi, 'fısılda');
  return split[1] + scene;
}

function isMnemonicTitle(title) {
  return /mnemonic/i.test(String(title || ''));
}

function createMnemonicGate(options = {}) {
  const pythonPath = options.pythonPath || defaultPythonPath();
  const workerPath = options.workerPath || path.join(__dirname, 'mnemonic_gate_worker.py');
  const readyTimeoutMs = options.readyTimeoutMs ?? 30000;
  const checkTimeoutMs = options.checkTimeoutMs ?? 5000;
  const retryAfterMs = options.retryAfterMs ?? 60000;

  let child = null;
  let lines = null;
  let readyPromise = null;
  let failedAt = 0;
  let failure = null;
  const waiting = [];

  // Calisirken coken yardimci hemen yeniden baslar; hic baslayamayan bekleme suresine girer.
  function dropWorker(error, { backoff = true } = {}) {
    const current = child;
    child = null;
    readyPromise = null;
    lines?.close();
    lines = null;
    failedAt = Date.now();
    failure = backoff ? error : null;
    while (waiting.length) waiting.shift().reject(error);
    if (current && current.exitCode === null) current.kill();
  }

  function startWorker() {
    readyPromise = new Promise((resolve, reject) => {
      let settled = false;
      const settle = (fn, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn(value);
      };
      const fail = (error) => {
        const wasReady = settled;
        settle(reject, error);
        dropWorker(error, { backoff: !wasReady });
      };
      const timer = setTimeout(() => fail(unavailable('sozluk zamaninda yuklenmedi')), readyTimeoutMs);
      timer.unref?.();
      let started;
      try {
        started = spawn(pythonPath, ['-I', workerPath], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
      } catch (error) {
        fail(unavailable(error.message));
        return;
      }
      child = started;
      started.unref();
      started.stdin.on('error', () => {});
      started.once('error', (error) => { if (child === started) fail(unavailable(error.message)); });
      started.once('exit', (code) => { if (child === started) fail(unavailable(`yardimci surec kapandi (${code})`)); });
      lines = readline.createInterface({ input: started.stdout });
      lines.on('line', (line) => {
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          fail(unavailable('yardimci surec bozuk yanit verdi'));
          return;
        }
        if (!settled) {
          if (message.ready === true) settle(resolve);
          else fail(unavailable(message.error || 'sozluk_yok'));
          return;
        }
        const entry = waiting.shift();
        if (!entry) return;
        clearTimeout(entry.timer);
        if (Array.isArray(message.results)) entry.resolve(message.results);
        else entry.reject(unavailable(message.error || 'bilinmeyen yanit'));
      });
    });
    readyPromise.catch(() => {});
    return readyPromise;
  }

  function ready() {
    if (readyPromise) return readyPromise;
    if (failure && Date.now() - failedAt < retryAfterMs) return Promise.reject(failure);
    failure = null;
    return startWorker();
  }

  async function checkMany(word, values) {
    const list = Array.isArray(values) ? values.map((value) => String(value || '')) : [];
    if (!list.length) return [];
    await ready();
    const texts = list.map((value) => gateInputText(word, value));
    const results = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => dropWorker(unavailable('denetim zaman asimi')), checkTimeoutMs);
      timer.unref?.();
      waiting.push({ resolve, reject, timer });
      child.stdin.write(`${JSON.stringify({ word: String(word || ''), texts })}\n`);
    });
    return list.map((text, index) => ({ text, ok: results[index]?.ok === true, reasons: results[index]?.reasons || ['yanit_yok'] }));
  }

  async function filterCandidates(word, candidates) {
    const list = (Array.isArray(candidates) ? candidates : []).filter(Boolean);
    return (await checkMany(word, list)).filter((row) => row.ok).map((row) => row.text);
  }

  async function sanitizeCandidateResponse(word, response) {
    const candidates = await filterCandidates(word, response?.candidates);
    const rejected = (response?.candidates?.length || 0) - candidates.length;
    return { ...response, candidates, ...(rejected ? { mnemonicGate: { status: 'filtered', rejected } } : {}) };
  }

  async function sanitizeTranslationResult(word, result) {
    const sections = Array.isArray(result?.translationSections) ? result.translationSections : [];
    const values = [result?.mnemonic, ...sections.filter((row) => row?.key === 'mnemonic').map((row) => row.value)]
      .map((value) => String(value || '').trim())
      .filter(Boolean);
    if (!values.length) return result;
    let verdict;
    try {
      const rows = await checkMany(word, [...new Set(values)]);
      const failed = rows.filter((row) => !row.ok);
      if (!failed.length) return result;
      verdict = { status: 'rejected', reasons: failed.flatMap((row) => row.reasons) };
    } catch (error) {
      if (error?.code !== UNAVAILABLE_CODE) throw error;
      verdict = { status: 'unavailable', reasons: ['sozluk_yok'] };
    }
    return {
      ...result,
      mnemonic: '',
      translationSections: sections.filter((row) => row?.key !== 'mnemonic'),
      mnemonicGate: verdict,
    };
  }

  // Kotu kanca karttan cikar, kartin kalani yazilir. Sozluk yoksa kancali kart hic yazilmaz.
  async function enforceCardWrite(payload) {
    const word = String(payload?.front || '');
    const found = [];
    const visit = (rows) => (Array.isArray(rows) ? rows : []).forEach((row) => {
      if (isMnemonicTitle(row?.title) && String(row?.body || '').trim()) found.push(row);
      visit(row?.children);
    });
    visit(payload?.detailToggles);
    if (!found.length) return { payload, removed: [] };
    const verdicts = await checkMany(word, found.map((row) => row.body));
    const rejected = new Set(found.filter((_row, index) => !verdicts[index].ok));
    if (!rejected.size) return { payload, removed: [] };
    const prune = (rows) => rows
      .filter((row) => !rejected.has(row))
      .map((row) => (Array.isArray(row?.children) ? { ...row, children: prune(row.children) } : row));
    return {
      payload: { ...payload, detailToggles: prune(payload.detailToggles) },
      removed: verdicts.filter((row) => !row.ok).map((row) => ({ text: row.text, reasons: row.reasons })),
    };
  }

  function warm() {
    ready().catch(() => {});
  }

  function close() {
    failure = null;
    if (child) {
      const current = child;
      child = null;
      readyPromise = null;
      lines?.close();
      current.stdin.end();
      current.kill();
    }
  }

  return {
    checkMany,
    close,
    enforceCardWrite,
    filterCandidates,
    killWorkerForTest: () => new Promise((resolve) => { child.once('exit', () => setImmediate(resolve)); child.kill(); }),
    ready,
    sanitizeCandidateResponse,
    sanitizeTranslationResult,
    warm,
  };
}

module.exports = { UNAVAILABLE_CODE, createMnemonicGate, gateInputText };
