/**
 * RemNote MCP Bridge Plugin
 *
 * Connection is managed in the index plugin lifecycle.
 * Right sidebar widget is optional UI and no longer controls connectivity.
 */

import { declareIndexPlugin, type ReactRNPlugin, WidgetLocation } from '@remnote/plugin-sdk';
import '../style.css';
import { RemAdapter } from '../api/rem-adapter';
import { BridgeRequest, WebSocketClient } from '../bridge/websocket-client';
import {
  MCPSettings,
  SETTING_AUTO_TAG_ENABLED,
  SETTING_AUTO_TAG,
  SETTING_JOURNAL_PREFIX,
  SETTING_JOURNAL_TIMESTAMP,
  SETTING_WS_URL,
  SETTING_DEFAULT_PARENT,
  DEFAULT_AUTO_TAG,
  DEFAULT_JOURNAL_PREFIX,
  DEFAULT_WS_URL,
} from '../settings';

let wsClient: WebSocketClient | null = null;
let remAdapter: RemAdapter | null = null;

async function readSettings(plugin: ReactRNPlugin): Promise<MCPSettings> {
  const autoTagEnabled = (await plugin.settings.getSetting<boolean>(SETTING_AUTO_TAG_ENABLED)) ?? true;
  const autoTag = (await plugin.settings.getSetting<string>(SETTING_AUTO_TAG)) ?? 'MCP';
  const journalPrefix = (await plugin.settings.getSetting<string>(SETTING_JOURNAL_PREFIX)) ?? '[Claude]';
  const journalTimestamp = (await plugin.settings.getSetting<boolean>(SETTING_JOURNAL_TIMESTAMP)) ?? true;
  const wsUrl = (await plugin.settings.getSetting<string>(SETTING_WS_URL)) ?? DEFAULT_WS_URL;
  const defaultParentId = (await plugin.settings.getSetting<string>(SETTING_DEFAULT_PARENT)) ?? '';

  return {
    autoTagEnabled,
    autoTag,
    journalPrefix,
    journalTimestamp,
    wsUrl,
    defaultParentId,
  };
}

function normalizeForCompare(value: string): string {
  return (value || '')
    .normalize('NFC')
    .toLocaleLowerCase('tr-TR')
    .replace(/[çÇ]/g, 'c')
    .replace(/[ğĞ]/g, 'g')
    .replace(/[ıİ]/g, 'i')
    .replace(/[öÖ]/g, 'o')
    .replace(/[şŞ]/g, 's')
    .replace(/[üÜ]/g, 'u')
    .trim();
}

async function getRemTitle(remId: string): Promise<string> {
  if (!remAdapter) return '';
  try {
    const note = await remAdapter.readNote({ remId, depth: 1 });
    return note.title || '';
  } catch {
    return '';
  }
}

async function debugWindowContext(plugin: ReactRNPlugin) {
  const openPaneRemIds = await plugin.window.getOpenPaneRemIds();
  const focusedPaneId = await plugin.window.getFocusedPaneId();
  const focusedPaneRemId = await plugin.window.getOpenPaneRemId(focusedPaneId);

  const panes = await Promise.all(
    openPaneRemIds.map(async (remId) => ({
      remId,
      title: await getRemTitle(remId),
      isFocused: remId === focusedPaneRemId
    }))
  );

  return {
    openPaneRemIds,
    focusedPaneId,
    focusedPaneRemId,
    panes
  };
}

