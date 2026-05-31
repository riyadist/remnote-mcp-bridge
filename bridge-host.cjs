const http = require('node:http');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { URL } = require('node:url');
const WebSocket = require('ws');

let ClassicLevelCtor = null;

const HTTP_PORT = Number(process.env.REMNOTE_BRIDGE_HTTP_PORT || 3400);
const WS_PORT = Number(process.env.REMNOTE_BRIDGE_WS_PORT || 3401);
const REQUEST_TIMEOUT_MS = Number(process.env.REMNOTE_BRIDGE_TIMEOUT_MS || 60000);

const startedAt = new Date().toISOString();
const clients = new Map();
const pending = new Map();
const sseClients = new Set();
const recentActions = [];
const stats = {
  calls: 0,
  created: 0,
  updated: 0,
  journal: 0,
  searches: 0,
  reads: 0,
  errors: 0
};
const repoRoot = __dirname;
const autoBuilderLogPath = path.join(repoRoot, 'auto_builder.log');
const lastUpdateResultPath = path.join(repoRoot, 'last_update_result.json');
const defaultRemNoteProfilePath = path.join(process.env.APPDATA || '', 'RemNote');
const hostDbSnapshotRoot = path.join(repoRoot, '.agent', 'cache', 'remnote_leveldb_snapshots');
const hostVaultExportRoot = path.join(repoRoot, '.agent', 'cache', 'remnote_vault_exports');
const hostVaultGraphExportRoot = path.join(repoRoot, '.agent', 'cache', 'remnote_vault_graph_exports');
const HOST_ACTIONS = new Set([
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
  'host_remnote_vault_snapshot_export'
]);
const SDK_METHOD_ACTION_HINTS = [
  { className: 'RemNamespace', method: 'findOne', area: 'notes', actions: ['read_note', 'read_rem_full', 'probe_rem_ids'] },
  { className: 'RemNamespace', method: 'findMany', area: 'notes', actions: ['probe_rem_ids'] },
  { className: 'RemNamespace', method: 'findByName', area: 'notes', actions: ['find_or_create_path'] },
  { className: 'RemNamespace', method: 'getAll', area: 'vault_snapshot', actions: ['get_all_rems', 'export_vault_snapshot', 'host_remnote_vault_snapshot_export', 'host_remnote_vault_snapshot_export_partitioned'] },
  { className: 'RemNamespace', method: 'createRem', area: 'notes', actions: ['create_note'] },
  { className: 'RemNamespace', method: 'createSingleRemWithMarkdown', area: 'notes', actions: ['create_note', 'append_journal'] },
  { className: 'RemNamespace', method: 'createTreeWithMarkdown', area: 'notes', actions: ['batch_ingest_records', 'create_structured_summary'] },
  { className: 'RemNamespace', method: 'createLinkRem', area: 'notes', actions: ['create_link_rem'] },
  { className: 'RemNamespace', method: 'createPortal', area: 'graph', actions: ['create_portal'] },
  { className: 'RemNamespace', method: 'createTable', area: 'tables', actions: ['create_table'] },
  { className: 'RemNamespace', method: 'moveRems', area: 'notes', actions: ['move_note', 'safe_migration_apply'] },
  { className: 'RemObject', method: 'setText', area: 'notes', actions: ['update_note', 'overwrite_note_content'] },
  { className: 'RemObject', method: 'setBackText', area: 'flashcards_practice', actions: ['update_flashcard_back', 'create_flashcard'] },
  { className: 'RemObject', method: 'remove', area: 'notes', actions: ['delete_note', 'safe_migration_apply'] },
  { className: 'RemObject', method: 'setParent', area: 'notes', actions: ['move_note', 'safe_migration_apply'] },
  { className: 'RemObject', method: 'addTag', area: 'tags', actions: ['add_tag_by_id'] },
  { className: 'RemObject', method: 'removeTag', area: 'tags', actions: ['remove_tag_by_id'] },
  { className: 'RemObject', method: 'getTagRems', area: 'tags', actions: ['get_rem_tags', 'export_graph_edges'] },
  { className: 'RemObject', method: 'taggedRem', area: 'tags', actions: ['list_tagged_rems', 'export_tag_view'] },
  { className: 'RemObject', method: 'setTagPropertyValue', area: 'properties', actions: ['set_tag_property_value'] },
  { className: 'RemObject', method: 'getTagPropertyValue', area: 'properties', actions: ['read_rem_full', 'export_tag_view', 'export_learning_inbox'] },
  { className: 'RemObject', method: 'getTagPropertyAsRem', area: 'properties', actions: ['read_rem_full', 'get_property_info'] },
  { className: 'RemObject', method: 'getPropertyType', area: 'properties', actions: ['get_property_info'] },
  { className: 'RemObject', method: 'setTableFilter', area: 'tables', actions: ['set_table_filter_raw'] },
  { className: 'RemObject', method: 'getChildrenRem', area: 'notes', actions: ['list_children', 'read_note', 'read_rem_full', 'export_subtree'] },
  { className: 'RemObject', method: 'getDescendants', area: 'notes', actions: ['export_subtree', 'export_graph_edges'] },
  { className: 'RemObject', method: 'getParentRem', area: 'notes', actions: ['inspect_rem_location', 'read_rem_full'] },
  { className: 'RemObject', method: 'addPowerup', area: 'powerups', actions: ['add_powerup'] },
  { className: 'RemObject', method: 'removePowerup', area: 'powerups', actions: ['remove_powerup', 'remove_powerup_v2'] },
  { className: 'RemObject', method: 'setPowerupProperty', area: 'powerups', actions: ['set_document_pinned_state', 'apply_native_emoji_icon', 'apply_callout_bullet_icon', 'set_folder_state'] },
  { className: 'RemObject', method: 'getPowerupProperty', area: 'powerups', actions: ['inspect_native_icon_state', 'inspect_folder_state', 'inspect_note_style'] },
  { className: 'RemObject', method: 'addSource', area: 'graph', actions: ['add_source_to_rem'] },
  { className: 'RemObject', method: 'removeSource', area: 'graph', actions: ['remove_source_from_rem'] },
  { className: 'RemObject', method: 'getSources', area: 'graph', actions: ['export_graph_edges', 'read_rem_full'] },
  { className: 'RemObject', method: 'addToPortal', area: 'graph', actions: ['add_rem_to_portal'] },
  { className: 'RemObject', method: 'removeFromPortal', area: 'graph', actions: ['remove_rem_from_portal'] },
  { className: 'RemObject', method: 'getPortalDirectlyIncludedRem', area: 'graph', actions: ['export_graph_edges'] },
  { className: 'RemObject', method: 'remsReferencingThis', area: 'graph', actions: ['export_graph_edges', 'read_rem_full'] },
  { className: 'RemObject', method: 'remsBeingReferenced', area: 'graph', actions: ['export_graph_edges', 'read_rem_full'] },
  { className: 'RemObject', method: 'getOrCreateAliasWithText', area: 'graph', actions: ['create_alias'] },
  { className: 'RemObject', method: 'getAliases', area: 'graph', actions: ['export_graph_edges', 'read_rem_full'] },
  { className: 'RemObject', method: 'setEnablePractice', area: 'flashcards_practice', actions: ['set_practice_state'] },
  { className: 'RemObject', method: 'setPracticeDirection', area: 'flashcards_practice', actions: ['set_practice_state'] },
  { className: 'RemObject', method: 'getPracticeDirection', area: 'flashcards_practice', actions: ['export_practice_queue', 'read_rem_full'] },
  { className: 'RemObject', method: 'getCards', area: 'flashcards_practice', actions: ['export_practice_queue', 'read_rem_full'] },
  { className: 'RemObject', method: 'setIsDocument', area: 'document_state', actions: ['set_document_pinned_state', 'rem_sdk_call'] },
  { className: 'RemObject', method: 'setIsFolder', area: 'document_state', actions: ['set_folder_state'] },
  { className: 'RemObject', method: 'setFontSize', area: 'formatting', actions: ['set_note_heading_level'] },
  { className: 'RemObject', method: 'setHighlightColor', area: 'formatting', actions: ['set_note_highlight_color'] },
  { className: 'RemObject', method: 'openRemAsPage', area: 'ui_view_configuration', actions: ['open_note'] },
  { className: 'RemObject', method: 'getType', area: 'rem_object_state', actions: ['inspect_rem_object_state'] },
  { className: 'RemObject', method: 'getSchemaVersion', area: 'rem_object_state', actions: ['inspect_rem_object_state'] },
  { className: 'RemObject', method: 'isDocument', area: 'rem_object_state', actions: ['inspect_rem_object_state'] },
  { className: 'RemObject', method: 'isFolder', area: 'rem_object_state', actions: ['inspect_rem_object_state', 'inspect_folder_state'] },
  { className: 'RemObject', method: 'isTable', area: 'rem_object_state', actions: ['inspect_rem_object_state'] },
  { className: 'RemObject', method: 'isListItem', area: 'rem_object_state', actions: ['inspect_rem_object_state'] },
  { className: 'RemObject', method: 'isCardItem', area: 'rem_object_state', actions: ['inspect_rem_object_state'] },
  { className: 'RemObject', method: 'isQuote', area: 'rem_object_state', actions: ['inspect_rem_object_state'] },
  { className: 'RemObject', method: 'isCode', area: 'rem_object_state', actions: ['inspect_rem_object_state'] },
  { className: 'RemObject', method: 'isTodo', area: 'rem_object_state', actions: ['inspect_rem_object_state'] },
  { className: 'RemObject', method: 'isSlot', area: 'rem_object_state', actions: ['inspect_rem_object_state'] },
  { className: 'RemObject', method: 'isProperty', area: 'rem_object_state', actions: ['inspect_rem_object_state'] },
  { className: 'RemObject', method: 'isPowerup', area: 'rem_object_state', actions: ['inspect_rem_object_state'] },
  { className: 'RemObject', method: 'isPowerupEnum', area: 'rem_object_state', actions: ['inspect_rem_object_state'] },
  { className: 'RemObject', method: 'isPowerupSlot', area: 'rem_object_state', actions: ['inspect_rem_object_state'] },
  { className: 'RemObject', method: 'isPowerupProperty', area: 'rem_object_state', actions: ['inspect_rem_object_state'] },
  { className: 'RemObject', method: 'isPowerupPropertyListItem', area: 'rem_object_state', actions: ['inspect_rem_object_state'] },
  { className: 'RemObject', method: 'getTodoStatus', area: 'rem_object_state', actions: ['inspect_rem_object_state', 'control_rem_object_state'] },
  { className: 'RemObject', method: 'setTodoStatus', area: 'rem_object_state_control', actions: ['control_rem_object_state'] },
  { className: 'RemObject', method: 'getFontSize', area: 'rem_object_state', actions: ['inspect_rem_object_state', 'inspect_note_style'] },
  { className: 'RemObject', method: 'getHighlightColor', area: 'rem_object_state', actions: ['inspect_rem_object_state'] },
  { className: 'RemObject', method: 'getEnablePractice', area: 'rem_object_state', actions: ['inspect_rem_object_state', 'export_practice_queue'] },
  { className: 'RemObject', method: 'getLastPracticed', area: 'rem_object_state', actions: ['inspect_rem_object_state', 'export_practice_queue'] },
  { className: 'RemObject', method: 'getLastTimeMovedTo', area: 'rem_object_state', actions: ['inspect_rem_object_state', 'export_practice_queue'] },
  { className: 'RemObject', method: 'embeddedQueueViewMode', area: 'rem_object_state', actions: ['inspect_rem_object_state'] },
  { className: 'RemObject', method: 'positionAmongstSiblings', area: 'rem_object_state', actions: ['inspect_rem_object_state', 'inspect_rem_location'] },
  { className: 'RemObject', method: 'positionAmongstVisibleSiblings', area: 'rem_object_state', actions: ['inspect_rem_object_state'] },
  { className: 'RemObject', method: 'timesSelectedInSearch', area: 'rem_object_state', actions: ['inspect_rem_object_state'] },
  { className: 'RemObject', method: 'getPortalType', area: 'rem_object_state', actions: ['inspect_rem_object_state'] },
  { className: 'RemObject', method: 'isCollapsed', area: 'rem_object_state', actions: ['inspect_rem_object_state'] },
  { className: 'RemObject', method: 'setIsCollapsed', area: 'rem_object_state_control', actions: ['control_rem_object_state'] },
  { className: 'RemObject', method: 'getHiddenExplicitlyIncludedState', area: 'rem_object_state', actions: ['inspect_rem_object_state'] },
  { className: 'RemObject', method: 'setHiddenExplicitlyIncludedState', area: 'rem_object_state_control', actions: ['control_rem_object_state'] },
  { className: 'RemObject', method: 'hasPowerup', area: 'rem_object_state', actions: ['inspect_rem_object_state', 'inspect_powerup_registry'] },
  { className: 'RemObject', method: 'getPowerupPropertyAsRem', area: 'rem_object_state', actions: ['inspect_rem_object_state', 'inspect_native_icon_state', 'inspect_folder_state'] },
  { className: 'RemObject', method: 'getPowerupPropertyAsRichText', area: 'rem_object_state', actions: ['inspect_rem_object_state', 'inspect_note_style'] },
  { className: 'RemObject', method: 'allRemInFolderQueue', area: 'rem_object_state', actions: ['inspect_rem_object_state'] },
  { className: 'RemObject', method: 'allRemInDocumentOrPortal', area: 'rem_object_state', actions: ['inspect_rem_object_state', 'export_subtree'] },
  { className: 'RemObject', method: 'portalsAndDocumentsIn', area: 'rem_object_state', actions: ['inspect_rem_object_state'] },
  { className: 'RemObject', method: 'siblingRem', area: 'rem_object_graph', actions: ['inspect_rem_graph_context'] },
  { className: 'RemObject', method: 'visibleSiblingRem', area: 'rem_object_graph', actions: ['inspect_rem_graph_context'] },
  { className: 'RemObject', method: 'ancestorTagRem', area: 'rem_object_graph', actions: ['inspect_rem_graph_context'] },
  { className: 'RemObject', method: 'descendantTagRem', area: 'rem_object_graph', actions: ['inspect_rem_graph_context'] },
  { className: 'RemObject', method: 'deepRemsBeingReferenced', area: 'rem_object_graph', actions: ['inspect_rem_graph_context'] },
  { className: 'RemObject', method: 'indent', area: 'rem_object_structure_control', actions: ['control_rem_structure'] },
  { className: 'RemObject', method: 'outdent', area: 'rem_object_structure_control', actions: ['control_rem_structure'] },
  { className: 'RemObject', method: 'setType', area: 'rem_object_structure_control', actions: ['control_rem_structure'] },
  { className: 'RemObject', method: 'merge', area: 'rem_object_structure_control', actions: ['control_rem_structure'] },
  { className: 'RemObject', method: 'mergeAndSetAlias', area: 'rem_object_structure_control', actions: ['control_rem_structure'] },
  { className: 'RemObject', method: 'setIsListItem', area: 'rem_object_state_control', actions: ['control_rem_object_state'] },
  { className: 'RemObject', method: 'setIsCardItem', area: 'rem_object_state_control', actions: ['control_rem_object_state'] },
  { className: 'RemObject', method: 'setIsQuote', area: 'rem_object_state_control', actions: ['control_rem_object_state'] },
  { className: 'RemObject', method: 'setIsCode', area: 'rem_object_state_control', actions: ['control_rem_object_state'] },
  { className: 'RemObject', method: 'setIsTodo', area: 'rem_object_state_control', actions: ['control_rem_object_state'] },
  { className: 'RemObject', method: 'setIsSlot', area: 'rem_object_state_control', actions: ['control_rem_object_state'] },
  { className: 'RemObject', method: 'setIsProperty', area: 'rem_object_state_control', actions: ['control_rem_object_state'] },
  { className: 'RemObject', method: 'expand', area: 'rem_object_state_control', actions: ['control_rem_object_state'] },
  { className: 'RemObject', method: 'collapse', area: 'rem_object_state_control', actions: ['control_rem_object_state'] },
  { className: 'RemObject', method: 'openRemInContext', area: 'ui_view_configuration', actions: ['control_rem_object_state', 'open_note'] },
  { className: 'RemObject', method: 'scrollToReaderHighlight', area: 'reader_control', actions: ['control_rem_object_state', 'control_reader'] },
  { className: 'RemObject', method: 'copyReferenceToClipboard', area: 'ui_view_configuration', actions: ['control_rem_object_state'] },
  { className: 'RemObject', method: 'copyTagReferenceToClipboard', area: 'ui_view_configuration', actions: ['control_rem_object_state'] },
  { className: 'RemObject', method: 'copyPortalReferenceToClipboard', area: 'ui_view_configuration', actions: ['control_rem_object_state'] },
  { className: 'AppNamespace', method: 'getOperatingSystem', area: 'sdk_namespace_read', actions: ['sdk_namespace_call', 'inspect_app_context'] },
  { className: 'AppNamespace', method: 'getPlatform', area: 'sdk_namespace_read', actions: ['sdk_namespace_call', 'inspect_app_context'] },
  { className: 'AppNamespace', method: 'waitForInitialSync', area: 'app_control', actions: ['inspect_app_context', 'control_app'] },
  { className: 'AppNamespace', method: 'registerPowerup', area: 'app_control', actions: ['control_app'] },
  { className: 'AppNamespace', method: 'registerWidget', area: 'app_control', actions: ['control_app'] },
  { className: 'AppNamespace', method: 'unregisterWidget', area: 'app_control', actions: ['control_app'] },
  { className: 'AppNamespace', method: 'registerCommand', area: 'app_control', actions: ['control_app'] },
  { className: 'AppNamespace', method: 'registerSidebarButton', area: 'app_control', actions: ['control_app'] },
  { className: 'AppNamespace', method: 'registerRemMenuItem', area: 'app_control', actions: ['control_app'] },
  { className: 'AppNamespace', method: 'registerMenuItem', area: 'app_control', actions: ['control_app'] },
  { className: 'AppNamespace', method: 'unregisterMenuItem', area: 'app_control', actions: ['control_app'] },
  { className: 'AppNamespace', method: 'stealKeys', area: 'app_control', actions: ['control_app'] },
  { className: 'AppNamespace', method: 'releaseKeys', area: 'app_control', actions: ['control_app'] },
  { className: 'AppNamespace', method: 'registerCSS', area: 'app_control', actions: ['inject_css', 'control_app'] },
  { className: 'AppNamespace', method: 'registerStatusBarItem', area: 'app_control', actions: ['control_app'] },
  { className: 'AppNamespace', method: 'registerCallback', area: 'app_control', actions: ['control_app'] },
  { className: 'AppNamespace', method: 'transaction', area: 'app_control', actions: ['control_app'] },
  { className: 'AppNamespace', method: 'toast', area: 'app_control', actions: ['control_app'] },
  { className: 'EventNamespace', method: 'addListener', area: 'event_control', actions: ['control_events'] },
  { className: 'EventNamespace', method: 'removeListener', area: 'event_control', actions: ['control_events'] },
  { className: 'PowerupNamespace', method: 'getPowerupByCode', area: 'powerups', actions: ['sdk_namespace_call', 'inspect_powerup_registry'] },
  { className: 'PowerupNamespace', method: 'getPowerupSlotByCode', area: 'powerups', actions: ['sdk_namespace_call', 'inspect_powerup_registry'] },
  { className: 'WindowNamespace', method: 'openRem', area: 'ui_view_configuration', actions: ['open_note', 'control_window'] },
  { className: 'WindowNamespace', method: 'stealKeys', area: 'window_control', actions: ['control_window'] },
  { className: 'WindowNamespace', method: 'releaseKeys', area: 'window_control', actions: ['control_window'] },
  { className: 'WindowNamespace', method: 'openFloatingWidget', area: 'window_control', actions: ['control_window'] },
  { className: 'WindowNamespace', method: 'closeFloatingWidget', area: 'window_control', actions: ['control_window'] },
  { className: 'WindowNamespace', method: 'getCurrentWindowTree', area: 'ui_view_configuration', actions: ['sdk_namespace_call'] },
  { className: 'WindowNamespace', method: 'setFloatingWidgetPosition', area: 'window_control', actions: ['control_window'] },
  { className: 'WindowNamespace', method: 'closeAllFloatingWidgets', area: 'window_control', actions: ['control_window'] },
  { className: 'WindowNamespace', method: 'setRemWindowTree', area: 'window_control', actions: ['control_window'] },
  { className: 'WindowNamespace', method: 'getLastFocusedPane', area: 'ui_view_configuration', actions: ['sdk_namespace_call'] },
  { className: 'WindowNamespace', method: 'setCurrentWindowTreeFromString', area: 'window_control', actions: ['control_window'] },
  { className: 'WindowNamespace', method: 'getOpenPaneIds', area: 'ui_view_configuration', actions: ['sdk_namespace_call', 'debug_window_context'] },
  { className: 'WindowNamespace', method: 'getFocusedPaneId', area: 'ui_view_configuration', actions: ['sdk_namespace_call', 'debug_window_context', 'inspect_editor_context'] },
  { className: 'WindowNamespace', method: 'setFocusedPaneId', area: 'window_control', actions: ['control_window'] },
  { className: 'WindowNamespace', method: 'getURL', area: 'ui_view_configuration', actions: ['sdk_namespace_call'] },
  { className: 'WindowNamespace', method: 'setURL', area: 'window_control', actions: ['control_window'] },
  { className: 'WindowNamespace', method: 'getOpenPaneRemIds', area: 'ui_view_configuration', actions: ['sdk_namespace_call', 'debug_window_context'] },
  { className: 'WindowNamespace', method: 'getOpenPaneRemId', area: 'ui_view_configuration', actions: ['sdk_namespace_call', 'debug_window_context', 'inspect_editor_context'] },
  { className: 'WindowNamespace', method: 'openWidgetInPane', area: 'window_control', actions: ['control_window'] },
  { className: 'WindowNamespace', method: 'openWidgetInRightSidebar', area: 'window_control', actions: ['control_window'] },
  { className: 'WindowNamespace', method: 'isFloatingWidgetOpen', area: 'ui_view_configuration', actions: ['sdk_namespace_call'] },
  { className: 'WindowNamespace', method: 'isOnPage', area: 'ui_view_configuration', actions: ['sdk_namespace_call'] },
  { className: 'EditorNamespace', method: 'getSelectedRem', area: 'editor_context', actions: ['sdk_namespace_call', 'inspect_editor_context'] },
  { className: 'EditorNamespace', method: 'getSelectedText', area: 'editor_context', actions: ['sdk_namespace_call', 'inspect_editor_context'] },
  { className: 'EditorNamespace', method: 'getSelection', area: 'editor_context', actions: ['sdk_namespace_call', 'inspect_editor_context'] },
  { className: 'EditorNamespace', method: 'getCaretPosition', area: 'editor_context', actions: ['sdk_namespace_call', 'inspect_editor_context'] },
  { className: 'EditorNamespace', method: 'getFocusedEditorText', area: 'editor_context', actions: ['sdk_namespace_call', 'inspect_editor_context'] },
  { className: 'EditorNamespace', method: 'setText', area: 'editor_control', actions: ['control_editor'] },
  { className: 'EditorNamespace', method: 'copy', area: 'editor_control', actions: ['control_editor'] },
  { className: 'EditorNamespace', method: 'cut', area: 'editor_control', actions: ['control_editor'] },
  { className: 'EditorNamespace', method: 'deleteCharacters', area: 'editor_control', actions: ['control_editor'] },
  { className: 'EditorNamespace', method: 'delete', area: 'editor_control', actions: ['control_editor'] },
  { className: 'EditorNamespace', method: 'selectRem', area: 'editor_control', actions: ['control_editor'] },
  { className: 'EditorNamespace', method: 'selectText', area: 'editor_control', actions: ['control_editor'] },
  { className: 'EditorNamespace', method: 'collapseSelection', area: 'editor_control', actions: ['control_editor'] },
  { className: 'EditorNamespace', method: 'undo', area: 'editor_control', actions: ['control_editor'] },
  { className: 'EditorNamespace', method: 'redo', area: 'editor_control', actions: ['control_editor'] },
  { className: 'EditorNamespace', method: 'moveCaret', area: 'editor_control', actions: ['control_editor'] },
  { className: 'EditorNamespace', method: 'moveCaretVertical', area: 'editor_control', actions: ['control_editor'] },
  { className: 'EditorNamespace', method: 'insertPlainText', area: 'editor_control', actions: ['control_editor'] },
  { className: 'EditorNamespace', method: 'insertRichText', area: 'editor_control', actions: ['control_editor'] },
  { className: 'EditorNamespace', method: 'insertMarkdown', area: 'editor_control', actions: ['control_editor'] },
  { className: 'SearchNamespace', method: 'search', area: 'search', actions: ['search'] },
  { className: 'DateNamespace', method: 'getDailyDoc', area: 'daily_docs', actions: ['get_daily_doc', 'append_journal', 'export_daily_range'] },
  { className: 'DateNamespace', method: 'getTodaysDoc', area: 'daily_docs', actions: ['get_daily_doc', 'append_journal', 'export_daily_range', 'sdk_namespace_call'] },
  { className: 'QueueNamespace', method: 'getAverageTimePerCard', area: 'flashcards_practice', actions: ['sdk_namespace_call', 'inspect_queue_context'] },
  { className: 'QueueNamespace', method: 'getCurrentQueueScreenType', area: 'flashcards_practice', actions: ['sdk_namespace_call', 'inspect_queue_context'] },
  { className: 'QueueNamespace', method: 'hasRevealedAnswer', area: 'flashcards_practice', actions: ['sdk_namespace_call', 'inspect_queue_context'] },
  { className: 'QueueNamespace', method: 'isTypeAnswerEnabled', area: 'flashcards_practice', actions: ['sdk_namespace_call', 'inspect_queue_context'] },
  { className: 'QueueNamespace', method: 'getCurrentCard', area: 'flashcards_practice', actions: ['export_practice_queue', 'sdk_namespace_call', 'inspect_queue_context'] },
  { className: 'QueueNamespace', method: 'getNumRemainingCards', area: 'flashcards_practice', actions: ['sdk_namespace_call', 'inspect_queue_context'] },
  { className: 'QueueNamespace', method: 'getCurrentStreak', area: 'flashcards_practice', actions: ['sdk_namespace_call', 'inspect_queue_context'] },
  { className: 'QueueNamespace', method: 'inLookbackMode', area: 'flashcards_practice', actions: ['sdk_namespace_call', 'inspect_queue_context'] },
  { className: 'QueueNamespace', method: 'goBackToPreviousCard', area: 'flashcards_practice', actions: ['control_practice_queue'] },
  { className: 'QueueNamespace', method: 'showAnswer', area: 'flashcards_practice', actions: ['control_practice_queue'] },
  { className: 'QueueNamespace', method: 'rateCurrentCard', area: 'flashcards_practice', actions: ['control_practice_queue'] },
  { className: 'QueueNamespace', method: 'removeCurrentCardFromQueue', area: 'flashcards_practice', actions: ['control_practice_queue'] },
  { className: 'CardNamespace', method: 'findOne', area: 'flashcards_practice', actions: ['sdk_namespace_call', 'read_card_full'] },
  { className: 'CardNamespace', method: 'findMany', area: 'flashcards_practice', actions: ['sdk_namespace_call', 'export_card_catalog'] },
  { className: 'CardNamespace', method: 'getAll', area: 'flashcards_practice', actions: ['sdk_namespace_call', 'export_card_catalog'] },
  { className: 'Card', method: 'getType', area: 'flashcards_practice', actions: ['read_card_full', 'export_card_catalog'] },
  { className: 'Card', method: 'getRem', area: 'flashcards_practice', actions: ['read_card_full', 'export_card_catalog'] },
  { className: 'Card', method: 'remove', area: 'flashcards_practice', actions: ['control_card'] },
  { className: 'StorageNamespace', method: 'setSession', area: 'plugin_runtime_control', actions: ['control_plugin_runtime'] },
  { className: 'StorageNamespace', method: 'getSession', area: 'plugin_runtime', actions: ['sdk_namespace_call', 'inspect_plugin_runtime', 'control_plugin_runtime'] },
  { className: 'StorageNamespace', method: 'setSynced', area: 'plugin_runtime_control', actions: ['control_plugin_runtime'] },
  { className: 'StorageNamespace', method: 'getSynced', area: 'plugin_runtime', actions: ['sdk_namespace_call', 'inspect_plugin_runtime', 'control_plugin_runtime'] },
  { className: 'StorageNamespace', method: 'setLocal', area: 'plugin_runtime_control', actions: ['control_plugin_runtime'] },
  { className: 'StorageNamespace', method: 'getLocal', area: 'plugin_runtime', actions: ['sdk_namespace_call', 'inspect_plugin_runtime', 'control_plugin_runtime'] },
  { className: 'SettingsNamespace', method: 'registerDropdownSetting', area: 'plugin_runtime_control', actions: ['control_plugin_runtime'] },
  { className: 'SettingsNamespace', method: 'registerBooleanSetting', area: 'plugin_runtime_control', actions: ['control_plugin_runtime'] },
  { className: 'SettingsNamespace', method: 'registerStringSetting', area: 'plugin_runtime_control', actions: ['control_plugin_runtime'] },
  { className: 'SettingsNamespace', method: 'registerNumberSetting', area: 'plugin_runtime_control', actions: ['control_plugin_runtime'] },
  { className: 'SettingsNamespace', method: 'getSetting', area: 'plugin_runtime', actions: ['sdk_namespace_call', 'inspect_plugin_runtime', 'control_plugin_runtime'] },
  { className: 'WidgetNamespace', method: 'getWidgetsAtLocation', area: 'plugin_runtime_control', actions: ['control_plugin_runtime'] },
  { className: 'WidgetNamespace', method: 'getDimensions', area: 'plugin_runtime_control', actions: ['control_plugin_runtime'] },
  { className: 'WidgetNamespace', method: 'openPopup', area: 'plugin_runtime_control', actions: ['control_plugin_runtime'] },
  { className: 'WidgetNamespace', method: 'closePopup', area: 'plugin_runtime_control', actions: ['control_plugin_runtime'] },
  { className: 'WidgetNamespace', method: 'getWidgetContext', area: 'plugin_runtime_control', actions: ['control_plugin_runtime'] },
  { className: 'MessagingNamespace', method: 'broadcast', area: 'plugin_runtime_control', actions: ['control_plugin_runtime'] },
  { className: 'KnowledgeBaseNamespace', method: 'getCurrentKnowledgeBaseData', area: 'knowledge_base', actions: ['sdk_namespace_call', 'inspect_plugin_runtime'] },
  { className: 'KnowledgeBaseNamespace', method: 'isPrimaryKnowledgeBase', area: 'knowledge_base', actions: ['sdk_namespace_call', 'inspect_plugin_runtime'] },
  { className: 'FocusNamespace', method: 'getFocusedRem', area: 'focus_context', actions: ['sdk_namespace_call', 'inspect_focus_context'] },
  { className: 'FocusNamespace', method: 'getFocusedPortal', area: 'focus_context', actions: ['sdk_namespace_call', 'inspect_focus_context'] },
  { className: 'ReaderNamespace', method: 'addHighlight', area: 'reader_control', actions: ['control_reader'] },
  { className: 'SchedulerNamespace', method: 'registerCustomScheduler', area: 'scheduler_control', actions: ['control_scheduler'] },
  { className: 'RichTextNamespace', method: 'applyTextFormatToRange', area: 'rich_text', actions: ['sdk_namespace_call', 'rich_text_format_range'] },
  { className: 'RichTextNamespace', method: 'charAt', area: 'rich_text', actions: ['sdk_namespace_call', 'rich_text_inspect'] },
  { className: 'RichTextNamespace', method: 'deepGetRemAndAliasIdsFromRichText', area: 'rich_text', actions: ['sdk_namespace_call', 'rich_text_inspect'] },
  { className: 'RichTextNamespace', method: 'deepGetRemIdsFromRichText', area: 'rich_text', actions: ['sdk_namespace_call', 'rich_text_inspect'] },
  { className: 'RichTextNamespace', method: 'empty', area: 'rich_text', actions: ['sdk_namespace_call', 'rich_text_inspect'] },
  { className: 'RichTextNamespace', method: 'equals', area: 'rich_text', actions: ['sdk_namespace_call', 'rich_text_inspect'] },
  { className: 'RichTextNamespace', method: 'findAllExternalURLs', area: 'rich_text', actions: ['sdk_namespace_call', 'rich_text_inspect'] },
  { className: 'RichTextNamespace', method: 'getRemAndAliasIdsFromRichText', area: 'rich_text', actions: ['sdk_namespace_call', 'rich_text_inspect'] },
  { className: 'RichTextNamespace', method: 'getRemIdsFromRichText', area: 'rich_text', actions: ['sdk_namespace_call', 'rich_text_inspect'] },
  { className: 'RichTextNamespace', method: 'indexOf', area: 'rich_text', actions: ['sdk_namespace_call', 'rich_text_inspect'] },
  { className: 'RichTextNamespace', method: 'indexOfElementAt', area: 'rich_text', actions: ['sdk_namespace_call', 'rich_text_inspect'] },
  { className: 'RichTextNamespace', method: 'length', area: 'rich_text', actions: ['sdk_namespace_call', 'rich_text_inspect'] },
  { className: 'RichTextNamespace', method: 'normalize', area: 'rich_text', actions: ['sdk_namespace_call', 'rich_text_inspect'] },
  { className: 'RichTextNamespace', method: 'parseAndInsertHtml', area: 'rich_text', actions: ['rich_text_insert_html'] },
  { className: 'RichTextNamespace', method: 'parseFromMarkdown', area: 'rich_text', actions: ['sdk_namespace_call', 'rich_text_parse_markdown'] },
  { className: 'RichTextNamespace', method: 'removeTextFormatFromRange', area: 'rich_text', actions: ['sdk_namespace_call', 'rich_text_format_range'] },
  { className: 'RichTextNamespace', method: 'replaceAllRichText', area: 'rich_text', actions: ['sdk_namespace_call'] },
  { className: 'RichTextNamespace', method: 'split', area: 'rich_text', actions: ['sdk_namespace_call'] },
  { className: 'RichTextNamespace', method: 'splitRichText', area: 'rich_text', actions: ['sdk_namespace_call'] },
  { className: 'RichTextNamespace', method: 'substring', area: 'rich_text', actions: ['sdk_namespace_call', 'rich_text_inspect'] },
  { className: 'RichTextNamespace', method: 'toHTML', area: 'rich_text', actions: ['sdk_namespace_call', 'rich_text_inspect'] },
  { className: 'RichTextNamespace', method: 'toMarkdown', area: 'rich_text', actions: ['sdk_namespace_call', 'rich_text_inspect'] },
  { className: 'RichTextNamespace', method: 'toString', area: 'rich_text', actions: ['sdk_namespace_call', 'rich_text_inspect'] },
  { className: 'RichTextNamespace', method: 'toggleTextFormatOnRange', area: 'rich_text', actions: ['sdk_namespace_call', 'rich_text_format_range'] },
  { className: 'RichTextNamespace', method: 'trim', area: 'rich_text', actions: ['sdk_namespace_call', 'rich_text_inspect'] },
  { className: 'RichTextNamespace', method: 'trimEnd', area: 'rich_text', actions: ['sdk_namespace_call', 'rich_text_inspect'] },
  { className: 'RichTextNamespace', method: 'trimStart', area: 'rich_text', actions: ['sdk_namespace_call', 'rich_text_inspect'] },
  { className: 'Card', method: 'updateCardRepetitionStatus', area: 'flashcards_practice', actions: ['set_practice_state', 'control_card'] }
];
const mimeTypes = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.bmp', 'image/bmp'],
  ['.svg', 'image/svg+xml']
]);

function safeReadJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function safeReadStat(filePath) {
  try {
    return fs.statSync(filePath);
  } catch {
    return null;
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function safeIso(statTime) {
  try {
    return statTime instanceof Date ? statTime.toISOString() : null;
  } catch {
    return null;
  }
}

function sanitizeSnapshotId(value) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9_.-]/g, '_')
    .slice(0, 80);
}

function clampNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(Math.floor(parsed), max));
}

function readTextFile(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
}

function walkFiles(dirPath, predicate, results = []) {
  if (!fs.existsSync(dirPath)) {
    return results;
  }
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, predicate, results);
    } else if (!predicate || predicate(fullPath)) {
      results.push(fullPath);
    }
  }
  return results;
}

function extractStringLiterals(source) {
  const values = [];
  const regex = /['"]([^'"]+)['"]/g;
  let match;
  while ((match = regex.exec(source))) {
    values.push(match[1]);
  }
  return values;
}

function extractNewSetStrings(source, constName) {
  const regex = new RegExp(`const\\s+${constName}\\s*=\\s*new\\s+Set\\s*\\(\\s*\\[([\\s\\S]*?)\\]\\s*\\)`);
  const match = regex.exec(source);
  return match ? extractStringLiterals(match[1]) : [];
}

function extractBridgeActionsFromWidgetSource(source) {
  const match = /const\s+BRIDGE_ACTIONS\s*=\s*\[([\s\S]*?)\]\s*as\s+const\s*;/m.exec(source);
  return match ? Array.from(new Set(extractStringLiterals(match[1]))).sort() : [];
}

function extractDispatchActionsFromWidgetSource(source) {
  const lines = source.split(/\r?\n/);
  const switchStart = lines.findIndex((line) => /switch\s*\(\s*request\.action\s*\)/.test(line));
  if (switchStart < 0) {
    return { switchStartLine: 0, defaultLine: 0, actions: [] };
  }
  const defaultOffset = lines.slice(switchStart).findIndex((line) => /^\s*default\s*:/.test(line));
  const defaultLineIndex = defaultOffset < 0 ? lines.length : switchStart + defaultOffset;
  const actions = [];
  for (let i = switchStart; i < defaultLineIndex; i += 1) {
    const match = /^\s*case\s+['"]([^'"]+)['"]\s*:/.exec(lines[i]);
    if (match) {
      actions.push({ action: match[1], file: 'src/widgets/index.tsx', line: i + 1 });
    }
  }
  return {
    switchStartLine: switchStart + 1,
    defaultLine: defaultLineIndex + 1,
    actions: actions.sort((a, b) => a.action.localeCompare(b.action)),
  };
}

function extractCoverageReferences(coveragePaths) {
  const references = new Map();
  for (const coveragePath of coveragePaths) {
    if (!fs.existsSync(coveragePath)) {
      continue;
    }
    const relPath = path.relative(repoRoot, coveragePath).replace(/\\/g, '/');
    const lines = readTextFile(coveragePath).split(/\r?\n/);
    lines.forEach((line, index) => {
      const regex = /-Action\s+['"]([^'"]+)['"]/g;
      let match;
      while ((match = regex.exec(line))) {
        if (!references.has(match[1])) {
          references.set(match[1], []);
        }
        references.get(match[1]).push(`${relPath}:${index + 1}`);
      }
    });
  }
  return references;
}

function buildBridgeActionCoverageReport(options = {}) {
  const widgetPath = path.join(repoRoot, 'src', 'widgets', 'index.tsx');
  const source = fs.existsSync(widgetPath) ? readTextFile(widgetPath) : '';
  const dispatch = source ? extractDispatchActionsFromWidgetSource(source) : { switchStartLine: 0, defaultLine: 0, actions: [] };
  const coveragePaths = [
    path.join(repoRoot, 'test_bridge_actions.ps1'),
    path.join(repoRoot, 'test_flashcard_actions.ps1'),
    path.join(repoRoot, 'test_readonly_debug_actions.ps1'),
    path.join(repoRoot, 'update_and_test_semantic.ps1'),
  ];
  const refs = extractCoverageReferences(coveragePaths);
  const rows = dispatch.actions.map((entry) => ({
    action: entry.action,
    actionLocation: `${entry.file}:${entry.line}`,
    covered: refs.has(entry.action),
    coverageLocations: refs.get(entry.action) || [],
  }));
  const uncovered = rows.filter((row) => !row.covered);
  const covered = rows.filter((row) => row.covered);
  const result = {
    status: uncovered.length === 0 && rows.length > 0 ? 'covered' : 'needs_attention',
    generatedAt: new Date().toISOString(),
    source: {
      path: 'src/widgets/index.tsx',
      switchStartLine: dispatch.switchStartLine,
      defaultLine: dispatch.defaultLine,
    },
    coverageFiles: coveragePaths.map((coveragePath) => path.relative(repoRoot, coveragePath).replace(/\\/g, '/')),
    summary: {
      actionCount: rows.length,
      coveredCount: covered.length,
      uncoveredCount: uncovered.length,
    },
    uncovered,
  };
  if (options.includeCovered) {
    result.covered = covered;
  }
  return result;
}

function parseSdkDtsMethodSurface(options = {}) {
  const sdkRoot = path.join(repoRoot, 'node_modules', '@remnote', 'plugin-sdk');
  const distRoot = path.join(sdkRoot, 'dist');
  const nameSpacesRoot = path.join(distRoot, 'name_spaces');
  const includeReact = options.includeReact === true;
  const dtsRoots = [nameSpacesRoot, path.join(distRoot, 'events.d.ts'), path.join(distRoot, 'plugin_base.d.ts')];
  if (includeReact) {
    dtsRoots.push(path.join(distRoot, 'react'));
  }
  const files = [];
  for (const root of dtsRoots) {
    if (!fs.existsSync(root)) {
      continue;
    }
    const stat = fs.statSync(root);
    if (stat.isDirectory()) {
      walkFiles(root, (filePath) => filePath.endsWith('.d.ts'), files);
    } else if (root.endsWith('.d.ts')) {
      files.push(root);
    }
  }

  const namespaceFilter = String(options.namespaceFilter || '').trim().toLowerCase();
  const methodFilter = String(options.methodFilter || '').trim().toLowerCase();
  const classes = [];
  const methods = [];
  for (const filePath of files.sort()) {
    const source = readTextFile(filePath);
    const relPath = path.relative(repoRoot, filePath).replace(/\\/g, '/');
    const classRegex = /export\s+declare\s+class\s+([A-Za-z0-9_]+)[^{]*\{([\s\S]*?)\n\}/g;
    let classMatch;
    while ((classMatch = classRegex.exec(source))) {
      const className = classMatch[1];
      if (namespaceFilter && !className.toLowerCase().includes(namespaceFilter)) {
        continue;
      }
      const body = classMatch[2];
      const classMethods = [];
      body.split(/\r?\n/).forEach((line, index) => {
        const trimmed = line.trim();
        if (
          !trimmed ||
          trimmed.startsWith('*') ||
          trimmed.startsWith('/') ||
          trimmed.startsWith('private ') ||
          trimmed.startsWith('readonly ') ||
          trimmed.startsWith('constructor')
        ) {
          return;
        }
        const match = /^([A-Za-z_$][\w$]*)\s*(?::|\()/.exec(trimmed);
        if (!match) {
          return;
        }
        const method = match[1];
        const methodLike = /=>\s*Promise|:\s*[^;]*Promise|Overload|Callback|^\w+\s*\(/.test(trimmed);
        if (!methodLike || (methodFilter && !method.toLowerCase().includes(methodFilter))) {
          return;
        }
        const signature = trimmed.replace(/\s+/g, ' ').slice(0, 500);
        const entry = {
          className,
          method,
          key: `${className}.${method}`,
          source: relPath,
          line: index + 1,
          signature,
          returnsPromise: /Promise\s*</.test(signature),
        };
        classMethods.push(entry);
        methods.push(entry);
      });
      classes.push({
        className,
        source: relPath,
        methodCount: classMethods.length,
        methods: classMethods,
      });
    }
  }

  return { sdkRoot, distRoot, files, classes, methods };
}

function hostRemNoteSdkSurfaceGapReport(payload = {}) {
  const packagePath = path.join(repoRoot, 'node_modules', '@remnote', 'plugin-sdk', 'package.json');
  const packageJson = safeReadJson(packagePath) || {};
  const adapterPath = path.join(repoRoot, 'src', 'api', 'rem-adapter.ts');
  const widgetPath = path.join(repoRoot, 'src', 'widgets', 'index.tsx');
  const adapterSource = fs.existsSync(adapterPath) ? readTextFile(adapterPath) : '';
  const widgetSource = fs.existsSync(widgetPath) ? readTextFile(widgetPath) : '';
  const bridgeActions = widgetSource ? extractBridgeActionsFromWidgetSource(widgetSource) : [];
  const actionSet = new Set(bridgeActions);
  const sdkRemMethodAllowlist = extractNewSetStrings(adapterSource, 'SDK_REM_METHOD_ALLOWLIST').sort();
  const rawRemMethodAllowlist = extractNewSetStrings(adapterSource, 'RAW_REM_CALL_ALLOWLIST').sort();
  const sdkSurface = parseSdkDtsMethodSurface({
    includeReact: payload.includeReact === true,
    namespaceFilter: payload.namespaceFilter,
    methodFilter: payload.methodFilter,
  });
  const coverage = buildBridgeActionCoverageReport({ includeCovered: payload.includeCovered === true });
  const hintByKey = new Map(SDK_METHOD_ACTION_HINTS.map((hint) => [`${hint.className}.${hint.method}`, hint]));
  const remObjectMethods = sdkSurface.methods
    .filter((entry) => entry.className === 'RemObject')
    .map((entry) => entry.method)
    .sort();
  const remObjectMethodSet = new Set(remObjectMethods);
  const allowlistSet = new Set(sdkRemMethodAllowlist);
  const rawAllowlistSet = new Set(rawRemMethodAllowlist);
  const allowlistMissingFromSdk = sdkRemMethodAllowlist.filter((method) => !remObjectMethodSet.has(method));
  const remObjectMissingFromAllowlist = remObjectMethods.filter((method) => !allowlistSet.has(method));

  const methodCoverage = sdkSurface.methods.map((entry) => {
    const hint = hintByKey.get(entry.key);
    const explicitActions = hint ? hint.actions.filter((action) => actionSet.has(action)) : [];
    const allowlisted = entry.className === 'RemObject' && allowlistSet.has(entry.method);
    const rawAllowlisted = entry.className === 'RemObject' && rawAllowlistSet.has(entry.method);
    let status = 'needs_bridge_review';
    if (explicitActions.length > 0) {
      status = 'supported';
    } else if (allowlisted) {
      status = 'generic_rem_sdk_call';
    } else if (entry.className === 'RemObject') {
      status = 'needs_allowlist_or_typed_action_review';
    }
    return {
      ...entry,
      area: hint ? hint.area : 'unmapped_sdk_surface',
      status,
      explicitActions,
      allowlisted,
      rawAllowlisted,
    };
  });

  const maxPotentialGaps = clampNumber(payload.maxPotentialGaps, 80, 1, 500);
  const potentialGaps = methodCoverage
    .filter((entry) => entry.status !== 'supported')
    .slice(0, maxPotentialGaps);
  const methodsByStatus = methodCoverage.reduce((acc, entry) => {
    acc[entry.status] = (acc[entry.status] || 0) + 1;
    return acc;
  }, {});
  const methodsByClass = sdkSurface.classes
    .map((entry) => ({
      className: entry.className,
      source: entry.source,
      methodCount: entry.methodCount,
      supported: methodCoverage.filter((method) => method.className === entry.className && method.status === 'supported').length,
      genericRemSdkCall: methodCoverage.filter((method) => method.className === entry.className && method.status === 'generic_rem_sdk_call').length,
      needsReview: methodCoverage.filter((method) => method.className === entry.className && method.status !== 'supported' && method.status !== 'generic_rem_sdk_call').length,
    }))
    .sort((a, b) => b.methodCount - a.methodCount || a.className.localeCompare(b.className));

  const result = {
    mode: 'host_remnote_sdk_surface_gap_report',
    readOnly: true,
    mutationApplied: false,
    pluginVersion: '2.58.0',
    sdkPackage: {
      name: packageJson.name || '@remnote/plugin-sdk',
      version: packageJson.version || null,
      packagePath: path.relative(repoRoot, packagePath).replace(/\\/g, '/'),
      distRoot: path.relative(repoRoot, sdkSurface.distRoot).replace(/\\/g, '/'),
      typeFilesScanned: sdkSurface.files.length,
    },
    bridgeActions: {
      count: bridgeActions.length,
      actions: payload.includeActions === true ? bridgeActions : undefined,
    },
    actionCoverage: coverage,
    summary: {
      classCount: sdkSurface.classes.length,
      sdkMethodCount: sdkSurface.methods.length,
      remObjectMethodCount: remObjectMethods.length,
      remObjectAllowlistedCount: sdkRemMethodAllowlist.filter((method) => remObjectMethodSet.has(method)).length,
      remObjectMissingFromAllowlistCount: remObjectMissingFromAllowlist.length,
      allowlistMissingFromSdkCount: allowlistMissingFromSdk.length,
      potentialGapCount: methodCoverage.filter((entry) => entry.status !== 'supported').length,
      methodsByStatus,
      bridgeActionCoverage: coverage.summary,
    },
    remObjectAllowlist: {
      sdkRemMethodAllowlist,
      rawRemMethodAllowlist,
      missingFromSdk: allowlistMissingFromSdk,
      missingFromSdkCount: allowlistMissingFromSdk.length,
      missingFromAllowlist: remObjectMissingFromAllowlist,
      missingFromAllowlistCount: remObjectMissingFromAllowlist.length,
    },
    methodsByClass,
    mappedMethods: methodCoverage.filter((entry) => entry.status === 'supported'),
    potentialGaps,
    knownBlocks: [
      {
        area: 'internal_database_write',
        status: 'unsafe_internal_db',
        reason: 'Direct RemNote DB writes remain intentionally unsupported; use SDK mutations plus Safe Migration audit/rollback gates.',
      },
      {
        area: 'native_view_configuration',
        status: 'needs_ui_automation',
        reason: 'Tag/table view column and sort UI state is not represented as a stable SDK type in @remnote/plugin-sdk 0.0.46.',
      },
      {
        area: 'sdk_type_surface',
        status: 'partial',
        reason: 'This report parses local TypeScript declaration files; runtime-only undocumented methods still require targeted Rem SDK probes.',
      },
    ],
    recommendations: [
      'Use potentialGaps as the backlog for typed MCP actions; RemObject entries with generic_rem_sdk_call are callable but still deserve typed actions when they become common workflows.',
      'If allowlistMissingFromSdk is non-empty, review the local @remnote/plugin-sdk version before using rem_sdk_call for those methods.',
      'Keep internal DB work read-only and reconcile DB findings with SDK-visible IDs before any repair plan.',
    ],
  };
  if (payload.includeMethods === true) {
    result.methods = methodCoverage;
  }
  return result;
}

function resolveRemNoteProfilePath(profilePath) {
  if (!process.env.APPDATA) {
    throw new Error('APPDATA is not set; cannot resolve RemNote profile path.');
  }
  const appDataRoot = path.resolve(process.env.APPDATA);
  const target = path.resolve(profilePath || defaultRemNoteProfilePath);
  const relative = path.relative(appDataRoot, target);
  const firstSegment = relative.split(path.sep)[0] || '';
  if (relative.startsWith('..') || path.isAbsolute(relative) || !/^RemNote/i.test(firstSegment)) {
    throw new Error(`Refusing to inspect path outside APPDATA/RemNote*: ${target}`);
  }
  return target;
}

function getDirectorySummary(dirPath, options = {}) {
  const includeFiles = options.includeFiles !== false;
  const maxFiles = Math.max(1, Math.min(Number(options.maxFiles || 40), 500));
  const exists = fs.existsSync(dirPath);
  const summary = {
    path: dirPath,
    exists,
    fileCount: 0,
    totalBytes: 0,
    newestWriteTime: null,
    files: []
  };
  if (!exists) {
    return summary;
  }

  const stack = [dirPath];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const stat = safeReadStat(fullPath);
      if (!stat) {
        continue;
      }
      summary.fileCount += 1;
      summary.totalBytes += stat.size;
      const writeTime = safeIso(stat.mtime);
      if (writeTime && (!summary.newestWriteTime || writeTime > summary.newestWriteTime)) {
        summary.newestWriteTime = writeTime;
      }
      if (includeFiles && summary.files.length < maxFiles) {
        summary.files.push({
          relativePath: path.relative(dirPath, fullPath),
          bytes: stat.size,
          lastWriteTime: writeTime
        });
      }
    }
  }

  return summary;
}

function collectLevelDbFiles(sourceDirs, maxTotalBytes) {
  const allowed = /^(CURRENT|LOG|LOG\.old|LOCK|MANIFEST-\d+|\d+\.(?:ldb|log))$/i;
  const files = [];
  let totalBytes = 0;
  for (const sourceDir of sourceDirs) {
    if (!fs.existsSync(sourceDir)) {
      continue;
    }
    const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !allowed.test(entry.name) || entry.name.toUpperCase() === 'LOCK') {
        continue;
      }
      const fullPath = path.join(sourceDir, entry.name);
      const stat = safeReadStat(fullPath);
      if (!stat) {
        continue;
      }
      if (totalBytes + stat.size > maxTotalBytes) {
        files.push({
          sourcePath: fullPath,
          relativePath: path.join(path.basename(sourceDir), entry.name),
          bytes: stat.size,
          skipped: true,
          reason: 'maxTotalBytes'
        });
        continue;
      }
      files.push({
        sourcePath: fullPath,
        relativePath: path.join(path.basename(sourceDir), entry.name),
        bytes: stat.size,
        lastWriteTime: safeIso(stat.mtime),
        skipped: false
      });
      totalBytes += stat.size;
    }
  }
  return { files, totalBytes };
}

function getClassicLevelCtor() {
  if (!ClassicLevelCtor) {
    ({ ClassicLevel: ClassicLevelCtor } = require('classic-level'));
  }
  if (typeof ClassicLevelCtor !== 'function') {
    throw new Error('classic-level did not expose ClassicLevel constructor.');
  }
  return ClassicLevelCtor;
}

function getLevelDbSnapshotCandidates(profilePath, source) {
  const candidates = [];
  if (source === 'indexeddb-leveldb' || source === 'all-leveldb') {
    candidates.push(path.join(profilePath, 'IndexedDB', 'file__0.indexeddb.leveldb'));
  }
  if (source === 'local-storage-leveldb' || source === 'all-leveldb') {
    candidates.push(path.join(profilePath, 'Local Storage', 'leveldb'));
  }
  if (candidates.length === 0) {
    throw new Error(`Unsupported LevelDB snapshot source: ${source}`);
  }
  return candidates;
}

