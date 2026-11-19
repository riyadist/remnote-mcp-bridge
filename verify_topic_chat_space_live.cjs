#!/usr/bin/env node
'use strict';

const CDP_LIST_URL = process.env.REMNOTE_CDP_LIST_URL || 'http://127.0.0.1:9233/json/list';
const STATE_KEY = '__mcpRemNoteCevirOverlay25930AppSchemeToolbarV6Live';
const TIMEOUT_MS = Number(process.env.REMNOTE_CDP_TIMEOUT_MS || 10000);

function withTimeout(promise, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function getRemNoteTarget() {
  const response = await withTimeout(fetch(CDP_LIST_URL), 'CDP target list');
  if (!response.ok) throw new Error(`CDP target list failed: HTTP ${response.status}`);
  const targets = await response.json();
  const pages = targets.filter((target) => target.type === 'page' && target.webSocketDebuggerUrl);
  return pages.find((target) => /RemNote|app\.asar|file:\/\//i.test(`${target.title || ''} ${target.url || ''}`)) || pages[0];
}

async function evaluate(target, expression) {
  if (!target) throw new Error('No RemNote CDP page target was found.');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let nextId = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    const pair = pending.get(message.id);
    if (!pair) return;
    pending.delete(message.id);
    if (message.error) pair.reject(new Error(JSON.stringify(message.error)));
    else pair.resolve(message.result);
  });
  await withTimeout(new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  }), 'CDP websocket');
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  try {
    await withTimeout(send('Runtime.enable'), 'Runtime.enable');
    const result = await withTimeout(send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    }), 'Runtime.evaluate');
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result?.value;
  } finally {
    ws.close();
  }
}

async function sendCdpCommand(target, method, params = {}) {
  if (!target) throw new Error('No RemNote CDP page target was found.');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let nextId = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    const pair = pending.get(message.id);
    if (!pair) return;
    pending.delete(message.id);
    if (message.error) pair.reject(new Error(JSON.stringify(message.error)));
    else pair.resolve(message.result);
  });
  await withTimeout(new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  }), 'CDP websocket');
  try {
    const id = ++nextId;
    const result = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    ws.send(JSON.stringify({ id, method, params }));
    return await withTimeout(result, method);
  } finally {
    ws.close();
  }
}

const expression = `(() => {
  const state = window['${STATE_KEY}'];
  if (!state?.installed || typeof state.renderTranslationPopupContent !== 'function') {
    return { ok: false, error: 'active overlay state not found', stateKey: '${STATE_KEY}' };
  }
  const capture = { selectedText: '__space_probe__', contextText: '__space_probe__ context' };
  const result = {
    directTranslation: 'deneme',
    translationSections: [{ key: 'directTranslation', label: 'Direkt ceviri', value: 'deneme' }],
  };
  const host = document.createElement('div');
  host.dataset.mcpSpaceProbe = 'true';
  const content = state.renderTranslationPopupContent(result, capture);
  if (!content) return { ok: false, error: 'popup content was not created' };
  host.appendChild(content);
  document.body.appendChild(host);
  try {
    const textarea = host.querySelector('textarea.mcp-cdp-cevir-chat-input');
    if (!textarea) return { ok: false, error: 'chat textarea was not created' };
    const pressSpace = (options = {}) => {
      const event = new KeyboardEvent('keydown', {
        key: ' ', code: 'Space', bubbles: true, cancelable: true, composed: true, ...options,
      });
      textarea.dispatchEvent(event);
      return event.defaultPrevented;
    };

    textarea.value = 'alphaomega';
    textarea.setSelectionRange(5, 5);
    const firstPrevented = pressSpace();
    const middleInsertion = textarea.value;
    const secondPrevented = pressSpace();
    const consecutiveInsertion = textarea.value;

    textarea.value = 'alpha-omega';
    textarea.setSelectionRange(5, 6);
    const replacementPrevented = pressSpace();
    const selectionReplacement = textarea.value;

    textarea.value = 'control';
    textarea.setSelectionRange(7, 7);
    pressSpace({ ctrlKey: true });
    const modifiedShortcut = textarea.value;

    const ok = firstPrevented
      && secondPrevented
      && replacementPrevented
      && middleInsertion === 'alpha omega'
      && consecutiveInsertion === 'alpha  omega'
      && selectionReplacement === 'alpha omega'
      && modifiedShortcut === 'control';
    return {
      ok,
      stateKey: '${STATE_KEY}',
      middleInsertion,
      consecutiveInsertion,
      selectionReplacement,
      modifiedShortcut,
    };
  } finally {
    host.remove();
  }
})()`;

const physicalSetupExpression = `(() => {
  const state = window['${STATE_KEY}'];
  document.querySelector('[data-mcp-physical-space-probe]')?.remove();
  if (!state?.installed || typeof state.renderTranslationPopupContent !== 'function') {
    return { ok: false, error: 'active overlay state not found' };
  }
  const host = document.createElement('div');
  host.dataset.mcpPhysicalSpaceProbe = 'true';
  const content = state.renderTranslationPopupContent(
    {
      directTranslation: 'deneme',
      translationSections: [{ key: 'directTranslation', label: 'Direkt ceviri', value: 'deneme' }],
    },
    { selectedText: '__physical_space_probe__', contextText: '__physical_space_probe__ context' }
  );
  host.appendChild(content);
  document.body.appendChild(host);
  [...host.querySelectorAll('button')].find((button) => button.textContent.includes('Sohbet'))?.click();
  const textarea = host.querySelector('textarea.mcp-cdp-cevir-chat-input');
  if (!textarea) {
    host.remove();
    return { ok: false, error: 'chat textarea was not created' };
  }
  textarea.value = 'alphaomega';
  textarea.focus();
  textarea.setSelectionRange(5, 5);
  return { ok: true, active: document.activeElement === textarea };
})()`;

