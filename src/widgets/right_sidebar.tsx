/**
 * MCP Bridge widget UI.
 *
 * The widget polls the local bridge host for connection health and recent
 * actions. It also compares the loaded plugin bundle against the localhost
 * manifest so version mismatches are visible inside RemNote.
 */

import { renderWidget, usePlugin } from '@remnote/plugin-sdk';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { fetchPluginUpdateInfo, formatPluginUpdateInfo } from '../api/plugin-update-info';
import { pluginKeyHeaders } from '../core/host-key';
import { PLUGIN_VERSION } from '../version';
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
  translateDebug?: TranslateDebugSnapshot;
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

interface TranslateDebugStage {
  name: string;
  label?: string;
  status: 'ok' | 'error' | 'running' | string;
  durationMs?: number;
  errorClass?: string;
}

interface TranslateDebugTrace {
  traceId: string;
  status: 'ok' | 'error' | 'running' | string;
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  source?: string;
  model?: string;
  input?: {
    selectionMode?: string;
    selectedWordCount?: number;
  } | null;
  output?: {
    selectionMode?: string;
  } | null;
  stages?: TranslateDebugStage[];
  error?: {
    errorClass?: string;
    stage?: string;
    message?: string;
    advice?: string;
  } | null;
}

interface TranslateDebugSnapshot {
  logPath?: string;
  latest?: TranslateDebugTrace | null;
  traces?: TranslateDebugTrace[];
}