function createRemNoteLevelDbSnapshot(payload = {}) {
  const profilePath = resolveRemNoteProfilePath(payload.profilePath);
  const source = String(payload.source || 'indexeddb-leveldb');
  const maxTotalBytes = Math.max(1024 * 1024, Math.min(Number(payload.maxTotalBytes || 64 * 1024 * 1024), 512 * 1024 * 1024));
  const snapshotId = sanitizeSnapshotId(payload.snapshotId) || `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  const snapshotPath = path.join(hostDbSnapshotRoot, snapshotId);
  const candidates = getLevelDbSnapshotCandidates(profilePath, source);

  const { files, totalBytes } = collectLevelDbFiles(candidates, maxTotalBytes);
  ensureDir(snapshotPath);
  const copiedFiles = [];
  for (const file of files) {
    if (file.skipped) {
      copiedFiles.push(file);
      continue;
    }
    const targetPath = path.join(snapshotPath, file.relativePath);
    ensureDir(path.dirname(targetPath));
    fs.copyFileSync(file.sourcePath, targetPath);
    copiedFiles.push({
      ...file,
      snapshotRelativePath: path.relative(snapshotPath, targetPath)
    });
  }

  const dbDirectories = candidates.map((candidate) => {
    const relativePath = path.basename(candidate);
    const copiedFileCount = copiedFiles.filter(
      (file) => !file.skipped && file.relativePath.startsWith(`${relativePath}${path.sep}`)
    ).length;
    return {
      sourcePath: candidate,
      relativePath,
      snapshotPath: path.join(snapshotPath, relativePath),
      exists: fs.existsSync(candidate),
      copiedFileCount
    };
  });

  return {
    source,
    profilePath,
    snapshotId,
    snapshotPath,
    maxTotalBytes,
    copiedFiles,
    totalBytes,
    dbDirectories
  };
}

function extractPrintableStrings(buffer, options) {
  const minLength = Math.max(3, Math.min(Number(options.minLength || 8), 120));
  const limit = Math.max(1, Math.min(Number(options.limit || 100), 1000));
  const query = typeof options.query === 'string' && options.query.trim()
    ? options.query.trim().toLocaleLowerCase('tr-TR')
    : '';
  const text = buffer.toString('utf8');
  const rows = [];
  const regex = new RegExp(`[\\x20-\\x7E]{${minLength},}`, 'g');
  let match;
  while ((match = regex.exec(text)) && rows.length < limit) {
    const value = match[0].replace(/\s+/g, ' ').trim();
    if (!value || (query && !value.toLocaleLowerCase('tr-TR').includes(query))) {
      continue;
    }
    rows.push({
      charOffset: match.index,
      text: value.slice(0, 500)
    });
  }
  return rows;
}

function previewBuffer(buffer, options = {}) {
  const value = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  const maxChars = Math.max(40, Math.min(Number(options.maxChars || 500), 2000));
  const maxHexBytes = Math.max(8, Math.min(Number(options.maxHexBytes || 96), 512));
  const utf8Preview = value
    .toString('utf8')
    .replace(/\u0000/g, ' ')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxChars);
  const utf16LePreview = getUtf16LePreview(value, maxChars);
  return {
    bytes: value.length,
    utf8Preview: utf8Preview || null,
    utf16LePreview,
    hexPrefix: value.subarray(0, maxHexBytes).toString('hex')
  };
}

function getUtf16LePreview(buffer, maxChars) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8) {
    return null;
  }
  const sampleLength = Math.min(buffer.length - (buffer.length % 2), 512);
  let asciiPairs = 0;
  for (let i = 0; i + 1 < sampleLength; i += 2) {
    if (buffer[i + 1] === 0 && buffer[i] >= 32 && buffer[i] <= 126) {
      asciiPairs += 1;
    }
  }
  if (asciiPairs < 4) {
    return null;
  }
  const evenLength = buffer.length - (buffer.length % 2);
  const preview = buffer
    .subarray(0, evenLength)
    .toString('utf16le')
    .replace(/\u0000/g, ' ')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxChars);
  return preview || null;
}

function previewSearchText(...previews) {
  return previews
    .flat()
    .filter(Boolean)
    .flatMap((preview) => [preview.utf8Preview, preview.utf16LePreview, preview.hexPrefix])
    .filter(Boolean)
    .join('\n')
    .toLocaleLowerCase('tr-TR');
}

function formatError(err) {
  const message = err instanceof Error ? err.message : String(err);
  const cause = err && err.cause
    ? (err.cause instanceof Error ? err.cause.message : String(err.cause))
    : '';
  return cause ? `${message}: ${cause}` : message;
}

function readVarint(buffer, offset, end = buffer.length) {
  let value = 0;
  let shift = 0;
  let cursor = offset;
  while (cursor < end && shift <= 49) {
    const byte = buffer[cursor];
    value += (byte & 0x7f) * Math.pow(2, shift);
    cursor += 1;
    if ((byte & 0x80) === 0) {
      return { value, next: cursor };
    }
    shift += 7;
  }
  throw new Error('Invalid varint');
}

function readLengthPrefixedSlice(buffer, offset, end = buffer.length) {
  const lengthInfo = readVarint(buffer, offset, end);
  const valueStart = lengthInfo.next;
  const valueEnd = valueStart + lengthInfo.value;
  if (valueEnd > end) {
    throw new Error('Invalid length-prefixed slice bounds');
  }
  return {
    value: buffer.subarray(valueStart, valueEnd),
    next: valueEnd
  };
}

function readBlockHandle(buffer, offset = 0, end = buffer.length) {
  const blockOffset = readVarint(buffer, offset, end);
  const blockSize = readVarint(buffer, blockOffset.next, end);
  return {
    offset: blockOffset.value,
    size: blockSize.value,
    next: blockSize.next
  };
}

function decodeSnappy(buffer) {
  const lengthInfo = readVarint(buffer, 0);
  const output = Buffer.alloc(lengthInfo.value);
  let inputOffset = lengthInfo.next;
  let outputOffset = 0;

  while (inputOffset < buffer.length) {
    const tag = buffer[inputOffset];
    inputOffset += 1;
    const type = tag & 0x03;

    if (type === 0) {
      let length = tag >> 2;
      if (length < 60) {
        length += 1;
      } else {
        const lengthBytes = length - 59;
        if (inputOffset + lengthBytes > buffer.length) {
          throw new Error('Invalid snappy literal length');
        }
        length = 0;
        for (let i = 0; i < lengthBytes; i += 1) {
          length += buffer[inputOffset + i] << (8 * i);
        }
        inputOffset += lengthBytes;
        length += 1;
      }
      if (inputOffset + length > buffer.length || outputOffset + length > output.length) {
        throw new Error('Invalid snappy literal bounds');
      }
      buffer.copy(output, outputOffset, inputOffset, inputOffset + length);
      inputOffset += length;
      outputOffset += length;
      continue;
    }

    let length;
    let copyOffset;
    if (type === 1) {
      if (inputOffset >= buffer.length) {
        throw new Error('Invalid snappy copy1 bounds');
      }
      length = 4 + ((tag >> 2) & 0x07);
      copyOffset = ((tag & 0xe0) << 3) | buffer[inputOffset];
      inputOffset += 1;
    } else if (type === 2) {
      if (inputOffset + 2 > buffer.length) {
        throw new Error('Invalid snappy copy2 bounds');
      }
      length = 1 + (tag >> 2);
      copyOffset = buffer.readUInt16LE(inputOffset);
      inputOffset += 2;
    } else {
      if (inputOffset + 4 > buffer.length) {
        throw new Error('Invalid snappy copy4 bounds');
      }
      length = 1 + (tag >> 2);
      copyOffset = buffer.readUInt32LE(inputOffset);
      inputOffset += 4;
    }

    if (copyOffset <= 0 || copyOffset > outputOffset || outputOffset + length > output.length) {
      throw new Error('Invalid snappy copy offset');
    }
    for (let i = 0; i < length; i += 1) {
      output[outputOffset + i] = output[outputOffset - copyOffset + i];
    }
    outputOffset += length;
  }

  if (outputOffset !== output.length) {
    throw new Error('Invalid snappy output length');
  }
  return output;
}

function readLevelDbTableBlock(fileBuffer, handle) {
  if (handle.offset < 0 || handle.size < 0 || handle.offset + handle.size + 5 > fileBuffer.length) {
    throw new Error('Invalid LevelDB block handle bounds');
  }
  const raw = fileBuffer.subarray(handle.offset, handle.offset + handle.size);
  const compressionType = fileBuffer[handle.offset + handle.size];
  if (compressionType === 0) {
    return raw;
  }
  if (compressionType === 1) {
    return decodeSnappy(raw);
  }
  throw new Error(`Unsupported LevelDB block compression type: ${compressionType}`);
}

function parseLevelDbBlockEntries(block) {
  if (block.length < 4) {
    throw new Error('LevelDB block is too small');
  }
  const restartCount = block.readUInt32LE(block.length - 4);
  const restartsOffset = block.length - 4 - restartCount * 4;
  if (restartCount < 1 || restartsOffset < 0 || restartsOffset > block.length - 4) {
    throw new Error('Invalid LevelDB block restart table');
  }

  const entries = [];
  let cursor = 0;
  let previousKey = Buffer.alloc(0);
  while (cursor < restartsOffset) {
    const shared = readVarint(block, cursor, restartsOffset);
    const unshared = readVarint(block, shared.next, restartsOffset);
    const valueLength = readVarint(block, unshared.next, restartsOffset);
    cursor = valueLength.next;
    if (shared.value > previousKey.length || cursor + unshared.value + valueLength.value > restartsOffset) {
      throw new Error('Invalid LevelDB block entry bounds');
    }
    const key = Buffer.concat([
      previousKey.subarray(0, shared.value),
      block.subarray(cursor, cursor + unshared.value)
    ]);
    cursor += unshared.value;
    const value = block.subarray(cursor, cursor + valueLength.value);
    cursor += valueLength.value;
    previousKey = key;
    entries.push({ key, value });
  }
  return entries;
}

function decodeLevelDbTableFile(filePath, options = {}) {
  const fileBuffer = fs.readFileSync(filePath);
  if (fileBuffer.length < 48) {
    throw new Error('LevelDB table file is too small');
  }
  const footer = fileBuffer.subarray(fileBuffer.length - 48);
  const metaIndexHandle = readBlockHandle(footer, 0, footer.length - 8);
  const indexHandle = readBlockHandle(footer, metaIndexHandle.next, footer.length - 8);
  const indexBlock = readLevelDbTableBlock(fileBuffer, indexHandle);
  const indexEntries = parseLevelDbBlockEntries(indexBlock);
  const limit = Math.max(1, Math.min(Number(options.limit || 50), 500));
  const maxInspected = Math.max(limit, Math.min(Number(options.maxInspected || 2000), 20000));
  const includeValues = options.includeValues !== false;
  const query = typeof options.query === 'string' && options.query.trim()
    ? options.query.trim().toLocaleLowerCase('tr-TR')
    : '';
  const rows = [];
  let inspected = 0;
  const errors = [];

  for (let blockIndex = 0; blockIndex < indexEntries.length && inspected < maxInspected && rows.length < limit; blockIndex += 1) {
    let dataHandle;
    let dataEntries;
    try {
      dataHandle = readBlockHandle(indexEntries[blockIndex].value);
      dataEntries = parseLevelDbBlockEntries(readLevelDbTableBlock(fileBuffer, dataHandle));
    } catch (err) {
      errors.push({
        blockIndex,
        error: formatError(err)
      });
      continue;
    }

    for (let entryIndex = 0; entryIndex < dataEntries.length && inspected < maxInspected && rows.length < limit; entryIndex += 1) {
      inspected += 1;
      const entry = dataEntries[entryIndex];
      const keyPreview = previewBuffer(entry.key, options);
      const valuePreview = previewBuffer(entry.value, options);
      const haystack = previewSearchText(keyPreview, valuePreview);
      if (query && !haystack.includes(query)) {
        continue;
      }
      rows.push({
        file: path.basename(filePath),
        blockIndex,
        entryIndex,
        key: keyPreview,
        value: includeValues ? valuePreview : { bytes: valuePreview.bytes }
      });
    }
  }

  return {
    engine: 'sstable_block_scan',
    file: path.basename(filePath),
    bytes: fileBuffer.length,
    indexBlockCount: indexEntries.length,
    inspected,
    returned: rows.length,
    errors,
    rows
  };
}

function decodeLevelDbTableFiles(dbDirectory, copiedFiles, options = {}) {
  const limit = Math.max(1, Math.min(Number(options.limit || 50), 500));
  const maxInspected = Math.max(limit, Math.min(Number(options.maxInspected || 2000), 20000));
  const rows = [];
  const files = [];
  let inspected = 0;
  const ldbFiles = copiedFiles
    .filter((file) => !file.skipped && file.snapshotRelativePath && file.snapshotRelativePath.startsWith(`${dbDirectory.relativePath}${path.sep}`) && /\.ldb$/i.test(file.snapshotRelativePath))
    .sort((a, b) => String(a.snapshotRelativePath).localeCompare(String(b.snapshotRelativePath)));

  for (const copied of ldbFiles) {
    if (rows.length >= limit || inspected >= maxInspected) {
      break;
    }
    const filePath = path.join(path.dirname(dbDirectory.snapshotPath), copied.snapshotRelativePath);
    try {
      const decoded = decodeLevelDbTableFile(filePath, {
        ...options,
        limit: limit - rows.length,
        maxInspected: maxInspected - inspected
      });
      inspected += decoded.inspected;
      rows.push(...decoded.rows.map((row) => ({
        database: dbDirectory.relativePath,
        ...row
      })));
      files.push({
        file: copied.snapshotRelativePath,
        engine: decoded.engine,
        bytes: decoded.bytes,
        indexBlockCount: decoded.indexBlockCount,
        inspected: decoded.inspected,
        returned: decoded.returned,
        errors: decoded.errors.slice(0, 10)
      });
    } catch (err) {
      files.push({
        file: copied.snapshotRelativePath,
        error: formatError(err)
      });
    }
  }

  return {
    engine: 'sstable_block_scan',
    attemptedFileCount: ldbFiles.length,
    inspected,
    returned: rows.length,
    files,
    rows
  };
}

function parseLevelDbWriteBatch(record, options = {}) {
  if (!Buffer.isBuffer(record) || record.length < 12) {
    throw new Error('Malformed WriteBatch: too small');
  }
  const maxOps = Math.max(1, Math.min(Number(options.maxOpsPerBatch || 1000), 10000));
  const sequenceBase = record.readBigUInt64LE(0);
  const declaredCount = record.readUInt32LE(8);
  const operations = [];
  let cursor = 12;
  let parsedCount = 0;

  while (cursor < record.length && parsedCount < maxOps) {
    const tag = record[cursor];
    cursor += 1;
    parsedCount += 1;

    if (tag === 1) {
      const key = readLengthPrefixedSlice(record, cursor);
      const value = readLengthPrefixedSlice(record, key.next);
      cursor = value.next;
      operations.push({
        type: 'put',
        sequence: (sequenceBase + BigInt(parsedCount - 1)).toString(),
        key: key.value,
        value: value.value
      });
      continue;
    }

    if (tag === 0) {
      const key = readLengthPrefixedSlice(record, cursor);
      cursor = key.next;
      operations.push({
        type: 'delete',
        sequence: (sequenceBase + BigInt(parsedCount - 1)).toString(),
        key: key.value,
        value: null
      });
      continue;
    }

    throw new Error(`Unknown WriteBatch tag: ${tag}`);
  }

  return {
    sequence: sequenceBase.toString(),
    declaredCount,
    parsedCount,
    truncated: cursor < record.length || parsedCount < declaredCount,
    operations
  };
}

function decodeLevelDbLogFile(filePath, options = {}) {
  const fileBuffer = fs.readFileSync(filePath);
  const limit = Math.max(1, Math.min(Number(options.limit || 50), 500));
  const maxInspected = Math.max(limit, Math.min(Number(options.maxInspected || 2000), 20000));
  const includeValues = options.includeValues !== false;
  const query = typeof options.query === 'string' && options.query.trim()
    ? options.query.trim().toLocaleLowerCase('tr-TR')
    : '';
  const blockSize = 32768;
  const headerSize = 7;
  const rows = [];
  const errors = [];
  let blockStart = 0;
  let physicalRecordCount = 0;
  let logicalRecordCount = 0;
  let inspected = 0;
  let fragments = [];
  let fragmentStartOffset = 0;

  const pushError = (offset, error) => {
    if (errors.length < 50) {
      errors.push({ offset, error });
    }
  };

  const processLogicalRecord = (record, logicalOffset) => {
    logicalRecordCount += 1;
    let batch;
    try {
      batch = parseLevelDbWriteBatch(record, options);
    } catch (err) {
      pushError(logicalOffset, formatError(err));
      return;
    }

    for (let operationIndex = 0; operationIndex < batch.operations.length && inspected < maxInspected && rows.length < limit; operationIndex += 1) {
      const operation = batch.operations[operationIndex];
      inspected += 1;
      const keyPreview = previewBuffer(operation.key, options);
      const valuePreview = operation.value ? previewBuffer(operation.value, options) : null;
      const haystack = previewSearchText(keyPreview, valuePreview);
      if (query && !haystack.includes(query)) {
        continue;
      }
      rows.push({
        file: path.basename(filePath),
        logicalOffset,
        logicalRecordIndex: logicalRecordCount - 1,
        operationIndex,
        sequence: operation.sequence,
        batchSequence: batch.sequence,
        declaredBatchCount: batch.declaredCount,
        parsedBatchCount: batch.parsedCount,
        type: operation.type,
        key: keyPreview,
        value: valuePreview && includeValues ? valuePreview : (valuePreview ? { bytes: valuePreview.bytes } : null)
      });
    }
  };

  while (blockStart < fileBuffer.length && inspected < maxInspected && rows.length < limit) {
    const blockEnd = Math.min(blockStart + blockSize, fileBuffer.length);
    let cursor = blockStart;

    while (cursor + headerSize <= blockEnd && inspected < maxInspected && rows.length < limit) {
      const recordOffset = cursor;
      const length = fileBuffer.readUInt16LE(cursor + 4);
      const type = fileBuffer[cursor + 6];
      cursor += headerSize;

      if (type === 0 && length === 0) {
        cursor = blockEnd;
        break;
      }
      if (cursor + length > blockEnd) {
        pushError(recordOffset, 'Physical log record exceeds block boundary');
        cursor = blockEnd;
        break;
      }

      const fragment = fileBuffer.subarray(cursor, cursor + length);
      cursor += length;
      physicalRecordCount += 1;

      if (type === 1) {
        if (fragments.length > 0) {
          pushError(recordOffset, 'Full record arrived before fragmented record ended');
          fragments = [];
        }
        processLogicalRecord(fragment, recordOffset);
      } else if (type === 2) {
        fragments = [fragment];
        fragmentStartOffset = recordOffset;
      } else if (type === 3) {
        if (fragments.length === 0) {
          pushError(recordOffset, 'Middle fragment without first fragment');
        } else {
          fragments.push(fragment);
        }
      } else if (type === 4) {
        if (fragments.length === 0) {
          pushError(recordOffset, 'Last fragment without first fragment');
        } else {
          fragments.push(fragment);
          processLogicalRecord(Buffer.concat(fragments), fragmentStartOffset);
          fragments = [];
        }
      } else {
        pushError(recordOffset, `Unknown physical log record type: ${type}`);
        fragments = [];
      }
    }

    blockStart += blockSize;
  }

  return {
    engine: 'leveldb_log_writebatch_scan',
    file: path.basename(filePath),
    bytes: fileBuffer.length,
    physicalRecordCount,
    logicalRecordCount,
    inspected,
    returned: rows.length,
    errors,
    rows
  };
}

function decodeLevelDbLogFiles(dbDirectory, copiedFiles, options = {}) {
  const limit = Math.max(1, Math.min(Number(options.limit || 50), 500));
  const maxInspected = Math.max(limit, Math.min(Number(options.maxInspected || 2000), 20000));
  const rows = [];
  const files = [];
  let inspected = 0;
  const logFiles = copiedFiles
    .filter((file) => !file.skipped && file.snapshotRelativePath && file.snapshotRelativePath.startsWith(`${dbDirectory.relativePath}${path.sep}`) && /\d+\.log$/i.test(file.snapshotRelativePath))
    .sort((a, b) => String(a.snapshotRelativePath).localeCompare(String(b.snapshotRelativePath)));

  for (const copied of logFiles) {
    if (rows.length >= limit || inspected >= maxInspected) {
      break;
    }
    const filePath = path.join(path.dirname(dbDirectory.snapshotPath), copied.snapshotRelativePath);
    try {
      const decoded = decodeLevelDbLogFile(filePath, {
        ...options,
        limit: limit - rows.length,
        maxInspected: maxInspected - inspected
      });
      inspected += decoded.inspected;
      rows.push(...decoded.rows.map((row) => ({
        database: dbDirectory.relativePath,
        ...row
      })));
      files.push({
        file: copied.snapshotRelativePath,
        engine: decoded.engine,
        bytes: decoded.bytes,
        physicalRecordCount: decoded.physicalRecordCount,
        logicalRecordCount: decoded.logicalRecordCount,
        inspected: decoded.inspected,
        returned: decoded.returned,
        errors: decoded.errors.slice(0, 10)
      });
    } catch (err) {
      files.push({
        file: copied.snapshotRelativePath,
        error: formatError(err)
      });
    }
  }

  return {
    engine: 'leveldb_log_writebatch_scan',
    attemptedFileCount: logFiles.length,
    inspected,
    returned: rows.length,
    files,
    rows
  };
}

function normalizeEntityText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function previewToText(preview) {
  if (!preview) {
    return '';
  }
  return [preview.utf16LePreview, preview.utf8Preview]
    .filter(Boolean)
    .map(normalizeEntityText)
    .filter(Boolean)
    .join(' ');
}

function extractEntityIdCandidates(text) {
  const raw = normalizeEntityText(text);
  const seen = new Set();
  const ids = [];

  const add = (candidate) => {
    const entityId = String(candidate || '').trim();
    const hasLetter = /[A-Za-z]/.test(entityId);
    const hasDigit = /\d/.test(entityId);
    const hasForbiddenWord = /undefined|false|true|null|table|cell|row|node|select|text|date|image|number|placeholder/i.test(entityId);
    if (!/^[A-Za-z0-9]{17}$/.test(entityId) || !hasLetter || !hasDigit || hasForbiddenWord || seen.has(entityId)) {
      return;
    }
    seen.add(entityId);
    ids.push(entityId);
  };

  for (const match of raw.matchAll(/\bB\s+([A-Za-z0-9]{17})::/g)) {
    add(match[1]);
  }
  for (const match of raw.matchAll(/(?:^|[\s:])([A-Za-z0-9]{17})(?=$|[\s:])/g)) {
    add(match[1]);
  }
  for (const match of raw.matchAll(/-([A-Za-z0-9]{17,120})/g)) {
    const run = match[1];
    for (let index = 0; index + 17 <= run.length; index += 17) {
      add(run.slice(index, index + 17));
    }
  }

  if (ids.length === 0) {
    for (const match of raw.matchAll(/[A-Za-z0-9_-]{12,24}/g)) {
      const fallback = match[0].replace(/[^A-Za-z0-9]/g, '');
      if (fallback.length !== 17) {
        continue;
      }
      add(fallback);
    }
  }

  return ids;
}

function inferRemNoteRecordKind(text, row) {
  const normalized = normalizeEntityText(text);
  const knownKinds = [
    'table_row_handle_node',
    'table_row_node',
    'table_cell-single_select',
    'table_cell-multi_select',
    'table_cell-text',
    'table_add_column_placeholder',
    'table_add_row_placeholder'
  ];
  for (const kind of knownKinds) {
    if (normalized.includes(kind)) {
      return kind;
    }
  }
  const doubleColon = normalized.match(/::([A-Za-z][A-Za-z0-9_-]{2,60})/);
  if (doubleColon) {
    const suffix = doubleColon[1];
    if (suffix.includes('table_')) {
      return suffix.split(/[^A-Za-z0-9_-]/)[0];
    }
    return 'composite_key';
  }
  if (row.type === 'put') {
    return 'writebatch_put';
  }
  if (row.type === 'delete') {
    return 'writebatch_delete';
  }
  if (row.blockIndex !== undefined) {
    return 'sstable_entry';
  }
  return 'unknown';
}

function buildEntityIndex(decodedRows, options = {}) {
  const maxRows = Math.max(1, Math.min(Number(options.maxRows || 200), 2000));
  const maxEntities = Math.max(1, Math.min(Number(options.maxEntities || 200), 2000));
  const maxEdges = Math.max(1, Math.min(Number(options.maxEdges || 500), 5000));
  const includeRows = options.includeRows !== false;
  const entities = new Map();
  const edgeMap = new Map();
  const rows = [];
  let indexedRowCount = 0;

  const ensureEntity = (entityId) => {
    if (!entities.has(entityId)) {
      entities.set(entityId, {
        entityId,
        seenCount: 0,
        recordKinds: new Set(),
        sources: new Set(),
        sampleTexts: []
      });
    }
    return entities.get(entityId);
  };

  for (const row of decodedRows.slice(0, maxRows)) {
    const keyText = previewToText(row.key);
    const valueText = previewToText(row.value);
    const allText = normalizeEntityText(`${keyText} ${valueText}`);
    const entityIds = extractEntityIdCandidates(allText);
    if (entityIds.length === 0) {
      continue;
    }

    indexedRowCount += 1;
    const recordKind = inferRemNoteRecordKind(allText, row);
    const source = row.source || (row.type ? 'log' : 'table');
    const sampleText = allText.slice(0, 240);

    for (const entityId of entityIds) {
      const entity = ensureEntity(entityId);
      entity.seenCount += 1;
      entity.recordKinds.add(recordKind);
      entity.sources.add(source);
      if (entity.sampleTexts.length < 3 && sampleText) {
        entity.sampleTexts.push(sampleText);
      }
    }

    for (let i = 0; i < entityIds.length; i += 1) {
      for (let j = i + 1; j < entityIds.length; j += 1) {
        const from = entityIds[i];
        const to = entityIds[j];
        const edgeKey = from < to ? `${from}\u0000${to}` : `${to}\u0000${from}`;
        const existing = edgeMap.get(edgeKey) || {
          from: from < to ? from : to,
          to: from < to ? to : from,
          relationship: 'co_occurs_in_leveldb_record',
          count: 0,
          recordKinds: new Set(),
          sources: new Set()
        };
        existing.count += 1;
        existing.recordKinds.add(recordKind);
        existing.sources.add(source);
        edgeMap.set(edgeKey, existing);
      }
    }

    if (includeRows) {
      rows.push({
        source,
        database: row.database || null,
        file: row.file || null,
        recordKind,
        entityIds,
        primaryEntityId: entityIds[0],
        type: row.type || null,
        sequence: row.sequence || null,
        blockIndex: row.blockIndex ?? null,
        entryIndex: row.entryIndex ?? null,
        keyPreview: row.key || null,
        valuePreview: row.value || null
      });
    }
  }

  const entityRows = Array.from(entities.values())
    .sort((a, b) => b.seenCount - a.seenCount || a.entityId.localeCompare(b.entityId))
    .slice(0, maxEntities)
    .map((entity) => ({
      entityId: entity.entityId,
      seenCount: entity.seenCount,
      recordKinds: Array.from(entity.recordKinds).sort(),
      sources: Array.from(entity.sources).sort(),
      sampleTexts: entity.sampleTexts
    }));

  const edges = Array.from(edgeMap.values())
    .sort((a, b) => b.count - a.count || a.from.localeCompare(b.from))
    .slice(0, maxEdges)
    .map((edge) => ({
      from: edge.from,
      to: edge.to,
      relationship: edge.relationship,
      count: edge.count,
      recordKinds: Array.from(edge.recordKinds).sort(),
      sources: Array.from(edge.sources).sort()
    }));

  return {
    heuristic: true,
    indexedRowCount,
    entityCount: entityRows.length,
    edgeCount: edges.length,
    entities: entityRows,
    edges,
    rows
  };
}

function getRemNoteDbInventory(payload = {}) {
  const profilePath = resolveRemNoteProfilePath(payload.profilePath);
  const includeFiles = payload.includeFiles !== false;
  const maxFiles = Math.max(1, Math.min(Number(payload.maxFiles || 40), 500));
  const indexedDbLevelDbPath = path.join(profilePath, 'IndexedDB', 'file__0.indexeddb.leveldb');
  const indexedDbBlobPath = path.join(profilePath, 'IndexedDB', 'file__0.indexeddb.blob');
  const localStorageLevelDbPath = path.join(profilePath, 'Local Storage', 'leveldb');

  return {
    readOnly: true,
    mode: 'host_remnote_db_inventory',
    profilePath,
    paths: {
      indexedDbLevelDbPath,
      indexedDbBlobPath,
      localStorageLevelDbPath,
      snapshotRoot: hostDbSnapshotRoot
    },
    directories: {
      indexedDbLevelDb: getDirectorySummary(indexedDbLevelDbPath, { includeFiles, maxFiles }),
      indexedDbBlob: getDirectorySummary(indexedDbBlobPath, { includeFiles, maxFiles }),
      localStorageLevelDb: getDirectorySummary(localStorageLevelDbPath, { includeFiles, maxFiles })
    }
  };
}

function scanRemNoteLevelDbSnapshot(payload = {}) {
  const snapshot = createRemNoteLevelDbSnapshot(payload);
  const {
    source,
    profilePath,
    snapshotId,
    snapshotPath,
    maxTotalBytes,
    copiedFiles,
    totalBytes
  } = snapshot;

  const limit = Math.max(1, Math.min(Number(payload.limit || 100), 1000));
  const scanRows = [];
  for (const copied of copiedFiles) {
    if (copied.skipped || !copied.snapshotRelativePath || scanRows.length >= limit) {
      continue;
    }
    const targetPath = path.join(snapshotPath, copied.snapshotRelativePath);
    let fileRows = [];
    try {
      fileRows = extractPrintableStrings(fs.readFileSync(targetPath), {
        query: payload.query,
        minLength: payload.minLength,
        limit: limit - scanRows.length
      });
    } catch (err) {
      scanRows.push({
        file: copied.snapshotRelativePath,
        error: err instanceof Error ? err.message : String(err)
      });
      continue;
    }
    for (const row of fileRows) {
      scanRows.push({
        file: copied.snapshotRelativePath,
        ...row
      });
      if (scanRows.length >= limit) {
        break;
      }
    }
  }

  return {
    readOnly: true,
    snapshot: true,
    mode: 'host_remnote_leveldb_snapshot_scan',
    source,
    profilePath,
    snapshotId,
    snapshotPath,
    maxTotalBytes,
    copiedFileCount: copiedFiles.filter((file) => !file.skipped).length,
    skippedFileCount: copiedFiles.filter((file) => file.skipped).length,
    copiedBytes: totalBytes,
    query: payload.query || null,
    returned: scanRows.length,
    files: copiedFiles.map((file) => ({
      relativePath: file.relativePath,
      snapshotRelativePath: file.snapshotRelativePath || null,
      bytes: file.bytes,
      lastWriteTime: file.lastWriteTime || null,
      skipped: Boolean(file.skipped),
      reason: file.reason || null
    })),
    rows: scanRows
  };
}

async function decodeRemNoteLevelDbSnapshot(payload = {}) {
  const snapshot = createRemNoteLevelDbSnapshot(payload);
  const limit = Math.max(1, Math.min(Number(payload.limit || 50), 500));
  const maxInspected = Math.max(limit, Math.min(Number(payload.maxInspected || 2000), 20000));
  const includeValues = payload.includeValues !== false;
  const query = typeof payload.query === 'string' && payload.query.trim()
    ? payload.query.trim().toLocaleLowerCase('tr-TR')
    : '';
  const rows = [];
  const databases = [];
  let decoded = false;

  for (const dbDirectory of snapshot.dbDirectories) {
    const databaseSummary = {
      relativePath: dbDirectory.relativePath,
      snapshotPath: dbDirectory.snapshotPath,
      copiedFileCount: dbDirectory.copiedFileCount,
      attempted: dbDirectory.copiedFileCount > 0,
      opened: false,
      inspected: 0,
      returned: 0,
      error: null
    };
    databases.push(databaseSummary);
    if (rows.length >= limit || dbDirectory.copiedFileCount === 0) {
      continue;
    }

    let db = null;
    try {
      const ClassicLevel = getClassicLevelCtor();
      db = new ClassicLevel(dbDirectory.snapshotPath, {
        keyEncoding: 'buffer',
        valueEncoding: 'buffer'
      });
      await db.open();
      databaseSummary.opened = true;
      decoded = true;

      for await (const [key, value] of db.iterator()) {
        databaseSummary.inspected += 1;
        const keyPreview = previewBuffer(key, payload);
        const valuePreview = previewBuffer(value, payload);
        const haystack = previewSearchText(keyPreview, valuePreview);
        if (!query || haystack.includes(query)) {
          rows.push({
            database: dbDirectory.relativePath,
            index: rows.length,
            key: keyPreview,
            value: includeValues ? valuePreview : { bytes: valuePreview.bytes }
          });
          databaseSummary.returned += 1;
          if (rows.length >= limit) {
            break;
          }
        }
        if (databaseSummary.inspected >= maxInspected) {
          break;
        }
      }
    } catch (err) {
      databaseSummary.error = formatError(err);
      const fallback = decodeLevelDbTableFiles(dbDirectory, snapshot.copiedFiles, {
        ...payload,
        limit: limit - rows.length,
        maxInspected: maxInspected - databaseSummary.inspected,
        includeValues
      });
      databaseSummary.fallback = {
        engine: fallback.engine,
        attemptedFileCount: fallback.attemptedFileCount,
        inspected: fallback.inspected,
        returned: fallback.returned,
        files: fallback.files
      };
      databaseSummary.inspected += fallback.inspected;
      databaseSummary.returned += fallback.returned;
      if (fallback.inspected > 0) {
        decoded = true;
      }
      for (const row of fallback.rows) {
        rows.push({
          index: rows.length,
          ...row
        });
      }
    } finally {
      if (db) {
        try {
          await db.close();
        } catch (err) {
          if (!databaseSummary.error) {
            databaseSummary.error = formatError(err);
          }
        }
      }
    }
  }

  return {
    readOnly: true,
    snapshot: true,
    mode: 'host_remnote_leveldb_decode',
    source: snapshot.source,
    profilePath: snapshot.profilePath,
    snapshotId: snapshot.snapshotId,
    snapshotPath: snapshot.snapshotPath,
    maxTotalBytes: snapshot.maxTotalBytes,
    maxInspected,
    includeValues,
    decoded,
    copiedFileCount: snapshot.copiedFiles.filter((file) => !file.skipped).length,
    skippedFileCount: snapshot.copiedFiles.filter((file) => file.skipped).length,
    copiedBytes: snapshot.totalBytes,
    query: payload.query || null,
    returned: rows.length,
    databases,
    files: snapshot.copiedFiles.map((file) => ({
      relativePath: file.relativePath,
      snapshotRelativePath: file.snapshotRelativePath || null,
      bytes: file.bytes,
      lastWriteTime: file.lastWriteTime || null,
      skipped: Boolean(file.skipped),
      reason: file.reason || null
    })),
    rows
  };
}

function decodeRemNoteLevelDbLogs(payload = {}) {
  const snapshot = createRemNoteLevelDbSnapshot(payload);
  const limit = Math.max(1, Math.min(Number(payload.limit || 50), 500));
  const maxInspected = Math.max(limit, Math.min(Number(payload.maxInspected || 2000), 20000));
  const includeValues = payload.includeValues !== false;
  const rows = [];
  const databases = [];
  let decoded = false;

  for (const dbDirectory of snapshot.dbDirectories) {
    const databaseSummary = {
      relativePath: dbDirectory.relativePath,
      snapshotPath: dbDirectory.snapshotPath,
      copiedFileCount: dbDirectory.copiedFileCount,
      attempted: dbDirectory.copiedFileCount > 0,
      inspected: 0,
      returned: 0,
      logFileCount: 0,
      files: []
    };
    databases.push(databaseSummary);
    if (rows.length >= limit || dbDirectory.copiedFileCount === 0) {
      continue;
    }

    const decodedLogs = decodeLevelDbLogFiles(dbDirectory, snapshot.copiedFiles, {
      ...payload,
      limit: limit - rows.length,
      maxInspected: maxInspected - databaseSummary.inspected,
      includeValues
    });
    databaseSummary.logFileCount = decodedLogs.attemptedFileCount;
    databaseSummary.inspected = decodedLogs.inspected;
    databaseSummary.returned = decodedLogs.returned;
    databaseSummary.files = decodedLogs.files;
    if (decodedLogs.inspected > 0) {
      decoded = true;
    }
    for (const row of decodedLogs.rows) {
      rows.push({
        index: rows.length,
        ...row
      });
    }
  }

  return {
    readOnly: true,
    snapshot: true,
    mode: 'host_remnote_leveldb_log_decode',
    source: snapshot.source,
    profilePath: snapshot.profilePath,
    snapshotId: snapshot.snapshotId,
    snapshotPath: snapshot.snapshotPath,
    maxTotalBytes: snapshot.maxTotalBytes,
    maxInspected,
    includeValues,
    decoded,
    copiedFileCount: snapshot.copiedFiles.filter((file) => !file.skipped).length,
    skippedFileCount: snapshot.copiedFiles.filter((file) => file.skipped).length,
    copiedBytes: snapshot.totalBytes,
    query: payload.query || null,
    returned: rows.length,
    databases,
    files: snapshot.copiedFiles.map((file) => ({
      relativePath: file.relativePath,
      snapshotRelativePath: file.snapshotRelativePath || null,
      bytes: file.bytes,
      lastWriteTime: file.lastWriteTime || null,
      skipped: Boolean(file.skipped),
      reason: file.reason || null
    })),
    rows
  };
}

function buildRemNoteLevelDbEntityIndex(payload = {}) {
  const snapshot = createRemNoteLevelDbSnapshot(payload);
  const limit = Math.max(1, Math.min(Number(payload.limit || 250), 2000));
  const maxInspected = Math.max(limit, Math.min(Number(payload.maxInspected || 4000), 40000));
  const includeTables = payload.includeTables !== false;
  const includeLogs = payload.includeLogs !== false;
  const includeValues = payload.includeValues !== false;
  const decodedRows = [];
  const databases = [];
  let inspected = 0;

  for (const dbDirectory of snapshot.dbDirectories) {
    const databaseSummary = {
      relativePath: dbDirectory.relativePath,
      snapshotPath: dbDirectory.snapshotPath,
      copiedFileCount: dbDirectory.copiedFileCount,
      attempted: dbDirectory.copiedFileCount > 0,
      table: null,
      log: null
    };
    databases.push(databaseSummary);
    if (decodedRows.length >= limit || inspected >= maxInspected || dbDirectory.copiedFileCount === 0) {
      continue;
    }

    if (includeTables) {
      const tableDecoded = decodeLevelDbTableFiles(dbDirectory, snapshot.copiedFiles, {
        ...payload,
        limit: limit - decodedRows.length,
        maxInspected: maxInspected - inspected,
        includeValues
      });
      inspected += tableDecoded.inspected;
      databaseSummary.table = {
        engine: tableDecoded.engine,
        attemptedFileCount: tableDecoded.attemptedFileCount,
        inspected: tableDecoded.inspected,
        returned: tableDecoded.returned,
        files: tableDecoded.files
      };
      decodedRows.push(...tableDecoded.rows.map((row) => ({
        ...row,
        source: 'table'
      })));
    }

    if (includeLogs && decodedRows.length < limit && inspected < maxInspected) {
      const logDecoded = decodeLevelDbLogFiles(dbDirectory, snapshot.copiedFiles, {
        ...payload,
        limit: limit - decodedRows.length,
        maxInspected: maxInspected - inspected,
        includeValues
      });
      inspected += logDecoded.inspected;
      databaseSummary.log = {
        engine: logDecoded.engine,
        attemptedFileCount: logDecoded.attemptedFileCount,
        inspected: logDecoded.inspected,
        returned: logDecoded.returned,
        files: logDecoded.files
      };
      decodedRows.push(...logDecoded.rows.map((row) => ({
        ...row,
        source: 'log'
      })));
    }
  }

  const index = buildEntityIndex(decodedRows, payload);

  return {
    readOnly: true,
    snapshot: true,
    mode: 'host_remnote_leveldb_entity_index',
    source: snapshot.source,
    profilePath: snapshot.profilePath,
    snapshotId: snapshot.snapshotId,
    snapshotPath: snapshot.snapshotPath,
    maxTotalBytes: snapshot.maxTotalBytes,
    maxInspected,
    includeTables,
    includeLogs,
    includeValues,
    decoded: decodedRows.length > 0,
    copiedFileCount: snapshot.copiedFiles.filter((file) => !file.skipped).length,
    skippedFileCount: snapshot.copiedFiles.filter((file) => file.skipped).length,
    copiedBytes: snapshot.totalBytes,
    decodedRowCount: decodedRows.length,
    indexedRowCount: index.indexedRowCount,
    entityCount: index.entityCount,
    edgeCount: index.edgeCount,
    databases,
    entities: index.entities,
    edges: index.edges,
    rows: index.rows
  };
}

function compactSdkProbeRow(row) {
  if (!row || typeof row !== 'object') {
    return null;
  }
  const relationCounts = {};
  if (row.relations && typeof row.relations === 'object') {
    for (const [key, value] of Object.entries(row.relations)) {
      relationCounts[key] = value && typeof value === 'object' && typeof value.count === 'number'
        ? value.count
        : null;
    }
  }
  return {
    remId: row.remId || null,
    exists: row.exists === true,
    status: row.status || null,
    title: typeof row.title === 'string' ? row.title : '',
    createdAt: typeof row.createdAt === 'number' ? row.createdAt : null,
    updatedAt: typeof row.updatedAt === 'number' ? row.updatedAt : null,
    localUpdatedAt: typeof row.localUpdatedAt === 'number' ? row.localUpdatedAt : null,
    parentId: row.parentId || null,
    childCount: Array.isArray(row.childIds) ? row.childIds.length : null,
    type: row.type || null,
    flags: row.flags || null,
    activePowerups: row.activePowerups || null,
    propertyCount: typeof row.propertyCount === 'number' ? row.propertyCount : null,
    relationCounts: Object.keys(relationCounts).length > 0 ? relationCounts : null
  };
}

function buildLevelDbSdkSchemaSummary(mappedEntities) {
  const byRecordKind = new Map();
  const bySource = new Map();
  const addCount = (map, key, visible) => {
    const cleanKey = key || 'unknown';
    const entry = map.get(cleanKey) || { key: cleanKey, total: 0, sdkVisible: 0, sdkMissing: 0 };
    entry.total += 1;
    if (visible) {
      entry.sdkVisible += 1;
    } else {
      entry.sdkMissing += 1;
    }
    map.set(cleanKey, entry);
  };

  for (const entity of mappedEntities) {
    const visible = entity.sdkVisible === true;
    for (const kind of entity.recordKinds || ['unknown']) {
      addCount(byRecordKind, kind, visible);
    }
    for (const source of entity.sources || ['unknown']) {
      addCount(bySource, source, visible);
    }
  }

  const sortRows = (rows) => rows
    .sort((a, b) => b.total - a.total || String(a.key).localeCompare(String(b.key)))
    .slice(0, 100);

  return {
    byRecordKind: sortRows(Array.from(byRecordKind.values())),
    bySource: sortRows(Array.from(bySource.values()))
  };
}

async function buildRemNoteLevelDbSdkMap(payload = {}) {
  const maxProbeIds = Math.max(1, Math.min(Number(payload.maxProbeIds || payload.maxEntities || 50), 500));
  const entityIndex = buildRemNoteLevelDbEntityIndex({
    ...payload,
    includeRows: payload.includeRows === true,
    maxEntities: Math.max(maxProbeIds, Math.min(Number(payload.maxEntities || maxProbeIds), 2000))
  });
  const entityIds = (entityIndex.entities || [])
    .slice(0, maxProbeIds)
    .map((entity) => entity.entityId)
    .filter(Boolean);
  const sdkProbe = await callPlugin('probe_rem_ids', {
    remIds: entityIds,
    includeMissing: true,
    includeTypeFlags: payload.includeTypeFlags !== false,
    includePowerups: payload.includePowerups === true,
    includeRelations: payload.includeRelations === true,
    includeProperties: payload.includeProperties === true,
    maxIds: maxProbeIds
  });
  const sdkRows = Array.isArray(sdkProbe?.rows) ? sdkProbe.rows : [];
  const sdkById = new Map(sdkRows.map((row) => [row.remId, row]));
  const mappedEntities = (entityIndex.entities || []).slice(0, maxProbeIds).map((entity) => {
    const sdkRow = sdkById.get(entity.entityId) || null;
    return {
      entityId: entity.entityId,
      sdkVisible: sdkRow?.exists === true,
      seenCount: entity.seenCount,
      recordKinds: entity.recordKinds,
      sources: entity.sources,
      sampleTexts: entity.sampleTexts,
      sdk: compactSdkProbeRow(sdkRow)
    };
  });
  const mappedCount = mappedEntities.filter((entity) => entity.sdkVisible).length;
  const unresolvedCount = mappedEntities.length - mappedCount;

  return {
    readOnly: true,
    snapshot: true,
    mode: 'host_remnote_leveldb_sdk_map',
    source: entityIndex.source,
    profilePath: entityIndex.profilePath,
    snapshotId: entityIndex.snapshotId,
    snapshotPath: entityIndex.snapshotPath,
    maxTotalBytes: entityIndex.maxTotalBytes,
    maxInspected: entityIndex.maxInspected,
    decoded: entityIndex.decoded,
    copiedFileCount: entityIndex.copiedFileCount,
    skippedFileCount: entityIndex.skippedFileCount,
    copiedBytes: entityIndex.copiedBytes,
    entityIndex: {
      decodedRowCount: entityIndex.decodedRowCount,
      indexedRowCount: entityIndex.indexedRowCount,
      entityCount: entityIndex.entityCount,
      edgeCount: entityIndex.edgeCount,
      heuristic: entityIndex.heuristic === true
    },
    sdkProbe: {
      mode: sdkProbe?.mode || 'sdk_rem_id_probe',
      requestedCount: sdkProbe?.requestedCount ?? entityIds.length,
      uniqueCount: sdkProbe?.uniqueCount ?? entityIds.length,
      returned: sdkProbe?.returned ?? sdkRows.length,
      foundCount: sdkProbe?.foundCount ?? mappedCount,
      missingCount: sdkProbe?.missingCount ?? unresolvedCount,
      invalidCount: sdkProbe?.invalidCount ?? 0,
      duplicateCount: sdkProbe?.duplicateCount ?? 0
    },
    maxProbeIds,
    mappedCount,
    unresolvedCount,
    mappedEntities,
    unresolvedEntities: mappedEntities.filter((entity) => !entity.sdkVisible).slice(0, 50),
    schemaSummary: buildLevelDbSdkSchemaSummary(mappedEntities)
  };
}

async function exportRemNoteLevelDbGraph(payload = {}) {
  const maxNodes = Math.max(1, Math.min(Number(payload.maxNodes || payload.maxProbeIds || 80), 500));
  const maxEdges = Math.max(1, Math.min(Number(payload.maxEdges || 500), 5000));
  const includeUnresolvedNodes = payload.includeUnresolvedNodes !== false;
  const onlySdkVisibleEdges = payload.onlySdkVisibleEdges === true;
  const entityIndex = buildRemNoteLevelDbEntityIndex({
    ...payload,
    includeRows: false,
    maxEntities: Math.max(maxNodes, Math.min(Number(payload.maxEntities || maxNodes), 2000)),
    maxEdges
  });
  const probedEntityIds = (entityIndex.entities || [])
    .slice(0, maxNodes)
    .map((entity) => entity.entityId)
    .filter(Boolean);
  const sdkProbe = await callPlugin('probe_rem_ids', {
    remIds: probedEntityIds,
    includeMissing: true,
    includeTypeFlags: payload.includeTypeFlags !== false,
    includePowerups: payload.includePowerups === true,
    includeRelations: payload.includeRelations === true,
    includeProperties: payload.includeProperties === true,
    maxIds: maxNodes
  });
  const sdkRows = Array.isArray(sdkProbe?.rows) ? sdkProbe.rows : [];
  const sdkById = new Map(sdkRows.map((row) => [row.remId, row]));
  const nodes = [];

  for (const entity of (entityIndex.entities || []).slice(0, maxNodes)) {
    const sdkRow = sdkById.get(entity.entityId) || null;
    const sdk = compactSdkProbeRow(sdkRow);
    const sdkVisible = sdk?.exists === true;
    if (!sdkVisible && !includeUnresolvedNodes) {
      continue;
    }
    nodes.push({
      id: entity.entityId,
      label: sdkVisible && sdk.title ? sdk.title : entity.entityId,
      sdkVisible,
      seenCount: entity.seenCount,
      recordKinds: entity.recordKinds,
      sources: entity.sources,
      sampleTexts: entity.sampleTexts,
      sdk
    });
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edges = [];
  for (const edge of entityIndex.edges || []) {
    const fromNode = nodeById.get(edge.from);
    const toNode = nodeById.get(edge.to);
    if (!fromNode || !toNode) {
      continue;
    }
    if (onlySdkVisibleEdges && (!fromNode.sdkVisible || !toNode.sdkVisible)) {
      continue;
    }
    edges.push({
      from: edge.from,
      to: edge.to,
      relationship: edge.relationship,
      count: edge.count,
      recordKinds: edge.recordKinds,
      sources: edge.sources,
      fromLabel: fromNode.label,
      toLabel: toNode.label,
      fromSdkVisible: fromNode.sdkVisible,
      toSdkVisible: toNode.sdkVisible
    });
    if (edges.length >= maxEdges) {
      break;
    }
  }

  const sdkVisibleNodeCount = nodes.filter((node) => node.sdkVisible).length;

  return {
    readOnly: true,
    snapshot: true,
    mode: 'host_remnote_leveldb_graph_export',
    graphFormat: 'nodes_edges_v1',
    source: entityIndex.source,
    profilePath: entityIndex.profilePath,
    snapshotId: entityIndex.snapshotId,
    snapshotPath: entityIndex.snapshotPath,
    maxTotalBytes: entityIndex.maxTotalBytes,
    maxInspected: entityIndex.maxInspected,
    decoded: entityIndex.decoded,
    copiedFileCount: entityIndex.copiedFileCount,
    skippedFileCount: entityIndex.skippedFileCount,
    copiedBytes: entityIndex.copiedBytes,
    heuristic: true,
    maxNodes,
    maxEdges,
    includeUnresolvedNodes,
    onlySdkVisibleEdges,
    decodedRowCount: entityIndex.decodedRowCount,
    indexedRowCount: entityIndex.indexedRowCount,
    scannedEntityCount: entityIndex.entityCount,
    scannedEdgeCount: entityIndex.edgeCount,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    sdkVisibleNodeCount,
    unresolvedNodeCount: nodes.length - sdkVisibleNodeCount,
    sdkProbe: {
      mode: sdkProbe?.mode || 'sdk_rem_id_probe',
      requestedCount: sdkProbe?.requestedCount ?? probedEntityIds.length,
      uniqueCount: sdkProbe?.uniqueCount ?? probedEntityIds.length,
      returned: sdkProbe?.returned ?? sdkRows.length,
      foundCount: sdkProbe?.foundCount ?? sdkVisibleNodeCount,
      missingCount: sdkProbe?.missingCount ?? (nodes.length - sdkVisibleNodeCount),
      invalidCount: sdkProbe?.invalidCount ?? 0,
      duplicateCount: sdkProbe?.duplicateCount ?? 0
    },
    nodes,
    edges
  };
}

function buildDbDoctorIssueSummary(issues) {
  const byType = {};
  const bySeverity = {};
  for (const issue of issues) {
    byType[issue.type] = (byType[issue.type] || 0) + 1;
    bySeverity[issue.severity] = (bySeverity[issue.severity] || 0) + 1;
  }
  return { byType, bySeverity };
}

async function scanRemNoteDbDoctor(payload = {}) {
  const maxIssues = Math.max(1, Math.min(Number(payload.maxIssues || 100), 1000));
  const minVisibilityRatio = typeof payload.minVisibilityRatio === 'number'
    ? Math.max(0, Math.min(payload.minVisibilityRatio, 1))
    : 0.75;
  const sdkMap = await buildRemNoteLevelDbSdkMap({
    ...payload,
    includeRows: false,
    includeRelations: payload.includeRelations === true,
    includeProperties: payload.includeProperties === true,
    includePowerups: payload.includePowerups === true,
    includeTypeFlags: payload.includeTypeFlags !== false
  });
  const issues = [];
  const addIssue = (issue) => {
    if (issues.length < maxIssues) {
      issues.push(issue);
    }
  };
  const probed = Math.max(1, sdkMap.sdkProbe?.requestedCount || sdkMap.maxProbeIds || 1);
  const visibilityRatio = (sdkMap.mappedCount || 0) / probed;

  if (visibilityRatio < minVisibilityRatio) {
    addIssue({
      type: 'low_sdk_visibility_ratio',
      severity: 'warn',
      expectedAtLeast: minVisibilityRatio,
      actual: Number(visibilityRatio.toFixed(3)),
      mappedCount: sdkMap.mappedCount,
      probedCount: probed,
      suggestedAction: 'Inspect unresolvedEntities and tighten LevelDB entity extraction before using the map for automated migrations.'
    });
  }

  for (const entity of sdkMap.unresolvedEntities || []) {
    addIssue({
      type: 'unresolved_leveldb_entity',
      severity: entity.seenCount > 1 ? 'warn' : 'info',
      entityId: entity.entityId,
      seenCount: entity.seenCount,
      recordKinds: entity.recordKinds,
      sources: entity.sources,
      sampleTexts: entity.sampleTexts,
      suggestedAction: 'Treat as heuristic until the ID is resolved through SDK or classified as serialized key noise.'
    });
  }

  for (const row of sdkMap.schemaSummary?.byRecordKind || []) {
    if (row.total > 0 && row.sdkMissing > 0) {
      addIssue({
        type: 'record_kind_has_unresolved_entities',
        severity: row.sdkVisible === 0 ? 'warn' : 'info',
        recordKind: row.key,
        total: row.total,
        sdkVisible: row.sdkVisible,
        sdkMissing: row.sdkMissing,
        suggestedAction: 'Use this recordKind as a schema reverse-engineering target before trusting it as canonical.'
      });
    }
  }

  for (const entity of sdkMap.mappedEntities || []) {
    if (!entity.sdkVisible || !entity.sdk?.flags) {
      continue;
    }
    const recordKindText = (entity.recordKinds || []).join(' ');
    if (/table_row|table_cell|table_add_/i.test(recordKindText) && entity.sdk.flags.isTable !== true && entity.sdk.flags.isProperty !== true) {
      addIssue({
        type: 'table_key_points_to_non_table_rem',
        severity: 'info',
        entityId: entity.entityId,
        title: entity.sdk.title,
        recordKinds: entity.recordKinds,
        flags: entity.sdk.flags,
        suggestedAction: 'Classify whether the key belongs to a table row/document relation rather than the Rem type itself.'
      });
    }
  }

  return {
    readOnly: true,
    snapshot: true,
    mode: 'host_remnote_db_doctor_scan',
    source: sdkMap.source,
    profilePath: sdkMap.profilePath,
    snapshotId: sdkMap.snapshotId,
    snapshotPath: sdkMap.snapshotPath,
    decoded: sdkMap.decoded,
    entityIndex: sdkMap.entityIndex,
    sdkProbe: sdkMap.sdkProbe,
    mappedCount: sdkMap.mappedCount,
    unresolvedCount: sdkMap.unresolvedCount,
    visibilityRatio: Number(visibilityRatio.toFixed(3)),
    minVisibilityRatio,
    scannedEntities: sdkMap.mappedEntities.length,
    issueCount: issues.length,
    issueSummary: buildDbDoctorIssueSummary(issues),
    issues,
    schemaSummary: sdkMap.schemaSummary,
    unresolvedEntities: sdkMap.unresolvedEntities
  };
}

async function exportRemNoteVaultSnapshotToFile(payload = {}) {
  const pageLimit = clampNumber(payload.pageLimit || payload.limit, 500, 1, 500);
  const maxRows = clampNumber(payload.maxRows, pageLimit, 1, 200000);
  const startOffset = clampNumber(payload.offset, 0, 0, 200000);
  const maxPages = clampNumber(payload.maxPages, Math.ceil(maxRows / pageLimit), 1, 1000);
  const sortBy = ['createdAt', 'updatedAt', 'localUpdatedAt', 'title'].includes(payload.sortBy)
    ? payload.sortBy
    : 'updatedAt';
  const direction = payload.direction === 'asc' ? 'asc' : 'desc';
  const relationMode = ['counts', 'ids', 'summaries'].includes(payload.relationMode)
    ? payload.relationMode
    : 'counts';
  const exportId = sanitizeSnapshotId(payload.exportId || `sdk_vault_${new Date().toISOString().replace(/[:.]/g, '-')}`) || 'sdk_vault';
  const exportDir = path.join(hostVaultExportRoot, exportId);
  const rowsPath = path.join(exportDir, 'rows.jsonl');
  const manifestPath = path.join(exportDir, 'manifest.json');
  const startedAtExport = new Date().toISOString();
  ensureDir(exportDir);

  const rowStream = fs.createWriteStream(rowsPath, { encoding: 'utf8' });
  const pages = [];
  let offset = startOffset;
  let exportedRows = 0;
  let totalAccessible = null;
  let nextOffset = null;
  let truncated = false;
  let finalSortBy = sortBy;
  let finalDirection = direction;

  try {
    for (let pageIndex = 0; pageIndex < maxPages && exportedRows < maxRows; pageIndex += 1) {
      const remaining = maxRows - exportedRows;
      const currentLimit = Math.min(pageLimit, remaining);
      const page = await callPlugin('export_vault_snapshot', {
        limit: currentLimit,
        offset,
        sortBy,
        direction,
        includeRawText: payload.includeRawText === true,
        includeBackText: payload.includeBackText === true,
        includeTypeFlags: payload.includeTypeFlags === true,
        includePowerups: payload.includePowerups === true,
        includeRelations: payload.includeRelations !== false,
        relationMode,
        maxRelationSummaries: clampNumber(payload.maxRelationSummaries, 10, 1, 100),
        includeProperties: payload.includeProperties === true,
        includePracticeData: payload.includePracticeData === true,
        includeCards: payload.includeCards === true,
        valueDepth: clampNumber(payload.valueDepth, 5, 1, 10)
      });
      const rows = Array.isArray(page?.rows) ? page.rows : [];
      if (typeof page?.totalAccessible === 'number') {
        totalAccessible = page.totalAccessible;
      }
      finalSortBy = page?.sortBy || finalSortBy;
      finalDirection = page?.direction || finalDirection;
      for (const row of rows) {
        rowStream.write(`${JSON.stringify(row)}\n`);
      }
      exportedRows += rows.length;
      pages.push({
        pageIndex,
        offset,
        requestedLimit: currentLimit,
        returned: rows.length,
        nextOffset: typeof page?.nextOffset === 'number' ? page.nextOffset : null,
        truncated: page?.truncated === true
      });
      if (rows.length === 0 || page?.truncated !== true || page?.nextOffset === null || page?.nextOffset === undefined) {
        nextOffset = null;
        truncated = page?.truncated === true && exportedRows >= maxRows;
        break;
      }
      offset = Number(page.nextOffset);
      nextOffset = offset;
      truncated = true;
    }
  } finally {
    rowStream.end();
    await new Promise((resolve, reject) => {
      rowStream.on('finish', resolve);
      rowStream.on('error', reject);
    });
  }

  const completedAt = new Date().toISOString();
  if (totalAccessible !== null && startOffset + exportedRows >= totalAccessible) {
    truncated = false;
    nextOffset = null;
  } else if (nextOffset === null && totalAccessible !== null && startOffset + exportedRows < totalAccessible) {
    truncated = true;
    nextOffset = startOffset + exportedRows;
  }

  const manifest = {
    readOnly: true,
    snapshot: true,
    mutationApplied: false,
    mode: 'host_remnote_vault_snapshot_export',
    exportId,
    exportDir,
    rowsPath,
    manifestPath,
    format: 'jsonl',
    startedAt: startedAtExport,
    completedAt,
    requested: {
      startOffset,
      pageLimit,
      maxRows,
      maxPages,
      sortBy,
      direction,
      relationMode,
      includeRawText: payload.includeRawText === true,
      includeBackText: payload.includeBackText === true,
      includeTypeFlags: payload.includeTypeFlags === true,
      includePowerups: payload.includePowerups === true,
      includeRelations: payload.includeRelations !== false,
      includeProperties: payload.includeProperties === true,
      includePracticeData: payload.includePracticeData === true,
      includeCards: payload.includeCards === true
    },
    totalAccessible,
    exportedRows,
    pageCount: pages.length,
    pages,
    sortBy: finalSortBy,
    direction: finalDirection,
    truncated,
    nextOffset,
    warnings: [
      'This export is built from SDK-visible Rems through export_vault_snapshot; it is not a direct internal database dump.',
      'Rows are written as JSONL in the host cache. Use nextOffset/maxRows paging for very large vault exports.'
    ]
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

async function exportRemNoteVaultSnapshotPartitioned(payload = {}) {
  const pageLimit = clampNumber(payload.pageLimit || payload.limit, 500, 1, 500);
  const partitionRows = clampNumber(payload.partitionRows || payload.partRows, 5000, pageLimit, 50000);
  const maxRows = clampNumber(payload.maxRows, partitionRows, 1, 200000);
  const maxPages = clampNumber(payload.maxPages, Math.ceil(maxRows / pageLimit), 1, 5000);
  const maxParts = clampNumber(payload.maxParts, Math.ceil(maxRows / partitionRows), 1, 5000);
  const sortBy = ['createdAt', 'updatedAt', 'localUpdatedAt', 'title'].includes(payload.sortBy)
    ? payload.sortBy
    : 'updatedAt';
  const direction = payload.direction === 'asc' ? 'asc' : 'desc';
  const relationMode = ['counts', 'ids', 'summaries'].includes(payload.relationMode)
    ? payload.relationMode
    : 'counts';
  const exportId = sanitizeSnapshotId(payload.exportId || `sdk_vault_parts_${new Date().toISOString().replace(/[:.]/g, '-')}`) || 'sdk_vault_parts';
  const exportDir = path.join(hostVaultExportRoot, exportId);
  const partsDir = path.join(exportDir, 'parts');
  const manifestPath = path.join(exportDir, 'manifest.json');
  const startedAtExport = new Date().toISOString();
  const existingManifest = payload.resume === true ? safeReadJson(manifestPath) : null;
  const startOffset = clampNumber(
    payload.offset !== undefined ? payload.offset : existingManifest?.nextOffset,
    0,
    0,
    200000
  );
  ensureDir(partsDir);

  const partFiles = Array.isArray(existingManifest?.partFiles) && payload.resume === true
    ? existingManifest.partFiles.slice()
    : [];
  const pages = Array.isArray(existingManifest?.pages) && payload.resume === true
    ? existingManifest.pages.slice()
    : [];
  let offset = startOffset;
  let exportedRowsThisRun = 0;
  let exportedRows = payload.resume === true && typeof existingManifest?.exportedRows === 'number'
    ? existingManifest.exportedRows
    : 0;
  let totalAccessible = typeof existingManifest?.totalAccessible === 'number' ? existingManifest.totalAccessible : null;
  let nextOffset = null;
  let truncated = false;
  let partitionLimitReached = false;
  let finalSortBy = existingManifest?.sortBy || sortBy;
  let finalDirection = existingManifest?.direction || direction;
  let currentPart = null;
  let currentPartStream = null;
  let currentPartRows = 0;

  const closeCurrentPart = async () => {
    if (!currentPartStream || !currentPart) return;
    await finishJsonlStream(currentPartStream);
    const stat = safeReadStat(currentPart.path);
    currentPart.bytes = stat ? stat.size : null;
    currentPart.completedAt = new Date().toISOString();
    partFiles.push(currentPart);
    currentPartStream = null;
    currentPart = null;
    currentPartRows = 0;
  };

  const openPart = async () => {
    await closeCurrentPart();
    if (partFiles.length >= maxParts) {
      partitionLimitReached = true;
      return false;
    }
    const partIndex = partFiles.length;
    const partName = `part-${String(partIndex).padStart(5, '0')}.jsonl`;
    const partPath = path.join(partsDir, partName);
    currentPart = {
      partIndex,
      path: partPath,
      relativePath: path.relative(exportDir, partPath),
      startOffset: offset,
      rows: 0,
      bytes: null,
      startedAt: new Date().toISOString(),
      completedAt: null
    };
    currentPartStream = fs.createWriteStream(partPath, { encoding: 'utf8' });
    return true;
  };

  try {
    for (let pageIndex = 0; pageIndex < maxPages && exportedRowsThisRun < maxRows; pageIndex += 1) {
      const partCapacityRemaining = maxParts * partitionRows - exportedRowsThisRun;
      if (partCapacityRemaining <= 0) {
        partitionLimitReached = true;
        break;
      }
      const remaining = maxRows - exportedRowsThisRun;
      const currentLimit = Math.min(pageLimit, remaining, partCapacityRemaining);
      const page = await callPlugin('export_vault_snapshot', {
        limit: currentLimit,
        offset,
        sortBy,
        direction,
        includeRawText: payload.includeRawText === true,
        includeBackText: payload.includeBackText === true,
        includeTypeFlags: payload.includeTypeFlags === true,
        includePowerups: payload.includePowerups === true,
        includeRelations: payload.includeRelations !== false,
        relationMode,
        maxRelationSummaries: clampNumber(payload.maxRelationSummaries, 10, 1, 100),
        includeProperties: payload.includeProperties === true,
        includePracticeData: payload.includePracticeData === true,
        includeCards: payload.includeCards === true,
        valueDepth: clampNumber(payload.valueDepth, 5, 1, 10)
      });
      const rows = Array.isArray(page?.rows) ? page.rows : [];
      if (typeof page?.totalAccessible === 'number') {
        totalAccessible = page.totalAccessible;
      }
      finalSortBy = page?.sortBy || finalSortBy;
      finalDirection = page?.direction || finalDirection;

      for (const row of rows) {
        if (!currentPartStream || currentPartRows >= partitionRows) {
          const opened = await openPart();
          if (!opened) break;
        }
        await writeJsonLine(currentPartStream, row);
        currentPartRows += 1;
        currentPart.rows += 1;
        exportedRowsThisRun += 1;
        exportedRows += 1;
      }

      pages.push({
        pageIndex: pages.length,
        offset,
        requestedLimit: currentLimit,
        returned: rows.length,
        nextOffset: typeof page?.nextOffset === 'number' ? page.nextOffset : null,
        truncated: page?.truncated === true,
        partCount: partFiles.length + (currentPart ? 1 : 0)
      });

      if (rows.length === 0 || page?.truncated !== true || page?.nextOffset === null || page?.nextOffset === undefined) {
        nextOffset = null;
        truncated = page?.truncated === true && exportedRowsThisRun >= maxRows;
        break;
      }
      offset = Number(page.nextOffset);
      nextOffset = offset;
      truncated = true;
      if (partitionLimitReached) break;
    }
  } finally {
    await closeCurrentPart();
  }

  const completedAt = new Date().toISOString();
  if (totalAccessible !== null && offset >= totalAccessible) {
    truncated = false;
    nextOffset = null;
  } else if (nextOffset === null && totalAccessible !== null && startOffset + exportedRowsThisRun < totalAccessible) {
    truncated = exportedRowsThisRun > 0;
    nextOffset = startOffset + exportedRowsThisRun;
  }
  if (partitionLimitReached) {
    truncated = true;
    nextOffset = nextOffset === null ? offset : nextOffset;
  }

  const manifest = {
    readOnly: true,
    snapshot: true,
    mutationApplied: false,
    mode: 'host_remnote_vault_snapshot_export_partitioned',
    exportId,
    exportDir,
    partsDir,
    manifestPath,
    rowsPath: partFiles[0]?.path || null,
    format: 'jsonl_parts_v1',
    partitioned: true,
    resumable: true,
    startedAt: existingManifest?.startedAt && payload.resume === true ? existingManifest.startedAt : startedAtExport,
    lastRunStartedAt: startedAtExport,
    completedAt,
    requested: {
      startOffset,
      pageLimit,
      partitionRows,
      maxRows,
      maxPages,
      maxParts,
      sortBy,
      direction,
      relationMode,
      resume: payload.resume === true,
      includeRawText: payload.includeRawText === true,
      includeBackText: payload.includeBackText === true,
      includeTypeFlags: payload.includeTypeFlags === true,
      includePowerups: payload.includePowerups === true,
      includeRelations: payload.includeRelations !== false,
      includeProperties: payload.includeProperties === true,
      includePracticeData: payload.includePracticeData === true,
      includeCards: payload.includeCards === true
    },
    totalAccessible,
    exportedRows,
    exportedRowsThisRun,
    partCount: partFiles.length,
    partFiles,
    pageCount: pages.length,
    pages,
    sortBy: finalSortBy,
    direction: finalDirection,
    truncated,
    nextOffset,
    warnings: [
      'This partitioned export is built from SDK-visible Rems through export_vault_snapshot; it is not a direct internal database dump.',
      'Rows are written as JSONL part files in the host cache. Use nextOffset with resume=true to continue a large export.',
      'Vault export query/stats/diff/graph actions can read all partFiles automatically when a partitioned exportId/exportDir is selected.'
    ]
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

function listVaultExportManifests() {
  if (!fs.existsSync(hostVaultExportRoot)) {
    return [];
  }
  return fs.readdirSync(hostVaultExportRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const exportDir = path.join(hostVaultExportRoot, entry.name);
      const manifestPath = path.join(exportDir, 'manifest.json');
      const stat = safeReadStat(manifestPath) || safeReadStat(exportDir);
      const manifest = safeReadJson(manifestPath) || {};
      return {
        exportId: entry.name,
        exportDir,
        manifestPath,
        rowsPath: manifest.rowsPath || manifest.partFiles?.[0]?.path || path.join(exportDir, 'rows.jsonl'),
        partsDir: manifest.partsDir || null,
        completedAt: manifest.completedAt || null,
        exportedRows: typeof manifest.exportedRows === 'number' ? manifest.exportedRows : null,
        partCount: typeof manifest.partCount === 'number' ? manifest.partCount : null,
        mtimeMs: stat ? stat.mtimeMs : 0
      };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function resolveVaultExportSelection(payload = {}) {
  const explicitRowsPath = Boolean(payload.rowsPath);
  let rowsPath = payload.rowsPath ? path.resolve(String(payload.rowsPath)) : '';
  let exportDir = payload.exportDir ? path.resolve(String(payload.exportDir)) : '';
  let manifestPath = payload.manifestPath ? path.resolve(String(payload.manifestPath)) : '';
  const exportId = payload.exportId ? sanitizeSnapshotId(payload.exportId) : '';

  if (!rowsPath && !exportDir && manifestPath) {
    exportDir = path.dirname(manifestPath);
  }

  if (!rowsPath && exportId) {
    exportDir = path.join(hostVaultExportRoot, exportId);
    manifestPath = path.join(exportDir, 'manifest.json');
  } else if (!rowsPath && exportDir) {
    manifestPath = manifestPath || path.join(exportDir, 'manifest.json');
  } else if (!rowsPath) {
    const latest = listVaultExportManifests()[0];
    if (!latest) {
      throw new Error('No vault export found. Run host_remnote_vault_snapshot_export first or pass rowsPath/exportId.');
    }
    rowsPath = latest.rowsPath;
    exportDir = latest.exportDir;
    manifestPath = latest.manifestPath;
  }

  if (rowsPath && !exportDir) {
    const rowDir = path.dirname(rowsPath);
    exportDir = path.basename(rowDir).toLowerCase() === 'parts' ? path.dirname(rowDir) : rowDir;
  }
  exportDir = exportDir ? path.resolve(exportDir) : path.resolve(hostVaultExportRoot);
  manifestPath = manifestPath ? path.resolve(manifestPath) : path.join(exportDir, 'manifest.json');
  const manifest = safeReadJson(manifestPath) || null;
  const manifestRowsPath = manifest?.rowsPath ? path.resolve(String(manifest.rowsPath)) : '';
  const partitionPaths = resolveVaultExportPartitionPaths(manifest, exportDir);
  const readAllParts = manifest?.partitioned === true && partitionPaths.length > 0 && (!explicitRowsPath || payload.readAllParts === true);

  if (!rowsPath) {
    rowsPath = readAllParts
      ? partitionPaths[0]
      : (manifestRowsPath || path.join(exportDir, 'rows.jsonl'));
  }
  rowsPath = path.resolve(rowsPath);
  const rowPaths = readAllParts ? partitionPaths : [rowsPath];
  const validatedRowPaths = rowPaths.map((rowPath) => {
    const resolved = assertPathInsideRoot(rowPath, hostVaultExportRoot, 'vault export rows file');
    if (!fs.existsSync(resolved)) {
      throw new Error(`Vault export rows file not found: ${resolved}`);
    }
    return resolved;
  });

  return {
    exportId: exportId || path.basename(exportDir),
    exportDir,
    rowsPath: validatedRowPaths[0],
    rowPaths: validatedRowPaths,
    fileCount: validatedRowPaths.length,
    manifestPath,
    manifest,
    partitioned: manifest?.partitioned === true,
    partCount: manifest?.partitioned === true ? partitionPaths.length : null,
    partsDir: manifest?.partsDir || (manifest?.partitioned === true ? path.join(exportDir, 'parts') : null)
  };
}

function resolveVaultExportPartitionPaths(manifest, exportDir) {
  if (manifest?.partitioned !== true || !Array.isArray(manifest.partFiles)) {
    return [];
  }
  const paths = [];
  const seen = new Set();
  for (const part of manifest.partFiles) {
    const rawPath = part?.path
      ? String(part.path)
      : (part?.relativePath ? path.join(exportDir, String(part.relativePath)) : '');
    if (!rawPath) continue;
    const resolved = path.resolve(rawPath);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    paths.push(resolved);
  }
  return paths;
}

async function* iterateVaultExportLines(selection, start = {}) {
  const rowPaths = Array.isArray(selection.rowPaths) && selection.rowPaths.length > 0
    ? selection.rowPaths
    : [selection.rowsPath];
  const startFileIndex = clampNumber(start.fileIndex, 0, 0, Math.max(0, rowPaths.length - 1));
  const startLineNumber = clampNumber(start.lineNumber, 0, 0, 1000000000);
  for (let fileIndex = startFileIndex; fileIndex < rowPaths.length; fileIndex += 1) {
    const rowPath = rowPaths[fileIndex];
    const rl = readline.createInterface({
      input: fs.createReadStream(rowPath, { encoding: 'utf8' }),
      crlfDelay: Infinity
    });
    let lineNumber = 0;
    try {
      for await (const line of rl) {
        const currentLineNumber = lineNumber;
        lineNumber += 1;
        if (fileIndex === startFileIndex && currentLineNumber < startLineNumber) {
          continue;
        }
        yield {
          line,
          rowPath,
          fileIndex,
          lineNumber: currentLineNumber,
          nextPosition: {
            fileIndex,
            lineNumber: currentLineNumber + 1
          }
        };
      }
    } finally {
      rl.close();
    }
  }
}

function encodeJsonBase64Url(value) {
  return Buffer.from(JSON.stringify(value), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function decodeJsonBase64Url(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const padded = text.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(text.length / 4) * 4, '=');
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
}

function decodeVaultQueryCursor(cursor) {
  if (!cursor) {
    return { fileIndex: 0, lineNumber: 0, raw: null };
  }
  let data = cursor;
  if (typeof cursor === 'string') {
    try {
      data = decodeJsonBase64Url(cursor);
    } catch {
      data = JSON.parse(cursor);
    }
  }
  if (!data || typeof data !== 'object') {
    throw new Error('Vault query cursor must be a cursor string or object.');
  }
  return {
    fileIndex: clampNumber(data.fileIndex, 0, 0, 1000000),
    lineNumber: clampNumber(data.lineNumber, 0, 0, 1000000000),
    raw: data
  };
}

function buildVaultQueryCursor(selection, position, metadata = {}) {
  if (!position || typeof position.fileIndex !== 'number' || typeof position.lineNumber !== 'number') {
    return null;
  }
  const state = {
    version: 1,
    kind: 'vault_export_query_cursor',
    exportId: selection.exportId,
    fileIndex: position.fileIndex,
    lineNumber: position.lineNumber,
    fileCount: selection.fileCount,
    partitioned: selection.partitioned === true,
    createdAt: new Date().toISOString(),
    ...metadata
  };
  return {
    cursor: encodeJsonBase64Url(state),
    state
  };
}

function getPathValue(value, pathExpression) {
  return String(pathExpression || '')
    .split('.')
    .filter(Boolean)
    .reduce((current, part) => {
      if (current === null || current === undefined) return undefined;
      if (Array.isArray(current)) {
        const index = Number(part);
        return Number.isInteger(index) ? current[index] : undefined;
      }
      return current[part];
    }, value);
}

function pickRowFields(row, fields) {
  if (!Array.isArray(fields) || fields.length === 0) {
    return row;
  }
  const picked = {};
  for (const field of fields) {
    picked[field] = getPathValue(row, field);
  }
  return picked;
}

function serializedSearchText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(serializedSearchText).join(' ');
  }
  if (typeof value === 'object') {
    return Object.values(value).map(serializedSearchText).join(' ');
  }
  return '';
}

function relationContainsId(row, relationKey, id) {
  if (!id || !row?.relations?.[relationKey]) return false;
  const block = row.relations[relationKey];
  if (Array.isArray(block.ids) && block.ids.includes(id)) return true;
  if (Array.isArray(block.summaries) && block.summaries.some((summary) => summary?.remId === id)) return true;
  return false;
}

function rowMatchesVaultQuery(row, filters) {
  if (filters.remIds.size > 0 && !filters.remIds.has(row.remId)) return false;
  if (filters.parentId && row.parentId !== filters.parentId) return false;
  if (filters.query) {
    const haystack = [
      row.remId,
      row.title,
      serializedSearchText(row.rawText),
      serializedSearchText(row.backText),
      serializedSearchText(row.properties),
      serializedSearchText(row.relations)
    ].join(' ').toLocaleLowerCase('tr-TR');
    if (!haystack.includes(filters.query)) return false;
  }
  if (filters.titleIncludes && !String(row.title || '').toLocaleLowerCase('tr-TR').includes(filters.titleIncludes)) return false;
  if (filters.activePowerup && !(Array.isArray(row.activePowerups) && row.activePowerups.includes(filters.activePowerup))) return false;
  for (const [flag, expected] of Object.entries(filters.flags)) {
    if (row.flags?.[flag] !== expected) return false;
  }
  if (filters.tagId && !relationContainsId(row, 'tags', filters.tagId)) return false;
  if (filters.sourceId && !relationContainsId(row, 'sources', filters.sourceId)) return false;
  if (filters.referenceId && !relationContainsId(row, 'referencesOut', filters.referenceId) && !relationContainsId(row, 'referencesIn', filters.referenceId)) return false;
  if (filters.createdAfter !== null && !(typeof row.createdAt === 'number' && row.createdAt >= filters.createdAfter)) return false;
  if (filters.createdBefore !== null && !(typeof row.createdAt === 'number' && row.createdAt <= filters.createdBefore)) return false;
  if (filters.updatedAfter !== null && !(typeof row.updatedAt === 'number' && row.updatedAt >= filters.updatedAfter)) return false;
  if (filters.updatedBefore !== null && !(typeof row.updatedAt === 'number' && row.updatedAt <= filters.updatedBefore)) return false;
  return true;
}

function buildVaultQueryFilters(payload = {}) {
  const filters = {
    query: String(payload.query || payload.q || '').trim().toLocaleLowerCase('tr-TR'),
    titleIncludes: String(payload.titleIncludes || '').trim().toLocaleLowerCase('tr-TR'),
    remIds: new Set(Array.isArray(payload.remIds) ? payload.remIds.map(String) : (payload.remId ? [String(payload.remId)] : [])),
    parentId: payload.parentId ? String(payload.parentId) : '',
    activePowerup: payload.activePowerup ? String(payload.activePowerup) : '',
    tagId: payload.tagId ? String(payload.tagId) : '',
    sourceId: payload.sourceId ? String(payload.sourceId) : '',
    referenceId: payload.referenceId ? String(payload.referenceId) : '',
    createdAfter: typeof payload.createdAfter === 'number' ? payload.createdAfter : null,
    createdBefore: typeof payload.createdBefore === 'number' ? payload.createdBefore : null,
    updatedAfter: typeof payload.updatedAfter === 'number' ? payload.updatedAfter : null,
    updatedBefore: typeof payload.updatedBefore === 'number' ? payload.updatedBefore : null,
    flags: {}
  };
  for (const key of ['isDocument', 'isFolder', 'isTable', 'isProperty', 'isCardItem', 'isTodo', 'isQuote', 'isCode', 'isListItem']) {
    if (typeof payload[key] === 'boolean') {
      filters.flags[key] = payload[key];
    }
  }
  return filters;
}

async function queryRemNoteVaultExport(payload = {}) {
  const selection = resolveVaultExportSelection(payload);
  const limit = clampNumber(payload.limit, 50, 0, 500);
  const offset = clampNumber(payload.offset, 0, 0, 200000);
  const maxScan = clampNumber(payload.maxScan, 200000, 1, 500000);
  const includeRows = payload.includeRows !== false;
  const cursorMode = payload.cursorMode === true || payload.useCursor === true || payload.cursor !== undefined || payload.pageCursor !== undefined;
  const cursorState = decodeVaultQueryCursor(payload.cursor || payload.pageCursor || null);
  const fields = Array.isArray(payload.fields) ? payload.fields.map(String).filter(Boolean).slice(0, 50) : [];
  const filters = buildVaultQueryFilters(payload);

  const rows = [];
  let scanned = 0;
  let matchedTotal = 0;
  let parseErrors = 0;
  let nextPosition = null;
  let stopReason = null;

  for await (const { line, fileIndex, lineNumber, nextPosition: afterLinePosition } of iterateVaultExportLines(selection, cursorState)) {
    if (scanned >= maxScan) {
      nextPosition = { fileIndex, lineNumber };
      stopReason = 'maxScan';
      break;
    }
    const text = String(line || '').trim();
    if (!text) continue;
    scanned += 1;
    nextPosition = afterLinePosition;
    let row;
    try {
      row = JSON.parse(text);
    } catch {
      parseErrors += 1;
      continue;
    }
    if (!rowMatchesVaultQuery(row, filters)) continue;
    matchedTotal += 1;
    if (includeRows && matchedTotal > offset && rows.length < limit) {
      rows.push(pickRowFields(row, fields));
      if (cursorMode && limit > 0 && rows.length >= limit) {
        stopReason = 'limit';
        break;
      }
    }
  }
  const cursorResult = cursorMode && nextPosition
    ? buildVaultQueryCursor(selection, nextPosition, {
        stopReason,
        scanned,
        matchedInPage: matchedTotal,
        returned: rows.length
      })
    : null;
  const hasMoreByCursor = Boolean(cursorResult);

  return {
    readOnly: true,
    snapshot: true,
    mutationApplied: false,
    mode: 'host_remnote_vault_export_query',
    exportId: selection.exportId,
    exportDir: selection.exportDir,
    rowsPath: selection.rowsPath,
    rowPaths: selection.rowPaths,
    fileCount: selection.fileCount,
    partitioned: selection.partitioned,
    partCount: selection.partCount,
    manifestPath: selection.manifestPath,
    manifest: selection.manifest
      ? {
          exportedRows: selection.manifest.exportedRows,
          totalAccessible: selection.manifest.totalAccessible,
          completedAt: selection.manifest.completedAt,
          truncated: selection.manifest.truncated,
          nextOffset: selection.manifest.nextOffset,
          partitioned: selection.manifest.partitioned === true,
          partCount: selection.manifest.partCount
        }
      : null,
    scanned,
    maxScan,
    parseErrors,
    matchedTotal,
    cursorMode,
    cursorStart: cursorState.raw
      ? {
          fileIndex: cursorState.fileIndex,
          lineNumber: cursorState.lineNumber,
          exportId: cursorState.raw.exportId || null
        }
      : null,
    nextCursor: cursorResult ? cursorResult.cursor : null,
    nextCursorState: cursorResult ? cursorResult.state : null,
    stopReason,
    offset,
    limit,
    returned: rows.length,
    truncated: hasMoreByCursor || matchedTotal > offset + rows.length || scanned >= maxScan,
    rows,
    filters: {
      query: filters.query || null,
      titleIncludes: filters.titleIncludes || null,
      remIds: Array.from(filters.remIds),
      parentId: filters.parentId || null,
      activePowerup: filters.activePowerup || null,
      tagId: filters.tagId || null,
      sourceId: filters.sourceId || null,
      referenceId: filters.referenceId || null,
      flags: filters.flags
    }
  };
}

function pickFirstPayloadValue(payload, names) {
  for (const name of names) {
    if (payload[name] !== undefined && payload[name] !== null && payload[name] !== '') {
      return payload[name];
    }
  }
  return undefined;
}

function hasVaultExportSelectionInput(payload) {
  return Boolean(payload.rowsPath || payload.exportId || payload.exportDir || payload.manifestPath);
}

function buildVaultExportSelectionPayload(payload, prefixes) {
  return {
    rowsPath: pickFirstPayloadValue(payload, prefixes.map((prefix) => `${prefix}RowsPath`)),
    exportId: pickFirstPayloadValue(payload, prefixes.map((prefix) => `${prefix}ExportId`)),
    exportDir: pickFirstPayloadValue(payload, prefixes.map((prefix) => `${prefix}ExportDir`)),
    manifestPath: pickFirstPayloadValue(payload, prefixes.map((prefix) => `${prefix}ManifestPath`))
  };
}

function resolveVaultExportDiffSelections(payload = {}) {
  const basePayload = buildVaultExportSelectionPayload(payload, ['base', 'before', 'left']);
  const comparePayload = buildVaultExportSelectionPayload(payload, ['compare', 'after', 'right']);
  const hasBase = hasVaultExportSelectionInput(basePayload);
  const hasCompare = hasVaultExportSelectionInput(comparePayload);

  if (!hasBase && !hasCompare) {
    const manifests = listVaultExportManifests();
    if (manifests.length < 2) {
      throw new Error('Need at least two vault exports to diff automatically. Run host_remnote_vault_snapshot_export twice or pass baseRowsPath/compareRowsPath.');
    }
    return {
      base: resolveVaultExportSelection({
        exportDir: manifests[1].exportDir,
        manifestPath: manifests[1].manifestPath
      }),
      compare: resolveVaultExportSelection({
        exportDir: manifests[0].exportDir,
        manifestPath: manifests[0].manifestPath
      })
    };
  }

  if (!hasBase || !hasCompare) {
    throw new Error('Vault export diff needs both base and compare selections, or neither to use the latest two exports.');
  }

  return {
    base: resolveVaultExportSelection(basePayload),
    compare: resolveVaultExportSelection(comparePayload)
  };
}

function sortForStableJson(value) {
  if (value === undefined) {
    return { __bridgeMissing: true };
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sortForStableJson);
  }
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = sortForStableJson(value[key]);
    return result;
  }, {});
}

function stableJson(value) {
  return JSON.stringify(sortForStableJson(value));
}

function diffDisplayValue(value) {
  return value === undefined ? null : value;
}

function normalizeFieldList(fields, fallback, maxFields = 80) {
  const source = Array.isArray(fields) && fields.length > 0 ? fields : fallback;
  return Array.from(new Set(source.map(String).map((field) => field.trim()).filter(Boolean))).slice(0, maxFields);
}

async function readVaultExportRowsForDiff(selection, options = {}) {
  const keyField = options.keyField || 'remId';
  const maxScan = options.maxScan || 200000;
  const rowsByKey = new Map();
  let scanned = 0;
  let parseErrors = 0;
  let missingKeys = 0;
  let duplicateKeys = 0;
  let truncated = false;

  for await (const { line } of iterateVaultExportLines(selection)) {
    const text = String(line || '').trim();
    if (!text) continue;
    if (scanned >= maxScan) {
      truncated = true;
      break;
    }
    scanned += 1;
    let row;
    try {
      row = JSON.parse(text);
    } catch {
      parseErrors += 1;
      continue;
    }
    const rawKey = getPathValue(row, keyField);
    if (rawKey === undefined || rawKey === null || rawKey === '') {
      missingKeys += 1;
      continue;
    }
    const key = String(rawKey);
    if (rowsByKey.has(key)) {
      duplicateKeys += 1;
    }
    rowsByKey.set(key, row);
  }

  return {
    rowsByKey,
    scanned,
    parsedRows: rowsByKey.size,
    parseErrors,
    missingKeys,
    duplicateKeys,
    truncated
  };
}

function compactVaultExportSelection(selection) {
  return {
    exportId: selection.exportId,
    exportDir: selection.exportDir,
    rowsPath: selection.rowsPath,
    rowPaths: selection.rowPaths,
    fileCount: selection.fileCount,
    partitioned: selection.partitioned,
    partCount: selection.partCount,
    partsDir: selection.partsDir,
    manifestPath: selection.manifestPath,
    manifest: selection.manifest
      ? {
          exportedRows: selection.manifest.exportedRows,
          totalAccessible: selection.manifest.totalAccessible,
          completedAt: selection.manifest.completedAt,
          truncated: selection.manifest.truncated,
          nextOffset: selection.manifest.nextOffset,
          partitioned: selection.manifest.partitioned === true,
          partCount: selection.manifest.partCount
        }
      : null
  };
}

function buildVaultExportCatalogEntry(entry, options = {}) {
  const includeManifest = options.includeManifest === true;
  const manifest = entry.manifest || safeReadJson(entry.manifestPath) || null;
  const rowsStat = safeReadStat(entry.rowsPath);
  const manifestStat = safeReadStat(entry.manifestPath);
  const result = {
    exportId: entry.exportId,
    exportDir: entry.exportDir,
    rowsPath: entry.rowsPath,
    manifestPath: entry.manifestPath,
    exists: {
      rows: Boolean(rowsStat),
      manifest: Boolean(manifestStat)
    },
    bytes: {
      rows: rowsStat ? rowsStat.size : null,
      manifest: manifestStat ? manifestStat.size : null
    },
    mtime: {
      rows: rowsStat ? safeIso(rowsStat.mtime) : null,
      manifest: manifestStat ? safeIso(manifestStat.mtime) : null
    },
    completedAt: manifest?.completedAt || entry.completedAt || null,
    exportedRows: typeof manifest?.exportedRows === 'number' ? manifest.exportedRows : entry.exportedRows,
    partitioned: manifest?.partitioned === true,
    partCount: typeof manifest?.partCount === 'number' ? manifest.partCount : entry.partCount,
    partsDir: manifest?.partsDir || entry.partsDir || null,
    totalAccessible: typeof manifest?.totalAccessible === 'number' ? manifest.totalAccessible : null,
    pageCount: typeof manifest?.pageCount === 'number' ? manifest.pageCount : null,
    sortBy: manifest?.sortBy || null,
    direction: manifest?.direction || null,
    truncated: manifest?.truncated === true,
    nextOffset: typeof manifest?.nextOffset === 'number' ? manifest.nextOffset : null
  };
  if (includeManifest) {
    result.manifest = manifest;
  }
  return result;
}

function catalogRemNoteVaultExports(payload = {}) {
  const limit = clampNumber(payload.limit, 20, 0, 500);
  const offset = clampNumber(payload.offset, 0, 0, 200000);
  const includeManifest = payload.includeManifest === true;
  const manifests = listVaultExportManifests();
  const rows = manifests
    .slice(offset, offset + limit)
    .map((entry) => buildVaultExportCatalogEntry(entry, { includeManifest }));
  return {
    readOnly: true,
    snapshot: true,
    mutationApplied: false,
    mode: 'host_remnote_vault_export_catalog',
    exportRoot: hostVaultExportRoot,
    totalFound: manifests.length,
    offset,
    limit,
    returned: rows.length,
    truncated: offset + rows.length < manifests.length,
    exports: rows
  };
}

function incrementCounter(counter, key, amount = 1) {
  if (key === undefined || key === null || key === '') return;
  const text = String(key);
  counter.set(text, (counter.get(text) || 0) + amount);
}

function counterToRows(counter, limit) {
  return Array.from(counter.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, limit);
}

function createNumericRange() {
  return {
    count: 0,
    min: null,
    max: null
  };
}

function addToNumericRange(range, value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return;
  range.count += 1;
  range.min = range.min === null ? value : Math.min(range.min, value);
  range.max = range.max === null ? value : Math.max(range.max, value);
}

function numericRangeToResult(range) {
  return {
    count: range.count,
    min: range.min,
    max: range.max,
    minIso: typeof range.min === 'number' ? new Date(range.min).toISOString() : null,
    maxIso: typeof range.max === 'number' ? new Date(range.max).toISOString() : null
  };
}

function relationBlockIds(block) {
  if (!block || typeof block !== 'object') return [];
  if (Array.isArray(block.ids)) return block.ids.map(String).filter(Boolean);
  if (Array.isArray(block.summaries)) {
    return block.summaries.map((summary) => summary?.remId).filter(Boolean).map(String);
  }
  return [];
}

function relationBlockCount(block) {
  if (!block || typeof block !== 'object') return 0;
  if (typeof block.count === 'number' && Number.isFinite(block.count)) return block.count;
  const ids = relationBlockIds(block);
  return ids.length;
}

function relationBlockSummaryMap(block) {
  const result = new Map();
  if (!block || typeof block !== 'object' || !Array.isArray(block.summaries)) {
    return result;
  }
  for (const summary of block.summaries) {
    if (summary?.remId) {
      result.set(String(summary.remId), {
        title: summary.title || null,
        type: summary.type || null
      });
    }
  }
  return result;
}

const VAULT_STATS_RELATION_KEYS = ['tags', 'sources', 'aliases', 'referencesOut', 'referencesIn', 'portalsAndDocumentsIn'];

function buildRelationStats() {
  return {
    rowsWithAny: 0,
    totalCount: 0,
    countOnlyRemainder: 0,
    ids: new Map()
  };
}

function buildChildCountResult(childCounts) {
  if (childCounts.count === 0) {
    return {
      count: 0,
      min: null,
      max: null,
      average: null
    };
  }
  return {
    count: childCounts.count,
    min: childCounts.min,
    max: childCounts.max,
    average: Number((childCounts.sum / childCounts.count).toFixed(2))
  };
}

function createVaultStatsAccumulator(options = {}) {
  return {
    includeSamples: options.includeSamples === true,
    sampleLimit: clampNumber(options.sampleLimit, 10, 0, 100),
    flagTrueCounts: new Map(),
    flagFalseCounts: new Map(),
    activePowerupCounts: new Map(),
    parentCounts: new Map(),
    propertyIdCounts: new Map(),
    propertyTitleCounts: new Map(),
    practiceDirectionCounts: new Map(),
    relationStats: Object.fromEntries(VAULT_STATS_RELATION_KEYS.map((key) => [key, buildRelationStats()])),
    ranges: {
      createdAt: createNumericRange(),
      updatedAt: createNumericRange(),
      localUpdatedAt: createNumericRange()
    },
    missing: {
      remId: 0,
      title: 0,
      parentId: 0,
      createdAt: 0,
      updatedAt: 0,
      localUpdatedAt: 0,
      flags: 0,
      activePowerups: 0,
      relations: 0,
      properties: 0,
      practice: 0
    },
    childCounts: {
      count: 0,
      sum: 0,
      min: null,
      max: null
    },
    practice: {
      rowsWithPractice: 0,
      cardItems: 0,
      enablePracticeTrue: 0,
      totalCards: 0
    },
    properties: {
      rowsWithProperties: 0,
      totalProperties: 0,
      valuesPresent: 0,
      valuesMissing: 0,
      errors: 0
    },
    samples: []
  };
}

function consumeVaultStatsRow(state, row) {
  if (!row.remId) state.missing.remId += 1;
  if (!String(row.title || '').trim()) state.missing.title += 1;
  if (!row.parentId) state.missing.parentId += 1;
  if (typeof row.createdAt !== 'number') state.missing.createdAt += 1;
  if (typeof row.updatedAt !== 'number') state.missing.updatedAt += 1;
  if (typeof row.localUpdatedAt !== 'number') state.missing.localUpdatedAt += 1;
  addToNumericRange(state.ranges.createdAt, row.createdAt);
  addToNumericRange(state.ranges.updatedAt, row.updatedAt);
  addToNumericRange(state.ranges.localUpdatedAt, row.localUpdatedAt);
  incrementCounter(state.parentCounts, row.parentId);

  if (Array.isArray(row.childIds)) {
    const count = row.childIds.length;
    state.childCounts.count += 1;
    state.childCounts.sum += count;
    state.childCounts.min = state.childCounts.min === null ? count : Math.min(state.childCounts.min, count);
    state.childCounts.max = state.childCounts.max === null ? count : Math.max(state.childCounts.max, count);
  }

  if (row.flags && typeof row.flags === 'object') {
    for (const [flag, value] of Object.entries(row.flags)) {
      if (value === true) incrementCounter(state.flagTrueCounts, flag);
      if (value === false) incrementCounter(state.flagFalseCounts, flag);
    }
  } else {
    state.missing.flags += 1;
  }

  if (Array.isArray(row.activePowerups)) {
    for (const powerup of row.activePowerups) incrementCounter(state.activePowerupCounts, powerup);
  } else {
    state.missing.activePowerups += 1;
  }

  if (row.relations && typeof row.relations === 'object') {
    for (const key of VAULT_STATS_RELATION_KEYS) {
      const block = row.relations[key];
      const count = relationBlockCount(block);
      const ids = relationBlockIds(block);
      if (count > 0) state.relationStats[key].rowsWithAny += 1;
      state.relationStats[key].totalCount += count;
      state.relationStats[key].countOnlyRemainder += Math.max(0, count - ids.length);
      for (const id of ids) incrementCounter(state.relationStats[key].ids, id);
    }
  } else {
    state.missing.relations += 1;
  }

  if (Array.isArray(row.properties)) {
    if (row.properties.length > 0) state.properties.rowsWithProperties += 1;
    state.properties.totalProperties += row.properties.length;
    for (const property of row.properties) {
      incrementCounter(state.propertyIdCounts, property?.propertyId);
      incrementCounter(state.propertyTitleCounts, property?.propertyTitle);
      if (property?.error) state.properties.errors += 1;
      if (String(property?.valuePlain || '').trim()) {
        state.properties.valuesPresent += 1;
      } else {
        state.properties.valuesMissing += 1;
      }
    }
  } else {
    state.missing.properties += 1;
  }

  if (row.practice && typeof row.practice === 'object') {
    state.practice.rowsWithPractice += 1;
    if (row.practice.isCardItem === true) state.practice.cardItems += 1;
    if (row.practice.enablePractice === true) state.practice.enablePracticeTrue += 1;
    if (Array.isArray(row.practice.cards)) state.practice.totalCards += row.practice.cards.length;
    incrementCounter(state.practiceDirectionCounts, row.practice.practiceDirection);
  } else {
    state.missing.practice += 1;
  }

  if (state.includeSamples && state.samples.length < state.sampleLimit) {
    state.samples.push(pickRowFields(row, ['remId', 'title', 'parentId', 'createdAt', 'updatedAt', 'localUpdatedAt', 'flags']));
  }
}

function finalizeVaultStatsAccumulator(state, topLimit) {
  const relations = Object.fromEntries(VAULT_STATS_RELATION_KEYS.map((key) => {
    const relationStats = state.relationStats[key];
    return [key, {
      rowsWithAny: relationStats.rowsWithAny,
      totalCount: relationStats.totalCount,
      countOnlyRemainder: relationStats.countOnlyRemainder,
      topIds: counterToRows(relationStats.ids, topLimit)
    }];
  }));

  return {
    missing: state.missing,
    timeRanges: {
      createdAt: numericRangeToResult(state.ranges.createdAt),
      updatedAt: numericRangeToResult(state.ranges.updatedAt),
      localUpdatedAt: numericRangeToResult(state.ranges.localUpdatedAt)
    },
    childCounts: buildChildCountResult(state.childCounts),
    topParents: counterToRows(state.parentCounts, topLimit),
    flags: {
      true: counterToRows(state.flagTrueCounts, topLimit),
      false: counterToRows(state.flagFalseCounts, topLimit)
    },
    activePowerups: counterToRows(state.activePowerupCounts, topLimit),
    relations,
    properties: {
      ...state.properties,
      topPropertyIds: counterToRows(state.propertyIdCounts, topLimit),
      topPropertyTitles: counterToRows(state.propertyTitleCounts, topLimit)
    },
    practice: {
      ...state.practice,
      directions: counterToRows(state.practiceDirectionCounts, topLimit)
    },
    samples: state.samples
  };
}

function formatVaultCursorStart(cursorState) {
  return cursorState.raw
    ? {
        fileIndex: cursorState.fileIndex,
        lineNumber: cursorState.lineNumber,
        exportId: cursorState.raw.exportId || null,
        kind: cursorState.raw.kind || null
      }
    : null;
}

async function statsRemNoteVaultExport(payload = {}) {
  const selection = resolveVaultExportSelection(payload);
  const maxScan = clampNumber(payload.maxScan, 200000, 1, 500000);
  const topLimit = clampNumber(payload.topLimit, 20, 1, 200);
  const includeSamples = payload.includeSamples === true;
  const sampleLimit = clampNumber(payload.sampleLimit, 10, 0, 100);
  const cursorMode = payload.cursorMode === true || payload.useCursor === true || payload.cursor !== undefined || payload.pageCursor !== undefined;
  const cursorState = decodeVaultQueryCursor(payload.cursor || payload.pageCursor || null);
  const statsState = createVaultStatsAccumulator({ includeSamples, sampleLimit });
  let scanned = 0;
  let parsedRows = 0;
  let parseErrors = 0;
  let truncated = false;
  let nextPosition = null;
  let stopReason = null;

  for await (const { line, fileIndex, lineNumber, nextPosition: afterLinePosition } of iterateVaultExportLines(selection, cursorState)) {
    const text = String(line || '').trim();
    if (!text) continue;
    if (scanned >= maxScan) {
      truncated = true;
      stopReason = 'maxScan';
      nextPosition = { fileIndex, lineNumber };
      break;
    }
    scanned += 1;
    nextPosition = afterLinePosition;
    let row;
    try {
      row = JSON.parse(text);
      parsedRows += 1;
    } catch {
      parseErrors += 1;
      continue;
    }
    consumeVaultStatsRow(statsState, row);
  }
  const cursorResult = cursorMode && nextPosition
    ? buildVaultQueryCursor(selection, nextPosition, {
        kind: 'vault_export_stats_cursor',
        stopReason,
        scanned,
        parsedRows,
        parseErrors
      })
    : null;
  if (cursorResult) {
    truncated = true;
  }

  return {
    readOnly: true,
    snapshot: true,
    mutationApplied: false,
    mode: 'host_remnote_vault_export_stats',
    export: compactVaultExportSelection(selection),
    maxScan,
    topLimit,
    scanned,
    parsedRows,
    parseErrors,
    truncated,
    cursorMode,
    cursorStart: formatVaultCursorStart(cursorState),
    nextCursor: cursorResult ? cursorResult.cursor : null,
    nextCursorState: cursorResult ? cursorResult.state : null,
    stopReason,
    ...finalizeVaultStatsAccumulator(statsState, topLimit)
  };
}

async function aggregateRemNoteVaultExportStats(payload = {}) {
  const selection = resolveVaultExportSelection(payload);
  const pageSize = clampNumber(payload.pageSize || payload.chunkSize || payload.maxScanPerPage, 25000, 1, 500000);
  const maxRows = clampNumber(payload.maxRows || payload.maxScan, 500000, 1, 5000000);
  const maxPages = clampNumber(payload.maxPages, 1000, 1, 100000);
  const topLimit = clampNumber(payload.topLimit, 20, 1, 200);
  const includeSamples = payload.includeSamples === true;
  const sampleLimit = clampNumber(payload.sampleLimit, 10, 0, 100);
  const cursorState = decodeVaultQueryCursor(payload.cursor || payload.pageCursor || null);
  const statsState = createVaultStatsAccumulator({ includeSamples, sampleLimit });
  const pages = [];
  let scanned = 0;
  let parsedRows = 0;
  let parseErrors = 0;
  let pageIndex = 1;
  let pageScanned = 0;
  let pageParsedRows = 0;
  let pageParseErrors = 0;
  let pageStart = null;
  let pageEnd = null;
  let truncated = false;
  let stopReason = null;
  let nextPosition = null;

  const flushPage = () => {
    if (pageScanned < 1 && pageParsedRows < 1 && pageParseErrors < 1) return;
    pages.push({
      page: pageIndex,
      scanned: pageScanned,
      parsedRows: pageParsedRows,
      parseErrors: pageParseErrors,
      start: pageStart,
      end: pageEnd
    });
    pageIndex += 1;
    pageScanned = 0;
    pageParsedRows = 0;
    pageParseErrors = 0;
    pageStart = null;
    pageEnd = null;
  };

  for await (const { line, fileIndex, lineNumber, nextPosition: afterLinePosition } of iterateVaultExportLines(selection, cursorState)) {
    const text = String(line || '').trim();
    if (!text) continue;

    if (pageScanned >= pageSize) {
      flushPage();
      if (pages.length >= maxPages) {
        truncated = true;
        stopReason = 'maxPages';
        nextPosition = { fileIndex, lineNumber };
        break;
      }
    }

    if (scanned >= maxRows) {
      truncated = true;
      stopReason = 'maxRows';
      nextPosition = { fileIndex, lineNumber };
      break;
    }

    if (!pageStart) {
      pageStart = { fileIndex, lineNumber };
    }
    pageEnd = afterLinePosition;
    nextPosition = afterLinePosition;
    scanned += 1;
    pageScanned += 1;

    let row;
    try {
      row = JSON.parse(text);
      parsedRows += 1;
      pageParsedRows += 1;
    } catch {
      parseErrors += 1;
      pageParseErrors += 1;
      continue;
    }
    consumeVaultStatsRow(statsState, row);
  }
  flushPage();

  const cursorResult = truncated && nextPosition
    ? buildVaultQueryCursor(selection, nextPosition, {
        kind: 'vault_export_stats_aggregate_cursor',
        stopReason,
        scanned,
        parsedRows,
        parseErrors,
        pageSize,
        maxRows,
        maxPages
      })
    : null;

  return {
    readOnly: true,
    snapshot: true,
    mutationApplied: false,
    mode: 'host_remnote_vault_export_stats_aggregate',
    export: compactVaultExportSelection(selection),
    pageSize,
    maxRows,
    maxPages,
    topLimit,
    scanned,
    parsedRows,
    parseErrors,
    pageCount: pages.length,
    pages,
    truncated,
    cursorStart: formatVaultCursorStart(cursorState),
    nextCursor: cursorResult ? cursorResult.cursor : null,
    nextCursorState: cursorResult ? cursorResult.state : null,
    stopReason,
    ...finalizeVaultStatsAccumulator(statsState, topLimit)
  };
}

function schemaProfileValueKind(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  const kind = typeof value;
  if (kind === 'string' || kind === 'number' || kind === 'boolean') return kind;
  if (kind === 'object') return 'object';
  return kind;
}

function isSchemaProfileEmptyValue(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

function schemaProfileSample(value) {
  const kind = schemaProfileValueKind(value);
  if (kind === 'array') {
    return {
      type: kind,
      value: `array(length=${value.length})`
    };
  }
  if (kind === 'object') {
    const keys = Object.keys(value).slice(0, 10);
    return {
      type: kind,
      value: `object(keys=${keys.join(',')})`
    };
  }
  const text = String(value);
  return {
    type: kind,
    value: text.length > 160 ? `${text.slice(0, 157)}...` : text
  };
}

function addSchemaProfileValue(state, pathKey, value, rowSeen) {
  if (!pathKey) return;
  let profile = state.profiles.get(pathKey);
  if (!profile) {
    if (state.profiles.size >= state.maxFieldPaths) {
      state.skippedNewFieldPaths += 1;
      return;
    }
    profile = {
      path: pathKey,
      count: 0,
      rows: 0,
      emptyCount: 0,
      typeCounts: new Map(),
      sampleValues: []
    };
    state.profiles.set(pathKey, profile);
  }
  profile.count += 1;
  if (!rowSeen.has(pathKey)) {
    rowSeen.add(pathKey);
    profile.rows += 1;
  }
  const kind = schemaProfileValueKind(value);
  incrementCounter(profile.typeCounts, kind);
  if (isSchemaProfileEmptyValue(value)) {
    profile.emptyCount += 1;
  }
  if (profile.sampleValues.length < state.sampleLimit) {
    const sample = schemaProfileSample(value);
    if (!profile.sampleValues.some((existing) => existing.type === sample.type && existing.value === sample.value)) {
      profile.sampleValues.push(sample);
    }
  }
}

function walkSchemaProfileValue(state, pathKey, value, rowSeen, depth) {
  if (!pathKey) return;
  addSchemaProfileValue(state, pathKey, value, rowSeen);
  if (depth >= state.maxDepth) return;
  if (Array.isArray(value)) {
    const limit = Math.min(value.length, state.maxArrayItems);
    if (value.length > state.maxArrayItems) {
      state.truncatedArrays += 1;
    }
    for (let index = 0; index < limit; index += 1) {
      walkSchemaProfileValue(state, `${pathKey}[]`, value[index], rowSeen, depth + 1);
    }
    return;
  }
  if (value && typeof value === 'object') {
    for (const [childKey, childValue] of Object.entries(value)) {
      walkSchemaProfileValue(state, `${pathKey}.${childKey}`, childValue, rowSeen, depth + 1);
    }
  }
}

function schemaFieldProfileToResult(profile, parsedRows) {
  const denominator = Math.max(1, parsedRows);
  return {
    path: profile.path,
    count: profile.count,
    rows: profile.rows,
    coveragePct: Number(((profile.rows / denominator) * 100).toFixed(2)),
    emptyCount: profile.emptyCount,
    types: Object.fromEntries(Array.from(profile.typeCounts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
    sampleValues: profile.sampleValues
  };
}

function buildSchemaProfileRecommendations(result) {
  const recommendations = [];
  if (result.parseErrors > 0) {
    recommendations.push('JSONL parse hatalari var; schema kararindan once export dosyasini yeniden uret veya bozuk satirlari incele.');
  }
  const missingRequired = Object.entries(result.requiredFields || {})
    .filter(([, value]) => value.present !== true)
    .map(([field]) => field);
  if (missingRequired.length > 0) {
    recommendations.push(`Snapshot su beklenen alanlari hic icermiyor: ${missingRequired.join(', ')}. Daha zengin export flagleri veya export uretim hattini kontrol et.`);
  }
  if (result.typeConflicts.length > 0) {
    recommendations.push('Bazi alanlarda birden fazla JSON tipi gorunuyor; migration veya property repair oncesi bu alanlari field bazinda filtrele.');
  }
  if (result.skippedNewFieldPaths > 0) {
    recommendations.push('Field path limiti doldu; daha derin profil icin fieldLimit degerini artir veya maxDepth/maxRows ile hedefi daralt.');
  }
  if (recommendations.length === 0) {
    recommendations.push('Schema profile tutarli gorunuyor; ayrintili DB kesfi icin query/stats/graph actionlariyla alan bazli ilerle.');
  }
  return recommendations;
}

function getFieldPathValues(value, pathExpression) {
  const parts = String(pathExpression || '').split('.').filter(Boolean);
  if (parts.length === 0) return [];
  let current = [value];
  for (const rawPart of parts) {
    const isArrayWildcard = rawPart === '[]' || rawPart.endsWith('[]');
    const key = rawPart === '[]' ? '' : rawPart.replace(/\[\]$/, '');
    const next = [];
    for (const item of current) {
      let target = item;
      if (key) {
        if (target === null || target === undefined) continue;
        if (Array.isArray(target) && /^\d+$/.test(key)) {
          target = target[Number(key)];
        } else {
          target = target[key];
        }
      }
      if (target === undefined) continue;
      if (isArrayWildcard) {
        if (Array.isArray(target)) {
          next.push(...target);
        } else {
          next.push(target);
        }
      } else {
        next.push(target);
      }
    }
    current = next;
    if (current.length === 0) break;
  }
  return current;
}

function fieldProfileValueKey(value) {
  const kind = schemaProfileValueKind(value);
  if (kind === 'array' || kind === 'object') {
    try {
      const json = JSON.stringify(value);
      return json.length > 240 ? `${json.slice(0, 237)}...` : json;
    } catch {
      return schemaProfileSample(value).value;
    }
  }
  return String(value);
}

function createFieldProfileState(field, topLimit, sampleLimit) {
  return {
    field,
    rowsWithValue: 0,
    valueCount: 0,
    emptyCount: 0,
    typeCounts: new Map(),
    topValues: new Map(),
    sampleValues: [],
    topLimit,
    sampleLimit
  };
}

function consumeFieldProfileValues(profile, values) {
  if (!Array.isArray(values) || values.length === 0) return;
  profile.rowsWithValue += 1;
  for (const value of values) {
    profile.valueCount += 1;
    incrementCounter(profile.typeCounts, schemaProfileValueKind(value));
    if (isSchemaProfileEmptyValue(value)) {
      profile.emptyCount += 1;
    }
    const key = fieldProfileValueKey(value);
    incrementCounter(profile.topValues, key);
    if (profile.sampleValues.length < profile.sampleLimit) {
      const sample = schemaProfileSample(value);
      if (!profile.sampleValues.some((existing) => existing.type === sample.type && existing.value === sample.value)) {
        profile.sampleValues.push(sample);
      }
    }
  }
}

function fieldProfileToResult(profile, rowDenominator) {
  const denominator = Math.max(1, rowDenominator);
  return {
    field: profile.field,
    rowsWithValue: profile.rowsWithValue,
    missingRows: Math.max(0, rowDenominator - profile.rowsWithValue),
    coveragePct: Number(((profile.rowsWithValue / denominator) * 100).toFixed(2)),
    valueCount: profile.valueCount,
    emptyCount: profile.emptyCount,
    types: Object.fromEntries(Array.from(profile.typeCounts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
    topValues: counterToRows(profile.topValues, profile.topLimit),
    sampleValues: profile.sampleValues
  };
}

function normalizeFieldProfileFields(payload = {}) {
  const rawFields = Array.isArray(payload.fields)
    ? payload.fields
    : (Array.isArray(payload.paths)
      ? payload.paths
      : [payload.field || payload.path].filter(Boolean));
  const fields = rawFields
    .map((field) => String(field || '').trim())
    .filter(Boolean);
  const deduped = [];
  const seen = new Set();
  for (const field of fields.length > 0 ? fields : ['remId', 'title', 'parentId', 'createdAt', 'updatedAt']) {
    if (seen.has(field)) continue;
    seen.add(field);
    deduped.push(field);
  }
  return deduped.slice(0, 100);
}

function buildFieldProfileRecommendations(result) {
  const recommendations = [];
  if (result.parseErrors > 0) {
    recommendations.push('JSONL parse hatalari var; field dagilimi karari oncesi export dosyasini yeniden uret veya bozuk satirlari incele.');
  }
  const missing = result.fields.filter((field) => field.rowsWithValue === 0).map((field) => field.field);
  if (missing.length > 0) {
    recommendations.push(`Bu field path'lerde deger bulunmadi: ${missing.join(', ')}. Path yazimini schema_profile ciktisiyla karsilastir.`);
  }
  const mixed = result.fields.filter((field) => Object.keys(field.types || {}).length > 1).map((field) => field.field);
  if (mixed.length > 0) {
    recommendations.push(`Birden fazla JSON tipi tasiyan field path'ler var: ${mixed.join(', ')}. Migration oncesi type-specific filtre kullan.`);
  }
  if (recommendations.length === 0) {
    recommendations.push('Field profile okunabilir; gerekirse ayni alanlari query/diff/graph adimlarinda kullan.');
  }
  return recommendations;
}

