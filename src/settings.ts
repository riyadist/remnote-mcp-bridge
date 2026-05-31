/**
 * Settings IDs and defaults for MCP Bridge plugin
 */

// Setting IDs
export const SETTING_AUTO_TAG_ENABLED = 'mcp-auto-tag-enabled';
export const SETTING_AUTO_TAG = 'mcp-auto-tag';
export const SETTING_JOURNAL_PREFIX = 'mcp-journal-prefix';
export const SETTING_JOURNAL_TIMESTAMP = 'mcp-journal-timestamp';
export const SETTING_WS_URL = 'mcp-ws-url';
export const SETTING_DEFAULT_PARENT = 'mcp-default-parent';
export const STORAGE_SIDEBAR_SHORTCUTS = 'mcp-sidebar-shortcuts';
export const STORAGE_RUNTIME_STATUS = 'mcp-runtime-status';

// Default values
export const DEFAULT_AUTO_TAG = 'MCP';
export const DEFAULT_JOURNAL_PREFIX = '[Claude]';
export const DEFAULT_WS_URL = 'ws://127.0.0.1:3401';

// Settings interface for type safety
export interface MCPSettings {
  autoTagEnabled: boolean;
  autoTag: string;
  journalPrefix: string;
  journalTimestamp: boolean;
  wsUrl: string;
  defaultParentId: string;
}

export interface SidebarShortcut {
  remId: string;
  title: string;
  icon?: string;
  description?: string;
}

export type BridgeConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

export interface BridgeRuntimeActionSummary {
  timestamp: string;
  action: string;
  title: string;
  remId: string | null;
  ok: boolean;
  error?: string;
}

export interface BridgeRuntimeStats {
  calls: number;
  created: number;
  updated: number;
  journal: number;
  searches: number;
  reads: number;
  errors: number;
}

export interface BridgeRuntimeSnapshot {
  status: BridgeConnectionStatus;
  pluginConnected: boolean;
  activeVersion: string;
  updatedAt: string;
  stats: BridgeRuntimeStats;
  recentActions: BridgeRuntimeActionSummary[];
  lastError?: string | null;
}
