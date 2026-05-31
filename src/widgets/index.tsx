/**
 * RemNote MCP Bridge Plugin v2.58.0
 *
 * Connection is managed in the index plugin lifecycle.
 * Right sidebar widget is optional UI and no longer controls connectivity.
 * v2.58.0: Add RemObject graph context inspector and confirmed structure control action.
 * v2.57.0: Add RemObject state inspector and confirmed RemObject state control action.
 * v2.56.0: Add confirmed Reader highlight and Scheduler registration control actions.
 * v2.55.0: Add confirmed RichText HTML import action.
 * v2.54.0: Add confirmed Link Rem creation action.
 * v2.53.0: Add confirmed Card remove/repetition control action.
 * v2.52.0: Add PowerupNamespace registry inspection and confirmed EventNamespace listener control.
 * v2.51.0: Add confirmed plugin runtime storage/settings/widget/messaging control action.
 * v2.50.0: Add confirmed WindowNamespace control action.
 * v2.49.0: Add confirmed AppNamespace control action.
 * v2.48.0: Add confirmed live editor control action.
 * v2.47.0: Add confirmed live practice queue control action.
 * v2.46.0: Add read-only SDK Card catalog and full-card read actions.
 * v2.45.0: Add read-only plugin runtime, storage/settings, knowledge base, and focus inspectors.
 * v2.44.0: Add read-only RichText parse, format, and inspect actions.
 * v2.43.0: Add read-only non-Rem SDK namespace and context inspector actions.
 * v2.42.0: Add host-side SDK surface gap report from local plugin SDK types.
 * v2.41.0: Add filter support to vault export field profiler.
 * v2.40.0: Add read-only vault export field value profiler.
 * v2.39.0: Add read-only vault export schema profiler.
 * v2.38.0: Add read-only vault quality repair plan preview.
 * v2.37.0: Split vault quality report schema coverage from real data issues.
 * v2.36.0: Added host-side vault quality report over cached exports.
 * v2.35.0: Added aggregate host-side vault export stats for full inventory rollups.
 * v2.34.0: Added cursor pagination to host-side vault export stats.
 * v2.33.0: Added cursor pagination to host-side vault export query.
 * v2.32.0: Vault export query/stats/diff/graph now read all partitioned parts by exportId/exportDir.
 * v2.31.0: Added partitioned/resumable host-side vault snapshot export.
 * v2.30.0: Streamed host-side vault graph JSONL file export to reduce memory pressure.
 * v2.29.0: Added host-side vault graph file catalog/query actions.
 * v2.28.0: Added host-side SDK vault graph JSONL file export action.
 * v2.27.0: Added host-side SDK vault JSONL graph export action.
 * v2.26.0: Added host-side SDK vault JSONL catalog/statistics actions.
 * v2.25.0: Added host-side SDK vault JSONL diff/compare action.
 * v2.24.0: Added host-side SDK vault JSONL query/filter action.
 * v2.23.0: Added host-side SDK vault snapshot JSONL export.
 * v2.22.0: Added read-only SDK-visible vault snapshot export.
 * v2.21.0: Added RemNote Doctor repair plan/apply actions.
 * v2.20.0: Added confirmed Learning Inbox property repair apply.
 * v2.19.0: Added dry-run Learning Inbox repair plans.
 * v2.18.0: Added read-only Learning Inbox export with property and practice readiness summaries.
 * v2.17.0: Added read-only practice queue export with SRS metadata.
 * v2.16.0: Added confirmed safe migration rollback apply.
 * v2.15.0: Added safe migration audit log and rollback validation.
 * v2.14.0: Added confirmed safe migration apply with preflight and rollback guidance.
 * v2.13.0: Added safe migration dry-run plans with rollback guidance.
 * v2.12.0: Added read-only LevelDB knowledge graph export enriched with SDK Rem probes.
 * v2.11.0: Added read-only DB Doctor scan over LevelDB-to-SDK reconciliation.
 * v2.10.0: Added one-call host LevelDB-to-SDK schema map reconciliation.
 * v2.9.0: Added SDK Rem ID probe to reconcile LevelDB entity candidates with SDK-visible Rems.
 * v2.8.0: Added host-side heuristic RemNote entity index over copied LevelDB table/log decode.
 * v2.7.0: Added host-side copied LevelDB log/write-batch decode action.
 * v2.6.0: Added host-side copied LevelDB key/value decode action.
 * v2.5.0: Added host-side RemNote AppData LevelDB inventory and snapshot string scan actions.
 * v2.4.0: Added read-only IndexedDB inventory and store snapshot actions.
 * v2.3.0: Added capability inspector plus full-read/export/graph/doctor actions.
 * v2.1.0: Added flashcard, powerup, portal, reference, daily doc actions.
 * v2.2.1: Exposed read_note timestamp metadata for Date backfills.
 * v2.2.0: Added template/property helpers and controlled Rem SDK/raw calls.
 */

import { BuiltInPowerupCodes, declareIndexPlugin, type ReactRNPlugin, WidgetLocation } from '@remnote/plugin-sdk';
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
  STORAGE_RUNTIME_STATUS,
  type BridgeConnectionStatus,
  type BridgeRuntimeActionSummary,
  type BridgeRuntimeStats,
} from '../settings';

let wsClient: WebSocketClient | null = null;
let remAdapter: RemAdapter | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
const LOCAL_PLUGIN_VERSION = '2.58.0';
const MAX_RECENT_ACTIONS = 20;
const DOCUMENT_BULLET_ICON_SLOT_CODE = 'b';
const DOCUMENT_STATUS_SLOT_CODE = 's';
const BRIDGE_ACTIONS = [
  'add_powerup',
  'add_rem_to_portal',
  'add_sidebar_shortcut',
  'add_source_to_rem',
  'add_tag_by_id',
  'append_journal',
  'apply_callout_bullet_icon',
  'apply_learning_inbox_repairs',
  'apply_remnote_doctor_repairs',
  'apply_native_emoji_icon',
  'apply_tag_auto_template',
  'apply_template_to_rem',
  'batch_create_flashcards',
  'batch_ingest_records',
  'capability_inspector',
  'count_books_table',
  'count_tagged_rems',
  'control_app',
  'control_card',
  'control_editor',
  'control_events',
  'control_practice_queue',
  'control_plugin_runtime',
  'control_reader',
  'control_rem_object_state',
  'control_rem_structure',
  'control_scheduler',
  'control_window',
  'create_alias',
  'create_cloze_flashcard',
  'create_flashcard',
  'create_link_rem',
  'create_note',
  'create_portal',
  'create_property',
  'create_reference',
  'create_structured_summary',
  'create_table',
  'create_template',
  'debug_focused_page_children_raw',
  'debug_rem_raw_text',
  'debug_window_context',
  'delete_note',
  'discover_tables',
  'export_daily_range',
  'export_graph_edges',
  'export_learning_inbox',
  'export_card_catalog',
  'export_practice_queue',
  'export_subtree',
  'export_tag_view',
  'export_vault_snapshot',
  'find_or_create_path',
  'get_all_rems',
  'get_daily_doc',
  'get_property_info',
  'get_rem_tags',
  'get_sidebar_shortcuts',
  'get_status',
  'host_remnote_sdk_surface_gap_report',
  'host_remnote_db_doctor_scan',
  'host_remnote_db_inventory',
  'host_remnote_leveldb_decode',
  'host_remnote_leveldb_entity_index',
  'host_remnote_leveldb_graph_export',
  'host_remnote_leveldb_log_decode',
  'host_remnote_leveldb_sdk_map',
  'host_remnote_leveldb_snapshot_scan',
  'host_remnote_vault_graph_export_catalog',
  'host_remnote_vault_graph_export_query',
  'host_remnote_vault_export_catalog',
  'host_remnote_vault_export_diff',
  'host_remnote_vault_export_field_profile',
  'host_remnote_vault_export_graph',
  'host_remnote_vault_export_graph_file',
  'host_remnote_vault_export_query',
  'host_remnote_vault_export_schema_profile',
  'host_remnote_vault_export_stats',
  'host_remnote_vault_export_stats_aggregate',
  'host_remnote_vault_quality_report',
  'host_remnote_vault_snapshot_export_partitioned',
  'host_remnote_vault_snapshot_export',
  'inject_css',
  'indexeddb_inventory',
  'indexeddb_read_store',
  'inspect_built_in_powerups',
  'inspect_app_context',
  'inspect_editor_context',
  'inspect_folder_state',
  'inspect_focus_context',
  'inspect_native_icon_state',
  'inspect_note_style',
  'inspect_plugin_runtime',
  'inspect_powerup_registry',
  'inspect_queue_context',
  'inspect_rem_graph_context',
  'inspect_rem_location',
  'inspect_rem_object_state',
  'inspect_rem_relations',
  'list_children',
  'list_table_rows',
  'list_tag_templates',
  'list_tagged_rems',
  'move_note',
  'open_note',
  'overwrite_note_content',
  'plan_learning_inbox_repairs',
  'plan_remnote_doctor_repairs',
  'probe_rem_ids',
  'read_note',
  'read_card_full',
  'read_rem_full',
  'rebuild_semantic_index',
  'reload_plugin',
  'rem_raw_call',
  'rem_sdk_call',
  'remnote_doctor_scan',
  'remove_powerup',
  'remove_powerup_v2',
  'remove_rem_from_portal',
  'remove_sidebar_shortcut',
  'remove_source_from_rem',
  'remove_tag_by_id',
  'rich_text_format_range',
  'rich_text_insert_html',
  'rich_text_inspect',
  'rich_text_parse_markdown',
  'sdk_gap_report',
  'sdk_namespace_call',
  'safe_migration_audit_log',
  'safe_migration_apply',
  'safe_migration_apply_rollback',
  'safe_migration_plan',
  'safe_migration_validate_rollback',
  'search',
  'semantic_status',
  'set_document_pinned_state',
  'set_folder_state',
  'set_note_heading_level',
  'set_note_highlight_color',
  'set_practice_state',
  'set_property_type',
  'set_sidebar_shortcuts',
  'set_table_filter_raw',
  'set_tag_property_value',
  'set_template_auto_apply',
  'smart_count_table',
  'update_flashcard_back',
  'update_note',
  'upsert_structured_note',
] as const;
let bridgeStats: BridgeRuntimeStats = {
  calls: 0,
  created: 0,
  updated: 0,
  journal: 0,
  searches: 0,
  reads: 0,
  errors: 0,
};
let bridgeRecentActions: BridgeRuntimeActionSummary[] = [];
let bridgeLastError: string | null = null;