async function profileRemNoteVaultExportFields(payload = {}) {
  const selection = resolveVaultExportSelection(payload);
  const maxRows = clampNumber(payload.maxRows || payload.maxScan, 50000, 1, 5000000);
  const topLimit = clampNumber(payload.topLimit, 20, 1, 200);
  const sampleLimit = clampNumber(payload.sampleLimit, 5, 0, 50);
  const cursorMode = payload.cursorMode === true || payload.useCursor === true || payload.cursor !== undefined || payload.pageCursor !== undefined;
  const cursorState = decodeVaultQueryCursor(payload.cursor || payload.pageCursor || null);
  const fields = normalizeFieldProfileFields(payload);
  const filters = buildVaultQueryFilters(payload);
  const profiles = fields.map((field) => createFieldProfileState(field, topLimit, sampleLimit));
  let scanned = 0;
  let parsedRows = 0;
  let matchedRows = 0;
  let parseErrors = 0;
  let truncated = false;
  let stopReason = null;
  let nextPosition = null;

  for await (const { line, fileIndex, lineNumber, nextPosition: afterLinePosition } of iterateVaultExportLines(selection, cursorState)) {
    const text = String(line || '').trim();
    if (!text) continue;
    if (scanned >= maxRows) {
      truncated = true;
      stopReason = 'maxRows';
      nextPosition = { fileIndex, lineNumber };
      break;
    }
    scanned += 1;
    nextPosition = afterLinePosition;
    let row;
    try {
      row = JSON.parse(text);
      parsedRows += 1;
    } catch {
      parseErrors += 1;
      continue;
    }
    if (!rowMatchesVaultQuery(row, filters)) continue;
    matchedRows += 1;
    for (const profile of profiles) {
      consumeFieldProfileValues(profile, getFieldPathValues(row, profile.field));
    }
  }

  const cursorResult = (cursorMode || truncated) && nextPosition
    ? buildVaultQueryCursor(selection, nextPosition, {
        kind: 'vault_field_profile_cursor',
        stopReason,
        scanned,
        parsedRows,
        matchedRows,
        parseErrors,
        maxRows
      })
    : null;
  const result = {
    readOnly: true,
    snapshot: true,
    mutationApplied: false,
    mode: 'host_remnote_vault_export_field_profile',
    export: compactVaultExportSelection(selection),
    maxRows,
    topLimit,
    sampleLimit,
    scanned,
    parsedRows,
    matchedRows,
    parseErrors,
    truncated: truncated || Boolean(cursorResult && cursorMode),
    cursorMode,
    cursorStart: formatVaultCursorStart(cursorState),
    nextCursor: cursorResult ? cursorResult.cursor : null,
    nextCursorState: cursorResult ? cursorResult.state : null,
    stopReason,
    filters: {
      query: filters.query || null,
      titleIncludes: filters.titleIncludes || null,
      remIds: Array.from(filters.remIds),
      parentId: filters.parentId || null,
      activePowerup: filters.activePowerup || null,
      tagId: filters.tagId || null,
      sourceId: filters.sourceId || null,
      referenceId: filters.referenceId || null,
      createdAfter: filters.createdAfter,
      createdBefore: filters.createdBefore,
      updatedAfter: filters.updatedAfter,
      updatedBefore: filters.updatedBefore,
      flags: filters.flags
    },
    fieldCount: fields.length,
    fields: profiles.map((profile) => fieldProfileToResult(profile, matchedRows)),
    warnings: [
      'This field profile reads only cached SDK-visible JSONL vault exports; it does not write to RemNote or internal DB files.',
      'Use [] in a path segment, for example properties[].propertyTitle, to flatten array values.'
    ]
  };
  result.recommendations = buildFieldProfileRecommendations(result);
  return result;
}

