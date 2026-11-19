import { renderWidget, usePlugin } from '@remnote/plugin-sdk';
import React from 'react';
import { AssistantToolbarButton, TranslateToolbarButton } from '../translate_toolbar_core';
import '../style.css';

function TranslateSelectedTextMenu() {
  const plugin = usePlugin();
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      <AssistantToolbarButton plugin={plugin} source="selected_text_menu" />
      <TranslateToolbarButton plugin={plugin} source="selected_text_menu" />
    </div>
  );
}

renderWidget(TranslateSelectedTextMenu);