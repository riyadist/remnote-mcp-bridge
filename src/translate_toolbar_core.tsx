import type { RNPlugin } from '@remnote/plugin-sdk';
import React, { useState } from 'react';
import { hostKeyHeaders, primeHostKey } from './core/host-key';

const { createHostCaller } = require('../selection-assistant-sdk.cjs');

const TRANSLATE_POPUP_WIDGET = 'translate_popup';
const ASSISTANT_POPUP_WIDGET = 'assistant_popup';

type ToolbarState = 'idle' | 'opening' | 'error';

function normalizeToolbarText(value: string, maxLength = 3000): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLength);
}

function collectToolbarText(value: unknown, depth = 0, seen = new Set<unknown>()): string {
  if (value == null || depth > 4) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return '';
  if (typeof value !== 'object') return '';
  if (seen.has(value)) return '';
  seen.add(value);

  if (Array.isArray(value)) {
    return value
      .map((entry) => collectToolbarText(entry, depth + 1, seen))
      .filter(Boolean)
      .join('');
  }

  const record = value as Record<string, unknown>;
  if (typeof record.text === 'string') return record.text;
  if (typeof record.string === 'string') return record.string;
  if (typeof record.plainText === 'string') return record.plainText;
  if (Array.isArray(record.richText)) return collectToolbarText(record.richText, depth + 1, seen);
  if (Array.isArray(record.content)) return collectToolbarText(record.content, depth + 1, seen);
  if (record.value && typeof record.value === 'object') return collectToolbarText(record.value, depth + 1, seen);
  return '';
}

function captureToolbarWindowSelection(maxLength = 1000): string {
  try {
    return normalizeToolbarText(window.getSelection?.()?.toString() || '', maxLength);
  } catch {
    return '';
  }
}

async function captureToolbarContext(plugin: RNPlugin, source: string) {
  let selectedText = captureToolbarWindowSelection(1000);
  let focusedEditorText = '';
  let selectionType = '';
  try {
    selectionType = String((await plugin.editor.getSelection())?.type || '');
  } catch {
  }

  try {
    selectedText = selectedText || normalizeToolbarText(collectToolbarText(await plugin.editor.getSelectedText()), 1000);
  } catch {
  }

  try {
    selectedText = selectedText || normalizeToolbarText(collectToolbarText(await plugin.editor.getSelection()), 1000);
  } catch {
  }

  try {
    focusedEditorText = normalizeToolbarText(collectToolbarText(await plugin.editor.getFocusedEditorText()), 3000);
  } catch {
  }

  return {
    source,
    selectionType,
    selectedText,
    contextText: focusedEditorText && focusedEditorText !== selectedText ? focusedEditorText : '',
    focusedEditorText,
    capturedAt: new Date().toISOString(),
  };
}

interface TranslateToolbarButtonProps {
  plugin: RNPlugin;
  source: string;
}

export function TranslateToolbarButton({ plugin, source }: TranslateToolbarButtonProps) {
  const [state, setState] = useState<ToolbarState>('idle');

  const openTranslatePopup = async () => {
    setState('opening');
    try {
      const contextData = await captureToolbarContext(plugin, source);
      await plugin.widget.openPopup(TRANSLATE_POPUP_WIDGET, contextData, true);
      setState('idle');
    } catch {
      setState('error');
      window.setTimeout(() => setState('idle'), 1600);
    }
  };

  return (
    <button
      className="mcp-translate-toolbar-button"
      type="button"
      aria-label="Translate selected text with AI"
      title="Secili metni cevir"
      disabled={state === 'opening'}
      onClick={openTranslatePopup}
    >
      {state === 'opening' ? '...' : state === 'error' ? 'Hata' : 'Çevir'}
    </button>
  );
}

// Opens the same AI assistant as the "AI Asistanı" command, from the plugin's
// own selection-menu widget. It needs no CDP, so it is there however RemNote
// was started.
const callHost = createHostCaller(hostKeyHeaders);

export function AssistantToolbarButton({ plugin, source }: TranslateToolbarButtonProps) {
  const [state, setState] = useState<ToolbarState>('idle');
  primeHostKey(plugin);

  const openAssistant = async () => {
    setState('opening');
    try {
      const context = await captureToolbarContext(plugin, source);
      const surface = context.selectionType === 'PDF' || context.selectionType === 'WebReader' ? 'pdf' : 'note';
      let initialCapture: unknown;
      let captureError: string | undefined;
      try {
        initialCapture = await callHost('host_assistant_capture', { surface, selectedText: context.selectedText || '' });
      } catch (error) {
        captureError = String((error as Error)?.message || error);
      }
      await plugin.widget.openPopup(ASSISTANT_POPUP_WIDGET, { ...context, surface, initialCapture, captureError }, true);
      setState('idle');
    } catch {
      setState('error');
      window.setTimeout(() => setState('idle'), 1600);
    }
  };

  return (
    <button
      className="mcp-translate-toolbar-button"
      type="button"
      aria-label="Open the AI assistant for the selected text"
      title="AI Asistanı"
      disabled={state === 'opening'}
      onClick={openAssistant}
    >
      {state === 'opening' ? '...' : state === 'error' ? 'Hata' : 'AI Asistanı'}
    </button>
  );
}