import { renderWidget, usePlugin } from '@remnote/plugin-sdk';
import React, { useCallback, useEffect, useState } from 'react';
import { SidebarShortcut, STORAGE_SIDEBAR_SHORTCUTS } from '../settings';

function LeftSidebarShortcuts() {
  const plugin = usePlugin();
  const [shortcuts, setShortcuts] = useState<SidebarShortcut[]>([]);
  const [error, setError] = useState('');

  const loadShortcuts = useCallback(async () => {
    try {
      const stored = await plugin.storage.getSynced<SidebarShortcut[]>(STORAGE_SIDEBAR_SHORTCUTS);
      setShortcuts(Array.isArray(stored) ? stored : []);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [plugin]);

  const openShortcut = useCallback(
    async (shortcut: SidebarShortcut) => {
      try {
        const rem = await plugin.rem.findOne(shortcut.remId);
        if (!rem) {
          setError(`Shortcut rem not found: ${shortcut.title}`);
          return;
        }
        await plugin.window.openRem(rem);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [plugin]
  );

  useEffect(() => {
    loadShortcuts().catch(() => {});
    const timer = setInterval(() => {
      loadShortcuts().catch(() => {});
    }, 2000);
    return () => clearInterval(timer);
  }, [loadShortcuts]);

  if (shortcuts.length === 0 && !error) {
    return null;
  }

  return (
    <div style={{ padding: '8px 10px 10px', fontFamily: 'system-ui, sans-serif' }}>
      <div
        style={{
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: '#6b7280',
          marginBottom: '8px',
        }}
      >
        Personal Intelligence
      </div>

      {error ? (
        <div style={{ fontSize: '11px', color: '#ef4444', marginBottom: '8px' }}>{error}</div>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {shortcuts.map((shortcut) => (
          <button
            key={shortcut.remId}
            onClick={() => openShortcut(shortcut)}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
              width: '100%',
              padding: '8px',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              background: '#ffffff',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <span style={{ fontSize: '15px', lineHeight: 1 }}>{shortcut.icon || '->'}</span>
            <span style={{ minWidth: 0 }}>
              <span
                style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#111827',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {shortcut.title}
              </span>
              {shortcut.description ? (
                <span
                  style={{
                    display: 'block',
                    fontSize: '11px',
                    color: '#6b7280',
                    marginTop: '2px',
                    lineHeight: 1.35,
                  }}
                >
                  {shortcut.description}
                </span>
              ) : null}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

renderWidget(LeftSidebarShortcuts);
