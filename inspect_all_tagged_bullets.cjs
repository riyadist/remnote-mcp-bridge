#!/usr/bin/env node
'use strict';

const CDP_LIST_URL = process.env.REMNOTE_CDP_LIST_URL || 'http://127.0.0.1:9233/json/list';
const TIMEOUT_MS = Number(process.env.REMNOTE_CDP_TIMEOUT_MS || 12000);

function withTimeout(promise, timeoutMs, label) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function selectRemNotePageTarget() {
  const response = await withTimeout(fetch(CDP_LIST_URL), TIMEOUT_MS, 'CDP target list');
  if (!response.ok) {
    throw new Error(`CDP target list failed: HTTP ${response.status}`);
  }
  const targets = await response.json();
  const pageTargets = targets.filter((target) => target.type === 'page' && target.webSocketDebuggerUrl);
  const scored = pageTargets
    .map((target) => {
      const haystack = `${target.title || ''} ${target.url || ''}`;
      let score = 0;
      if (/Learning/i.test(haystack)) score += 10;
      if (/RemNote|app\.asar|file:\/\//i.test(haystack)) score += 5;
      return { target, score };
    })
    .sort((a, b) => b.score - a.score);
  const selected = scored[0] && scored[0].score > 0 ? scored[0].target : pageTargets[0];
  if (!selected) {
    throw new Error('No RemNote page target with a websocket debugger URL was found.');
  }
  return { selected, targets };
}

function summarizeTarget(target) {
  return {
    id: target.id,
    type: target.type,
    title: target.title,
    url: target.url,
  };
}

async function cdpEvaluate(target, expression) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let nextId = 0;
  const pending = new Map();

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.error) {
      entry.reject(new Error(`${message.error.message || 'CDP error'} ${JSON.stringify(message.error)}`));
    } else {
      entry.resolve(message);
    }
  });

  await withTimeout(new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  }), TIMEOUT_MS, 'CDP websocket open');

  try {
    await send('Runtime.enable');
    const result = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      timeout: TIMEOUT_MS,
    });
    if (result.result.exceptionDetails) {
      throw new Error(JSON.stringify(result.result.exceptionDetails));
    }
    return result.result.result.value;
  } finally {
    try {
      ws.close();
    } catch (_) {}
  }
}

