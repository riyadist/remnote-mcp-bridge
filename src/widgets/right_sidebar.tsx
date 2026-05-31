/**
 * MCP Bridge widget UI.
 *
 * The widget polls the local bridge host for connection health and recent
 * actions. It also compares the loaded plugin bundle against the localhost
 * manifest so version mismatches are visible inside RemNote.
 */

import { renderWidget, usePlugin } from '@remnote/plugin-sdk';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  STORAGE_RUNTIME_STATUS,
  type BridgeRuntimeSnapshot,
} from '../settings';

type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

interface LogEntry {
  timestamp: Date;
  message: string;
  level: 'info' | 'error' | 'warn' | 'success';
}

interface HistoryEntry {
  timestamp: Date;
  title: string;
  remId: string | null;
  ok: boolean;
}

interface SessionStats {
  calls: number;
  created: number;
  updated: number;
  journal: number;
  searches: number;
  reads: number;
  errors: number;
}

interface HealthResponse {
  ok: boolean;
  pluginConnected: boolean;
  pending: number;
  runtime?: RuntimeStatus;
}

interface ManifestResponse {
  version?: {
    major?: number;
    minor?: number;
    patch?: number;
  };
}

interface HostAction {
  timestamp: string;
  action: string;
  title: string;
  remId: string | null;
  ok: boolean;
  error?: string;
}

interface EventsResponse {
  ok: boolean;
  stats: SessionStats;
  recentActions: HostAction[];
  runtime?: RuntimeStatus;
}

interface RuntimeStatus {
  autoBuilder?: {
    logPath?: string;
    seen?: boolean;
    lastWriteTime?: string | null;
  };
  lastUpdate?: {
    ok?: boolean;
    expectedVersion?: string | null;
    activeVersion?: string | null;
    build?: string | null;
  } | null;
}

const LOCAL_PLUGIN_VERSION = '2.58.0';
const HOST_HEALTH_URL = 'http://127.0.0.1:3400/health';
const HOST_EVENTS_URL = 'http://127.0.0.1:3400/events';
const HOST_MANIFEST_URL = 'http://127.0.0.1:8080/manifest.json';
const HOST_MANIFEST_LABEL = '127.0.0.1:8080';
const HOST_POLL_MS = 10000;

function formatManifestVersion(manifest: ManifestResponse | null): string {
  if (!manifest?.version) return 'unknown';
  const { major = 0, minor = 0, patch = 0 } = manifest.version;
  return `${major}.${minor}.${patch}`;
}

