import { renderWidget, usePlugin } from '@remnote/plugin-sdk';
import React from 'react';
import { AssistantToolbarButton, TranslateToolbarButton } from '../translate_toolbar_core';

// Shown at the right end of RemNote's selection toolbar by src/selection_actions.ts.
// Styled like that toolbar: dark rounded bar, borderless text buttons.
const css = `
html, body { margin: 0; padding: 0; background: transparent; overflow: hidden; }
.sa-bar { box-sizing: border-box; height: 40px; display: flex; align-items: center; gap: 2px;
  padding: 4px 6px; background: #2b2b31; border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px; box-shadow: 0 4px 14px rgba(0,0,0,0.35);
  font-family: Inter, "Segoe UI", system-ui, sans-serif; }
.sa-bar .mcp-translate-toolbar-button { height: 30px; padding: 0 9px; border: 0; border-radius: 6px;
  background: transparent; color: #e9e9ef; font-size: 13.5px; font-weight: 500; cursor: pointer;
  white-space: nowrap; font-family: inherit; }
.sa-bar .mcp-translate-toolbar-button:hover { background: rgba(255,255,255,0.09); }
.sa-bar .mcp-translate-toolbar-button:disabled { opacity: .7; cursor: wait; }
.sa-sep { width: 1px; height: 20px; background: rgba(255,255,255,0.14); margin: 0 2px; }
`;

function SelectionActions() {
  const plugin = usePlugin();
  return (
    <>
      <style>{css}</style>
      <div className="sa-bar">
        <AssistantToolbarButton plugin={plugin} source="selection_actions" />
        <span className="sa-sep" />
        <TranslateToolbarButton plugin={plugin} source="selection_actions" />
      </div>
    </>
  );
}

renderWidget(SelectionActions);