async function countBooksTable(plugin: ReactRNPlugin, payload: BridgeRequest['payload']) {
  if (!remAdapter) throw new Error('RemAdapter is not initialized');

  const normalizedBooks = normalizeForCompare((payload.pageTitle as string) || 'Books');
  const normalizedTable = normalizeForCompare((payload.tableTitle as string) || 'Tablo');

  let pageRemId = (payload.pageRemId as string | undefined) || '';
  let pageTitle = '';

  if (!pageRemId) {
    const openPaneRemIds = await plugin.window.getOpenPaneRemIds();
    for (const candidateId of openPaneRemIds) {
      const candidateTitle = await getRemTitle(candidateId);
      if (normalizeForCompare(candidateTitle).includes(normalizedBooks)) {
        pageRemId = candidateId;
        pageTitle = candidateTitle;
        break;
      }
    }
  } else {
    pageTitle = await getRemTitle(pageRemId);
  }

  if (!pageRemId) {
    throw new Error('Could not resolve Books page from open panes. Pass pageRemId explicitly.');
  }

  const page = await remAdapter.readNote({ remId: pageRemId, depth: 2 });

  let tableRemId = (payload.tableRemId as string | undefined) || '';
  if (!tableRemId) {
    const tableLink = page.children.find((child) =>
      normalizeForCompare(child.text).includes(normalizedTable)
    );
    if (tableLink) {
      tableRemId = tableLink.remId;
    }
  }

  // Fallback 1: resolve referenced portal children from raw rich text
  if (!tableRemId) {
    const pageRem = await plugin.rem.findOne(pageRemId);
    if (pageRem) {
      const children = await pageRem.getChildrenRem();
      for (const child of children) {
        let raw = child.text as unknown;
        if (raw instanceof Promise) raw = await raw;
        const arr = Array.isArray(raw) ? raw as Array<any> : [];
        for (const part of arr) {
          if (part && typeof part === 'object' && part.i === 'q' && typeof part._id === 'string') {
            const refTitle = await getRemTitle(part._id);
            if (normalizeForCompare(refTitle).includes(normalizedTable)) {
              tableRemId = part._id;
              break;
            }
          }
        }
        if (tableRemId) break;
      }
    }
  }

  // Fallback 2: global search best candidate by highest taggedRem count
  if (!tableRemId) {
    const search = await remAdapter.search({ query: (payload.tableTitle as string) || 'Tablo', limit: 20 });
    let bestId = '';
    let bestScore = -1;
    for (const item of search.results) {
      const rem = await plugin.rem.findOne(item.remId);
      if (!rem) continue;
      const score = (await rem.taggedRem()).length;
      if (score > bestScore) {
        bestScore = score;
        bestId = item.remId;
      }
    }
    tableRemId = bestId;
  }

  if (!tableRemId) {
    throw new Error(`Table "${payload.tableTitle || 'Tablo'}" not found under page "${page.title}"`);
  }

  const table = await remAdapter.readNote({ remId: tableRemId, depth: 1 });
  const tableRem = await plugin.rem.findOne(tableRemId);
  const taggedCount = tableRem ? (await tableRem.taggedRem()).length : 0;
  const rows = table.children || [];
  const nonEmptyRows = rows.filter((r) => (r.text || '').trim().length > 0);

  const headerNames = new Set(
    ['book cover', 'type', 'complated date', 'author', 'query:#', 'kitaplar (name)', 'kitaplar(name)', '#']
      .map(normalizeForCompare)
  );

  const estimatedBooks = nonEmptyRows.filter((r) => !headerNames.has(normalizeForCompare(r.text)));

  return {
    page: { remId: pageRemId, title: pageTitle || page.title },
    table: { remId: tableRemId, title: table.title },
    counts: {
      rowsTotal: rows.length,
      rowsNonEmpty: nonEmptyRows.length,
      estimatedBooks: estimatedBooks.length,
      taggedBooks: taggedCount
    },
    sampleBooks: estimatedBooks.slice(0, 15).map((r) => r.text)
  };
}

async function debugFocusedPageChildrenRaw(plugin: ReactRNPlugin) {
  const openPaneRemIds = await plugin.window.getOpenPaneRemIds();
  const focusedPaneId = await plugin.window.getFocusedPaneId();
  const focusedPaneRemId = await plugin.window.getOpenPaneRemId(focusedPaneId);
  const pageRemId = focusedPaneRemId || openPaneRemIds[0];

  if (!pageRemId) {
    throw new Error('No open page found');
  }

  const pageRem = await plugin.rem.findOne(pageRemId);
  if (!pageRem) {
    throw new Error(`Focused page not found: ${pageRemId}`);
  }

  const children = await pageRem.getChildrenRem();
  const out = [];
  for (const child of children.slice(0, 80)) {
    let rawText: unknown = child.text as unknown;
    if (rawText instanceof Promise) {
      rawText = await rawText;
    }
    out.push({
      remId: child._id,
      textRaw: rawText
    });
  }

  return {
    pageRemId,
    pageTitle: await getRemTitle(pageRemId),
    childCount: children.length,
    children: out
  };
}

async function countTaggedRems(plugin: ReactRNPlugin, payload: BridgeRequest['payload']) {
  let remId = (payload.remId as string | undefined) || '';
  if (!remId) {
    const focusedPaneId = await plugin.window.getFocusedPaneId();
    remId = (await plugin.window.getOpenPaneRemId(focusedPaneId)) || '';
  }
  if (!remId) throw new Error('No focused rem/page to count tags from');

  const rem = await plugin.rem.findOne(remId);
  if (!rem) throw new Error(`Rem not found: ${remId}`);

  const tagged = await rem.taggedRem();
  const sample: Array<{ remId: string; title: string }> = [];
  for (const item of tagged.slice(0, 20)) {
    sample.push({
      remId: item._id,
      title: await getRemTitle(item._id)
    });
  }

  return {
    remId,
    title: await getRemTitle(remId),
    taggedCount: tagged.length,
    sample
  };
}

