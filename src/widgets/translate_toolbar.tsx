import { renderWidget, usePlugin } from '@remnote/plugin-sdk';
import React from 'react';
import { TranslateToolbarButton } from '../translate_toolbar_core';
import '../style.css';

function TranslateToolbar() {
  return <TranslateToolbarButton plugin={usePlugin()} source="pdf_highlight_toolbar" />;
}

renderWidget(TranslateToolbar);