async function profileRemNoteVaultExportSchema(payload = {}) {
  const selection = resolveVaultExportSelection(payload);
  const maxRows = clampNumber(payload.maxRows || payload.maxScan, 50000, 1, 5000000);
  const fieldLimit = clampNumber(payload.fieldLimit || payload.limit, 200, 1, 5000);
  const topLimit = clampNumber(payload.topLimit, 20, 1, 200);
  const sampleLimit = clampNumber(payload.sampleLimit, 3, 0, 20);
  const maxDepth = clampNumber(payload.maxDepth, 6, 1, 16);
  const maxArrayItems = clampNumber(payload.maxArrayItems, 25, 1, 500);
  const maxFieldPaths = clampNumber(payload.maxFieldPaths, Math.max(1000, fieldLimit * 20), fieldLimit, 50000);
  const cursorMode = payload.cursorMode === true || payload.useCursor === true || payload.cursor !== undefined || payload.pageCursor !== undefined;
  const cursorState = decodeVaultQueryCursor(payload.cursor || payload.pageCursor || null);
  const requiredFieldList = Array.isArray(payload.requiredFields) && payload.requiredFields.length > 0
    ? payload.requiredFields.map((field) => String(field || '').trim()).filter(Boolean)
    : ['remId', 'title', 'parentId', 'createdAt', 'updatedAt', 'childIds', 'flags', 'activePowerups', 'relations', 'properties', 'practice'];
  const state = {
    profiles: new Map(),
    sampleLimit,
    maxDepth,
    maxArrayItems,
    maxFieldPaths,
    truncatedArrays: 0,
    skippedNewFieldPaths: 0
  };
  let scanned = 0;
  let parsedRows = 0;
  let parseErrors = 0;
  let truncated = false;
  let stopReason = null;
  let nextPosition = null;

  for await (const { line, fileIndex, lineNumber, nextPosition: afterLinePosition } of iterateVaultExportLines(selection, cursorState)) {
    const text = String(line || '').trim();
    if (!text) continue;
    if (scanned >= maxRows) {
      truncated = true;
      stopReason = 'maxRows';
      nextPosition = { fileIndex, lineNumber };
      break;
    }
    scanned += 1;
    nextPosition = afterLinePosition;
    let row;
    try {
      row = JSON.parse(text);
      parsedRows += 1;
    } catch {
      parseErrors += 1;
      continue;
    }
    const rowSeen = new Set();
    if (row && typeof row === 'object' && !Array.isArray(row)) {
      for (const [key, value] of Object.entries(row)) {
        walkSchemaProfileValue(state, key, value, rowSeen, 1);
      }
    } else {
      walkSchemaProfileValue(state, '$row', row, rowSeen, 1);
    }
  }

  const fieldsAll = Array.from(state.profiles.values())
    .sort((a, b) => b.rows - a.rows || b.count - a.count || a.path.localeCompare(b.path));
  const fields = fieldsAll.slice(0, fieldLimit).map((profile) => schemaFieldProfileToResult(profile, parsedRows));
  const requiredFields = Object.fromEntries(requiredFieldList.map((field) => {
    const profile = state.profiles.get(field);
    return [field, profile
      ? {
          present: true,
          rows: profile.rows,
          coveragePct: Number(((profile.rows / Math.max(1, parsedRows)) * 100).toFixed(2)),
          types: Object.fromEntries(Array.from(profile.typeCounts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
          missingRows: Math.max(0, parsedRows - profile.rows)
        }
      : {
          present: false,
          rows: 0,
          coveragePct: 0,
          types: {},
          missingRows: parsedRows
        }];
  }));
  const topLevelFields = fieldsAll
    .filter((profile) => !profile.path.includes('.') && !profile.path.includes('[]'))
    .slice(0, topLimit)
    .map((profile) => schemaFieldProfileToResult(profile, parsedRows));
  const typeConflicts = fieldsAll
    .filter((profile) => profile.typeCounts.size > 1)
    .slice(0, topLimit)
    .map((profile) => schemaFieldProfileToResult(profile, parsedRows));
  const cursorResult = (cursorMode || truncated) && nextPosition
    ? buildVaultQueryCursor(selection, nextPosition, {
        kind: 'vault_schema_profile_cursor',
        stopReason,
        scanned,
        parsedRows,
        parseErrors,
        maxRows
      })
    : null;
  const result = {
    readOnly: true,
    snapshot: true,
    mutationApplied: false,
    mode: 'host_remnote_vault_export_schema_profile',
    export: compactVaultExportSelection(selection),
    maxRows,
    fieldLimit,
    topLimit,
    sampleLimit,
    maxDepth,
    maxArrayItems,
    maxFieldPaths,
    scanned,
    parsedRows,
    parseErrors,
    truncated: truncated || Boolean(cursorResult && cursorMode),
    cursorMode,
    cursorStart: formatVaultCursorStart(cursorState),
    nextCursor: cursorResult ? cursorResult.cursor : null,
    nextCursorState: cursorResult ? cursorResult.state : null,
    stopReason,
    fieldPathCount: state.profiles.size,
    returnedFieldPathCount: fields.length,
    skippedNewFieldPaths: state.skippedNewFieldPaths,
    truncatedArrays: state.truncatedArrays,
    requiredFields,
    topLevelFields,
    typeConflicts,
    fields,
    warnings: [
      'This schema profile reads only cached SDK-visible JSONL vault exports; it does not write to RemNote or internal DB files.',
      'Array element paths are normalized with [] so repeated list items share one schema path.'
    ]
  };
  result.recommendations = buildSchemaProfileRecommendations(result);
  return result;
}

function addQualityIssue(report, type, severity, row, detail = {}, amount = 1) {
  const safeAmount = Math.max(1, Math.floor(Number(amount) || 1));
  report.issueCounts[type] = (report.issueCounts[type] || 0) + safeAmount;
  report.severityCounts[severity] = (report.severityCounts[severity] || 0) + safeAmount;
  if (report.issueSamples.length < report.issueLimit) {
    report.issueSamples.push({
      type,
      severity,
      remId: row?.remId || null,
      title: row?.title || '',
      parentId: row?.parentId || null,
      detail
    });
  }
}

function gradeQualityScore(score) {
  if (score >= 90) return 'good';
  if (score >= 75) return 'watch';
  if (score >= 60) return 'needs_review';
  return 'risky';
}

function hasOwnField(obj, key) {
  return Boolean(obj && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, key));
}

function createQualitySchemaCoverage(strictSchema) {
  return {
    strictSchema,
    missingFields: {
      title: 0,
      parentId: 0,
      createdAt: 0,
      updatedAt: 0,
      localUpdatedAt: 0,
      flags: 0,
      activePowerups: 0,
      relations: 0,
      properties: 0,
      practice: 0
    }
  };
}

function noteSchemaMissing(schemaCoverage, field) {
  if (!schemaCoverage.missingFields[field] && schemaCoverage.missingFields[field] !== 0) {
    schemaCoverage.missingFields[field] = 0;
  }
  schemaCoverage.missingFields[field] += 1;
}

function buildQualityRecommendations(issueCounts) {
  const recommendations = [];
  const push = (condition, text) => {
    if (condition) recommendations.push(text);
  };
  push(issueCounts.parseErrors > 0, 'JSONL export satirlarinda parse hatasi var; export dosyasini yeniden uret veya bozuk satirlari host cache uzerinden incele.');
  push(issueCounts.missingRemId > 0, 'Rem ID eksik satirlar canonical Rem olarak guvenilir degil; export uretim hattini ve row schema alanlarini kontrol et.');
  push(issueCounts.missingTitle > 0, 'Bos baslikli Rem satirlari var; RemNote Doctor veya targeted query ile yapisal slot mu gercek bos not mu ayirt et.');
  push(issueCounts.missingCreatedAt > 0 || issueCounts.missingUpdatedAt > 0 || issueCounts.missingLocalUpdatedAt > 0, 'Timestamp eksikleri var; backfill gereken sayfalar icin RemNote Doctor veya tag-specific repair plan kullan.');
  push(issueCounts.propertyErrors > 0, 'Property okuma hatalari var; ilgili propertyId/propertyTitle orneklerini get_property_info ve read_rem_full ile incele.');
  push(issueCounts.propertyValuesMissing > 0, 'Bos property degerleri var; Learning/Domain/Status gibi workflow propertyleri icin plan_*_repairs ile onarim taslagi uret.');
  push(issueCounts.relationCountOnlyRemainder > 0, 'Bazi relation bloklari sadece count bilgisinde kalmis; gerekirse export_vault_snapshot relationMode=ids veya summaries ile daha zengin snapshot al.');
  push(issueCounts.practiceEnabledWithoutCards > 0 || issueCounts.cardItemWithoutCards > 0, 'Practice/card hazirligi eksikleri var; export_practice_queue ve flashcard actionlariyla kart adaylarini tekrar kontrol et.');
  if (recommendations.length === 0) {
    recommendations.push('Belirgin kalite sorunu yakalanmadi; daha derin inceleme icin graph export ve DB Doctor raporunu birlikte kullan.');
  }
  return recommendations;
}

function buildQualitySchemaRecommendations(schemaCoverage) {
  const recommendations = [];
  const missing = schemaCoverage?.missingFields || {};
  const optionalMissing = ['flags', 'activePowerups', 'relations', 'properties', 'practice']
    .filter((key) => (missing[key] || 0) > 0);
  if (optionalMissing.length > 0) {
    recommendations.push(`Bu rapordaki snapshot bazi opsiyonel bloklari icermiyor: ${optionalMissing.join(', ')}. Daha dolu kalite raporu icin export'u ilgili include flag'leriyle yeniden uret.`);
  }
  if ((missing.localUpdatedAt || 0) > 0) {
    recommendations.push('Snapshot localUpdatedAt alanini icermiyor; bu genelde export kapsami siniridir, RemNote verisinin bozuk oldugunu tek basina gostermez.');
  }
  return recommendations;
}

function buildQualityRepairPlanPreview(issueCounts = {}, schemaCoverage = {}) {
  const items = [];
  const addItem = (issueType, count, category, suggestedAction, risk, reason) => {
    const safeCount = Math.max(0, Math.floor(Number(count) || 0));
    if (safeCount < 1) return;
    items.push({
      issueType,
      count: safeCount,
      category,
      suggestedAction,
      risk,
      reason
    });
  };

  addItem(
    'parseErrors',
    issueCounts.parseErrors,
    'regenerate_export_needed',
    'host_remnote_vault_snapshot_export_partitioned',
    'medium',
    'JSONL satiri okunamiyorsa once temiz bir export alinmali; repair actionlari bozuk satir uzerinden guvenilir karar veremez.'
  );
  addItem(
    'missingRemId',
    issueCounts.missingRemId,
    'manual_review',
    'host_remnote_vault_export_query',
    'high',
    'Rem ID olmayan satir canonical Rem olarak hedeflenemez; once export kaynagi ve satir semasi incelenmeli.'
  );
  addItem(
    'missingTitle',
    issueCounts.missingTitle,
    'manual_review',
    'remnote_doctor_scan',
    'medium',
    'Bos baslik bazen gercek bos not, bazen RemNote yapisal slotu olabilir; silme veya backfill oncesi Doctor ayrimi gerekir.'
  );
  addItem(
    'missingCreatedAt',
    issueCounts.missingCreatedAt,
    'safe_migration_candidate',
    'remnote_doctor_scan -> plan_remnote_doctor_repairs',
    'medium',
    'Created at benzeri workflow tarihleri SDK-visible timestamp kaynaklariyla dry-run planlanabilir.'
  );
  addItem(
    'missingUpdatedAt',
    issueCounts.missingUpdatedAt,
    'safe_migration_candidate',
    'remnote_doctor_scan -> plan_remnote_doctor_repairs',
    'medium',
    'Updated timestamp eksikleri tag/property onarimi icin dry-run plan uretmeye adaydir.'
  );
  addItem(
    'missingLocalUpdatedAt',
    issueCounts.missingLocalUpdatedAt,
    'richer_export_needed',
    'export_vault_snapshot includeRawText=true',
    'low',
    'localUpdatedAt cogu zaman export kapsami siniridir; veri onarimi yerine daha zengin snapshot ile dogrulanmali.'
  );
  addItem(
    'propertyErrors',
    issueCounts.propertyErrors,
    'sdk_inspect',
    'read_rem_full -> get_property_info',
    'medium',
    'Property okuma hatalari propertyId/propertyTitle bazinda SDK ile tekrar incelenmeli; otomatik repair icin fazla belirsizdir.'
  );
  addItem(
    'propertyValuesMissing',
    issueCounts.propertyValuesMissing,
    'safe_migration_candidate',
    'plan_learning_inbox_repairs veya safe_migration_plan',
    'low',
    'Bos workflow propertyleri dry-run migration planina cevrilebilir; apply icin yine explicit onay gerekir.'
  );
  addItem(
    'relationCountOnlyRemainder',
    issueCounts.relationCountOnlyRemainder,
    'richer_export_needed',
    'export_vault_snapshot relationMode=ids',
    'low',
    'Relation count var ama ID listesi eksikse repair degil daha zengin relation export gerekir.'
  );
  addItem(
    'cardItemWithoutCards',
    issueCounts.cardItemWithoutCards,
    'practice_repair_candidate',
    'export_practice_queue -> batch_create_flashcards',
    'medium',
    'Card item gorunen Rem icin kart nesnesi eksik; once practice queue export ile adaylar ayrilmali.'
  );
  addItem(
    'practiceEnabledWithoutCards',
    issueCounts.practiceEnabledWithoutCards,
    'practice_repair_candidate',
    'export_practice_queue -> create_flashcard',
    'medium',
    'Practice acik ama kart yoksa kart olusturma taslagi insan onayli flashcard actionlarina tasinabilir.'
  );

  const missing = schemaCoverage?.missingFields || {};
  const optionalFields = ['localUpdatedAt', 'flags', 'activePowerups', 'relations', 'properties', 'practice'];
  const missingOptionalFields = optionalFields
    .map((field) => ({ field, count: Math.max(0, Math.floor(Number(missing[field]) || 0)) }))
    .filter((entry) => entry.count > 0);
  const optionalMissingCount = missingOptionalFields.reduce((sum, entry) => sum + entry.count, 0);
  if (optionalMissingCount > 0) {
    addItem(
      'schemaCoverage.optionalFieldsMissing',
      optionalMissingCount,
      'richer_export_needed',
      'host_remnote_vault_snapshot_export_partitioned includeTypeFlags/includePowerups/includeRelations/includeProperties/includePracticeData',
      'low',
      `Snapshot opsiyonel bloklari icermiyor: ${missingOptionalFields.map((entry) => entry.field).join(', ')}. Bu tek basina RemNote veri bozuklugu degildir.`
    );
  }

  const coreFields = ['title', 'parentId', 'createdAt', 'updatedAt'];
  const missingCoreFields = coreFields
    .map((field) => ({ field, count: Math.max(0, Math.floor(Number(missing[field]) || 0)) }))
    .filter((entry) => entry.count > 0);
  const coreMissingCount = missingCoreFields.reduce((sum, entry) => sum + entry.count, 0);
  if (coreMissingCount > 0) {
    addItem(
      'schemaCoverage.coreFieldsMissing',
      coreMissingCount,
      'regenerate_export_needed',
      'host_remnote_vault_snapshot_export_partitioned',
      'medium',
      `Snapshot temel alanlari icermiyor: ${missingCoreFields.map((entry) => entry.field).join(', ')}. Onarimdan once export semasi dogrulanmali.`
    );
  }

  const categorySummary = items.reduce((summary, item) => {
    summary[item.category] = (summary[item.category] || 0) + item.count;
    return summary;
  }, {});

  return {
    readOnly: true,
    dryRun: true,
    mutationApplied: false,
    summary: {
      totalItems: items.length,
      totalAffectedCount: items.reduce((sum, item) => sum + item.count, 0),
      safeMigrationCandidates: categorySummary.safe_migration_candidate || 0,
      richerExportNeeded: categorySummary.richer_export_needed || 0,
      manualReviewNeeded: categorySummary.manual_review || 0,
      sdkInspectNeeded: categorySummary.sdk_inspect || 0,
      practiceRepairCandidates: categorySummary.practice_repair_candidate || 0,
      regenerateExportNeeded: categorySummary.regenerate_export_needed || 0
    },
    items
  };
}

async function reportRemNoteVaultQuality(payload = {}) {
  const selection = resolveVaultExportSelection(payload);
  const maxRows = clampNumber(payload.maxRows || payload.maxScan, 200000, 1, 5000000);
  const topLimit = clampNumber(payload.topLimit, 20, 1, 200);
  const issueLimit = clampNumber(payload.issueLimit, 100, 0, 1000);
  const strictSchema = payload.strictSchema === true;
  const cursorState = decodeVaultQueryCursor(payload.cursor || payload.pageCursor || null);
  const issueTypeCounter = new Map();
  const report = {
    issueLimit,
    schemaCoverage: createQualitySchemaCoverage(strictSchema),
    issueCounts: {
      parseErrors: 0,
      missingRemId: 0,
      missingTitle: 0,
      missingParentId: 0,
      missingCreatedAt: 0,
      missingUpdatedAt: 0,
      missingLocalUpdatedAt: 0,
      missingFlags: 0,
      missingActivePowerups: 0,
      missingRelations: 0,
      missingProperties: 0,
      missingPractice: 0,
      propertyErrors: 0,
      propertyValuesMissing: 0,
      relationCountOnlyRemainder: 0,
      cardItemWithoutCards: 0,
      practiceEnabledWithoutCards: 0
    },
    severityCounts: {
      critical: 0,
      warning: 0,
      info: 0
    },
    issueSamples: []
  };
  let scanned = 0;
  let parsedRows = 0;
  let parseErrors = 0;
  let truncated = false;
  let stopReason = null;
  let nextPosition = null;

  const countIssueType = (type, amount = 1) => incrementCounter(issueTypeCounter, type, amount);
  const addIssue = (type, severity, row, detail, amount = 1) => {
    addQualityIssue(report, type, severity, row, detail, amount);
    countIssueType(type, amount);
  };

  for await (const { line, fileIndex, lineNumber, nextPosition: afterLinePosition } of iterateVaultExportLines(selection, cursorState)) {
    const text = String(line || '').trim();
    if (!text) continue;
    if (scanned >= maxRows) {
      truncated = true;
      stopReason = 'maxRows';
      nextPosition = { fileIndex, lineNumber };
      break;
    }
    scanned += 1;
    nextPosition = afterLinePosition;
    let row;
    try {
      row = JSON.parse(text);
      parsedRows += 1;
    } catch (err) {
      parseErrors += 1;
      addIssue('parseErrors', 'critical', null, { fileIndex, lineNumber, error: formatError(err) });
      continue;
    }

    if (!row.remId) addIssue('missingRemId', 'critical', row);
    if (!hasOwnField(row, 'title')) {
      noteSchemaMissing(report.schemaCoverage, 'title');
      if (strictSchema) addIssue('missingTitle', 'info', row, { schemaOnly: true });
    } else if (!String(row.title || '').trim()) {
      addIssue('missingTitle', 'warning', row);
    }
    if (!hasOwnField(row, 'parentId')) {
      noteSchemaMissing(report.schemaCoverage, 'parentId');
      if (strictSchema) addIssue('missingParentId', 'info', row, { schemaOnly: true });
    }
    if (!hasOwnField(row, 'createdAt')) {
      noteSchemaMissing(report.schemaCoverage, 'createdAt');
      if (strictSchema) addIssue('missingCreatedAt', 'info', row, { schemaOnly: true });
    } else if (typeof row.createdAt !== 'number') {
      addIssue('missingCreatedAt', 'warning', row);
    }
    if (!hasOwnField(row, 'updatedAt')) {
      noteSchemaMissing(report.schemaCoverage, 'updatedAt');
      if (strictSchema) addIssue('missingUpdatedAt', 'info', row, { schemaOnly: true });
    } else if (typeof row.updatedAt !== 'number') {
      addIssue('missingUpdatedAt', 'warning', row);
    }
    if (!hasOwnField(row, 'localUpdatedAt')) {
      noteSchemaMissing(report.schemaCoverage, 'localUpdatedAt');
      if (strictSchema) addIssue('missingLocalUpdatedAt', 'info', row, { schemaOnly: true });
    } else if (typeof row.localUpdatedAt !== 'number') {
      addIssue('missingLocalUpdatedAt', 'info', row);
    }
    if (!hasOwnField(row, 'flags')) {
      noteSchemaMissing(report.schemaCoverage, 'flags');
      if (strictSchema) addIssue('missingFlags', 'info', row, { schemaOnly: true });
    } else if (!row.flags || typeof row.flags !== 'object') {
      addIssue('missingFlags', 'info', row);
    }
    if (!hasOwnField(row, 'activePowerups')) {
      noteSchemaMissing(report.schemaCoverage, 'activePowerups');
      if (strictSchema) addIssue('missingActivePowerups', 'info', row, { schemaOnly: true });
    } else if (!Array.isArray(row.activePowerups)) {
      addIssue('missingActivePowerups', 'info', row);
    }
    if (!hasOwnField(row, 'relations')) {
      noteSchemaMissing(report.schemaCoverage, 'relations');
      if (strictSchema) addIssue('missingRelations', 'info', row, { schemaOnly: true });
    } else if (!row.relations || typeof row.relations !== 'object') {
      addIssue('missingRelations', 'info', row);
    }
    if (!hasOwnField(row, 'properties')) {
      noteSchemaMissing(report.schemaCoverage, 'properties');
      if (strictSchema) addIssue('missingProperties', 'info', row, { schemaOnly: true });
    } else if (!Array.isArray(row.properties)) {
      addIssue('missingProperties', 'info', row);
    }
    if (!hasOwnField(row, 'practice')) {
      noteSchemaMissing(report.schemaCoverage, 'practice');
      if (strictSchema) addIssue('missingPractice', 'info', row, { schemaOnly: true });
    } else if (!row.practice || typeof row.practice !== 'object') {
      addIssue('missingPractice', 'info', row);
    }

    if (Array.isArray(row.properties)) {
      for (const property of row.properties) {
        if (property?.error) {
          addIssue('propertyErrors', 'warning', row, {
            propertyId: property.propertyId || null,
            propertyTitle: property.propertyTitle || null,
            error: property.error
          });
        }
        if (!String(property?.valuePlain || '').trim()) {
          addIssue('propertyValuesMissing', 'info', row, {
            propertyId: property?.propertyId || null,
            propertyTitle: property?.propertyTitle || null
          });
        }
      }
    }

    if (row.relations && typeof row.relations === 'object') {
      for (const key of VAULT_STATS_RELATION_KEYS) {
        const block = row.relations[key];
        const count = relationBlockCount(block);
        const ids = relationBlockIds(block);
        const remainder = Math.max(0, count - ids.length);
        if (remainder > 0) {
          addIssue('relationCountOnlyRemainder', 'info', row, { relation: key, count, ids: ids.length, remainder }, remainder);
        }
      }
    }

    if (row.practice && typeof row.practice === 'object') {
      const cardCount = Array.isArray(row.practice.cards) ? row.practice.cards.length : 0;
      if (row.practice.isCardItem === true && cardCount < 1) {
        addIssue('cardItemWithoutCards', 'warning', row, { cardCount });
      }
      if (row.practice.enablePractice === true && cardCount < 1) {
        addIssue('practiceEnabledWithoutCards', 'warning', row, { cardCount });
      }
    }
  }

  const denominator = Math.max(1, parsedRows);
  const criticalPenalty = Math.min(45, (report.severityCounts.critical / denominator) * 100 * 0.7);
  const warningPenalty = Math.min(40, (report.severityCounts.warning / denominator) * 100 * 0.35);
  const infoPenalty = Math.min(15, (report.severityCounts.info / denominator) * 100 * 0.08);
  const qualityScore = Math.max(0, Math.round(100 - criticalPenalty - warningPenalty - infoPenalty));
  const cursorResult = truncated && nextPosition
    ? buildVaultQueryCursor(selection, nextPosition, {
        kind: 'vault_quality_report_cursor',
        stopReason,
        scanned,
        parsedRows,
        parseErrors,
        maxRows
      })
    : null;

  return {
    readOnly: true,
    snapshot: true,
    mutationApplied: false,
    mode: 'host_remnote_vault_quality_report',
    export: compactVaultExportSelection(selection),
    maxRows,
    topLimit,
    scanned,
    parsedRows,
    parseErrors,
    truncated,
    cursorStart: formatVaultCursorStart(cursorState),
    nextCursor: cursorResult ? cursorResult.cursor : null,
    nextCursorState: cursorResult ? cursorResult.state : null,
    stopReason,
    qualityScore,
    grade: gradeQualityScore(qualityScore),
    schemaCoverage: report.schemaCoverage,
    issueCounts: report.issueCounts,
    severityCounts: report.severityCounts,
    topIssueTypes: counterToRows(issueTypeCounter, topLimit),
    issueSamples: report.issueSamples,
    recommendations: buildQualityRecommendations(report.issueCounts),
    schemaRecommendations: buildQualitySchemaRecommendations(report.schemaCoverage),
    repairPlanPreview: buildQualityRepairPlanPreview(report.issueCounts, report.schemaCoverage)
  };
}

function buildVaultGraphNode(row, fields) {
  const node = {
    id: String(row.remId),
    kind: 'rem',
    title: row.title || ''
  };
  for (const field of fields) {
    if (field === 'remId' || field === 'title') continue;
    const value = getPathValue(row, field);
    if (value !== undefined) {
      node[field] = value;
    }
  }
  return node;
}

async function exportRemNoteVaultGraph(payload = {}) {
  const selection = resolveVaultExportSelection(payload);
  const maxScan = clampNumber(payload.maxScan, 200000, 1, 500000);
  const maxNodes = clampNumber(payload.maxNodes, 200000, 1, 500000);
  const maxEdges = clampNumber(payload.maxEdges, 300000, 0, 1000000);
  const includeNodes = payload.includeNodes !== false;
  const includeEdges = payload.includeEdges !== false;
  const includeParentEdges = payload.includeParentEdges !== false;
  const includeChildEdges = payload.includeChildEdges !== false;
  const includeRelationEdges = payload.includeRelationEdges !== false;
  const includePropertyEdges = payload.includePropertyEdges !== false;
  const includePracticeEdges = payload.includePracticeEdges !== false;
  const includePropertyValues = payload.includePropertyValues === true;
  const nodeFields = normalizeFieldList(payload.nodeFields, [
    'remId',
    'title',
    'parentId',
    'createdAt',
    'updatedAt',
    'localUpdatedAt',
    'flags',
    'activePowerups'
  ]);
  const nodes = new Map();
  const edges = [];
  const edgeKeys = new Set();
  const edgeTypeCounts = new Map();
  let scanned = 0;
  let parsedRows = 0;
  let parseErrors = 0;
  let scanLimitReached = false;
  let nodeLimitReached = false;
  let edgeLimitReached = false;

  const ensureNode = (id, patch = {}) => {
    if (!id) return false;
    const key = String(id);
    if (nodes.has(key)) {
      nodes.set(key, { ...nodes.get(key), ...patch, id: key });
      return true;
    }
    if (nodes.size >= maxNodes) {
      nodeLimitReached = true;
      return false;
    }
    nodes.set(key, {
      id: key,
      kind: 'external',
      ...patch
    });
    return true;
  };

  const addEdge = (from, to, type, metadata = {}) => {
    if (!from || !to || !type) return false;
    if (edges.length >= maxEdges) {
      edgeLimitReached = true;
      return false;
    }
    const source = String(from);
    const target = String(to);
    const edgeType = String(type);
    const key = `${source}\u0000${target}\u0000${edgeType}`;
    if (edgeKeys.has(key)) return false;
    edgeKeys.add(key);
    edges.push({
      source,
      target,
      type: edgeType,
      ...metadata
    });
    incrementCounter(edgeTypeCounts, edgeType);
    return true;
  };

  const addRelationEdges = (row, relationKey, edgeType, direction = 'out') => {
    if (!includeRelationEdges || !row?.relations?.[relationKey]) return;
    const block = row.relations[relationKey];
    const summaries = relationBlockSummaryMap(block);
    for (const id of relationBlockIds(block)) {
      const summary = summaries.get(id) || {};
      ensureNode(id, {
        kind: relationKey,
        title: summary.title || undefined,
        relationType: relationKey
      });
      if (direction === 'in') {
        addEdge(id, row.remId, edgeType, { relation: relationKey });
      } else {
        addEdge(row.remId, id, edgeType, { relation: relationKey });
      }
    }
  };

  for await (const { line } of iterateVaultExportLines(selection)) {
    const text = String(line || '').trim();
    if (!text) continue;
    if (scanned >= maxScan) {
      scanLimitReached = true;
      break;
    }
    scanned += 1;
    let row;
    try {
      row = JSON.parse(text);
      parsedRows += 1;
    } catch {
      parseErrors += 1;
      continue;
    }
    if (!row.remId) continue;

    ensureNode(row.remId, buildVaultGraphNode(row, nodeFields));

    if (includeParentEdges && row.parentId) {
      ensureNode(row.parentId, { kind: 'parent_stub' });
      addEdge(row.parentId, row.remId, 'parent_of');
    }
    if (includeChildEdges && Array.isArray(row.childIds)) {
      for (const childId of row.childIds) {
        ensureNode(childId, { kind: 'child_stub' });
        addEdge(row.remId, childId, 'parent_of');
      }
    }

    addRelationEdges(row, 'tags', 'tagged_with');
    addRelationEdges(row, 'sources', 'has_source');
    addRelationEdges(row, 'aliases', 'has_alias');
    addRelationEdges(row, 'referencesOut', 'references');
    addRelationEdges(row, 'referencesIn', 'referenced_by', 'in');
    addRelationEdges(row, 'portalsAndDocumentsIn', 'included_in', 'in');

    if (includePropertyEdges && Array.isArray(row.properties)) {
      for (const property of row.properties) {
        if (!property?.propertyId) continue;
        ensureNode(property.propertyId, {
          kind: 'property',
          title: property.propertyTitle || undefined
        });
        const metadata = {
          relation: 'property',
          tagId: property.tagId || undefined,
          tagTitle: property.tagTitle || undefined
        };
        if (includePropertyValues) {
          metadata.valuePlain = property.valuePlain || '';
        }
        addEdge(row.remId, property.propertyId, 'has_property', metadata);
      }
    }

    if (includePracticeEdges && row.practice && Array.isArray(row.practice.cards)) {
      for (const card of row.practice.cards) {
        const cardId = card?._id || card?.cardId || card?.id;
        if (!cardId) continue;
        const graphCardId = `card:${cardId}`;
        ensureNode(graphCardId, {
          kind: 'practice_card',
          remId: row.remId,
          cardType: card.type || null,
          nextRepetitionTime: card.nextRepetitionTime || null
        });
        addEdge(row.remId, graphCardId, 'has_practice_card', {
          relation: 'practice',
          cardType: card.type || undefined
        });
      }
    }
  }

  const nodeRows = Array.from(nodes.values());
  const externalNodeCount = nodeRows.filter((node) => node.kind !== 'rem').length;
  return {
    readOnly: true,
    snapshot: true,
    mutationApplied: false,
    mode: 'host_remnote_vault_export_graph',
    graphFormat: 'nodes_edges_v1',
    export: compactVaultExportSelection(selection),
    maxScan,
    maxNodes,
    maxEdges,
    scanned,
    parsedRows,
    parseErrors,
    truncated: scanLimitReached || nodeLimitReached || edgeLimitReached,
    truncation: {
      scanLimitReached,
      nodeLimitReached,
      edgeLimitReached
    },
    nodeCount: nodeRows.length,
    externalNodeCount,
    edgeCount: edges.length,
    edgeTypeCounts: counterToRows(edgeTypeCounts, 100),
    nodes: includeNodes ? nodeRows : undefined,
    edges: includeEdges ? edges : undefined
  };
}

async function writeJsonLine(stream, row) {
  if (!stream.write(`${JSON.stringify(row)}\n`)) {
    await new Promise((resolve, reject) => {
      stream.once('drain', resolve);
      stream.once('error', reject);
    });
  }
}

async function finishJsonlStream(stream) {
  stream.end();
  await new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

async function exportRemNoteVaultGraphToFile(payload = {}) {
  const selection = resolveVaultExportSelection(payload);
  const maxScan = clampNumber(payload.maxScan, 200000, 1, 500000);
  const maxNodes = clampNumber(payload.maxNodes, 200000, 1, 500000);
  const maxEdges = clampNumber(payload.maxEdges, 300000, 0, 1000000);
  const includeParentEdges = payload.includeParentEdges !== false;
  const includeChildEdges = payload.includeChildEdges !== false;
  const includeRelationEdges = payload.includeRelationEdges !== false;
  const includePropertyEdges = payload.includePropertyEdges !== false;
  const includePracticeEdges = payload.includePracticeEdges !== false;
  const includePropertyValues = payload.includePropertyValues === true;
  const nodeFields = normalizeFieldList(payload.nodeFields, [
    'remId',
    'title',
    'parentId',
    'createdAt',
    'updatedAt',
    'localUpdatedAt',
    'flags',
    'activePowerups'
  ]);
  const graphId = sanitizeSnapshotId(payload.graphId || `vault_graph_${new Date().toISOString().replace(/[:.]/g, '-')}`) || 'vault_graph';
  const graphDir = path.join(hostVaultGraphExportRoot, graphId);
  const nodesPath = path.join(graphDir, 'nodes.jsonl');
  const edgesPath = path.join(graphDir, 'edges.jsonl');
  const manifestPath = path.join(graphDir, 'manifest.json');
  const startedAtGraph = new Date().toISOString();
  ensureDir(graphDir);

  const realNodeIds = new Set();
  const externalNodes = new Map();
  const edgeKeys = new Set();
  const edgeTypeCounts = new Map();
  let scanned = 0;
  let parsedRows = 0;
  let parseErrors = 0;
  let edgePassScanned = 0;
  let edgePassParsedRows = 0;
  let edgePassParseErrors = 0;
  let edgeCount = 0;
  let scanLimitReached = false;
  let edgePassScanLimitReached = false;
  let nodeLimitReached = false;
  let edgeLimitReached = false;

  const currentNodeCount = () => realNodeIds.size + externalNodes.size;
  const rememberExternalNode = (id, patch = {}) => {
    if (!id) return false;
    const key = String(id);
    if (realNodeIds.has(key)) return true;
    if (externalNodes.has(key)) {
      externalNodes.set(key, { ...externalNodes.get(key), ...patch, id: key });
      return true;
    }
    if (currentNodeCount() >= maxNodes) {
      nodeLimitReached = true;
      return false;
    }
    externalNodes.set(key, {
      id: key,
      kind: 'external',
      ...patch
    });
    return true;
  };

  const nodesStream = fs.createWriteStream(nodesPath, { encoding: 'utf8' });
  try {
    for await (const { line } of iterateVaultExportLines(selection)) {
      const text = String(line || '').trim();
      if (!text) continue;
      if (scanned >= maxScan) {
        scanLimitReached = true;
        break;
      }
      scanned += 1;
      let row;
      try {
        row = JSON.parse(text);
        parsedRows += 1;
      } catch {
        parseErrors += 1;
        continue;
      }
      if (!row.remId) continue;
      const remId = String(row.remId);
      if (realNodeIds.has(remId)) continue;
      if (currentNodeCount() >= maxNodes) {
        nodeLimitReached = true;
        continue;
      }
      realNodeIds.add(remId);
      await writeJsonLine(nodesStream, buildVaultGraphNode(row, nodeFields));
    }

    const edgesStream = fs.createWriteStream(edgesPath, { encoding: 'utf8' });
    try {
      const addEdge = async (from, to, type, metadata = {}) => {
        if (!from || !to || !type) return false;
        if (edgeCount >= maxEdges) {
          edgeLimitReached = true;
          return false;
        }
        const source = String(from);
        const target = String(to);
        const edgeType = String(type);
        const key = `${source}\u0000${target}\u0000${edgeType}`;
        if (edgeKeys.has(key)) return false;
        edgeKeys.add(key);
        await writeJsonLine(edgesStream, {
          source,
          target,
          type: edgeType,
          ...metadata
        });
        edgeCount += 1;
        incrementCounter(edgeTypeCounts, edgeType);
        return true;
      };

      const addRelationEdges = async (row, relationKey, edgeType, direction = 'out') => {
        if (!includeRelationEdges || !row?.relations?.[relationKey]) return;
        const block = row.relations[relationKey];
        const summaries = relationBlockSummaryMap(block);
        for (const id of relationBlockIds(block)) {
          const summary = summaries.get(id) || {};
          rememberExternalNode(id, {
            kind: relationKey,
            title: summary.title || undefined,
            relationType: relationKey
          });
          if (direction === 'in') {
            await addEdge(id, row.remId, edgeType, { relation: relationKey });
          } else {
            await addEdge(row.remId, id, edgeType, { relation: relationKey });
          }
        }
      };

      for await (const { line } of iterateVaultExportLines(selection)) {
        const text = String(line || '').trim();
        if (!text) continue;
        if (edgePassScanned >= maxScan) {
          edgePassScanLimitReached = true;
          break;
        }
        edgePassScanned += 1;
        let row;
        try {
          row = JSON.parse(text);
          edgePassParsedRows += 1;
        } catch {
          edgePassParseErrors += 1;
          continue;
        }
        if (!row.remId) continue;

        if (includeParentEdges && row.parentId) {
          rememberExternalNode(row.parentId, { kind: 'parent_stub' });
          await addEdge(row.parentId, row.remId, 'parent_of');
        }
        if (includeChildEdges && Array.isArray(row.childIds)) {
          for (const childId of row.childIds) {
            rememberExternalNode(childId, { kind: 'child_stub' });
            await addEdge(row.remId, childId, 'parent_of');
          }
        }

        await addRelationEdges(row, 'tags', 'tagged_with');
        await addRelationEdges(row, 'sources', 'has_source');
        await addRelationEdges(row, 'aliases', 'has_alias');
        await addRelationEdges(row, 'referencesOut', 'references');
        await addRelationEdges(row, 'referencesIn', 'referenced_by', 'in');
        await addRelationEdges(row, 'portalsAndDocumentsIn', 'included_in', 'in');

        if (includePropertyEdges && Array.isArray(row.properties)) {
          for (const property of row.properties) {
            if (!property?.propertyId) continue;
            rememberExternalNode(property.propertyId, {
              kind: 'property',
              title: property.propertyTitle || undefined
            });
            const metadata = {
              relation: 'property',
              tagId: property.tagId || undefined,
              tagTitle: property.tagTitle || undefined
            };
            if (includePropertyValues) {
              metadata.valuePlain = property.valuePlain || '';
            }
            await addEdge(row.remId, property.propertyId, 'has_property', metadata);
          }
        }

        if (includePracticeEdges && row.practice && Array.isArray(row.practice.cards)) {
          for (const card of row.practice.cards) {
            const cardId = card?._id || card?.cardId || card?.id;
            if (!cardId) continue;
            const graphCardId = `card:${cardId}`;
            rememberExternalNode(graphCardId, {
              kind: 'practice_card',
              remId: row.remId,
              cardType: card.type || null,
              nextRepetitionTime: card.nextRepetitionTime || null
            });
            await addEdge(row.remId, graphCardId, 'has_practice_card', {
              relation: 'practice',
              cardType: card.type || undefined
            });
          }
        }
      }
    } finally {
      await finishJsonlStream(edgesStream);
    }

    for (const node of externalNodes.values()) {
      await writeJsonLine(nodesStream, node);
    }
  } finally {
    await finishJsonlStream(nodesStream);
  }

  const completedAt = new Date().toISOString();
  const manifest = {
    readOnly: true,
    snapshot: true,
    mutationApplied: false,
    mode: 'host_remnote_vault_export_graph_file',
    graphFormat: 'nodes_edges_jsonl_v1',
    sourceGraphFormat: 'nodes_edges_v1',
    fileFormat: 'jsonl',
    streaming: true,
    memoryMode: 'streaming_nodes_edges_v1',
    scanPasses: 2,
    graphId,
    graphDir,
    nodesPath,
    edgesPath,
    manifestPath,
    startedAt: startedAtGraph,
    completedAt,
    sourceGraphMode: 'host_remnote_vault_export_graph',
    sourceExport: compactVaultExportSelection(selection),
    source: compactVaultExportSelection(selection),
    maxScan,
    maxNodes,
    maxEdges,
    scanned,
    parsedRows,
    parseErrors,
    edgePassScanned,
    edgePassParsedRows,
    edgePassParseErrors,
    truncated: scanLimitReached || edgePassScanLimitReached || nodeLimitReached || edgeLimitReached,
    truncation: {
      scanLimitReached,
      edgePassScanLimitReached,
      nodeLimitReached,
      edgeLimitReached
    },
    nodeCount: currentNodeCount(),
    realNodeCount: realNodeIds.size,
    externalNodeCount: externalNodes.size,
    edgeCount,
    edgeTypeCounts: counterToRows(edgeTypeCounts, 100),
    warnings: [
      'This graph file export is built from SDK-visible JSONL vault exports in the host cache.',
      'It streams nodes and edges to JSONL files instead of returning the full graph in memory.',
      'It does not write to RemNote or internal DB files.'
    ]
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

function listVaultGraphExportManifests() {
  if (!fs.existsSync(hostVaultGraphExportRoot)) {
    return [];
  }
  return fs.readdirSync(hostVaultGraphExportRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const graphDir = path.join(hostVaultGraphExportRoot, entry.name);
      const manifestPath = path.join(graphDir, 'manifest.json');
      const stat = safeReadStat(manifestPath) || safeReadStat(graphDir);
      const manifest = safeReadJson(manifestPath) || {};
      return {
        graphId: entry.name,
        graphDir,
        manifestPath,
        nodesPath: manifest.nodesPath || path.join(graphDir, 'nodes.jsonl'),
        edgesPath: manifest.edgesPath || path.join(graphDir, 'edges.jsonl'),
        completedAt: manifest.completedAt || null,
        nodeCount: typeof manifest.nodeCount === 'number' ? manifest.nodeCount : null,
        edgeCount: typeof manifest.edgeCount === 'number' ? manifest.edgeCount : null,
        mtimeMs: stat ? stat.mtimeMs : 0
      };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function assertPathInsideRoot(filePath, rootPath, label) {
  const root = path.resolve(rootPath);
  const target = path.resolve(filePath);
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Refusing to read ${label} outside host cache: ${target}`);
  }
  return target;
}

function resolveVaultGraphExportSelection(payload = {}) {
  let nodesPath = payload.nodesPath ? path.resolve(String(payload.nodesPath)) : '';
  let edgesPath = payload.edgesPath ? path.resolve(String(payload.edgesPath)) : '';
  let graphDir = payload.graphDir ? path.resolve(String(payload.graphDir)) : '';
  let manifestPath = payload.manifestPath ? path.resolve(String(payload.manifestPath)) : '';
  const graphId = payload.graphId ? sanitizeSnapshotId(payload.graphId) : '';

  if (!nodesPath && graphId) {
    graphDir = path.join(hostVaultGraphExportRoot, graphId);
    nodesPath = path.join(graphDir, 'nodes.jsonl');
    edgesPath = edgesPath || path.join(graphDir, 'edges.jsonl');
    manifestPath = manifestPath || path.join(graphDir, 'manifest.json');
  } else if (!nodesPath && graphDir) {
    nodesPath = path.join(graphDir, 'nodes.jsonl');
    edgesPath = edgesPath || path.join(graphDir, 'edges.jsonl');
    manifestPath = manifestPath || path.join(graphDir, 'manifest.json');
  } else if (!nodesPath) {
    const latest = listVaultGraphExportManifests()[0];
    if (!latest) {
      throw new Error('No vault graph export found. Run host_remnote_vault_export_graph_file first or pass graphId/graphDir.');
    }
    nodesPath = latest.nodesPath;
    edgesPath = latest.edgesPath;
    graphDir = latest.graphDir;
    manifestPath = latest.manifestPath;
  }

  nodesPath = assertPathInsideRoot(nodesPath, hostVaultGraphExportRoot, 'vault graph nodes file');
  graphDir = graphDir ? path.resolve(graphDir) : path.dirname(nodesPath);
  edgesPath = edgesPath ? path.resolve(edgesPath) : path.join(graphDir, 'edges.jsonl');
  manifestPath = manifestPath ? path.resolve(manifestPath) : path.join(graphDir, 'manifest.json');
  edgesPath = assertPathInsideRoot(edgesPath, hostVaultGraphExportRoot, 'vault graph edges file');
  manifestPath = assertPathInsideRoot(manifestPath, hostVaultGraphExportRoot, 'vault graph manifest file');

  if (!fs.existsSync(nodesPath)) {
    throw new Error(`Vault graph nodes file not found: ${nodesPath}`);
  }
  if (!fs.existsSync(edgesPath)) {
    throw new Error(`Vault graph edges file not found: ${edgesPath}`);
  }
  return {
    graphId: graphId || path.basename(graphDir),
    graphDir,
    nodesPath,
    edgesPath,
    manifestPath,
    manifest: safeReadJson(manifestPath) || null
  };
}

function buildVaultGraphExportCatalogEntry(entry, options = {}) {
  const includeManifest = options.includeManifest === true;
  const manifest = entry.manifest || safeReadJson(entry.manifestPath) || null;
  const nodesStat = safeReadStat(entry.nodesPath);
  const edgesStat = safeReadStat(entry.edgesPath);
  const manifestStat = safeReadStat(entry.manifestPath);
  const result = {
    graphId: entry.graphId,
    graphDir: entry.graphDir,
    nodesPath: entry.nodesPath,
    edgesPath: entry.edgesPath,
    manifestPath: entry.manifestPath,
    exists: {
      nodes: Boolean(nodesStat),
      edges: Boolean(edgesStat),
      manifest: Boolean(manifestStat)
    },
    bytes: {
      nodes: nodesStat ? nodesStat.size : null,
      edges: edgesStat ? edgesStat.size : null,
      manifest: manifestStat ? manifestStat.size : null
    },
    mtime: {
      nodes: nodesStat ? safeIso(nodesStat.mtime) : null,
      edges: edgesStat ? safeIso(edgesStat.mtime) : null,
      manifest: manifestStat ? safeIso(manifestStat.mtime) : null
    },
    completedAt: manifest?.completedAt || entry.completedAt || null,
    graphFormat: manifest?.graphFormat || null,
    sourceGraphFormat: manifest?.sourceGraphFormat || null,
    nodeCount: typeof manifest?.nodeCount === 'number' ? manifest.nodeCount : entry.nodeCount,
    edgeCount: typeof manifest?.edgeCount === 'number' ? manifest.edgeCount : entry.edgeCount,
    parsedRows: typeof manifest?.parsedRows === 'number' ? manifest.parsedRows : null,
    truncated: manifest?.truncated === true
  };
  if (includeManifest) {
    result.manifest = manifest;
  }
  return result;
}

function catalogRemNoteVaultGraphExports(payload = {}) {
  const limit = clampNumber(payload.limit, 20, 0, 500);
  const offset = clampNumber(payload.offset, 0, 0, 200000);
  const includeManifest = payload.includeManifest === true;
  const manifests = listVaultGraphExportManifests();
  const rows = manifests
    .slice(offset, offset + limit)
    .map((entry) => buildVaultGraphExportCatalogEntry(entry, { includeManifest }));
  return {
    readOnly: true,
    snapshot: true,
    mutationApplied: false,
    mode: 'host_remnote_vault_graph_export_catalog',
    graphRoot: hostVaultGraphExportRoot,
    totalFound: manifests.length,
    offset,
    limit,
    returned: rows.length,
    truncated: offset + rows.length < manifests.length,
    graphExports: rows
  };
}

function graphNodeMatchesQuery(node, filters) {
  if (filters.nodeIds.size > 0 && !filters.nodeIds.has(String(node.id || ''))) return false;
  if (filters.kind && node.kind !== filters.kind) return false;
  if (filters.titleIncludes && !String(node.title || '').toLocaleLowerCase('tr-TR').includes(filters.titleIncludes)) return false;
  if (filters.query) {
    const haystack = serializedSearchText(node).toLocaleLowerCase('tr-TR');
    if (!haystack.includes(filters.query)) return false;
  }
  return true;
}

function graphEdgeMatchesQuery(edge, filters) {
  if (filters.edgeTypes.size > 0 && !filters.edgeTypes.has(String(edge.type || ''))) return false;
  if (filters.source && edge.source !== filters.source) return false;
  if (filters.target && edge.target !== filters.target) return false;
  if (filters.nodeIds.size > 0 && !filters.nodeIds.has(String(edge.source || '')) && !filters.nodeIds.has(String(edge.target || ''))) return false;
  if (filters.query) {
    const haystack = serializedSearchText(edge).toLocaleLowerCase('tr-TR');
    if (!haystack.includes(filters.query)) return false;
  }
  return true;
}

async function queryJsonlRows(filePath, options) {
  const rows = [];
  let scanned = 0;
  let matchedTotal = 0;
  let parseErrors = 0;
  let truncated = false;
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: 'utf8' }),
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    const text = String(line || '').trim();
    if (!text) continue;
    if (scanned >= options.maxScan) {
      truncated = true;
      break;
    }
    scanned += 1;
    let row;
    try {
      row = JSON.parse(text);
    } catch {
      parseErrors += 1;
      continue;
    }
    if (!options.matches(row)) continue;
    matchedTotal += 1;
    if (options.includeRows && matchedTotal > options.offset && rows.length < options.limit) {
      rows.push(pickRowFields(row, options.fields));
    }
  }
  return {
    scanned,
    matchedTotal,
    parseErrors,
    returned: rows.length,
    truncated: truncated || matchedTotal > options.offset + rows.length,
    rows
  };
}

async function queryRemNoteVaultGraphExport(payload = {}) {
  const selection = resolveVaultGraphExportSelection(payload);
  const limit = clampNumber(payload.limit, 50, 0, 500);
  const nodeLimit = clampNumber(payload.nodeLimit, limit, 0, 500);
  const edgeLimit = clampNumber(payload.edgeLimit, limit, 0, 500);
  const offset = clampNumber(payload.offset, 0, 0, 200000);
  const nodeOffset = clampNumber(payload.nodeOffset, offset, 0, 200000);
  const edgeOffset = clampNumber(payload.edgeOffset, offset, 0, 200000);
  const maxScan = clampNumber(payload.maxScan, 200000, 1, 500000);
  const nodeMaxScan = clampNumber(payload.nodeMaxScan, maxScan, 1, 500000);
  const edgeMaxScan = clampNumber(payload.edgeMaxScan, maxScan, 1, 1000000);
  const includeNodes = payload.includeNodes !== false;
  const includeEdges = payload.includeEdges !== false;
  const nodeFields = Array.isArray(payload.nodeFields) ? payload.nodeFields.map(String).filter(Boolean).slice(0, 80) : [];
  const edgeFields = Array.isArray(payload.edgeFields) ? payload.edgeFields.map(String).filter(Boolean).slice(0, 80) : [];
  const filters = {
    query: String(payload.query || payload.q || '').trim().toLocaleLowerCase('tr-TR'),
    titleIncludes: String(payload.titleIncludes || '').trim().toLocaleLowerCase('tr-TR'),
    nodeIds: new Set(Array.isArray(payload.nodeIds) ? payload.nodeIds.map(String) : (payload.nodeId ? [String(payload.nodeId)] : [])),
    kind: payload.kind ? String(payload.kind) : '',
    edgeTypes: new Set(Array.isArray(payload.edgeTypes) ? payload.edgeTypes.map(String) : (payload.edgeType ? [String(payload.edgeType)] : [])),
    source: payload.source ? String(payload.source) : '',
    target: payload.target ? String(payload.target) : ''
  };
  const nodeResult = includeNodes
    ? await queryJsonlRows(selection.nodesPath, {
        maxScan: nodeMaxScan,
        offset: nodeOffset,
        limit: nodeLimit,
        includeRows: true,
        fields: nodeFields,
        matches: (node) => graphNodeMatchesQuery(node, filters)
      })
    : { scanned: 0, matchedTotal: 0, parseErrors: 0, returned: 0, truncated: false, rows: [] };
  const edgeResult = includeEdges
    ? await queryJsonlRows(selection.edgesPath, {
        maxScan: edgeMaxScan,
        offset: edgeOffset,
        limit: edgeLimit,
        includeRows: true,
        fields: edgeFields,
        matches: (edge) => graphEdgeMatchesQuery(edge, filters)
      })
    : { scanned: 0, matchedTotal: 0, parseErrors: 0, returned: 0, truncated: false, rows: [] };

  return {
    readOnly: true,
    snapshot: true,
    mutationApplied: false,
    mode: 'host_remnote_vault_graph_export_query',
    graphId: selection.graphId,
    graphDir: selection.graphDir,
    nodesPath: selection.nodesPath,
    edgesPath: selection.edgesPath,
    manifestPath: selection.manifestPath,
    manifest: selection.manifest
      ? {
          graphFormat: selection.manifest.graphFormat,
          sourceGraphFormat: selection.manifest.sourceGraphFormat,
          completedAt: selection.manifest.completedAt,
          nodeCount: selection.manifest.nodeCount,
          edgeCount: selection.manifest.edgeCount,
          parsedRows: selection.manifest.parsedRows,
          truncated: selection.manifest.truncated
        }
      : null,
    graphFormat: selection.manifest?.graphFormat || 'nodes_edges_jsonl_v1',
    nodeScanned: nodeResult.scanned,
    edgeScanned: edgeResult.scanned,
    nodeParseErrors: nodeResult.parseErrors,
    edgeParseErrors: edgeResult.parseErrors,
    nodesMatchedTotal: nodeResult.matchedTotal,
    edgesMatchedTotal: edgeResult.matchedTotal,
    nodeOffset,
    edgeOffset,
    nodeLimit,
    edgeLimit,
    nodesReturned: nodeResult.returned,
    edgesReturned: edgeResult.returned,
    truncated: nodeResult.truncated || edgeResult.truncated,
    nodes: includeNodes ? nodeResult.rows : undefined,
    edges: includeEdges ? edgeResult.rows : undefined,
    filters: {
      query: filters.query || null,
      titleIncludes: filters.titleIncludes || null,
      nodeIds: Array.from(filters.nodeIds),
      kind: filters.kind || null,
      edgeTypes: Array.from(filters.edgeTypes),
      source: filters.source || null,
      target: filters.target || null
    }
  };
}

async function diffRemNoteVaultExports(payload = {}) {
  const { base, compare } = resolveVaultExportDiffSelections(payload);
  const keyField = String(payload.keyField || 'remId');
  const maxScan = clampNumber(payload.maxScan !== undefined ? payload.maxScan : payload.maxRows, 200000, 1, 500000);
  const sampleLimit = clampNumber(payload.limit !== undefined ? payload.limit : payload.sampleLimit, 50, 0, 500);
  const includeRows = payload.includeRows !== false;
  const compareFields = normalizeFieldList(payload.fields, [
    'title',
    'parentId',
    'createdAt',
    'updatedAt',
    'localUpdatedAt',
    'childIds',
    'activePowerups',
    'flags'
  ]);
  const rowFields = normalizeFieldList(payload.rowFields, [
    keyField,
    'remId',
    'title',
    'parentId',
    'createdAt',
    'updatedAt',
    'localUpdatedAt',
    'flags'
  ]);

  const baseRows = await readVaultExportRowsForDiff(base, { keyField, maxScan });
  const compareRows = await readVaultExportRowsForDiff(compare, { keyField, maxScan });
  const added = [];
  const removed = [];
  const changed = [];
  let addedCount = 0;
  let removedCount = 0;
  let changedCount = 0;
  let unchangedCount = 0;

  for (const [key, compareRow] of compareRows.rowsByKey.entries()) {
    if (!baseRows.rowsByKey.has(key)) {
      addedCount += 1;
      if (includeRows && added.length < sampleLimit) {
        added.push(pickRowFields(compareRow, rowFields));
      }
    }
  }

  for (const [key, baseRow] of baseRows.rowsByKey.entries()) {
    const compareRow = compareRows.rowsByKey.get(key);
    if (!compareRow) {
      removedCount += 1;
      if (includeRows && removed.length < sampleLimit) {
        removed.push(pickRowFields(baseRow, rowFields));
      }
      continue;
    }

    const fieldChanges = [];
    for (const field of compareFields) {
      const beforeValue = getPathValue(baseRow, field);
      const afterValue = getPathValue(compareRow, field);
      if (stableJson(beforeValue) !== stableJson(afterValue)) {
        fieldChanges.push({
          field,
          beforeMissing: beforeValue === undefined,
          afterMissing: afterValue === undefined,
          before: diffDisplayValue(beforeValue),
          after: diffDisplayValue(afterValue)
        });
      }
    }

    if (fieldChanges.length > 0) {
      changedCount += 1;
      if (includeRows && changed.length < sampleLimit) {
        changed.push({
          key,
          fields: fieldChanges,
          before: pickRowFields(baseRow, rowFields),
          after: pickRowFields(compareRow, rowFields)
        });
      }
    } else {
      unchangedCount += 1;
    }
  }

  return {
    readOnly: true,
    snapshot: true,
    mutationApplied: false,
    mode: 'host_remnote_vault_export_diff',
    keyField,
    fields: compareFields,
    rowFields,
    maxScan,
    base: compactVaultExportSelection(base),
    compare: compactVaultExportSelection(compare),
    stats: {
      base: {
        scanned: baseRows.scanned,
        parsedRows: baseRows.parsedRows,
        parseErrors: baseRows.parseErrors,
        missingKeys: baseRows.missingKeys,
        duplicateKeys: baseRows.duplicateKeys,
        truncated: baseRows.truncated
      },
      compare: {
        scanned: compareRows.scanned,
        parsedRows: compareRows.parsedRows,
        parseErrors: compareRows.parseErrors,
        missingKeys: compareRows.missingKeys,
        duplicateKeys: compareRows.duplicateKeys,
        truncated: compareRows.truncated
      }
    },
    counts: {
      added: addedCount,
      removed: removedCount,
      changed: changedCount,
      unchanged: unchangedCount
    },
    sampleLimit,
    returned: {
      added: added.length,
      removed: removed.length,
      changed: changed.length
    },
    added,
    removed,
    changed,
    warnings: [
      'This diff reads only SDK-visible JSONL vault exports in the host cache; it does not write to RemNote or internal DB files.',
      'Use the same field set across exports if you want precise relation/property/practice comparisons.'
    ]
  };
}

async function handleHostAction(action, payload) {
  if (action === 'host_remnote_sdk_surface_gap_report') {
    return hostRemNoteSdkSurfaceGapReport(payload);
  }
  if (action === 'host_remnote_db_doctor_scan') {
    return scanRemNoteDbDoctor(payload);
  }
  if (action === 'host_remnote_db_inventory') {
    return getRemNoteDbInventory(payload);
  }
  if (action === 'host_remnote_leveldb_decode') {
    return decodeRemNoteLevelDbSnapshot(payload);
  }
  if (action === 'host_remnote_leveldb_entity_index') {
    return buildRemNoteLevelDbEntityIndex(payload);
  }
  if (action === 'host_remnote_leveldb_graph_export') {
    return exportRemNoteLevelDbGraph(payload);
  }
  if (action === 'host_remnote_leveldb_log_decode') {
    return decodeRemNoteLevelDbLogs(payload);
  }
  if (action === 'host_remnote_leveldb_sdk_map') {
    return buildRemNoteLevelDbSdkMap(payload);
  }
  if (action === 'host_remnote_leveldb_snapshot_scan') {
    return scanRemNoteLevelDbSnapshot(payload);
  }
  if (action === 'host_remnote_vault_graph_export_catalog') {
    return catalogRemNoteVaultGraphExports(payload);
  }
  if (action === 'host_remnote_vault_graph_export_query') {
    return queryRemNoteVaultGraphExport(payload);
  }
  if (action === 'host_remnote_vault_export_catalog') {
    return catalogRemNoteVaultExports(payload);
  }
  if (action === 'host_remnote_vault_export_diff') {
    return diffRemNoteVaultExports(payload);
  }
  if (action === 'host_remnote_vault_export_field_profile') {
    return profileRemNoteVaultExportFields(payload);
  }
  if (action === 'host_remnote_vault_export_graph') {
    return exportRemNoteVaultGraph(payload);
  }
  if (action === 'host_remnote_vault_export_graph_file') {
    return exportRemNoteVaultGraphToFile(payload);
  }
  if (action === 'host_remnote_vault_export_query') {
    return queryRemNoteVaultExport(payload);
  }
  if (action === 'host_remnote_vault_export_schema_profile') {
    return profileRemNoteVaultExportSchema(payload);
  }
  if (action === 'host_remnote_vault_export_stats') {
    return statsRemNoteVaultExport(payload);
  }
  if (action === 'host_remnote_vault_export_stats_aggregate') {
    return aggregateRemNoteVaultExportStats(payload);
  }
  if (action === 'host_remnote_vault_quality_report') {
    return reportRemNoteVaultQuality(payload);
  }
  if (action === 'host_remnote_vault_snapshot_export_partitioned') {
    return exportRemNoteVaultSnapshotPartitioned(payload);
  }
  if (action === 'host_remnote_vault_snapshot_export') {
    return exportRemNoteVaultSnapshotToFile(payload);
  }
  throw new Error(`Unknown host action: ${action}`);
}

let lastStatusCache = null;
let lastStatusUpdate = 0;
let lastStatusCacheLastUpdateMtimeMs = -1;
const STATUS_CACHE_TTL = 30000; // 30 seconds

function getRuntimeStatus() {
  const now = Date.now();
  const lastUpdateStat = safeReadStat(lastUpdateResultPath);
  const lastUpdateMtimeMs = lastUpdateStat ? lastUpdateStat.mtimeMs : 0;
  if (lastStatusCache && lastStatusCacheLastUpdateMtimeMs === lastUpdateMtimeMs && (now - lastStatusUpdate < STATUS_CACHE_TTL)) {
    return lastStatusCache;
  }

  const autoBuilderStat = safeReadStat(autoBuilderLogPath);
  const lastUpdateResult = safeReadJson(lastUpdateResultPath);

  lastStatusCache = {
    autoBuilder: {
      logPath: autoBuilderLogPath,
      seen: Boolean(autoBuilderStat),
      lastWriteTime: autoBuilderStat ? autoBuilderStat.mtime.toISOString() : null
    },
    lastUpdate: lastUpdateResult
      ? {
          ok: Boolean(lastUpdateResult.ok),
          expectedVersion: lastUpdateResult.expectedVersion || null,
          activeVersion: lastUpdateResult.activeVersion || null,
          build: lastUpdateResult.build || null
        }
      : null
  };
  lastStatusUpdate = now;
  lastStatusCacheLastUpdateMtimeMs = lastUpdateMtimeMs;
  return lastStatusCache;
}

function broadcastEvent() {
  const payload = JSON.stringify({
    ok: true,
    stats,
    recentActions
  });
  for (const res of sseClients) {
    try {
      res.write(`data: ${payload}\n\n`);
    } catch {
      sseClients.delete(res);
    }
  }
}

function recordAction(action, title, remId, ok, error) {
  stats.calls += 1;
  if (action === 'create_note' || action === 'create_structured_summary' || action === 'upsert_structured_note' || action === 'batch_ingest_records') {
    stats.created += 1;
  } else if (action === 'update_note' || action === 'move_note' || action === 'overwrite_note_content') {
    stats.updated += 1;
  } else if (action === 'append_journal') {
    stats.journal += 1;
  } else if (action === 'search') {
    stats.searches += 1;
  } else if (action === 'read_note' || HOST_ACTIONS.has(action)) {
    stats.reads += 1;
  }
  if (!ok) {
    stats.errors += 1;
  }

  recentActions.unshift({
    timestamp: new Date().toISOString(),
    action,
    title: title || action,
    remId: remId || null,
    ok: Boolean(ok),
    ...(error ? { error } : {})
  });
  if (recentActions.length > 20) {
    recentActions.length = 20;
  }
  broadcastEvent();
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(payload));
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes.get(ext);
  if (!contentType) {
    sendJson(res, 400, { ok: false, error: 'Unsupported file type.' });
    return;
  }
  if (!fs.existsSync(filePath)) {
    sendJson(res, 404, { ok: false, error: 'File not found.' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*'
  });
  fs.createReadStream(filePath).pipe(res);
}

function getPrimaryClient() {
  return Array.from(clients.values())[0] || null;
}

function normalizeResultTitle(result, action, payload) {
  if (result && typeof result === 'object') {
    if (typeof result.title === 'string' && result.title) {
      return result.title;
    }
    if (typeof result.text === 'string' && result.text) {
      return result.text;
    }
    if (typeof result.noteTitle === 'string' && result.noteTitle) {
      return result.noteTitle;
    }
  }
  if (payload && typeof payload === 'object') {
    if (typeof payload.title === 'string' && payload.title) {
      return payload.title;
    }
    if (typeof payload.query === 'string' && payload.query) {
      return payload.query;
    }
  }
  return action;
}

function normalizeResultRemId(result) {
  if (!result || typeof result !== 'object') {
    return null;
  }
  return result.remId || result.id || null;
}

function callPlugin(action, payload) {
  const client = getPrimaryClient();
  if (!client || client.readyState !== WebSocket.OPEN) {
    return Promise.reject(new Error('No connected RemNote plugin client.'));
  }

  const id = randomUUID();
  const message = JSON.stringify({ id, action, payload: payload || {} });
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Bridge request timed out: ${action}`));
    }, REQUEST_TIMEOUT_MS);

    pending.set(id, {
      resolve,
      reject,
      timeout,
      action,
      payload: payload || {}
    });

    try {
      client.send(message);
    } catch (error) {
      clearTimeout(timeout);
      pending.delete(id);
      reject(error);
    }
  });
}