async function getRawPowerupProperty(rem: any, powerupCode: string, powerupSlot: string) {
  if (typeof rem.call !== 'function') {
    throw new Error('RemObject raw call is unavailable');
  }
  return rem.call('getPowerupProperty', { powerupCode, powerupSlot });
}

async function setRawPowerupProperty(rem: any, powerupCode: string, powerupSlot: string, value: unknown[]) {
  if (typeof rem.call !== 'function') {
    throw new Error('RemObject raw call is unavailable');
  }
  return rem.call('setPowerupProperty', { powerupCode, powerupSlot, value });
}

function deriveSessionBuckets(action: string): Partial<BridgeRuntimeStats> {
  switch (action) {
    case 'create_link_rem':
    case 'create_note':
    case 'create_structured_summary':
    case 'find_or_create_path':
    case 'batch_ingest_records':
      return { created: 1 };
    case 'update_note':
    case 'overwrite_note_content':
    case 'move_note':
    case 'set_tag_property_value':
    case 'set_property_type':
    case 'create_template':
    case 'set_template_auto_apply':
    case 'apply_template_to_rem':
    case 'apply_tag_auto_template':
    case 'rem_sdk_call':
    case 'rem_raw_call':
    case 'upsert_structured_note':
    case 'add_tag_by_id':
    case 'remove_tag_by_id':
    case 'add_source_to_rem':
    case 'remove_source_from_rem':
    case 'add_rem_to_portal':
    case 'remove_rem_from_portal':
    case 'create_alias':
    case 'set_practice_state':
    case 'control_app':
    case 'control_card':
    case 'control_editor':
    case 'control_events':
    case 'control_practice_queue':
    case 'control_plugin_runtime':
    case 'control_reader':
    case 'control_rem_object_state':
    case 'control_rem_structure':
    case 'control_scheduler':
    case 'control_window':
    case 'set_table_filter_raw':
    case 'safe_migration_apply':
    case 'safe_migration_apply_rollback':
    case 'apply_learning_inbox_repairs':
    case 'apply_remnote_doctor_repairs':
      return { updated: 1 };
    case 'append_journal':
      return { journal: 1 };
    case 'rich_text_insert_html':
      return { updated: 1 };
    case 'search':
      return { searches: 1 };
    case 'read_note':
    case 'read_rem_full':
    case 'probe_rem_ids':
    case 'list_children':
    case 'list_tagged_rems':
    case 'get_all_rems':
    case 'export_subtree':
    case 'export_tag_view':
    case 'export_daily_range':
    case 'export_graph_edges':
    case 'export_learning_inbox':
    case 'export_card_catalog':
    case 'read_card_full':
    case 'export_practice_queue':
    case 'inspect_app_context':
    case 'inspect_editor_context':
    case 'inspect_queue_context':
    case 'inspect_plugin_runtime':
    case 'inspect_focus_context':
    case 'inspect_powerup_registry':
    case 'inspect_rem_graph_context':
    case 'inspect_rem_object_state':
    case 'rich_text_parse_markdown':
    case 'rich_text_format_range':
    case 'rich_text_inspect':
    case 'capability_inspector':
    case 'export_vault_snapshot':
    case 'sdk_gap_report':
    case 'sdk_namespace_call':
    case 'remnote_doctor_scan':
    case 'safe_migration_audit_log':
    case 'safe_migration_plan':
    case 'safe_migration_validate_rollback':
    case 'plan_learning_inbox_repairs':
    case 'plan_remnote_doctor_repairs':
    case 'host_remnote_sdk_surface_gap_report':
    case 'host_remnote_db_doctor_scan':
    case 'host_remnote_db_inventory':
    case 'host_remnote_leveldb_decode':
    case 'host_remnote_leveldb_entity_index':
    case 'host_remnote_leveldb_graph_export':
    case 'host_remnote_leveldb_log_decode':
    case 'host_remnote_leveldb_sdk_map':
    case 'host_remnote_leveldb_snapshot_scan':
    case 'host_remnote_vault_graph_export_catalog':
    case 'host_remnote_vault_graph_export_query':
    case 'host_remnote_vault_export_catalog':
    case 'host_remnote_vault_export_diff':
    case 'host_remnote_vault_export_field_profile':
    case 'host_remnote_vault_export_graph':
    case 'host_remnote_vault_export_graph_file':
    case 'host_remnote_vault_export_query':
    case 'host_remnote_vault_export_schema_profile':
    case 'host_remnote_vault_export_stats':
    case 'host_remnote_vault_export_stats_aggregate':
    case 'host_remnote_vault_quality_report':
    case 'host_remnote_vault_snapshot_export_partitioned':
    case 'host_remnote_vault_snapshot_export':
    case 'indexeddb_inventory':
    case 'indexeddb_read_store':
    case 'open_note':
      return { reads: 1 };
    default:
      return {};
  }
}

async function persistBridgeRuntime(
  plugin: ReactRNPlugin,
  statusOverride?: BridgeConnectionStatus
): Promise<void> {
  const status = statusOverride ?? ((wsClient?.getStatus() as BridgeConnectionStatus | undefined) || 'disconnected');
  await plugin.storage.setSynced(STORAGE_RUNTIME_STATUS, {
    status,
    pluginConnected: status === 'connected',
    activeVersion: LOCAL_PLUGIN_VERSION,
    updatedAt: new Date().toISOString(),
    stats: bridgeStats,
    recentActions: bridgeRecentActions,
    lastError: bridgeLastError,
  });
}

async function recordBridgeAction(
  plugin: ReactRNPlugin,
  request: BridgeRequest,
  outcome: { ok: boolean; result?: unknown; error?: string }
): Promise<void> {
  bridgeStats = {
    ...bridgeStats,
    calls: bridgeStats.calls + 1,
    errors: bridgeStats.errors + (outcome.ok ? 0 : 1),
  };

  const buckets = deriveSessionBuckets(request.action);
  bridgeStats = {
    ...bridgeStats,
    created: bridgeStats.created + (buckets.created ?? 0),
    updated: bridgeStats.updated + (buckets.updated ?? 0),
    journal: bridgeStats.journal + (buckets.journal ?? 0),
    searches: bridgeStats.searches + (buckets.searches ?? 0),
    reads: bridgeStats.reads + (buckets.reads ?? 0),
  };

  let title = request.action;
  let remId: string | null = null;
  if (request.payload?.title && typeof request.payload.title === 'string') {
    title = request.payload.title;
  } else if (request.payload?.query && typeof request.payload.query === 'string') {
    title = request.payload.query;
  }

  if (outcome.ok && outcome.result && typeof outcome.result === 'object') {
    const result = outcome.result as Record<string, unknown>;
    if (typeof result.title === 'string' && result.title.trim()) {
      title = result.title;
    }
    if (typeof result.remId === 'string') {
      remId = result.remId;
    }
  }

  if (!remId && request.payload?.remId && typeof request.payload.remId === 'string') {
    remId = request.payload.remId;
  }

  bridgeRecentActions = [
    {
      timestamp: new Date().toISOString(),
      action: request.action,
      title,
      remId,
      ok: outcome.ok,
      ...(outcome.ok ? {} : { error: outcome.error || 'Unknown error' }),
    },
    ...bridgeRecentActions,
  ].slice(0, MAX_RECENT_ACTIONS);

  bridgeLastError = outcome.ok ? null : outcome.error || 'Unknown error';
  await persistBridgeRuntime(plugin);
}

async function readSettings(plugin: ReactRNPlugin): Promise<MCPSettings> {
  const autoTagEnabled = (await plugin.settings.getSetting<boolean>(SETTING_AUTO_TAG_ENABLED)) ?? true;
  const autoTag = (await plugin.settings.getSetting<string>(SETTING_AUTO_TAG)) ?? 'MCP';
  const journalPrefix = (await plugin.settings.getSetting<string>(SETTING_JOURNAL_PREFIX)) ?? '[Claude]';
  const journalTimestamp = (await plugin.settings.getSetting<boolean>(SETTING_JOURNAL_TIMESTAMP)) ?? true;
  let wsUrl = (await plugin.settings.getSetting<string>(SETTING_WS_URL)) ?? DEFAULT_WS_URL;
  // Port migration: 4006/3002 ? 3401
  if (wsUrl.includes(':4006') || wsUrl.includes(':3002')) {
    wsUrl = DEFAULT_WS_URL;
    const setSetting = (plugin.settings as any).setSetting;
    if (typeof setSetting === 'function') {
      await setSetting.call(plugin.settings, SETTING_WS_URL, wsUrl);
    }
  }
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
    .replace(/[ÃƒÂ§Ãƒâ€¡]/g, 'c')
    .replace(/[Ã„Å¸Ã„Å¾]/g, 'g')
    .replace(/[Ã„Â±Ã„Â°]/g, 'i')
    .replace(/[ÃƒÂ¶Ãƒâ€“]/g, 'o')
    .replace(/[Ã…Å¸Ã…Å¾]/g, 's')
    .replace(/[ÃƒÂ¼ÃƒÅ“]/g, 'u')
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

function extractPlainText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';

  return value
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object' && 'text' in item) {
        return ((item as { text?: string }).text || '');
      }
      return '';
    })
    .join('');
}

async function getRemObjectText(rem: any): Promise<string> {
  if (!rem) return '';
  let rawText: unknown = rem.text as unknown;
  if (rawText instanceof Promise) rawText = await rawText;
  return extractPlainText(rawText).trim();
}

async function getBlankDirectChildIds(rem: any): Promise<Set<string>> {
  const blankIds = new Set<string>();
  const children = await rem.getChildrenRem();
  if (!children || children.length === 0) return blankIds;

  for (const child of children) {
    const text = await getRemObjectText(child);
    const grandchildren = await child.getChildrenRem();
    if (!text && (!grandchildren || grandchildren.length === 0)) {
      blankIds.add(child._id);
    }
  }

  return blankIds;
}

async function isStructuralRem(rem: any): Promise<boolean> {
  for (const method of ['isPowerupPropertyListItem', 'isPowerupSlot', 'isPowerupProperty', 'isSlot', 'isProperty']) {
    if (typeof rem?.[method] === 'function') {
      try {
        if (await rem[method]()) return true;
      } catch {
        // Ignore SDK states that do not support a structural check.
      }
    }
  }
  return false;
}

