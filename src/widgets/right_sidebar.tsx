/**
 * MCP Bridge Widget UI (legacy layout)
 *
 * UI is intentionally similar to the previous version.
 * Connection itself is handled in background by index plugin lifecycle.
 */

import { renderWidget, usePlugin } from '@remnote/plugin-sdk';
import React, { useCallback, useEffect, useRef, useState } from 'react';

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
}

const HOST_HEALTH_URL = 'http://127.0.0.1:3005/health';
const HOST_EVENTS_URL = 'http://127.0.0.1:3005/events';

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
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const lastStatusRef = useRef<ConnectionStatus>('connecting');

  const addLog = useCallback((message: string, level: LogEntry['level'] = 'info') => {
    setLogs((prev) => {
      const next = [...prev, { timestamp: new Date(), message, level }];
      return next.slice(-50);
    });
  }, []);

  const refreshStatus = useCallback(async (silent = false) => {
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

      if (!silent) {
        addLog('Manual status refresh', 'info');
      }
    } catch (error) {
      const statusChanged = lastStatusRef.current !== 'error';
      setStatus('error');
      lastStatusRef.current = 'error';

      const msg = error instanceof Error ? error.message : String(error);
      if (!silent || statusChanged) {
        addLog(`Status check failed: ${msg}`, 'error');
      }
    }
  }, [addLog]);

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

  useEffect(() => {
    refreshStatus(true).catch(() => {});
    const timer = setInterval(() => {
      refreshStatus(true).catch(() => {});
    }, 2000);
    return () => clearInterval(timer);
  }, [refreshStatus]);

  const statusConfig = {
    connected: { color: '#22c55e', bg: '#dcfce7', icon: '●', text: 'Connected' },
    connecting: { color: '#f59e0b', bg: '#fef3c7', icon: '◐', text: 'Connecting...' },
    disconnected: { color: '#ef4444', bg: '#fee2e2', icon: '○', text: 'Disconnected' },
    error: { color: '#ef4444', bg: '#fee2e2', icon: '✕', text: 'Error' }
  }[status];

  return (
    <div style={{ padding: '12px', fontFamily: 'system-ui, sans-serif', fontSize: '13px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '12px'
        }}
      >
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>MCP Bridge</h3>
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
            fontWeight: 500
          }}
        >
          <span>{statusConfig.icon}</span>
          <span>{statusConfig.text}</span>
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
          fontWeight: 600
        }}
      >
        Reconnect
      </button>

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
          backgroundColor: '#f9fafb'
        }}
      >
        <div
          style={{
            fontSize: '11px',
            fontWeight: 600,
            padding: '8px 10px',
            borderBottom: '1px solid #e5e7eb',
            color: '#6b7280'
          }}
        >
          RECENT ACTIONS
        </div>
        <div style={{ maxHeight: '120px', overflowY: 'auto' }}>
          {history.length === 0 ? (
            <div style={{ padding: '12px', color: '#9ca3af', textAlign: 'center' }}>
              No recent actions
            </div>
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
                  cursor: entry.remId ? 'pointer' : 'default'
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
                    textDecoration: entry.remId ? 'underline' : 'none'
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
          backgroundColor: '#f9fafb'
        }}
      >
        <div
          style={{
            fontSize: '11px',
            fontWeight: 600,
            padding: '8px 10px',
            borderBottom: '1px solid #e5e7eb',
            color: '#6b7280'
          }}
        >
          LOGS
        </div>
        <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
          {logs.length === 0 ? (
            <div style={{ padding: '12px', color: '#9ca3af', textAlign: 'center' }}>
              No logs yet
            </div>
          ) : (
            logs.slice().reverse().map((log, index) => (
              <div
                key={`${log.timestamp.toISOString()}-${index}`}
                style={{
                  padding: '6px 10px',
                  borderBottom: index < logs.length - 1 ? '1px solid #e5e7eb' : 'none',
                  fontSize: '11px'
                }}
              >
                <span style={{ color: '#9ca3af' }}>
                  {log.timestamp.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
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
                            : '#374151'
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