const LOCAL_PLUGIN_VERSION = PLUGIN_VERSION;
const HOST_HEALTH_URL = 'http://127.0.0.1:3400/health';
const HOST_EVENTS_URL = 'http://127.0.0.1:3400/events';
const HOST_MANIFEST_URL = new URL('manifest.json', window.location.href).href;
const HOST_MANIFEST_LABEL = HOST_MANIFEST_URL;
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
  const [pluginUpdateInfo, setPluginUpdateInfo] = useState(() => formatPluginUpdateInfo(null, LOCAL_PLUGIN_VERSION));
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [hostFetchError, setHostFetchError] = useState('');
  const [translateDebug, setTranslateDebug] = useState<TranslateDebugSnapshot | null>(null);
  const [isTranslateDebugExpanded, setTranslateDebugExpanded] = useState<boolean>(false);
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
      // Written device-locally since 2.60.8; older builds wrote synced storage.
      const storedSnapshot =
        (await plugin.storage.getLocal<BridgeRuntimeSnapshot>(STORAGE_RUNTIME_STATUS))
        || (await plugin.storage.getSynced<BridgeRuntimeSnapshot>(STORAGE_RUNTIME_STATUS))
        || null;
      const hadStorageSnapshot = applyRuntimeSnapshot(storedSnapshot);

      const [manifestResponse, updateInfo] = await Promise.all([
        fetch(HOST_MANIFEST_URL).catch(() => null),
        fetchPluginUpdateInfo(LOCAL_PLUGIN_VERSION),
      ]);
      setPluginUpdateInfo(updateInfo);

      if (manifestResponse && manifestResponse.ok) {
        const manifest = (await manifestResponse.json()) as ManifestResponse;
        setManifestVersion(formatManifestVersion(manifest));
      } else {
        setManifestVersion('offline');
      }

      try {
        const keyHeaders = await pluginKeyHeaders(plugin);
        const [healthResponse, eventsResponse] = await Promise.all([
          fetch(HOST_HEALTH_URL, { headers: keyHeaders }),
          fetch(HOST_EVENTS_URL, { headers: keyHeaders }),
        ]);

        if (!healthResponse.ok) {
          throw new Error(`Health check failed (HTTP ${healthResponse.status})`);
        }
        if (!eventsResponse.ok) {
          throw new Error(`Events fetch failed (HTTP ${eventsResponse.status})`);
        }

        const health = (await healthResponse.json()) as HealthResponse;
        const events = (await eventsResponse.json()) as EventsResponse;
        setHostFetchError('');
        setTranslateDebug(events.translateDebug || null);

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
      setPluginUpdateInfo(formatPluginUpdateInfo(null, LOCAL_PLUGIN_VERSION));
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
  const latestTranslateTrace = translateDebug?.latest || null;
  const latestTranslateStages = (latestTranslateTrace?.stages || []).slice(-8);
  const latestTranslateStatus = latestTranslateTrace?.status || 'none';
  const latestTranslateStatusColor =
    latestTranslateStatus === 'ok'
      ? '#16a34a'
      : latestTranslateStatus === 'error'
        ? '#dc2626'
        : '#6b7280';
  const latestTranslateMode =
    latestTranslateTrace?.output?.selectionMode || latestTranslateTrace?.input?.selectionMode || 'unknown';
  const latestTranslateWordCount =
    typeof latestTranslateTrace?.input?.selectedWordCount === 'number'
      ? ` (${latestTranslateTrace.input.selectedWordCount} words)`
      : '';
  const latestTranslateTime =
    typeof latestTranslateTrace?.durationMs === 'number' ? `${latestTranslateTrace.durationMs} ms` : 'n/a';
  const latestTranslateTraceLabel = latestTranslateTrace?.traceId
    ? latestTranslateTrace.traceId.length > 18
      ? `...${latestTranslateTrace.traceId.slice(-14)}`
      : latestTranslateTrace.traceId
    : 'No trace yet';
  const latestTranslateSummary = latestTranslateTrace
    ? `${latestTranslateMode}${latestTranslateWordCount} | ${latestTranslateTime} | ${latestTranslateTraceLabel}`
    : 'No translation trace yet';
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

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '8px', marginBottom: '12px', alignItems: 'center' }}>
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
        <span
          aria-label="Son eklenti güncellemesi"
          title={pluginUpdateInfo.title}
          style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            minWidth: 0, color: '#4b5563', fontSize: '11px', lineHeight: 1.4,
            backgroundColor: '#f8fafc', border: '1px solid #e5e7eb',
            borderRadius: '6px', padding: '4px', boxSizing: 'border-box',
          }}
        >
          <span aria-hidden="true">ℹ</span>
          <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
            <span style={{ display: 'block' }}>Son güncelleme</span>
            <span style={{ display: 'block' }}>{pluginUpdateInfo.label}</span>
          </span>
        </span>
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
          backgroundColor: '#ffffff',
        }}
      >
        <button
          type="button"
          aria-expanded={isTranslateDebugExpanded}
          aria-controls="translate-debug-details"
          onClick={() => setTranslateDebugExpanded((value) => !value)}
          style={{
            width: '100%',
            border: 0,
            padding: 0,
            background: 'transparent',
            color: 'inherit',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#374151' }}>TRANSLATE DEBUG</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px' }}>
              <span style={{ fontWeight: 700, color: latestTranslateStatusColor }}>
                {latestTranslateStatus.toUpperCase()}
              </span>
              <span style={{ color: '#6b7280', fontWeight: 700 }}>
                {isTranslateDebugExpanded ? 'Hide' : 'Show'}
              </span>
            </div>
          </div>
          <div
            style={{
              marginTop: '5px',
              color: '#6b7280',
              fontSize: '10px',
              lineHeight: 1.35,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {latestTranslateSummary}
          </div>
        </button>
        {isTranslateDebugExpanded && latestTranslateTrace ? (
          <div id="translate-debug-details" style={{ marginTop: '8px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '5px 8px', color: '#4b5563', fontSize: '11px' }}>
              <span>Trace</span>
              <span style={{ overflowWrap: 'anywhere' }}>{latestTranslateTrace.traceId}</span>
              <span>Model</span>
              <span>{latestTranslateTrace.model || 'unknown'}</span>
              <span>Source</span>
              <span>{latestTranslateTrace.source || 'unknown'}</span>
              <span>Mode</span>
              <span>
                {latestTranslateMode}
                {latestTranslateWordCount}
              </span>
              <span>Time</span>
              <span>{latestTranslateTime}</span>
            </div>
            <div style={{ marginTop: '8px', display: 'grid', gap: '5px' }}>
              {latestTranslateStages.length === 0 ? (
                <div style={{ color: '#9ca3af', fontSize: '11px' }}>No stage details yet</div>
              ) : (
                latestTranslateStages.map((stage, index) => {
                  const color = stage.status === 'ok' ? '#16a34a' : stage.status === 'error' ? '#dc2626' : '#6b7280';
                  return (
                    <div key={`${stage.name}-${index}`} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#4b5563' }}>
                      <span style={{ width: '12px', color, fontWeight: 700 }}>
                        {stage.status === 'ok' ? '+' : stage.status === 'error' ? '!' : '-'}
                      </span>
                      <span style={{ flex: 1 }}>{stage.label || stage.name}</span>
                      <span style={{ color: '#6b7280' }}>
                        {typeof stage.durationMs === 'number' ? `${stage.durationMs} ms` : stage.status}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
            {latestTranslateTrace.error ? (
              <div style={{ marginTop: '8px', padding: '7px 8px', backgroundColor: '#fef2f2', borderRadius: '6px', color: '#991b1b', fontSize: '11px', overflowWrap: 'anywhere' }}>
                {latestTranslateTrace.error.errorClass || 'ERROR'}: {latestTranslateTrace.error.advice || latestTranslateTrace.error.message || 'Ceviri hatasi'}
              </div>
            ) : null}
            {translateDebug?.logPath ? (
              <div style={{ marginTop: '8px', color: '#6b7280', fontSize: '10px', overflowWrap: 'anywhere' }}>
                Log: {translateDebug.logPath}
              </div>
            ) : null}
          </div>
        ) : null}
        {isTranslateDebugExpanded && !latestTranslateTrace ? (
          <div id="translate-debug-details" style={{ marginTop: '8px', color: '#9ca3af', fontSize: '11px' }}>
            No translation trace yet
          </div>
        ) : null}
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