function MCPBridgeWidget() {
  const plugin = usePlugin();
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState<SessionStats>({
    calls: 0,
    created: 0,
    updated: 0,
    journal: 0,
    searches: 0,
    reads: 0,
    errors: 0,
  });
  const [manifestVersion, setManifestVersion] = useState<string>('checking');
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [hostFetchError, setHostFetchError] = useState('');
  const lastStatusRef = useRef<ConnectionStatus>('connecting');

  const addLog = useCallback((message: string, level: LogEntry['level'] = 'info') => {
    setLogs((prev) => {
      const next = [...prev, { timestamp: new Date(), message, level }];
      return next.slice(-50);
    });
  }, []);

  const applyRuntimeSnapshot = useCallback(
    (snapshot: BridgeRuntimeSnapshot | null) => {
      if (!snapshot) return false;

      const nextStatus: ConnectionStatus =
        snapshot.status === 'error'
          ? 'error'
          : snapshot.pluginConnected
            ? 'connected'
            : snapshot.status === 'connecting'
              ? 'connecting'
              : 'disconnected';

      const statusChanged = nextStatus !== lastStatusRef.current;
      if (statusChanged) {
        addLog(
          nextStatus === 'connected' ? 'Connected to RemNote plugin' : 'RemNote plugin disconnected',
          nextStatus === 'connected' ? 'success' : 'warn'
        );
      }

      setStats(snapshot.stats);
      setHistory(
        (snapshot.recentActions || []).slice(0, 20).map((entry) => ({
          timestamp: new Date(entry.timestamp),
          title: entry.title || entry.action,
          remId: entry.remId ?? null,
          ok: Boolean(entry.ok),
        }))
      );
      setStatus(nextStatus);
      lastStatusRef.current = nextStatus;
      return true;
    },
    [addLog]
  );

  const refreshStatus = useCallback(async (silent = false) => {
    try {
      const storedSnapshot =
        (await plugin.storage.getSynced<BridgeRuntimeSnapshot>(STORAGE_RUNTIME_STATUS)) || null;
      const hadStorageSnapshot = applyRuntimeSnapshot(storedSnapshot);

      const manifestResponse = await fetch(HOST_MANIFEST_URL).catch(() => null);

      if (manifestResponse && manifestResponse.ok) {
        const manifest = (await manifestResponse.json()) as ManifestResponse;
        setManifestVersion(formatManifestVersion(manifest));
      } else {
        setManifestVersion('offline');
      }

      try {
        const [healthResponse, eventsResponse] = await Promise.all([
          fetch(HOST_HEALTH_URL),
          fetch(HOST_EVENTS_URL),
        ]);

        if (!healthResponse.ok) {
          throw new Error(`Health check failed (HTTP ${healthResponse.status})`);
        }
        if (!eventsResponse.ok) {
          throw new Error(`Events fetch failed (HTTP ${eventsResponse.status})`);
        }

        const health = (await healthResponse.json()) as HealthResponse;
        const events = (await eventsResponse.json()) as EventsResponse;
        setRuntime(events.runtime || health.runtime || null);
        setHostFetchError('');

        const nextStatus: ConnectionStatus = health.pluginConnected ? 'connected' : 'disconnected';
        const statusChanged = nextStatus !== lastStatusRef.current;
        if (statusChanged) {
          addLog(
            nextStatus === 'connected' ? 'Connected to RemNote plugin' : 'RemNote plugin disconnected',
            nextStatus === 'connected' ? 'success' : 'warn'
          );
        }

        setStats({
          calls: events.stats.calls ?? 0,
          created: events.stats.created ?? 0,
          updated: events.stats.updated ?? 0,
          journal: events.stats.journal ?? 0,
          searches: events.stats.searches ?? 0,
          reads: events.stats.reads ?? 0,
          errors: events.stats.errors ?? 0,
        });

        setHistory(
          (events.recentActions || []).slice(0, 20).map((entry) => ({
            timestamp: new Date(entry.timestamp),
            title: entry.title || entry.action,
            remId: entry.remId ?? null,
            ok: Boolean(entry.ok),
          }))
        );

        setStatus(nextStatus);
        lastStatusRef.current = nextStatus;
      } catch (hostError) {
        const message = hostError instanceof Error ? hostError.message : String(hostError);
        setHostFetchError(message);
        if (!hadStorageSnapshot) {
          throw hostError;
        }
        if (!silent) {
          addLog(`Host fetch failed, using plugin runtime state: ${message}`, 'warn');
        }
      }

      if (!silent) {
        addLog('Manual status refresh', 'info');
      }
    } catch (error) {
      const statusChanged = lastStatusRef.current !== 'error';
      setStatus('error');
      lastStatusRef.current = 'error';
      setManifestVersion((prev) => (prev === 'checking' ? 'offline' : prev));

      const msg = error instanceof Error ? error.message : String(error);
      if (!silent || statusChanged) {
        addLog(`Status check failed: ${msg}`, 'error');
      }
    }
  }, [addLog, applyRuntimeSnapshot, plugin.storage]);

  const openHistoryEntry = useCallback(
    async (entry: HistoryEntry) => {
      if (!entry.remId) return;
      try {
        const rem = await plugin.rem.findOne(entry.remId);
        if (!rem) {
          addLog(`Rem not found: ${entry.remId}`, 'warn');
          return;
        }
        await plugin.window.openRem(rem);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        addLog(`Failed to open rem: ${msg}`, 'error');
      }
    },
    [addLog, plugin]
  );

  const reloadPlugin = useCallback(() => {
    addLog('Reloading plugin UI...', 'info');
    setTimeout(() => {
      window.location.reload();
    }, 250);
  }, [addLog]);

  const openPersonalIntelligenceRoot = useCallback(async () => {
    try {
      const rem = await plugin.rem.findByName(['Personal Intelligence OS'], null);
      if (!rem) {
        addLog('Personal Intelligence OS not found', 'warn');
        return;
      }
      await plugin.window.openRem(rem);
      addLog('Opened Personal Intelligence OS', 'success');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      addLog(`Failed to open Personal Intelligence OS: ${msg}`, 'error');
    }
  }, [addLog, plugin.rem, plugin.window]);

  useEffect(() => {
    refreshStatus(true).catch(() => {});
    const timer = setInterval(() => {
      refreshStatus(true).catch(() => {});
    }, HOST_POLL_MS);
    return () => clearInterval(timer);
  }, [refreshStatus]);

  const statusConfig = {
    connected: { color: '#22c55e', bg: '#dcfce7', badge: 'Connected', text: 'Connected' },
    connecting: { color: '#f59e0b', bg: '#fef3c7', badge: 'Pending', text: 'Connecting...' },
    disconnected: { color: '#ef4444', bg: '#fee2e2', badge: 'Offline', text: 'Disconnected' },
    error: { color: '#ef4444', bg: '#fee2e2', badge: 'Error', text: 'Error' },
  }[status];

  const hasUpdateMismatch =
    manifestVersion !== 'checking' &&
    manifestVersion !== 'offline' &&
    manifestVersion !== LOCAL_PLUGIN_VERSION;
  const autoBuilderSeen = runtime?.autoBuilder?.seen ?? false;
  const autoBuilderLastWrite = runtime?.autoBuilder?.lastWriteTime
    ? new Date(runtime.autoBuilder.lastWriteTime).toLocaleString()
    : 'unknown';
  const lastUpdateSummary = runtime?.lastUpdate;

  return (
    <div style={{ padding: '12px', fontFamily: 'system-ui, sans-serif', fontSize: '13px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '12px',
        }}
      >
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>MCP Bridge v{LOCAL_PLUGIN_VERSION}</h3>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 8px',
            borderRadius: '12px',
            backgroundColor: statusConfig.bg,
            color: statusConfig.color,
            fontSize: '12px',
            fontWeight: 500,
          }}
        >
          {statusConfig.badge === statusConfig.text ? (
            <span>{statusConfig.badge}</span>
          ) : (
            <>
              <span>{statusConfig.badge}</span>
              <span>{statusConfig.text}</span>
            </>
          )}
        </div>
      </div>

      <button
        onClick={() => refreshStatus(false)}
        style={{
          width: '100%',
          padding: '8px',
          marginBottom: '12px',
          border: '1px solid #e5e7eb',
          borderRadius: '6px',
          backgroundColor: '#ffffff',
          color: '#374151',
          cursor: 'pointer',
          fontSize: '12px',
          fontWeight: 600,
        }}
      >
        Reconnect
      </button>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
        <button
          onClick={reloadPlugin}
          style={{
            width: '100%',
            padding: '8px',
            border: '1px solid #e5e7eb',
            borderRadius: '6px',
            backgroundColor: '#ffffff',
            color: '#374151',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 600,
          }}
        >
          Reload Plugin
        </button>
        <button
          onClick={() => {
            openPersonalIntelligenceRoot().catch(() => {});
          }}
          style={{
            width: '100%',
            padding: '8px',
            border: '1px solid #e5e7eb',
            borderRadius: '6px',
            backgroundColor: '#ffffff',
            color: '#374151',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 600,
          }}
        >
          Open PI OS
        </button>
      </div>

      <div
        style={{
          marginBottom: '12px',
          padding: '10px',
          border: '1px solid #e5e7eb',
          borderRadius: '6px',
          backgroundColor: hasUpdateMismatch ? '#fff7ed' : '#ffffff',
        }}
      >
        <div style={{ fontSize: '11px', fontWeight: 600, marginBottom: '8px', color: '#374151' }}>
          UPDATE STATUS
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '6px', color: '#4b5563', fontSize: '12px' }}>
          <span>Active plugin</span>
          <span>{LOCAL_PLUGIN_VERSION}</span>
          <span>Localhost manifest</span>
          <span>{manifestVersion}</span>
          <span>Manifest URL</span>
          <span>{HOST_MANIFEST_LABEL}</span>
        </div>
        <div
          style={{
            marginTop: '8px',
            fontSize: '11px',
            color: hasUpdateMismatch ? '#c2410c' : '#6b7280',
            fontWeight: hasUpdateMismatch ? 600 : 500,
          }}
        >
          {hasUpdateMismatch
            ? 'New localhost build detected. Use Reconnect first, then reload the localhost plugin if the version stays old.'
            : 'Loaded plugin and localhost manifest are in sync.'}
        </div>
        {hostFetchError ? (
          <div style={{ marginTop: '8px', fontSize: '11px', color: '#b45309' }}>
            Host polling failed, showing plugin runtime state instead.
          </div>
        ) : null}
      </div>

      <div
        style={{
          marginBottom: '12px',
          padding: '10px',
          border: '1px solid #e5e7eb',
          borderRadius: '6px',
          backgroundColor: '#ffffff'
        }}
      >
        <div style={{ fontSize: '11px', fontWeight: 600, marginBottom: '8px', color: '#374151' }}>
          AUTO BUILDER
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '6px', color: '#4b5563', fontSize: '12px' }}>
          <span>Builder log</span>
          <span>{autoBuilderSeen ? 'seen' : 'missing'}</span>
          <span>Last log write</span>
          <span>{autoBuilderLastWrite}</span>
          <span>Last update ok</span>
          <span>{lastUpdateSummary?.ok ? 'yes' : 'no'}</span>
          <span>Expected version</span>
          <span>{lastUpdateSummary?.expectedVersion || 'unknown'}</span>
        </div>
      </div>

      <div
        style={{
          marginBottom: '12px',
          padding: '10px',
          border: '1px solid #e5e7eb',
          borderRadius: '6px',
          backgroundColor: '#ffffff',
        }}
      >
        <div style={{ fontSize: '11px', fontWeight: 600, marginBottom: '8px', color: '#374151' }}>
          SESSION STATS
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', color: '#4b5563' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#22c55e', fontWeight: 'bold' }}>+</span>
            <span>Created: {stats.created}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#3b82f6', fontWeight: 'bold' }}>~</span>
            <span>Updated: {stats.updated}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#8b5cf6', fontWeight: 'bold' }}>#</span>
            <span>Journal: {stats.journal}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#f59e0b', fontWeight: 'bold' }}>?</span>
            <span>Searches: {stats.searches}</span>
          </div>
        </div>
      </div>

      <div
        style={{
          marginBottom: '12px',
          border: '1px solid #e5e7eb',
          borderRadius: '6px',
          backgroundColor: '#f9fafb',
        }}
      >
        <div
          style={{
            fontSize: '11px',
            fontWeight: 600,
            padding: '8px 10px',
            borderBottom: '1px solid #e5e7eb',
            color: '#6b7280',
          }}
        >
          RECENT ACTIONS
        </div>
        <div style={{ maxHeight: '120px', overflowY: 'auto' }}>
          {history.length === 0 ? (
            <div style={{ padding: '12px', color: '#9ca3af', textAlign: 'center' }}>No recent actions</div>
          ) : (
            history.map((entry, index) => (
              <div
                key={`${entry.timestamp.toISOString()}-${index}`}
                style={{
                  padding: '6px 10px',
                  borderBottom: index < history.length - 1 ? '1px solid #e5e7eb' : 'none',
                  fontSize: '11px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: entry.remId ? 'pointer' : 'default',
                }}
                onClick={() => openHistoryEntry(entry)}
              >
                <span style={{ color: '#9ca3af', flexShrink: 0 }}>
                  {entry.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span
                  style={{
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: entry.ok ? '#374151' : '#ef4444',
                    textDecoration: entry.remId ? 'underline' : 'none',
                  }}
                >
                  {entry.title}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <div
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: '6px',
          backgroundColor: '#f9fafb',
        }}
      >
        <div
          style={{
            fontSize: '11px',
            fontWeight: 600,
            padding: '8px 10px',
            borderBottom: '1px solid #e5e7eb',
            color: '#6b7280',
          }}
        >
          LOGS
        </div>
        <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
          {logs.length === 0 ? (
            <div style={{ padding: '12px', color: '#9ca3af', textAlign: 'center' }}>No logs yet</div>
          ) : (
            logs
              .slice()
              .reverse()
              .map((log, index) => (
                <div
                  key={`${log.timestamp.toISOString()}-${index}`}
                  style={{
                    padding: '6px 10px',
                    borderBottom: index < logs.length - 1 ? '1px solid #e5e7eb' : 'none',
                    fontSize: '11px',
                  }}
                >
                  <span style={{ color: '#9ca3af' }}>
                    {log.timestamp.toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                  <span
                    style={{
                      marginLeft: '8px',
                      color:
                        log.level === 'error'
                          ? '#ef4444'
                          : log.level === 'success'
                            ? '#22c55e'
                            : log.level === 'warn'
                              ? '#f59e0b'
                              : '#374151',
                    }}
                  >
                    {log.message}
                  </span>
                </div>
              ))
          )}
        </div>
      </div>
    </div>
  );
}

renderWidget(MCPBridgeWidget);