async function inspectRemRelations(plugin: ReactRNPlugin, payload: BridgeRequest['payload']) {
  const remId = payload.remId as string;
  if (!remId) throw new Error('inspect_rem_relations requires remId');

  const rem = await plugin.rem.findOne(remId);
  if (!rem) throw new Error(`Rem not found: ${remId}`);

  const [children, tagged, tagRems, refsOut, refsIn] = await Promise.all([
    rem.getChildrenRem(),
    rem.taggedRem(),
    rem.getTagRems(),
    rem.remsBeingReferenced(),
    rem.remsReferencingThis()
  ]);

  const tagRemSamples: Array<{ remId: string; title: string; taggedCount: number }> = [];
  for (const tagRem of tagRems.slice(0, 20)) {
    tagRemSamples.push({
      remId: tagRem._id,
      title: await getRemTitle(tagRem._id),
      taggedCount: (await tagRem.taggedRem()).length
    });
  }

  return {
    remId,
    title: await getRemTitle(remId),
    counts: {
      children: children.length,
      taggedRem: tagged.length,
      tagRems: tagRems.length,
      remsBeingReferenced: refsOut.length,
      remsReferencingThis: refsIn.length
    },
    samples: {
      tagRems: tagRemSamples,
      refsBeingReferenced: refsOut.slice(0, 15).map((r) => r._id),
      refsReferencingThis: refsIn.slice(0, 15).map((r) => r._id)
    }
  };
}

async function debugRemRawText(plugin: ReactRNPlugin, payload: BridgeRequest['payload']) {
  const remId = payload.remId as string;
  if (!remId) throw new Error('debug_rem_raw_text requires remId');

  const rem = await plugin.rem.findOne(remId);
  if (!rem) throw new Error(`Rem not found: ${remId}`);

  let rawText: unknown = rem.text as unknown;
  if (rawText instanceof Promise) rawText = await rawText;

  const children = await rem.getChildrenRem();
  const childIds = children.map((c) => c._id);

  return {
    remId,
    title: await getRemTitle(remId),
    rawText,
    childIds
  };
}

async function handleBridgeRequest(plugin: ReactRNPlugin, request: BridgeRequest): Promise<unknown> {
  if (!remAdapter) {
    throw new Error('RemAdapter is not initialized');
  }

  remAdapter.updateSettings(await readSettings(plugin));
  const payload = request.payload;

  switch (request.action) {
    case 'create_note':
      return remAdapter.createNote({
        title: payload.title as string,
        content: payload.content as string | undefined,
        parentId: payload.parentId as string | undefined,
        tags: payload.tags as string[] | undefined,
        tagIds: payload.tagIds as string[] | undefined,
        isDocument: payload.isDocument as boolean | undefined,
        headingLevel: payload.headingLevel as number | undefined,
        isQuote: payload.isQuote as boolean | undefined,
        isList: payload.isList as boolean | undefined
      });
    case 'append_journal':
      return remAdapter.appendJournal({
        content: payload.content as string,
        timestamp: payload.timestamp as boolean | undefined
      });
    case 'search':
      return remAdapter.search({
        query: payload.query as string,
        limit: payload.limit as number | undefined,
        includeContent: payload.includeContent as boolean | undefined
      });
    case 'read_note':
      return remAdapter.readNote({
        remId: payload.remId as string,
        depth: payload.depth as number | undefined
      });
    case 'update_note':
      return remAdapter.updateNote({
        remId: payload.remId as string,
        title: payload.title as string | undefined,
        headingLevel: payload.headingLevel as number | undefined,
        appendContent: payload.appendContent as string | undefined,
        addTags: payload.addTags as string[] | undefined,
        removeTags: payload.removeTags as string[] | undefined
      });
    case 'move_note':
      return remAdapter.moveNote({
        remId: payload.remId as string,
        parentId: payload.parentId as string | null | undefined,
        positionAmongstSiblings: payload.positionAmongstSiblings as number | undefined
      });
    case 'delete_note':
      return remAdapter.deleteNote({
        remId: payload.remId as string
      });
    case 'overwrite_note_content':
      return remAdapter.overwriteNoteContent({
        remId: payload.remId as string,
        content: payload.content as string,
        headingLevel: payload.headingLevel as number | undefined
      });
    case 'create_structured_summary':
      return remAdapter.createStructuredSummary({
        parentId: payload.parentId as string,
        title: payload.title as string,
        headingLevel: payload.headingLevel as number | undefined,
        tags: payload.tags as string[] | undefined,
        sections: (payload.sections as Array<{ heading: string; body: string }>) || []
      });
    case 'create_table':
      return remAdapter.createTable({
        title: payload.title as string | undefined,
        parentId: payload.parentId as string | undefined,
        existingTagId: payload.existingTagId as string | undefined,
        tags: payload.tags as string[] | undefined
      });
    case 'create_property':
      return remAdapter.createProperty({
        parentTagId: payload.parentTagId as string,
        name: payload.name as string
      });
    case 'set_tag_property_value':
      return remAdapter.setTagPropertyValue({
        remId: payload.remId as string,
        propertyId: payload.propertyId as string,
        value: payload.value as string | undefined
      });
    case 'debug_window_context':
      return debugWindowContext(plugin);
    case 'count_books_table':
      return countBooksTable(plugin, payload);
    case 'debug_focused_page_children_raw':
      return debugFocusedPageChildrenRaw(plugin);
    case 'count_tagged_rems':
      return countTaggedRems(plugin, payload);
    case 'inspect_rem_relations':
      return inspectRemRelations(plugin, payload);
    case 'debug_rem_raw_text':
      return debugRemRawText(plugin, payload);
    case 'get_status':
      return remAdapter.getStatus();
    default:
      throw new Error(`Unknown action: ${request.action}`);
  }
}

