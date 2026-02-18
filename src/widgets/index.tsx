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
    case 'overwrite_note_content':
      return remAdapter.overwriteNoteContent({
        remId: payload.remId as string,
        content: payload.content as string,
        headingLevel: payload.headingLevel as number | undefined
      });
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