const expression = String.raw`(() => {
  const toArray = (value) => Array.prototype.slice.call(value || []);
  const cleanText = (value, max = 180) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
  const rectOf = (el) => {
    if (!el || !el.getBoundingClientRect) return null;
    const rect = el.getBoundingClientRect();
    return {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      top: Math.round(rect.top),
      left: Math.round(rect.left),
      right: Math.round(rect.right),
      bottom: Math.round(rect.bottom)
    };
  };
  const styleOf = (el) => {
    if (!el) return null;
    const style = window.getComputedStyle(el);
    return {
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      position: style.position,
      pointerEvents: style.pointerEvents,
      zIndex: style.zIndex,
      transform: style.transform
    };
  };
  const isVisible = (el) => {
    const rect = rectOf(el);
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;
    const style = window.getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none' && rect.bottom >= 0 && rect.top <= window.innerHeight;
  };
  const describe = (el, includeAncestors = false) => {
    if (!el) return null;
    const className = typeof el.className === 'string' ? el.className : '';
    const described = {
      tag: el.tagName ? el.tagName.toLowerCase() : null,
      id: el.id || null,
      className: cleanText(className, 260),
      role: el.getAttribute ? el.getAttribute('role') : null,
      ariaLabel: el.getAttribute ? el.getAttribute('aria-label') : null,
      dataRemId: el.getAttribute ? el.getAttribute('data-rem-id') : null,
      text: cleanText(el.innerText || el.textContent || '', 220),
      rect: rectOf(el),
      style: styleOf(el),
      visible: isVisible(el)
    };
    if (includeAncestors) {
      const ancestors = [];
      let parent = el.parentElement;
      while (parent && ancestors.length < 8) {
        ancestors.push({
          tag: parent.tagName ? parent.tagName.toLowerCase() : null,
          id: parent.id || null,
          className: cleanText(typeof parent.className === 'string' ? parent.className : '', 220),
          rect: rectOf(parent)
        });
        parent = parent.parentElement;
      }
      described.ancestors = ancestors;
    }
    return described;
  };
  const stackAt = (x, y) => toArray(document.elementsFromPoint(x, y)).slice(0, 8).map((el) => describe(el));
  const center = (rect) => rect ? {
    x: Math.max(0, Math.min(window.innerWidth - 1, Math.round(rect.left + rect.width / 2))),
    y: Math.max(0, Math.min(window.innerHeight - 1, Math.round(rect.top + rect.height / 2)))
  } : null;
  const hit = (el) => {
    const rect = rectOf(el);
    const point = center(rect);
    return point ? { point, top: describe(document.elementFromPoint(point.x, point.y)), stack: stackAt(point.x, point.y) } : null;
  };
  const allBodyElements = toArray(document.querySelectorAll('body *'));
  const visible = allBodyElements.filter(isVisible);
  const elementText = (el, max = 700) => cleanText(el && (el.innerText || el.textContent || ''), max);
  const textMatches = (pattern) => visible.filter((el) => pattern.test(elementText(el, 300)));
  const rawTextMatches = (pattern) => allBodyElements
    .filter((el) => pattern.test(elementText(el, 1200)))
    .map((el) => describe(el, true))
    .slice(0, 12);
  const headerCandidates = textMatches(/\bAll Tagged Bullets\b/i)
    .filter((el) => {
      const text = cleanText(el.innerText || el.textContent || '', 500);
      return text.length < 260 || /\bAll Tagged Bullets\b/.test(text);
    })
    .map((el) => describe(el, true));
  const header = headerCandidates
    .filter((entry) => entry.rect && entry.rect.width < 500 && entry.rect.height < 120)
    .sort((a, b) => (a.rect.width * a.rect.height) - (b.rect.width * b.rect.height))[0] || headerCandidates[0] || null;
  const headerRect = header ? header.rect : null;
  const region = headerRect ? {
    left: Math.max(0, headerRect.left - 90),
    right: Math.min(window.innerWidth, headerRect.right + 1050),
    top: Math.max(0, headerRect.top - 40),
    bottom: Math.min(window.innerHeight, headerRect.top + 650)
  } : null;
  const inRegion = (el) => {
    if (!region) return false;
    const rect = rectOf(el);
    return rect && rect.bottom >= region.top && rect.top <= region.bottom && rect.right >= region.left && rect.left <= region.right;
  };
  const rowTextPatterns = [
    /Solomon's paradox/i,
    /paleontoloji/i,
    /bergamot/i,
    /Özgül Öğrenme Güçlüğü|Ozgul Ogrenme/i,
    /Özgül Öğrenme Güçlüğü|Ozgul Ogrenme/i,
    /am ve pm fark/i,
    /normatif/i,
    /solipsist/i
  ];
  const visibleRowTextMatches = rowTextPatterns.map((pattern) => ({
    pattern: String(pattern),
    samples: visible
      .filter((el) => pattern.test(elementText(el, 500)))
      .map((el) => describe(el, true))
      .slice(0, 8)
  }));
  const rawRowTextMatches = rowTextPatterns.map((pattern) => ({
    pattern: String(pattern),
    samples: allBodyElements
      .filter((el) => pattern.test(elementText(el, 1200)))
      .map((el) => describe(el, true))
      .slice(0, 8)
  }));
  const rowTextElements = visible
    .filter((el) => inRegion(el))
    .filter((el) => {
      const text = cleanText(el.innerText || el.textContent || '', 260);
      return text && rowTextPatterns.some((pattern) => pattern.test(text));
    })
    .map((el) => describe(el, true))
    .filter((entry) => entry.rect && entry.rect.height <= 80)
    .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);
  const interestingClasses = [
    '.rem-button__container',
    '.rn-bullet-container',
    '.rn-rem-bullet',
    '.perfect-circle',
    '.toggle-collapse-button',
    '[data-rem-id]',
    '[role="button"]'
  ];
  const controls = interestingClasses.flatMap((selector) => toArray(document.querySelectorAll(selector))
    .filter((el) => isVisible(el) && inRegion(el))
    .map((el) => ({ selector, ...describe(el), hit: hit(el) })));
  const rows = rowTextElements.slice(0, 18).map((textEl) => {
    const rect = textEl.rect;
    const midY = rect ? Math.round(rect.top + rect.height / 2) : null;
    const nearbyControls = controls
      .filter((control) => control.rect && midY != null && Math.abs(Math.round(control.rect.top + control.rect.height / 2) - midY) <= 18)
      .sort((a, b) => a.rect.left - b.rect.left)
      .slice(0, 12);
    return {
      textElement: textEl,
      rowMidY: midY,
      nearbyControls,
      leftStackAtText: rect ? stackAt(Math.max(0, rect.left - 18), midY) : []
    };
  });
  const overlay = {
    popup: describe(document.querySelector('#PopupContent')),
    closeButton: describe(document.querySelector('#close-button')),
    activeElement: describe(document.activeElement)
  };
  const scrollContainers = visible
    .filter((el) => el.scrollHeight > el.clientHeight + 20 || el.scrollWidth > el.clientWidth + 20)
    .map((el) => ({
      ...describe(el),
      scroll: {
        scrollTop: Math.round(el.scrollTop || 0),
        scrollLeft: Math.round(el.scrollLeft || 0),
        clientHeight: Math.round(el.clientHeight || 0),
        scrollHeight: Math.round(el.scrollHeight || 0),
        clientWidth: Math.round(el.clientWidth || 0),
        scrollWidth: Math.round(el.scrollWidth || 0)
      }
    }))
    .slice(0, 24);
  return {
    title: document.title,
    location: window.location.href,
    readyState: document.readyState,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
      scrollX: Math.round(window.scrollX || 0),
      scrollY: Math.round(window.scrollY || 0)
    },
    overlay,
    header,
    region,
    headerCandidates: headerCandidates.slice(0, 8),
    rawAllTaggedMatches: rawTextMatches(/\bAll Tagged Bullets\b/i),
    visibleRowTextMatches,
    rawRowTextMatches,
    scrollContainers,
    bodyTextSample: cleanText(document.body && document.body.innerText, 1000),
    rows,
    controls: controls.slice(0, 80)
  };
})()`;

