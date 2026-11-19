import { renderWidget, usePlugin } from '@remnote/plugin-sdk';
import React from 'react';
import { TranslateToolbarButton } from '../translate_toolbar_core';
import '../style.css';

function TranslatePdfHighlightPopup() {
  return <TranslateToolbarButton plugin={usePlugin()} source="pdf_highlight_popup_widget" />;
}

renderWidget(TranslatePdfHighlightPopup);
