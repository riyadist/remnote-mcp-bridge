// Selection buttons that live inside this plugin: when text is selected in a
// note (or in the PDF/web reader), a small "AI Asistanı | Cevir" bar is
// attached to the right end of RemNote's own selection toolbar and closes when
// the selection goes away. The SDK positions a floating widget relative to an
// element class (the toolbar), so this works in sandbox mode, however RemNote
// was started (no CDP).
import { AppEvents, SelectionType, WidgetLocation, type ReactRNPlugin } from '@remnote/plugin-sdk';

export const SELECTION_ACTIONS_WIDGET = 'selection_actions';
export const SELECTION_ACTIONS_WIDTH = 176;
export const SELECTION_ACTIONS_HEIGHT = 40;
const DEBOUNCE_MS = 250;
const GAP = 6;
// RemNote's selection toolbar. `rn-floating-toolbar` is in RemNote's list of
// stable external CSS classes (plugins.remnote.com/custom-css), unlike the
// internal names the CDP helper matches, which can change between versions.
const NOTE_TOOLBAR_CLASS = 'rn-floating-toolbar';
const PDF_TOOLBAR_CLASS = 'rn-floating-toolbar';

// Last attempt, reported by get_status so placement can be checked live.
export const selectionActionsDebug: Record<string, unknown> = { events: 0 };

async function currentSelection(plugin: ReactRNPlugin): Promise<{ text: string; pdf: boolean }> {
  const selection: any = await plugin.editor.getSelection();
  if (!selection) return { text: '', pdf: false };
  if (selection.type === SelectionType.Text) {
    const range = selection.range;
    if (range && range.start === range.end) return { text: '', pdf: false };
    return { text: (await plugin.richText.toString(selection.richText ?? [])).trim(), pdf: false };
  }
  if (selection.type === SelectionType.PDF || selection.type === SelectionType.WebReader) {
    return { text: String(selection.text ?? '').trim(), pdf: true };
  }
  return { text: '', pdf: false };
}

export async function startSelectionActions(plugin: ReactRNPlugin): Promise<() => void> {
  await plugin.app.registerWidget(SELECTION_ACTIONS_WIDGET, WidgetLocation.FloatingWidget, {
    dimensions: { width: SELECTION_ACTIONS_WIDTH, height: SELECTION_ACTIONS_HEIGHT },
  });

  let openId: string | null = null;
  let openedFor = '';
  let timer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;
  let stopped = false;

  const close = async () => {
    const id = openId;
    openId = null;
    openedFor = '';
    if (id) {
      try { await plugin.window.closeFloatingWidget(id); } catch { /* already closed */ }
    }
  };

  const update = async () => {
    const mine = ++generation;
    selectionActionsDebug.lastEventAt = new Date().toISOString();
    let selection = { text: '', pdf: false };
    try { selection = await currentSelection(plugin); } catch { /* treated as no selection */ }
    if (stopped || mine !== generation) return;
    selectionActionsDebug.lastSelection = { pdf: selection.pdf, chars: selection.text.length };
    if (!selection.text) { await close(); return; }
    let rect: DOMRect | undefined;
    try { rect = await plugin.editor.getCaretPosition(); } catch { rect = undefined; }
    if (stopped || mine !== generation) return;
    const key = `${selection.pdf}:${Math.round(rect?.left ?? -1)}:${Math.round(rect?.bottom ?? -1)}:${selection.text.length}`;
    if (openId && key === openedFor) return; // same selection, already shown
    await close();
    if (stopped || mine !== generation) return;
    try {
      // Right next to the toolbar's right end, same top edge.
      openId = await plugin.window.openFloatingWidget(
        SELECTION_ACTIONS_WIDGET,
        { top: 0, right: -(SELECTION_ACTIONS_WIDTH + GAP) },
        selection.pdf ? PDF_TOOLBAR_CLASS : NOTE_TOOLBAR_CLASS,
      );
      openedFor = key;
      selectionActionsDebug.lastOpen = { id: openId, container: selection.pdf ? PDF_TOOLBAR_CLASS : NOTE_TOOLBAR_CLASS, caret: rect ? { left: Math.round(rect.left), top: Math.round(rect.top), bottom: Math.round(rect.bottom) } : null };
      selectionActionsDebug.lastError = null;
    } catch (error) {
      selectionActionsDebug.lastError = String((error as Error)?.message || error);
      console.warn('[MCP Bridge] selection actions could not open', error);
    }
  };

  const onSelection = () => {
    selectionActionsDebug.events = Number(selectionActionsDebug.events || 0) + 1;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { void update(); }, DEBOUNCE_MS);
  };

  plugin.event.addListener(AppEvents.EditorSelectionChanged, undefined, onSelection);
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    plugin.event.removeListener(AppEvents.EditorSelectionChanged, undefined, onSelection);
    void close();
  };
}