async function removeNewBlankDirectChildren(rem: any, before: Set<string>): Promise<number> {
  const children = await rem.getChildrenRem();
  if (!children || children.length === 0) return 0;

  let removed = 0;
  for (const child of children) {
    if (before.has(child._id)) continue;
    if (await isStructuralRem(child)) continue;
    const text = await getRemObjectText(child);
    const grandchildren = await child.getChildrenRem();
    if (!text && (!grandchildren || grandchildren.length === 0)) {
      await child.remove();
      removed++;
    }
  }

  return removed;
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

async function listTaggedRems(plugin: ReactRNPlugin, payload: BridgeRequest['payload']) {
  const tagRemId = ((payload.tagRemId as string | undefined) || (payload.remId as string | undefined) || '').trim();
  if (!tagRemId) throw new Error('list_tagged_rems requires tagRemId or remId');

  const limit = Math.max(1, Math.min(typeof payload.limit === 'number' ? payload.limit : 100, 1000));
  const sortBy = ((payload.sortBy as string | undefined) || 'createdAt').trim();
  const direction = ((payload.direction as string | undefined) || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
  const tagRem = await plugin.rem.findOne(tagRemId);
  if (!tagRem) throw new Error(`Tag rem not found: ${tagRemId}`);

  const taggedRems = await tagRem.taggedRem();
  const rows = [];
  for (const rem of taggedRems) {
    rows.push({
      remId: rem._id,
      title: await getRemTitle(rem._id),
      createdAt: rem.createdAt,
      updatedAt: rem.updatedAt,
      localUpdatedAt: rem.localUpdatedAt,
      parentId: rem.parent,
    });
  }

  rows.sort((a, b) => {
    if (sortBy === 'title') {
      const cmp = a.title.localeCompare(b.title, 'tr');
      return direction === 'asc' ? cmp : -cmp;
    }
    const key = sortBy === 'updatedAt' ? 'updatedAt' : sortBy === 'localUpdatedAt' ? 'localUpdatedAt' : 'createdAt';
    const av = typeof a[key] === 'number' ? a[key] : 0;
    const bv = typeof b[key] === 'number' ? b[key] : 0;
    return direction === 'asc' ? av - bv : bv - av;
  });

  return {
    tagRemId: tagRem._id,
    title: await getRemTitle(tagRem._id),
    totalTagged: taggedRems.length,
    sortBy,
    direction,
    returned: Math.min(rows.length, limit),
    rows: rows.slice(0, limit),
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

async function inspectNativeIconState(plugin: ReactRNPlugin, payload: BridgeRequest['payload']) {
  const remId = payload.remId as string;
  if (!remId) throw new Error('inspect_native_icon_state requires remId');

  const rem = await plugin.rem.findOne(remId);
  if (!rem) throw new Error(`Rem not found: ${remId}`);

  const [document, emoji, callout, quote, list] = await Promise.all([
    rem.hasPowerup(BuiltInPowerupCodes.Document),
    rem.hasPowerup(BuiltInPowerupCodes.Emoji),
    rem.hasPowerup(BuiltInPowerupCodes.Callout),
    rem.hasPowerup(BuiltInPowerupCodes.Quote),
    rem.hasPowerup(BuiltInPowerupCodes.List)
  ]);
  const documentIcon = document
    ? await getRawPowerupProperty(
      rem,
      BuiltInPowerupCodes.Document,
      DOCUMENT_BULLET_ICON_SLOT_CODE
    ).catch((e) => ({ error: String(e) }))
    : null;
  const documentStatus = document
    ? await getRawPowerupProperty(
      rem,
      BuiltInPowerupCodes.Document,
      DOCUMENT_STATUS_SLOT_CODE
    ).catch((e) => ({ error: String(e) }))
    : null;
  const documentStatusRem = document
    ? await rem.getPowerupPropertyAsRem(
      BuiltInPowerupCodes.Document,
      'Status'
    ).then(async (slotRem) => slotRem ? ({
      remId: slotRem._id,
      title: await getRemTitle(slotRem._id)
    }) : null).catch((e) => ({ error: String(e) }))
    : null;

  return {
    remId,
    title: await getRemTitle(remId),
    documentIcon,
    documentStatus,
    documentStatusRem,
    powerups: { document, emoji, callout, quote, list }
  };
}

async function resolveDocumentStatusOptionRemId(plugin: ReactRNPlugin, status: 'Pinned') {
  const statusSlot = await plugin.powerup.getPowerupSlotByCode(BuiltInPowerupCodes.Document, 'Status');
  if (!statusSlot) return undefined;
  const options = await statusSlot.getChildrenRem();
  for (const option of options || []) {
    if ((await getRemObjectText(option)).trim() === status) {
      return option._id;
    }
  }
  return undefined;
}

async function applyNativeEmojiIcon(plugin: ReactRNPlugin, payload: BridgeRequest['payload']) {
  const remId = payload.remId as string;
  const emoji = (payload.emoji as string | undefined) || '';
  if (!remId) throw new Error('apply_native_emoji_icon requires remId');

  const rem = await plugin.rem.findOne(remId);
  if (!rem) throw new Error(`Rem not found: ${remId}`);

  await rem.addPowerup(BuiltInPowerupCodes.Document);

  // RemNote renders page icons from DocumentPowerup.BulletIcon.
  // The SDK's public slot map omits this internal document slot, so use its raw code.
  if (emoji) {
    await setRawPowerupProperty(
      rem,
      BuiltInPowerupCodes.Document,
      DOCUMENT_BULLET_ICON_SLOT_CODE,
      [emoji]
    );
  }

  return inspectNativeIconState(plugin, payload);
}

async function setDocumentPinnedState(plugin: ReactRNPlugin, payload: BridgeRequest['payload']) {
  const remId = payload.remId as string;
  const pinned = payload.pinned !== false;
  if (!remId) throw new Error('set_document_pinned_state requires remId');

  const rem = await plugin.rem.findOne(remId);
  if (!rem) throw new Error(`Rem not found: ${remId}`);

  await rem.addPowerup(BuiltInPowerupCodes.Document).catch(() => undefined);
  if (pinned) {
    const pinnedOptionId = await resolveDocumentStatusOptionRemId(plugin, 'Pinned');
    const value = pinnedOptionId ? ([{ i: 'q', _id: pinnedOptionId }] as any[]) : ['Pinned'];
    await rem.setPowerupProperty(BuiltInPowerupCodes.Document, 'Status', value);
    await setRawPowerupProperty(rem, BuiltInPowerupCodes.Document, DOCUMENT_STATUS_SLOT_CODE, value);
  } else {
    await rem.setPowerupProperty(BuiltInPowerupCodes.Document, 'Status', []);
    await setRawPowerupProperty(rem, BuiltInPowerupCodes.Document, DOCUMENT_STATUS_SLOT_CODE, []);
  }

  return inspectNativeIconState(plugin, payload);
}

async function inspectBuiltInPowerups(plugin: ReactRNPlugin, payload: BridgeRequest['payload']) {
  const remId = payload.remId as string;
  if (!remId) throw new Error('inspect_built_in_powerups requires remId');

  const rem = await plugin.rem.findOne(remId);
  if (!rem) throw new Error(`Rem not found: ${remId}`);

  const active: string[] = [];
  for (const powerupCode of Object.values(BuiltInPowerupCodes)) {
    if (await rem.hasPowerup(powerupCode)) {
      active.push(powerupCode);
    }
  }

  return {
    remId,
    title: await getRemTitle(remId),
    activePowerups: active
  };
}

async function inspectNoteStyle(plugin: ReactRNPlugin, payload: BridgeRequest['payload']) {
  const remId = payload.remId as string;
  if (!remId) throw new Error('inspect_note_style requires remId');

  const rem = await plugin.rem.findOne(remId);
  if (!rem) throw new Error(`Rem not found: ${remId}`);

  const [fontSize, highlightColor, hasHeaderPowerup] = await Promise.all([
    rem.getFontSize(),
    rem.getHighlightColor(),
    rem.hasPowerup(BuiltInPowerupCodes.Header)
  ]);
  const headerSize = hasHeaderPowerup
    ? await rem.getPowerupProperty(
      BuiltInPowerupCodes.Header,
      'Size'
    ).catch((e) => ({ error: String(e) }))
    : null;
  const headerSizeRichText = hasHeaderPowerup
    ? await rem.getPowerupPropertyAsRichText(
      BuiltInPowerupCodes.Header,
      'Size'
    ).catch((e) => ({ error: String(e) }))
    : null;
  const headerSizeRem = hasHeaderPowerup
    ? await rem.getPowerupPropertyAsRem(
      BuiltInPowerupCodes.Header,
      'Size'
    ).then(async (slotRem) => slotRem ? ({
      remId: slotRem._id,
      title: await getRemTitle(slotRem._id)
    }) : null).catch((e) => ({ error: String(e) }))
    : null;
  const rawHeaderSize = hasHeaderPowerup
    ? await getRawPowerupProperty(
      rem,
      BuiltInPowerupCodes.Header,
      's'
    ).catch((e) => ({ error: String(e) }))
    : null;

  return {
    remId,
    title: await getRemTitle(remId),
    fontSize,
    highlightColor,
    hasHeaderPowerup,
    headerSize,
    headerSizeRichText,
    headerSizeRem,
    rawHeaderSize
  };
}

async function resolveHeaderSizeOptionRemId(plugin: ReactRNPlugin, fontSize: 'H1' | 'H2' | 'H3') {
  const sizeSlot = await plugin.powerup.getPowerupSlotByCode(BuiltInPowerupCodes.Header, 'Size');
  if (!sizeSlot) return undefined;
  const options = await sizeSlot.getChildrenRem();
  for (const option of options || []) {
    if ((await getRemTitle(option._id)).trim() === fontSize) {
      return option._id;
    }
  }
  return undefined;
}

async function setNoteHeadingLevel(plugin: ReactRNPlugin, payload: BridgeRequest['payload']) {
  const remId = payload.remId as string;
  const headingLevel = Number(payload.headingLevel);
  if (!remId) throw new Error('set_note_heading_level requires remId');
  if (!Number.isFinite(headingLevel)) throw new Error('set_note_heading_level requires headingLevel');

  const rem = await plugin.rem.findOne(remId);
  if (!rem) throw new Error(`Rem not found: ${remId}`);

  const blankChildrenBefore = await getBlankDirectChildIds(rem);
  if (headingLevel <= 0) {
    await rem.setFontSize(undefined);
    await rem.removePowerup(BuiltInPowerupCodes.Header).catch(() => undefined);
  } else {
    const fontSize = headingLevel === 1 ? 'H1' : headingLevel === 2 ? 'H2' : 'H3';
    await rem.setFontSize(fontSize);
    await rem.addPowerup(BuiltInPowerupCodes.Header).catch(() => undefined);
    const headerSizeOptionId = await resolveHeaderSizeOptionRemId(plugin, fontSize);
    const headerSizeValue = headerSizeOptionId
      ? ([{ i: 'q', _id: headerSizeOptionId }] as any[])
      : [fontSize];
    await rem.setPowerupProperty(BuiltInPowerupCodes.Header, 'Size', headerSizeValue);
    await setRawPowerupProperty(rem, BuiltInPowerupCodes.Header, 's', headerSizeValue);
  }
  await removeNewBlankDirectChildren(rem, blankChildrenBefore);

  return inspectNoteStyle(plugin, payload);
}

async function setNoteHighlightColor(plugin: ReactRNPlugin, payload: BridgeRequest['payload']) {
  const remId = payload.remId as string;
  const highlightColor = payload.highlightColor as 'Red' | 'Orange' | 'Yellow' | 'Green' | 'Blue' | 'Purple' | undefined;
  if (!remId) throw new Error('set_note_highlight_color requires remId');
  if (!highlightColor) throw new Error('set_note_highlight_color requires highlightColor');

  const rem = await plugin.rem.findOne(remId);
  if (!rem) throw new Error(`Rem not found: ${remId}`);

  const blankChildrenBefore = await getBlankDirectChildIds(rem);
  await rem.setHighlightColor(highlightColor);
  await removeNewBlankDirectChildren(rem, blankChildrenBefore);
  return inspectNoteStyle(plugin, payload);
}

async function applyCalloutBulletIcon(plugin: ReactRNPlugin, payload: BridgeRequest['payload']) {
  const remId = payload.remId as string;
  const icon = (payload.icon as string | undefined) || 'Ã°Å¸Â§Â ';
  if (!remId) throw new Error('apply_callout_bullet_icon requires remId');

  const rem = await plugin.rem.findOne(remId);
  if (!rem) throw new Error(`Rem not found: ${remId}`);

  await rem.addPowerup(BuiltInPowerupCodes.Callout);
  await rem.setPowerupProperty(BuiltInPowerupCodes.Callout, 'BulletIcon', [icon]);

  return {
    remId,
    title: await getRemTitle(remId),
    icon
  };
}

async function removeBuiltInPowerup(plugin: ReactRNPlugin, payload: BridgeRequest['payload']) {
  const remId = payload.remId as string;
  const powerup = payload.powerup as string;
  if (!remId) throw new Error('remove_powerup requires remId');
  if (!powerup) throw new Error('remove_powerup requires powerup');

  const rem = await plugin.rem.findOne(remId);
  if (!rem) throw new Error(`Rem not found: ${remId}`);

  await rem.removePowerup(powerup as BuiltInPowerupCodes);
  return inspectBuiltInPowerups(plugin, payload);
}

async function inspectRemLocation(plugin: ReactRNPlugin, payload: BridgeRequest['payload']) {
  const remId = payload.remId as string;
  if (!remId) throw new Error('inspect_rem_location requires remId');

  const rem = await plugin.rem.findOne(remId);
  if (!rem) throw new Error(`Rem not found: ${remId}`);

  const positionAmongstSiblings = await rem.positionAmongstSiblings();

  return {
    remId,
    title: await getRemTitle(remId),
    parentId: rem.parent,
    positionAmongstSiblings
  };
}

async function inspectFolderState(plugin: ReactRNPlugin, payload: BridgeRequest['payload']) {
  const remId = payload.remId as string;
  if (!remId) throw new Error('inspect_folder_state requires remId');

  const rem = await plugin.rem.findOne(remId);
  if (!rem) throw new Error(`Rem not found: ${remId}`);

  return {
    remId,
    title: await getRemTitle(remId),
    isFolder: await rem.isFolder()
  };
}

async function openRemById(plugin: ReactRNPlugin, payload: BridgeRequest['payload']) {
  const remId = payload.remId as string;
  if (!remId) throw new Error('open_note requires remId');

  const rem = await plugin.rem.findOne(remId);
  if (!rem) throw new Error(`Rem not found: ${remId}`);

  await plugin.window.openRem(rem);
  return {
    ok: true,
    remId,
    title: await getRemTitle(remId)
  };
}

async function setFolderState(plugin: ReactRNPlugin, payload: BridgeRequest['payload']) {
  const remId = payload.remId as string;
  if (!remId) throw new Error('set_folder_state requires remId');

  const rem = await plugin.rem.findOne(remId);
  if (!rem) throw new Error(`Rem not found: ${remId}`);

  await rem.setIsFolder(Boolean(payload.isFolder));
  return inspectFolderState(plugin, payload);
}

async function dispatchBridgeRequest(plugin: ReactRNPlugin, request: BridgeRequest): Promise<unknown> {
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
    case 'create_link_rem':
      return remAdapter.createLinkRem({
        url: payload.url as string,
        addTitle: payload.addTitle as boolean | undefined,
        parentId: payload.parentId as string | undefined,
        positionAmongstSiblings: payload.positionAmongstSiblings as number | undefined,
        confirm: payload.confirm as string | undefined,
        dryRun: payload.dryRun as boolean | undefined,
        includeSummary: payload.includeSummary as boolean | undefined,
        allowUnsafeScheme: payload.allowUnsafeScheme as boolean | undefined
      });
    case 'append_journal':
      return remAdapter.appendJournal({
        content: payload.content as string,
        timestamp: payload.timestamp as boolean | undefined
      });
    case 'search':
      let autoSearchContextRemId = payload.searchContextRemId as string | undefined;
      if (!autoSearchContextRemId) {
        try {
          const focusedPaneId = await plugin.window.getFocusedPaneId();
          autoSearchContextRemId = (await plugin.window.getOpenPaneRemId(focusedPaneId)) || undefined;
        } catch {
          autoSearchContextRemId = undefined;
        }
      }
      return remAdapter.search({
        query: payload.query as string,
        limit: payload.limit as number | undefined,
        includeContent: payload.includeContent as boolean | undefined,
        searchContextRemId: autoSearchContextRemId,
        searchMode: payload.searchMode as 'normal' | 'deep' | undefined
      });
    case 'capability_inspector':
      return remAdapter.getCapabilityInspector({
        actions: [...BRIDGE_ACTIONS]
      });
    case 'sdk_gap_report':
      return remAdapter.getSdkGapReport({
        actions: [...BRIDGE_ACTIONS]
      });
    case 'sdk_namespace_call':
      return remAdapter.sdkNamespaceCall({
        namespace: payload.namespace as string,
        method: payload.method as string,
        args: payload.args as unknown[] | undefined,
        valueDepth: payload.valueDepth as number | undefined
      });
    case 'inspect_app_context':
      return remAdapter.inspectAppContext({
        includeSyncProbe: payload.includeSyncProbe as boolean | undefined,
        syncTimeoutMs: payload.syncTimeoutMs as number | undefined,
        valueDepth: payload.valueDepth as number | undefined
      });
    case 'control_app':
      return remAdapter.controlApp({
        operation: payload.operation as 'status' | 'waitForInitialSync' | 'transactionProbe' | 'toast' | 'registerCSS' | 'registerStatusBarItem' | 'stealKeys' | 'releaseKeys' | 'registerWidget' | 'unregisterWidget' | 'registerCommand' | 'registerSidebarButton' | 'registerRemMenuItem' | 'registerMenuItem' | 'unregisterMenuItem' | 'registerCallback' | 'registerPowerup' | undefined,
        confirm: payload.confirm as string | undefined,
        dryRun: payload.dryRun as boolean | undefined,
        valueDepth: payload.valueDepth as number | undefined,
        syncTimeoutMs: payload.syncTimeoutMs as number | undefined,
        message: payload.message as string | undefined,
        id: payload.id as string | undefined,
        css: payload.css as string | undefined,
        html: payload.html as string | undefined,
        keys: payload.keys as string[] | undefined,
        fileName: payload.fileName as string | undefined,
        location: payload.location as string | undefined,
        options: payload.options as Record<string, unknown> | undefined,
        command: payload.command as Record<string, unknown> | undefined,
        menuItem: payload.menuItem as Record<string, unknown> | undefined,
        callbackId: payload.callbackId as string | undefined,
        name: payload.name as string | undefined,
        code: payload.code as string | undefined,
        description: payload.description as string | undefined
      });
    case 'control_window':
      return remAdapter.controlWindow({
        operation: payload.operation as 'status' | 'isFloatingWidgetOpen' | 'setFocusedPaneId' | 'setURL' | 'openRem' | 'setRemWindowTree' | 'setCurrentWindowTreeFromString' | 'openFloatingWidget' | 'closeFloatingWidget' | 'setFloatingWidgetPosition' | 'closeAllFloatingWidgets' | 'stealKeys' | 'releaseKeys' | 'openWidgetInPane' | 'openWidgetInRightSidebar' | undefined,
        confirm: payload.confirm as string | undefined,
        dryRun: payload.dryRun as boolean | undefined,
        valueDepth: payload.valueDepth as number | undefined,
        paneId: payload.paneId as string | undefined,
        url: payload.url as string | undefined,
        remId: payload.remId as string | undefined,
        tree: payload.tree as Record<string, unknown> | undefined,
        treeString: payload.treeString as string | undefined,
        fileName: payload.fileName as string | undefined,
        floatingWidgetId: payload.floatingWidgetId as string | undefined,
        position: payload.position as Record<string, unknown> | undefined,
        classContainer: payload.classContainer as string | undefined,
        closeWhenClickOutside: payload.closeWhenClickOutside as boolean | undefined,
        keys: payload.keys as string[] | undefined,
        contextData: payload.contextData as Record<string, unknown> | undefined
      });
    case 'inspect_editor_context':
      return remAdapter.inspectEditorContext({
        includeFocusedText: payload.includeFocusedText as boolean | undefined,
        valueDepth: payload.valueDepth as number | undefined
      });
    case 'inspect_queue_context':
      return remAdapter.inspectQueueContext({
        includeCurrentCard: payload.includeCurrentCard as boolean | undefined,
        valueDepth: payload.valueDepth as number | undefined
      });
    case 'inspect_plugin_runtime':
      return remAdapter.inspectPluginRuntime({
        includeSettings: payload.includeSettings as boolean | undefined,
        includeStorage: payload.includeStorage as boolean | undefined,
        includeKnowledgeBase: payload.includeKnowledgeBase as boolean | undefined,
        settingIds: payload.settingIds as string[] | undefined,
        storageKeys: payload.storageKeys as string[] | undefined,
        valueDepth: payload.valueDepth as number | undefined
      });
    case 'control_plugin_runtime':
      return remAdapter.controlPluginRuntime({
        operation: payload.operation as 'status' | 'storageGet' | 'storageSet' | 'getSetting' | 'registerSetting' | 'getWidgetsAtLocation' | 'getWidgetContext' | 'getWidgetDimensions' | 'openPopup' | 'closePopup' | 'broadcast' | undefined,
        confirm: payload.confirm as string | undefined,
        dryRun: payload.dryRun as boolean | undefined,
        valueDepth: payload.valueDepth as number | undefined,
        storageArea: payload.storageArea as 'session' | 'synced' | 'local' | undefined,
        key: payload.key as string | undefined,
        value: payload.value,
        settingId: payload.settingId as string | undefined,
        settingType: payload.settingType as 'dropdown' | 'boolean' | 'string' | 'number' | undefined,
        setting: payload.setting as Record<string, unknown> | undefined,
        location: payload.location as string | undefined,
        remId: payload.remId as string | undefined,
        widgetInstanceId: payload.widgetInstanceId as number | string | undefined,
        fileName: payload.fileName as string | undefined,
        contextData: payload.contextData,
        clickOutsideToClose: payload.clickOutsideToClose as boolean | undefined,
        restoreFocus: payload.restoreFocus as boolean | undefined,
        message: payload.message
      });
    case 'inspect_powerup_registry':
      return remAdapter.inspectPowerupRegistry({
        powerupCodes: payload.powerupCodes as string[] | undefined,
        slotsByPowerupCode: payload.slotsByPowerupCode as Record<string, string[]> | undefined,
        includeDefaultPowerups: payload.includeDefaultPowerups as boolean | undefined,
        includeSlots: payload.includeSlots as boolean | undefined,
        powerupLimit: payload.powerupLimit as number | undefined,
        slotLimit: payload.slotLimit as number | undefined,
        valueDepth: payload.valueDepth as number | undefined
      });
    case 'control_events':
      return remAdapter.controlEvents({
        operation: payload.operation as 'status' | 'addListener' | 'removeListener' | undefined,
        eventId: payload.eventId as string | undefined,
        listenerKey: payload.listenerKey as string | undefined,
        confirm: payload.confirm as string | undefined,
        dryRun: payload.dryRun as boolean | undefined,
        allowUntracked: payload.allowUntracked as boolean | undefined,
        valueDepth: payload.valueDepth as number | undefined,
        maxRecentEvents: payload.maxRecentEvents as number | undefined
      });
    case 'control_card':
      return remAdapter.controlCard({
        operation: payload.operation as 'status' | 'remove' | 'updateRepetitionStatus' | 'updateCardRepetitionStatus' | undefined,
        cardId: payload.cardId as string | undefined,
        score: payload.score as number | string | undefined,
        dryRun: payload.dryRun as boolean | undefined,
        confirm: payload.confirm as string | undefined,
        includeRem: payload.includeRem as boolean | undefined,
        includeRepetitionHistory: payload.includeRepetitionHistory as boolean | undefined,
        includeRawCard: payload.includeRawCard as boolean | undefined,
        valueDepth: payload.valueDepth as number | undefined
      });
    case 'control_reader':
      return remAdapter.controlReader({
        operation: payload.operation as 'status' | 'addHighlight' | undefined,
        confirm: payload.confirm as string | undefined,
        dryRun: payload.dryRun as boolean | undefined,
        includeSummary: payload.includeSummary as boolean | undefined,
        valueDepth: payload.valueDepth as number | undefined
      });
    case 'control_scheduler':
      return remAdapter.controlScheduler({
        operation: payload.operation as 'status' | 'registerCustomScheduler' | undefined,
        name: payload.name as string | undefined,
        parameters: payload.parameters as unknown[] | undefined,
        confirm: payload.confirm as string | undefined,
        dryRun: payload.dryRun as boolean | undefined,
        valueDepth: payload.valueDepth as number | undefined
      });
    case 'inspect_rem_object_state':
      return remAdapter.inspectRemObjectState({
        remId: payload.remId as string,
        portalId: payload.portalId as string | undefined,
        includeRelations: payload.includeRelations as boolean | undefined,
        includeContainerLists: payload.includeContainerLists as boolean | undefined,
        includePowerups: payload.includePowerups as boolean | undefined,
        includePowerupProperties: payload.includePowerupProperties as boolean | undefined,
        powerupCodes: payload.powerupCodes as string[] | undefined,
        powerupSlotsByCode: payload.powerupSlotsByCode as Record<string, string[]> | undefined,
        containerLimit: payload.containerLimit as number | undefined,
        valueDepth: payload.valueDepth as number | undefined
      });
    case 'inspect_rem_graph_context':
      return remAdapter.inspectRemGraphContext({
        remId: payload.remId as string,
        portalId: payload.portalId as string | undefined,
        includeSiblings: payload.includeSiblings as boolean | undefined,
        includeTagContext: payload.includeTagContext as boolean | undefined,
        includeReferences: payload.includeReferences as boolean | undefined,
        includeDeepReferences: payload.includeDeepReferences as boolean | undefined,
        includeContainers: payload.includeContainers as boolean | undefined,
        limit: payload.limit as number | undefined,
        valueDepth: payload.valueDepth as number | undefined
      });
    case 'control_rem_object_state':
      return remAdapter.controlRemObjectState({
        remId: payload.remId as string,
        operation: payload.operation as 'status' | 'setListItem' | 'setCardItem' | 'setQuote' | 'setCode' | 'setTodo' | 'setTodoStatus' | 'setSlot' | 'setProperty' | 'setCollapsed' | 'setHiddenExplicitlyIncludedState' | 'expand' | 'collapse' | 'openRemInContext' | 'scrollToReaderHighlight' | 'copyReferenceToClipboard' | 'copyTagReferenceToClipboard' | 'copyPortalReferenceToClipboard' | undefined,
        value: payload.value as boolean | string | undefined,
        todoStatus: payload.todoStatus as 'Finished' | 'Unfinished' | undefined,
        hiddenState: payload.hiddenState as 'hidden' | 'included' | 'none' | undefined,
        recurse: payload.recurse as boolean | undefined,
        portalId: payload.portalId as string | undefined,
        includePowerups: payload.includePowerups as boolean | undefined,
        powerupCodes: payload.powerupCodes as string[] | undefined,
        confirm: payload.confirm as string | undefined,
        dryRun: payload.dryRun as boolean | undefined,
        valueDepth: payload.valueDepth as number | undefined
      });
    case 'control_rem_structure':
      return remAdapter.controlRemStructure({
        remId: payload.remId as string,
        operation: payload.operation as 'status' | 'indent' | 'outdent' | 'setType' | 'merge' | 'mergeAndSetAlias' | undefined,
        targetRemId: payload.targetRemId as string | undefined,
        portalId: payload.portalId as string | undefined,
        remType: payload.remType as string | number | undefined,
        includeBeforeAfter: payload.includeBeforeAfter as boolean | undefined,
        confirm: payload.confirm as string | undefined,
        dryRun: payload.dryRun as boolean | undefined,
        allowDestructive: payload.allowDestructive as boolean | undefined,
        destructiveConfirm: payload.destructiveConfirm as string | undefined,
        valueDepth: payload.valueDepth as number | undefined
      });
    case 'inspect_focus_context':
      return remAdapter.inspectFocusContext({
        valueDepth: payload.valueDepth as number | undefined
      });
    case 'export_card_catalog':
      return remAdapter.exportCardCatalog({
        cardIds: payload.cardIds as string[] | undefined,
        remIds: payload.remIds as string[] | undefined,
        type: payload.type as string | undefined,
        limit: payload.limit as number | undefined,
        offset: payload.offset as number | undefined,
        maxScan: payload.maxScan as number | undefined,
        sortBy: payload.sortBy as 'createdAt' | 'nextRepetitionTime' | 'lastRepetitionTime' | 'remId' | 'cardId' | 'type' | undefined,
        direction: payload.direction as 'asc' | 'desc' | undefined,
        dueBefore: payload.dueBefore as number | undefined,
        dueAfter: payload.dueAfter as number | undefined,
        createdAfter: payload.createdAfter as number | undefined,
        createdBefore: payload.createdBefore as number | undefined,
        includeRem: payload.includeRem as boolean | undefined,
        includeRepetitionHistory: payload.includeRepetitionHistory as boolean | undefined,
        includeRawCard: payload.includeRawCard as boolean | undefined,
        valueDepth: payload.valueDepth as number | undefined
      });
    case 'read_card_full':
      return remAdapter.readCardFull({
        cardId: payload.cardId as string | undefined,
        remId: payload.remId as string | undefined,
        includeRem: payload.includeRem as boolean | undefined,
        includeRepetitionHistory: payload.includeRepetitionHistory as boolean | undefined,
        includeRawCard: payload.includeRawCard as boolean | undefined,
        valueDepth: payload.valueDepth as number | undefined
      });
    case 'control_editor':
      return remAdapter.controlEditor({
        operation: payload.operation as 'status' | 'setText' | 'copy' | 'cut' | 'deleteCharacters' | 'delete' | 'selectRem' | 'selectText' | 'collapseSelection' | 'undo' | 'redo' | 'moveCaret' | 'moveCaretVertical' | 'insertPlainText' | 'insertRichText' | 'insertMarkdown' | undefined,
        richText: payload.richText as any,
        text: payload.text as string | undefined,
        markdown: payload.markdown as string | undefined,
        confirm: payload.confirm as string | undefined,
        dryRun: payload.dryRun as boolean | undefined,
        includeFocusedText: payload.includeFocusedText as boolean | undefined,
        valueDepth: payload.valueDepth as number | undefined,
        remIds: payload.remIds as string[] | undefined,
        portalId: payload.portalId as string | undefined,
        range: payload.range,
        characters: payload.characters as number | undefined,
        direction: payload.direction as -1 | 1 | number | undefined,
        to: payload.to as 'start' | 'end' | undefined,
        amount: payload.amount as number | undefined,
        unit: payload.unit as number | string | undefined
      });
    case 'control_practice_queue':
      return remAdapter.controlPracticeQueue({
        operation: payload.operation as 'status' | 'showAnswer' | 'rateCurrentCard' | 'goBackToPreviousCard' | 'removeCurrentCardFromQueue' | undefined,
        score: payload.score as number | string | undefined,
        addToBackStack: payload.addToBackStack as boolean | undefined,
        dryRun: payload.dryRun as boolean | undefined,
        confirm: payload.confirm as string | undefined,
        includeCurrentCard: payload.includeCurrentCard as boolean | undefined,
        valueDepth: payload.valueDepth as number | undefined
      });
    case 'rich_text_parse_markdown':
      return remAdapter.richTextParseMarkdown({
        markdown: typeof payload.markdown === 'string' ? payload.markdown : '',
        includeHtml: payload.includeHtml as boolean | undefined,
        includeMarkdown: payload.includeMarkdown as boolean | undefined,
        includeString: payload.includeString as boolean | undefined,
        valueDepth: payload.valueDepth as number | undefined
      });
    case 'rich_text_format_range':
      return remAdapter.richTextFormatRange({
        richText: payload.richText as any,
        markdown: payload.markdown as string | undefined,
        text: payload.text as string | undefined,
        start: payload.start as number | undefined,
        end: payload.end as number | undefined,
        format: payload.format as string,
        mode: payload.mode as 'apply' | 'remove' | 'toggle' | undefined,
        includeHtml: payload.includeHtml as boolean | undefined,
        includeMarkdown: payload.includeMarkdown as boolean | undefined,
        includeString: payload.includeString as boolean | undefined,
        valueDepth: payload.valueDepth as number | undefined
      });
    case 'rich_text_insert_html':
      return remAdapter.richTextInsertHtml({
        remId: payload.remId as string,
        html: payload.html as string,
        confirm: payload.confirm as string | undefined,
        dryRun: payload.dryRun as boolean | undefined,
        includeBeforeAfter: payload.includeBeforeAfter as boolean | undefined,
        childLimit: payload.childLimit as number | undefined,
        maxHtmlLength: payload.maxHtmlLength as number | undefined,
        allowUnsafeHtml: payload.allowUnsafeHtml as boolean | undefined,
        valueDepth: payload.valueDepth as number | undefined
      });
    case 'rich_text_inspect':
      return remAdapter.richTextInspect({
        richText: payload.richText as any,
        markdown: payload.markdown as string | undefined,
        text: payload.text as string | undefined,
        character: payload.character as string | undefined,
        start: payload.start as number | undefined,
        end: payload.end as number | undefined,
        allowSpaces: payload.allowSpaces as boolean | undefined,
        includeHtml: payload.includeHtml as boolean | undefined,
        includeMarkdown: payload.includeMarkdown as boolean | undefined,
        includeReferences: payload.includeReferences as boolean | undefined,
        valueDepth: payload.valueDepth as number | undefined
      });
    case 'safe_migration_audit_log':
      return remAdapter.safeMigrationAuditLog({
        limit: payload.limit as number | undefined,
        auditId: payload.auditId as string | undefined,
        includePlans: payload.includePlans as boolean | undefined
      });
    case 'safe_migration_apply_rollback':
      return remAdapter.safeMigrationApplyRollback({
        auditId: payload.auditId as string | undefined,
        rollbackPlan: payload.rollbackPlan as Array<{ id?: string; action: string; payload?: Record<string, unknown> }> | undefined,
        includeSnapshots: payload.includeSnapshots as boolean | undefined,
        maxOperations: payload.maxOperations as number | undefined,
        confirm: payload.confirm as string | undefined,
        allowHighRisk: payload.allowHighRisk as boolean | undefined,
        allowDelete: payload.allowDelete as boolean | undefined,
        stopOnError: payload.stopOnError as boolean | undefined
      });
    case 'safe_migration_apply':
      return remAdapter.safeMigrationApply({
        operations: (payload.operations as Array<{ id?: string; action: string; payload?: Record<string, unknown> }>) || [],
        maxOperations: payload.maxOperations as number | undefined,
        includeSnapshots: payload.includeSnapshots as boolean | undefined,
        confirm: payload.confirm as string | undefined,
        allowHighRisk: payload.allowHighRisk as boolean | undefined,
        allowDelete: payload.allowDelete as boolean | undefined,
        stopOnError: payload.stopOnError as boolean | undefined
      });
    case 'safe_migration_plan':
      return remAdapter.safeMigrationPlan({
        operations: (payload.operations as Array<{ id?: string; action: string; payload?: Record<string, unknown> }>) || [],
        maxOperations: payload.maxOperations as number | undefined,
        includeSnapshots: payload.includeSnapshots as boolean | undefined
      });
    case 'safe_migration_validate_rollback':
      return remAdapter.safeMigrationValidateRollback({
        auditId: payload.auditId as string | undefined,
        rollbackPlan: payload.rollbackPlan as Array<{ id?: string; action: string; payload?: Record<string, unknown> }> | undefined,
        includeSnapshots: payload.includeSnapshots as boolean | undefined,
        maxOperations: payload.maxOperations as number | undefined
      });
    case 'get_all_rems':
      return remAdapter.getAllRems({
        limit: payload.limit as number | undefined,
        offset: payload.offset as number | undefined,
        query: payload.query as string | undefined,
        sortBy: payload.sortBy as 'createdAt' | 'updatedAt' | 'localUpdatedAt' | 'title' | undefined,
        direction: payload.direction as 'asc' | 'desc' | undefined,
        includeTypeFlags: payload.includeTypeFlags as boolean | undefined,
        includePowerups: payload.includePowerups as boolean | undefined
      });
    case 'export_vault_snapshot':
      return remAdapter.exportVaultSnapshot({
        limit: payload.limit as number | undefined,
        offset: payload.offset as number | undefined,
        sortBy: payload.sortBy as 'createdAt' | 'updatedAt' | 'localUpdatedAt' | 'title' | undefined,
        direction: payload.direction as 'asc' | 'desc' | undefined,
        includeRawText: payload.includeRawText as boolean | undefined,
        includeBackText: payload.includeBackText as boolean | undefined,
        includeTypeFlags: payload.includeTypeFlags as boolean | undefined,
        includePowerups: payload.includePowerups as boolean | undefined,
        includeRelations: payload.includeRelations as boolean | undefined,
        relationMode: payload.relationMode as 'counts' | 'ids' | 'summaries' | undefined,
        maxRelationSummaries: payload.maxRelationSummaries as number | undefined,
        includeProperties: payload.includeProperties as boolean | undefined,
        includePracticeData: payload.includePracticeData as boolean | undefined,
        includeCards: payload.includeCards as boolean | undefined,
        valueDepth: payload.valueDepth as number | undefined
      });
    case 'read_note':
      return remAdapter.readNote({
        remId: payload.remId as string,
        depth: payload.depth as number | undefined
      });
    case 'read_rem_full':
      return remAdapter.readRemFull({
        remId: payload.remId as string,
        includeChildren: payload.includeChildren as boolean | undefined,
        includeRelations: payload.includeRelations as boolean | undefined,
        includeProperties: payload.includeProperties as boolean | undefined,
        childLimit: payload.childLimit as number | undefined
      });
    case 'probe_rem_ids':
      return remAdapter.probeRemIds({
        remIds: payload.remIds as string[],
        maxIds: payload.maxIds as number | undefined,
        includeMissing: payload.includeMissing as boolean | undefined,
        includeTypeFlags: payload.includeTypeFlags as boolean | undefined,
        includePowerups: payload.includePowerups as boolean | undefined,
        includeRelations: payload.includeRelations as boolean | undefined,
        includeProperties: payload.includeProperties as boolean | undefined
      });
    case 'export_subtree':
      return remAdapter.exportSubtree({
        remId: payload.remId as string,
        depth: payload.depth as number | undefined,
        maxNodes: payload.maxNodes as number | undefined,
        includeRelations: payload.includeRelations as boolean | undefined
      });
    case 'export_tag_view':
      return remAdapter.exportTagView({
        tagRemId: payload.tagRemId as string,
        limit: payload.limit as number | undefined,
        sortBy: payload.sortBy as 'createdAt' | 'updatedAt' | 'localUpdatedAt' | 'title' | undefined,
        direction: payload.direction as 'asc' | 'desc' | undefined,
        includeProperties: payload.includeProperties as boolean | undefined,
        propertyIds: payload.propertyIds as string[] | undefined
      });
    case 'export_daily_range':
      return remAdapter.exportDailyRange({
        startDate: payload.startDate as string,
        endDate: payload.endDate as string,
        depth: payload.depth as number | undefined,
        includeChildren: payload.includeChildren as boolean | undefined,
        maxDays: payload.maxDays as number | undefined
      });
    case 'export_graph_edges':
      return remAdapter.exportGraphEdges({
        remIds: payload.remIds as string[] | undefined,
        rootRemId: payload.rootRemId as string | undefined,
        includeDescendants: payload.includeDescendants as boolean | undefined,
        maxNodes: payload.maxNodes as number | undefined,
        includeTags: payload.includeTags as boolean | undefined,
        includeReferences: payload.includeReferences as boolean | undefined,
        includeSources: payload.includeSources as boolean | undefined,
        includePortals: payload.includePortals as boolean | undefined
      });
    case 'export_learning_inbox':
      return remAdapter.exportLearningInbox({
        learningTagId: payload.learningTagId as string | undefined,
        datePropertyId: payload.datePropertyId as string | undefined,
        statusPropertyId: payload.statusPropertyId as string | undefined,
        priorityPropertyId: payload.priorityPropertyId as string | undefined,
        domainPropertyId: payload.domainPropertyId as string | undefined,
        limit: payload.limit as number | undefined,
        maxScan: payload.maxScan as number | undefined,
        sortBy: payload.sortBy as 'learnedAt' | 'createdAt' | 'updatedAt' | 'localUpdatedAt' | 'title' | 'status' | 'priority' | undefined,
        direction: payload.direction as 'asc' | 'desc' | undefined,
        includeArchived: payload.includeArchived as boolean | undefined,
        includePractice: payload.includePractice as boolean | undefined,
        includeBackText: payload.includeBackText as boolean | undefined,
        maxPracticeCardsPerRem: payload.maxPracticeCardsPerRem as number | undefined
      });
    case 'plan_learning_inbox_repairs':
      return remAdapter.planLearningInboxRepairs({
        learningTagId: payload.learningTagId as string | undefined,
        datePropertyId: payload.datePropertyId as string | undefined,
        statusPropertyId: payload.statusPropertyId as string | undefined,
        priorityPropertyId: payload.priorityPropertyId as string | undefined,
        domainPropertyId: payload.domainPropertyId as string | undefined,
        limit: payload.limit as number | undefined,
        maxScan: payload.maxScan as number | undefined,
        sortBy: payload.sortBy as 'learnedAt' | 'createdAt' | 'updatedAt' | 'localUpdatedAt' | 'title' | 'status' | 'priority' | undefined,
        direction: payload.direction as 'asc' | 'desc' | undefined,
        includeArchived: payload.includeArchived as boolean | undefined,
        includePractice: payload.includePractice as boolean | undefined,
        includeBackText: payload.includeBackText as boolean | undefined,
        maxPracticeCardsPerRem: payload.maxPracticeCardsPerRem as number | undefined,
        defaultStatus: payload.defaultStatus as string | undefined,
        defaultPriority: payload.defaultPriority as string | undefined,
        defaultDomain: payload.defaultDomain as string | undefined,
        backfillDateFromCreatedAt: payload.backfillDateFromCreatedAt as boolean | undefined,
        includeSafeMigrationPlan: payload.includeSafeMigrationPlan as boolean | undefined,
        includeCardDrafts: payload.includeCardDrafts as boolean | undefined,
        maxOperations: payload.maxOperations as number | undefined
      });
    case 'apply_learning_inbox_repairs':
      return remAdapter.applyLearningInboxRepairs({
        learningTagId: payload.learningTagId as string | undefined,
        datePropertyId: payload.datePropertyId as string | undefined,
        statusPropertyId: payload.statusPropertyId as string | undefined,
        priorityPropertyId: payload.priorityPropertyId as string | undefined,
        domainPropertyId: payload.domainPropertyId as string | undefined,
        limit: payload.limit as number | undefined,
        maxScan: payload.maxScan as number | undefined,
        sortBy: payload.sortBy as 'learnedAt' | 'createdAt' | 'updatedAt' | 'localUpdatedAt' | 'title' | 'status' | 'priority' | undefined,
        direction: payload.direction as 'asc' | 'desc' | undefined,
        includeArchived: payload.includeArchived as boolean | undefined,
        includePractice: payload.includePractice as boolean | undefined,
        includeBackText: payload.includeBackText as boolean | undefined,
        maxPracticeCardsPerRem: payload.maxPracticeCardsPerRem as number | undefined,
        defaultStatus: payload.defaultStatus as string | undefined,
        defaultPriority: payload.defaultPriority as string | undefined,
        defaultDomain: payload.defaultDomain as string | undefined,
        backfillDateFromCreatedAt: payload.backfillDateFromCreatedAt as boolean | undefined,
        includeSafeMigrationPlan: payload.includeSafeMigrationPlan as boolean | undefined,
        includeCardDrafts: payload.includeCardDrafts as boolean | undefined,
        maxOperations: payload.maxOperations as number | undefined,
        confirm: payload.confirm as string | undefined,
        stopOnError: payload.stopOnError as boolean | undefined
      });
    case 'remnote_doctor_scan':
      return remAdapter.remnoteDoctorScan({
        remIds: payload.remIds as string[] | undefined,
        rootRemId: payload.rootRemId as string | undefined,
        tagRemId: payload.tagRemId as string | undefined,
        limit: payload.limit as number | undefined,
        datePropertyId: payload.datePropertyId as string | undefined
      });
    case 'plan_remnote_doctor_repairs':
      return remAdapter.planRemNoteDoctorRepairs({
        remIds: payload.remIds as string[] | undefined,
        rootRemId: payload.rootRemId as string | undefined,
        tagRemId: payload.tagRemId as string | undefined,
        limit: payload.limit as number | undefined,
        datePropertyId: payload.datePropertyId as string | undefined,
        includeDateBackfill: payload.includeDateBackfill as boolean | undefined,
        includeBlankChildDeletes: payload.includeBlankChildDeletes as boolean | undefined,
        includeSafeMigrationPlan: payload.includeSafeMigrationPlan as boolean | undefined,
        maxOperations: payload.maxOperations as number | undefined
      });
    case 'apply_remnote_doctor_repairs':
      return remAdapter.applyRemNoteDoctorRepairs({
        remIds: payload.remIds as string[] | undefined,
        rootRemId: payload.rootRemId as string | undefined,
        tagRemId: payload.tagRemId as string | undefined,
        limit: payload.limit as number | undefined,
        datePropertyId: payload.datePropertyId as string | undefined,
        includeDateBackfill: payload.includeDateBackfill as boolean | undefined,
        includeBlankChildDeletes: payload.includeBlankChildDeletes as boolean | undefined,
        includeSafeMigrationPlan: payload.includeSafeMigrationPlan as boolean | undefined,
        maxOperations: payload.maxOperations as number | undefined,
        confirm: payload.confirm as string | undefined,
        allowHighRisk: payload.allowHighRisk as boolean | undefined,
        allowDelete: payload.allowDelete as boolean | undefined,
        stopOnError: payload.stopOnError as boolean | undefined
      });
    case 'indexeddb_inventory':
      return remAdapter.getIndexedDbInventory({
        databaseName: payload.databaseName as string | undefined,
        includeCounts: payload.includeCounts as boolean | undefined,
        includeSamples: payload.includeSamples as boolean | undefined,
        sampleLimit: payload.sampleLimit as number | undefined,
        valueDepth: payload.valueDepth as number | undefined
      });
    case 'indexeddb_read_store':
      return remAdapter.readIndexedDbStore({
        databaseName: payload.databaseName as string,
        storeName: payload.storeName as string,
        limit: payload.limit as number | undefined,
        offset: payload.offset as number | undefined,
        includeValues: payload.includeValues as boolean | undefined,
        valueDepth: payload.valueDepth as number | undefined
      });
    case 'host_remnote_sdk_surface_gap_report':
    case 'host_remnote_db_doctor_scan':
    case 'host_remnote_db_inventory':
    case 'host_remnote_leveldb_decode':
    case 'host_remnote_leveldb_entity_index':
    case 'host_remnote_leveldb_graph_export':
    case 'host_remnote_leveldb_log_decode':
    case 'host_remnote_leveldb_sdk_map':
    case 'host_remnote_leveldb_snapshot_scan':
    case 'host_remnote_vault_graph_export_catalog':
    case 'host_remnote_vault_graph_export_query':
    case 'host_remnote_vault_export_catalog':
    case 'host_remnote_vault_export_diff':
    case 'host_remnote_vault_export_field_profile':
    case 'host_remnote_vault_export_graph':
    case 'host_remnote_vault_export_graph_file':
    case 'host_remnote_vault_export_query':
    case 'host_remnote_vault_export_schema_profile':
    case 'host_remnote_vault_export_stats':
    case 'host_remnote_vault_export_stats_aggregate':
    case 'host_remnote_vault_quality_report':
    case 'host_remnote_vault_snapshot_export_partitioned':
    case 'host_remnote_vault_snapshot_export':
      throw new Error(`${request.action} is handled by bridge-host.cjs before plugin dispatch.`);
    case 'list_children':
      return remAdapter.listChildren({
        remId: payload.remId as string,
        limit: payload.limit as number | undefined
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
        sections: (payload.sections as Array<{ heading: string; body: string; imageUrls?: string[] }>) || []
      });
    case 'find_or_create_path':
      return remAdapter.findOrCreatePath({
        pathSegments: (payload.pathSegments as string[]) || [],
        rootParentId: payload.rootParentId as string | undefined,
        createMissing: payload.createMissing as boolean | undefined,
        asFolders: payload.asFolders as boolean | undefined
      });
    case 'upsert_structured_note':
      return remAdapter.upsertStructuredNote({
        title: payload.title as string,
        parentId: payload.parentId as string | undefined,
        pathSegments: payload.pathSegments as string[] | undefined,
        rootParentId: payload.rootParentId as string | undefined,
        headingLevel: payload.headingLevel as number | undefined,
        tags: payload.tags as string[] | undefined,
        mergeStrategy: payload.mergeStrategy as 'overwrite_if_exact_title' | 'append_sections' | undefined,
        metadata: payload.metadata as Record<string, string> | undefined,
        sections: (payload.sections as Array<{ heading: string; body: string; imageUrls?: string[] }>) || []
      });
    case 'batch_ingest_records':
      return remAdapter.batchIngestRecords({
        records: (payload.records as Array<{
          title: string;
          parentId?: string;
          pathSegments?: string[];
          rootParentId?: string;
          headingLevel?: number;
          tags?: string[];
          mergeStrategy?: 'overwrite_if_exact_title' | 'append_sections';
          metadata?: Record<string, string>;
          sections: Array<{ heading: string; body: string; imageUrls?: string[] }>;
        }>) || []
      });
    case 'get_sidebar_shortcuts':
      return remAdapter.getSidebarShortcuts();
    case 'set_sidebar_shortcuts':
      return remAdapter.setSidebarShortcuts({
        shortcuts: (payload.shortcuts as Array<{
          remId: string;
          title: string;
          icon?: string;
          description?: string;
        }>) || []
      });
    case 'add_sidebar_shortcut':
      return remAdapter.addSidebarShortcut({
        remId: payload.remId as string,
        title: payload.title as string | undefined,
        icon: payload.icon as string | undefined,
        description: payload.description as string | undefined
      });
    case 'remove_sidebar_shortcut':
      return remAdapter.removeSidebarShortcut({
        remId: payload.remId as string
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
        name: payload.name as string,
        propertyType: payload.propertyType as string | undefined,
        options: payload.options as string[] | undefined,
        strictPropertyType: payload.strictPropertyType as boolean | undefined
      });
    case 'get_property_info':
      return remAdapter.getPropertyInfo({
        propertyId: payload.propertyId as string
      });
    case 'set_property_type':
      return remAdapter.setPropertyType({
        propertyId: payload.propertyId as string,
        propertyType: payload.propertyType as string
      });
    case 'set_tag_property_value':
      return remAdapter.setTagPropertyValue({
        remId: payload.remId as string,
        propertyId: payload.propertyId as string,
        value: payload.value as string | undefined
      });
    case 'create_template':
      return remAdapter.createTemplate({
        tagId: payload.tagId as string,
        title: payload.title as string,
        content: payload.content as string | undefined,
        autoApply: payload.autoApply as boolean | undefined
      });
    case 'set_template_auto_apply':
      return remAdapter.setTemplateAutoApply({
        templateId: payload.templateId as string,
        autoApply: payload.autoApply as boolean | undefined
      });
    case 'list_tag_templates':
      return remAdapter.listTagTemplates({
        tagId: payload.tagId as string
      });
    case 'apply_template_to_rem':
      return remAdapter.applyTemplateToRem({
        remId: payload.remId as string,
        templateId: payload.templateId as string,
        tagId: payload.tagId as string | undefined,
        skipExistingChildTitles: payload.skipExistingChildTitles as boolean | undefined,
        propertyDefaults: payload.propertyDefaults as Record<string, string> | undefined
      });
    case 'apply_tag_auto_template':
      return remAdapter.applyTagAutoTemplate({
        remId: payload.remId as string,
        tagId: payload.tagId as string,
        templateTitle: payload.templateTitle as string | undefined,
        skipExistingChildTitles: payload.skipExistingChildTitles as boolean | undefined,
        propertyDefaults: payload.propertyDefaults as Record<string, string> | undefined
      });
    case 'rem_sdk_call':
      return remAdapter.remSdkCall({
        remId: payload.remId as string,
        method: payload.method as string,
        args: payload.args as unknown[] | undefined
      });
    case 'rem_raw_call':
      return remAdapter.remRawCall({
        remId: payload.remId as string,
        method: payload.method as string,
        payload: payload.payload as Record<string, unknown> | undefined
      });
    case 'add_tag_by_id':
      return remAdapter.addTagById({
        remId: payload.remId as string,
        tagId: payload.tagId as string
      });
    case 'remove_tag_by_id':
      return remAdapter.removeTagById({
        remId: payload.remId as string,
        tagId: payload.tagId as string,
        removeProperties: payload.removeProperties as boolean | undefined
      });
    case 'add_source_to_rem':
      return remAdapter.addSourceToRem({
        remId: payload.remId as string,
        sourceRemId: payload.sourceRemId as string
      });
    case 'remove_source_from_rem':
      return remAdapter.removeSourceFromRem({
        remId: payload.remId as string,
        sourceRemId: payload.sourceRemId as string
      });
    case 'add_rem_to_portal':
      return remAdapter.addRemToPortal({
        remId: payload.remId as string,
        portalId: payload.portalId as string
      });
    case 'remove_rem_from_portal':
      return remAdapter.removeRemFromPortal({
        remId: payload.remId as string,
        portalId: payload.portalId as string
      });
    case 'create_alias':
      return remAdapter.createAlias({
        remId: payload.remId as string,
        aliasText: payload.aliasText as string
      });
    case 'set_practice_state':
      return remAdapter.setPracticeState({
        remId: payload.remId as string,
        enablePractice: payload.enablePractice as boolean | undefined,
        direction: payload.direction as 'forward' | 'backward' | 'none' | 'both' | undefined
      });
    case 'set_table_filter_raw':
      return remAdapter.setTableFilterRaw({
        remId: payload.remId as string,
        filter: payload.filter,
        dryRun: payload.dryRun as boolean | undefined
      });
    case 'debug_window_context':
      return debugWindowContext(plugin);
    case 'count_books_table':
      return countBooksTable(plugin, payload);
    case 'debug_focused_page_children_raw':
      return debugFocusedPageChildrenRaw(plugin);
    case 'count_tagged_rems':
      return countTaggedRems(plugin, payload);
    case 'list_tagged_rems':
      return listTaggedRems(plugin, payload);
    case 'inspect_rem_relations':
      return inspectRemRelations(plugin, payload);
    case 'debug_rem_raw_text':
      return debugRemRawText(plugin, payload);
    case 'inspect_native_icon_state':
      return inspectNativeIconState(plugin, payload);
    case 'apply_native_emoji_icon':
      return applyNativeEmojiIcon(plugin, payload);
    case 'set_document_pinned_state':
      return setDocumentPinnedState(plugin, payload);
    case 'inspect_built_in_powerups':
      return inspectBuiltInPowerups(plugin, payload);
    case 'inspect_note_style':
      return inspectNoteStyle(plugin, payload);
    case 'set_note_heading_level':
      return setNoteHeadingLevel(plugin, payload);
    case 'set_note_highlight_color':
      return setNoteHighlightColor(plugin, payload);
    case 'apply_callout_bullet_icon':
      return applyCalloutBulletIcon(plugin, payload);
    case 'remove_powerup':
      return removeBuiltInPowerup(plugin, payload);
    case 'inspect_rem_location':
      return inspectRemLocation(plugin, payload);
    case 'inspect_folder_state':
      return inspectFolderState(plugin, payload);
    case 'set_folder_state':
      return setFolderState(plugin, payload);
    case 'open_note':
      return openRemById(plugin, payload);
    case 'get_status':
      return remAdapter.getStatus();
    case 'semantic_status':
      // Semantik index durumunu sorgula
      return remAdapter.getSemanticStatus();
    case 'rebuild_semantic_index':
      // Semantic index'i zorla sÃ„Â±fÃ„Â±rdan oluÃ…Å¸tur (uzun sÃƒÂ¼rebilir)
      remAdapter.triggerSemanticIndex();
      return { ok: true, message: 'Semantic index arka planda yeniden oluÃ…Å¸turuluyor...' };
    case 'discover_tables':
      // RemNote'taki tÃƒÂ¼m tag-tabanlÃ„Â± database'leri keÃ…Å¸fet ve hafÃ„Â±zaya al
      // Payload: { minRows?: number }  Ã¢â‚¬â€ varsayÃ„Â±lan minRows=3
      return remAdapter.discoverTables(
        typeof payload.minRows === 'number' ? payload.minRows : 3
      );
    case 'smart_count_table':
      // AkÃ„Â±llÃ„Â± tablo sayÃ„Â±mÃ„Â± Ã¢â‚¬â€ 3 stratejiyi dener, doÃ„Å¸ru sonucu bulur
      // Payload: { query: string }
      if (typeof payload.query !== 'string' || !payload.query.trim()) {
        throw new Error('smart_count_table requires payload.query (string)');
      }
      return remAdapter.smartCountTable(payload.query as string);
    case 'list_table_rows': {
      // Bir tag-database'deki TÃƒÅ“M satÃ„Â±rlarÃ„Â± getir
      // Payload: { tagRemId: string, limit?: number }
      const tagRemId = payload.tagRemId as string;
      if (!tagRemId) throw new Error('list_table_rows requires payload.tagRemId');
      const maxLimit = typeof payload.limit === 'number' ? payload.limit : 500;
      const tagRem = await plugin.rem.findOne(tagRemId);
      if (!tagRem) throw new Error(`Tag rem not found: ${tagRemId}`);
      const taggedRems = await tagRem.taggedRem();
      const rows: Array<{ remId: string; title: string }> = [];
      for (const rem of taggedRems.slice(0, maxLimit)) {
        let rawText: any = rem.text;
        if (rawText instanceof Promise) rawText = await rawText;
        const text = (Array.isArray(rawText)
          ? rawText.map((e: any) => (typeof e === 'string' ? e : e?.text || '')).join('')
          : ''
        ).trim();
        if (text) rows.push({ remId: rem._id, title: text });
      }
      return { tagRemId, totalTagged: taggedRems.length, returned: rows.length, rows };
    }
    // -- NEW ACTIONS (v2.1.0 â€” Antigravity Enhanced) ----------------------
    case 'create_flashcard':
      return remAdapter.createFlashcard({
        parentId: payload.parentId as string,
        front: payload.front as string,
        back: payload.back as string,
        type: payload.type as 'forward' | 'backward' | 'bidirectional' | undefined,
        extraDetail: payload.extraDetail as string | undefined,
        detailToggles: payload.detailToggles as any,
        tags: payload.tags as string[] | undefined,
      });
    case 'update_flashcard_back':
      return remAdapter.updateFlashcardBack({
        remId: payload.remId as string,
        back: payload.back as string,
      });
    case 'create_cloze_flashcard':
      return remAdapter.createClozeFlashcard({
        parentId: payload.parentId as string,
        text: payload.text as string,
        tags: payload.tags as string[] | undefined,
      });
    case 'add_powerup':
      return remAdapter.addPowerup({
        remId: payload.remId as string,
        powerup: payload.powerup as string,
      });
    case 'remove_powerup_v2':
      return remAdapter.removePowerup({
        remId: payload.remId as string,
        powerup: payload.powerup as string,
      });
    case 'create_portal':
      return remAdapter.createPortal({
        parentId: payload.parentId as string,
        sourceRemId: payload.sourceRemId as string,
      });
    case 'create_reference':
      return remAdapter.createReference({
        remId: payload.remId as string,
        text: payload.text as string,
        targetRemId: payload.targetRemId as string,
      });
    case 'get_daily_doc':
      return remAdapter.getDailyDoc({
        date: payload.date as string | undefined,
      });
    case 'get_rem_tags':
      return remAdapter.getRemTags({
        remId: payload.remId as string,
      });
    case 'export_practice_queue':
      return remAdapter.exportPracticeQueue({
        remIds: payload.remIds as string[] | undefined,
        parentId: payload.parentId as string | undefined,
        tagRemId: payload.tagRemId as string | undefined,
        query: payload.query as string | undefined,
        limit: payload.limit as number | undefined,
        maxScan: payload.maxScan as number | undefined,
        includeBackText: payload.includeBackText as boolean | undefined,
        includeCardDetails: payload.includeCardDetails as boolean | undefined,
        sortBy: payload.sortBy as 'lastPracticed' | 'lastTimeMovedTo' | 'updatedAt' | 'createdAt' | 'title' | undefined,
        direction: payload.direction as 'asc' | 'desc' | undefined
      });
    case 'batch_create_flashcards':
      return remAdapter.batchCreateFlashcards({
        parentId: payload.parentId as string,
        cards: payload.cards as Array<{
          front: string;
          back: string;
          type?: 'forward' | 'backward' | 'bidirectional';
          tags?: string[];
        }>,
      });
    // -- END NEW ACTIONS ------------------------------------------------
    case 'inject_css':
      // Inject CSS into the RemNote UI via plugin.app.registerCSS
      // payload: { id: string, css: string }
      return remAdapter.injectCSS({
        id: payload.id as string,
        css: payload.css as string,
      });
    case 'reload_plugin':
      setTimeout(() => {
        window.location.reload();
      }, 500);
      return { ok: true, message: 'Reloading plugin in 500ms...' };
    default:
      throw new Error(`Unknown action: ${request.action}`);
  }
}

async function handleBridgeRequest(plugin: ReactRNPlugin, request: BridgeRequest): Promise<unknown> {
  try {
    const result = await dispatchBridgeRequest(plugin, request);
    await recordBridgeAction(plugin, request, { ok: true, result });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordBridgeAction(plugin, request, { ok: false, error: message });
    throw error;
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
    onStatusChange: (status) => {
      console.log(`[MCP Bridge] WS status: ${status}`);
      void persistBridgeRuntime(plugin, status);
    },
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
  await persistBridgeRuntime(plugin, 'connecting');
}

async function onActivate(plugin: ReactRNPlugin) {
  console.log('[MCP Bridge] Plugin activating v2.58.0...');
  bridgeStats = {
    calls: 0,
    created: 0,
    updated: 0,
    journal: 0,
    searches: 0,
    reads: 0,
    errors: 0,
  };
  bridgeRecentActions = [];
  bridgeLastError = null;

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
    widgetTabTitle: 'MCP Bridge',
    widgetTabIcon: 'https://cdn-icons-png.flaticon.com/512/2885/2885417.png'
  });

  await startBridge(plugin);
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
  }
  heartbeatTimer = setInterval(() => {
    void persistBridgeRuntime(plugin);
  }, 5000);
  console.log('[MCP Bridge] Background bridge started');
}

async function onDeactivate(plugin: ReactRNPlugin) {
  console.log('[MCP Bridge] Plugin deactivating...');
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (wsClient) {
    wsClient.disconnect();
    wsClient = null;
  }
  remAdapter = null;
  await persistBridgeRuntime(plugin, 'disconnected');
}

declareIndexPlugin(onActivate, onDeactivate);