const physicalSpaceResultExpression = `(() => {
  const host = document.querySelector('[data-mcp-physical-space-probe]');
  const textarea = host?.querySelector('textarea.mcp-cdp-cevir-chat-input');
  return {
    ok: textarea?.value === 'alpha omega',
    value: textarea?.value || '',
    active: document.activeElement === textarea,
  };
})()`;

const physicalBackspaceSetupExpression = `(() => {
  const textarea = document.querySelector('[data-mcp-physical-space-probe] textarea.mcp-cdp-cevir-chat-input');
  if (!textarea) return { ok: false };
  textarea.value = 'abc';
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.focus();
  textarea.setSelectionRange(3, 3);
  return { ok: true };
})()`;

const physicalBackspaceResultExpression = `(() => {
  const textarea = document.querySelector('[data-mcp-physical-space-probe] textarea.mcp-cdp-cevir-chat-input');
  return {
    ok: textarea?.value === 'ab',
    value: textarea?.value || '',
    active: document.activeElement === textarea,
  };
})()`;

const physicalDeleteSetupExpression = `(() => {
  const textarea = document.querySelector('[data-mcp-physical-space-probe] textarea.mcp-cdp-cevir-chat-input');
  if (!textarea) return { ok: false };
  textarea.value = 'abc';
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.focus();
  textarea.setSelectionRange(1, 1);
  return { ok: true };
})()`;

const physicalDeleteResultExpression = `(() => {
  const host = document.querySelector('[data-mcp-physical-space-probe]');
  const textarea = host?.querySelector('textarea.mcp-cdp-cevir-chat-input');
  const result = {
    ok: textarea?.value === 'ac',
    value: textarea?.value || '',
    active: document.activeElement === textarea,
  };
  host?.remove();
  return result;
})()`;

(async () => {
  const target = await getRemNoteTarget();
  const result = await evaluate(target, expression);
  const physicalSetup = await evaluate(target, physicalSetupExpression);
  if (!physicalSetup?.ok) throw new Error(physicalSetup?.error || 'Physical Space probe setup failed.');
  await sendCdpCommand(target, 'Input.dispatchKeyEvent', {
    type: 'rawKeyDown',
    key: ' ',
    code: 'Space',
    windowsVirtualKeyCode: 32,
    nativeVirtualKeyCode: 32,
  });
  await sendCdpCommand(target, 'Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: ' ',
    code: 'Space',
    windowsVirtualKeyCode: 32,
    nativeVirtualKeyCode: 32,
  });
  const physicalSpace = await evaluate(target, physicalSpaceResultExpression);
  const backspaceSetup = await evaluate(target, physicalBackspaceSetupExpression);
  if (!backspaceSetup?.ok) throw new Error('Physical Backspace probe setup failed.');
  await sendCdpCommand(target, 'Input.dispatchKeyEvent', {
    type: 'rawKeyDown',
    key: 'Backspace',
    code: 'Backspace',
    windowsVirtualKeyCode: 8,
    nativeVirtualKeyCode: 8,
  });
  await sendCdpCommand(target, 'Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Backspace',
    code: 'Backspace',
    windowsVirtualKeyCode: 8,
    nativeVirtualKeyCode: 8,
  });
  const physicalBackspace = await evaluate(target, physicalBackspaceResultExpression);
  const deleteSetup = await evaluate(target, physicalDeleteSetupExpression);
  if (!deleteSetup?.ok) throw new Error('Physical Delete probe setup failed.');
  await sendCdpCommand(target, 'Input.dispatchKeyEvent', {
    type: 'rawKeyDown',
    key: 'Delete',
    code: 'Delete',
    windowsVirtualKeyCode: 46,
    nativeVirtualKeyCode: 46,
  });
  await sendCdpCommand(target, 'Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Delete',
    code: 'Delete',
    windowsVirtualKeyCode: 46,
    nativeVirtualKeyCode: 46,
  });
  const physicalDelete = await evaluate(target, physicalDeleteResultExpression);
  result.physicalInsertion = physicalSpace?.value || '';
  result.physicalBackspace = physicalBackspace?.value || '';
  result.physicalDelete = physicalDelete?.value || '';
  result.physicalActive = physicalSpace?.active === true
    && physicalBackspace?.active === true
    && physicalDelete?.active === true;
  result.ok = result.ok === true
    && physicalSpace?.ok === true
    && physicalBackspace?.ok === true
    && physicalDelete?.ok === true;
  const report = { target: { id: target.id, title: target.title, url: target.url }, result };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!result?.ok) process.exitCode = 1;
})().catch((error) => {
  process.stderr.write(`${error.stack || error.message || String(error)}\n`);
  process.exitCode = 1;
});