function handleBridgeResponse(message) {
  if (!message || typeof message !== 'object' || !('id' in message)) {
    return;
  }

  const entry = pending.get(message.id);
  if (!entry) {
    return;
  }

  clearTimeout(entry.timeout);
  pending.delete(message.id);

  if (typeof message.error === 'string' && message.error) {
    recordAction(entry.action, normalizeResultTitle(null, entry.action, entry.payload), null, false, message.error);
    entry.reject(new Error(message.error));
    return;
  }

  const result = Object.prototype.hasOwnProperty.call(message, 'result') ? message.result : null;
  recordAction(entry.action, normalizeResultTitle(result, entry.action, entry.payload), normalizeResultRemId(result), true);
  entry.resolve(result);
}

const wsServer = new WebSocket.Server({ port: WS_PORT, host: '127.0.0.1' });
wsServer.on('connection', (ws, req) => {
  const id = randomUUID();
  clients.set(id, ws);
  broadcastEvent();

  ws.on('message', (raw) => {
    try {
      const message = JSON.parse(raw.toString());
      handleBridgeResponse(message);
    } catch {
    }
  });

  ws.on('close', () => {
    clients.delete(id);
    broadcastEvent();
  });

  ws.on('error', () => {
    clients.delete(id);
    broadcastEvent();
  });

  try {
    ws.send(JSON.stringify({ type: 'ping', path: req.url || '/' }));
  } catch {
  }
});