(async () => {
  const { selected, targets } = await selectRemNotePageTarget();
  const pageTargets = targets.filter((target) => target.type === 'page' && target.webSocketDebuggerUrl);
  const inspectedPageTargets = [];
  for (const target of pageTargets.slice(0, 6)) {
    try {
      inspectedPageTargets.push({
        ok: true,
        target: summarizeTarget(target),
        inspection: await cdpEvaluate(target, expression),
      });
    } catch (error) {
      inspectedPageTargets.push({
        ok: false,
        target: summarizeTarget(target),
        error: error && error.stack ? error.stack : String(error),
      });
    }
  }
  const bestInspection = inspectedPageTargets.find((entry) => entry.ok && (
    entry.inspection.header ||
    (entry.inspection.rawAllTaggedMatches && entry.inspection.rawAllTaggedMatches.length > 0)
  )) || inspectedPageTargets.find((entry) => entry.ok && entry.target.id === selected.id) || inspectedPageTargets.find((entry) => entry.ok) || null;
  const output = {
    ok: true,
    generatedAt: new Date().toISOString(),
    readOnly: true,
    selectedTarget: summarizeTarget(selected),
    targetSummary: targets.map(summarizeTarget),
    inspectedPageTargets,
    inspectionTarget: bestInspection ? bestInspection.target : null,
    inspection: bestInspection ? bestInspection.inspection : null
  };
  console.log(JSON.stringify(output, null, 2));
})().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    generatedAt: new Date().toISOString(),
    readOnly: true,
    error: error && error.stack ? error.stack : String(error)
  }, null, 2));
  process.exitCode = 1;
});