async function startBridge(plugin: ReactRNPlugin): Promise<void> {
  const settings = await readSettings(plugin);

  remAdapter = new RemAdapter(plugin as any, settings);

  if (wsClient) {
    wsClient.disconnect();
    wsClient = null;
  }

  wsClient = new WebSocketClient({
    url: settings.wsUrl,
    maxReconnectAttempts: Number.POSITIVE_INFINITY,
    initialReconnectDelay: 1000,
    maxReconnectDelay: 30000,
    onStatusChange: (status) => console.log(`[MCP Bridge] WS status: ${status}`),
    onLog: (message, level) => {
      const prefix = `[MCP Bridge] ${message}`;
      if (level === 'error') {
        console.error(prefix);
      } else if (level === 'warn') {
        console.warn(prefix);
      } else {
        console.log(prefix);
      }
    }
  });

  wsClient.setMessageHandler((request) => handleBridgeRequest(plugin, request));
  wsClient.connect();
}

async function onActivate(plugin: ReactRNPlugin) {
  console.log('[MCP Bridge] Plugin activating...');

  await plugin.settings.registerBooleanSetting({
    id: SETTING_AUTO_TAG_ENABLED,
    title: 'Auto-tag MCP notes',
    description: 'Automatically add a tag to all notes created via MCP',
    defaultValue: true,
  });

  await plugin.settings.registerStringSetting({
    id: SETTING_AUTO_TAG,
    title: 'Auto-tag name',
    description: 'Tag name to add to MCP-created notes (e.g., "MCP", "Claude")',
    defaultValue: DEFAULT_AUTO_TAG,
  });

  await plugin.settings.registerStringSetting({
    id: SETTING_JOURNAL_PREFIX,
    title: 'Journal entry prefix',
    description: 'Prefix for journal entries (e.g., "[Claude]", "[MCP]")',
    defaultValue: DEFAULT_JOURNAL_PREFIX,
  });

  await plugin.settings.registerBooleanSetting({
    id: SETTING_JOURNAL_TIMESTAMP,
    title: 'Add timestamp to journal',
    description: 'Include timestamp in journal entries',
    defaultValue: true,
  });

  await plugin.settings.registerStringSetting({
    id: SETTING_WS_URL,
    title: 'WebSocket server URL',
    description: 'URL of the MCP WebSocket server',
    defaultValue: DEFAULT_WS_URL,
  });

  await plugin.settings.registerStringSetting({
    id: SETTING_DEFAULT_PARENT,
    title: 'Default parent Rem ID',
    description: 'ID of the Rem to use as default parent for new notes (leave empty for root)',
    defaultValue: '',
  });

  await plugin.app.registerWidget('right_sidebar', WidgetLocation.RightSidebar, {
    dimensions: {
      width: 300,
      height: 'auto'
    },
    widgetTabIcon: 'https://claude.ai/favicon.ico'
  });

  await startBridge(plugin);
  console.log('[MCP Bridge] Background bridge started');
}

async function onDeactivate(_: ReactRNPlugin) {
  console.log('[MCP Bridge] Plugin deactivating...');
  if (wsClient) {
    wsClient.disconnect();
    wsClient = null;
  }
  remAdapter = null;
}

declareIndexPlugin(onActivate, onDeactivate);