const httpServer = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || `127.0.0.1:${HTTP_PORT}`}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    sendJson(res, 200, {
      ok: true,
      pluginConnected: Boolean(getPrimaryClient()),
      connectedClients: clients.size,
      pending: pending.size,
      wsPort: WS_PORT,
      httpPort: HTTP_PORT,
      startedAt,
      runtime: getRuntimeStatus()
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/events') {
    sendJson(res, 200, {
      ok: true,
      stats,
      recentActions,
      runtime: getRuntimeStatus()
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/events/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write(`data: ${JSON.stringify({ ok: true, stats, recentActions, runtime: getRuntimeStatus() })}\n\n`);
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/local-file') {
    const filePath = url.searchParams.get('path') || '';
    if (!filePath) {
      sendJson(res, 400, { ok: false, error: 'Missing path.' });
      return;
    }
    sendFile(res, filePath);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/call') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
      if (body.length > 1024 * 1024) {
        req.destroy();
      }
    });

    req.on('end', async () => {
      let parsed;
      try {
        parsed = body ? JSON.parse(body) : {};
      } catch {
        sendJson(res, 400, { ok: false, error: 'Invalid JSON body.' });
        return;
      }

      const action = parsed && typeof parsed.action === 'string' ? parsed.action : '';
      const payload = parsed && parsed.payload && typeof parsed.payload === 'object' ? parsed.payload : {};
      if (!action) {
        sendJson(res, 400, { ok: false, error: 'Missing action.' });
        return;
      }

      try {
        const result = HOST_ACTIONS.has(action)
          ? await handleHostAction(action, payload)
          : await callPlugin(action, payload);
        if (HOST_ACTIONS.has(action)) {
          recordAction(action, normalizeResultTitle(result, action, payload), normalizeResultRemId(result), true);
        }
        sendJson(res, 200, { ok: true, result });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (HOST_ACTIONS.has(action)) {
          recordAction(action, normalizeResultTitle(null, action, payload), null, false, message);
        }
        sendJson(res, 503, { ok: false, error: message });
      }
    });
    return;
  }

  sendJson(res, 404, { ok: false, error: 'Not found.' });
});

httpServer.listen(HTTP_PORT, '127.0.0.1', () => {
  console.log(`remnote bridge host http://127.0.0.1:${HTTP_PORT} ws://127.0.0.1:${WS_PORT}`);
});

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
// trigger reload test
