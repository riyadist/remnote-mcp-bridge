import {
  PluginRem,
  renderWidget,
  usePlugin,
  WidgetLocation,
} from '@remnote/plugin-sdk';
import React, { CSSProperties, ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  MYDRIVE_CLIENT_ID_STORAGE_KEY,
  MYDRIVE_CLIENT_SECRET_STORAGE_KEY,
  MYDRIVE_DEFAULT_FOLDER_ID,
  MYDRIVE_FILE_GROUP_SLOT,
  MYDRIVE_FILE_ID_SLOT,
  MYDRIVE_FILE_MIME_SLOT,
  MYDRIVE_FILE_NAME_SLOT,
  MYDRIVE_FILE_POWERUP_CODE,
  MYDRIVE_FILE_URL_SLOT,
  MYDRIVE_FOLDER_ID_STORAGE_KEY,
  MYDRIVE_SERVER_ORIGIN,
} from '../features/mydrive/constants';
import {
  driveLink,
  fileLabel,
  iconColor,
  myDriveCardGroupFromFileName,
  myDriveCardLink,
  plainRichText,
  richTextToPlain,
  visibleMyDriveCardRichText,
} from '../features/mydrive/cardMetadata';
import {
  DriveAccessTokenSession,
  DriveFileResult,
  extractDriveFileIdFromUrl,
  normalizeMimeType,
  readCurrentDriveAccessToken,
  trashDriveFile,
  uploadFileToDrive,
} from '../features/mydrive/googleDrive';
import '../features/mydrive/mydrive.css';

interface MyDriveFileCardState {
  remId: string;
  fileName: string;
  driveUrl: string;
  group: string;
  mimeType: string;
  fileId: string;
}

const REMNOTE_BRIDGE_CALL_URL = 'http://127.0.0.1:3400/call';

function logCardEvent(event: string, payload: { [key: string]: unknown } = {}) {
  const origin = MYDRIVE_SERVER_ORIGIN;
  fetch(`${origin}/__mydrive_log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event,
      source: 'mydrive_file_card',
      payload,
    }),
  }).catch(() => undefined);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRemNoteDeletePermissionError(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase();
  return message.includes("attempted to perform 'rem.remove'")
    || message.includes('readcreatemodifydelete')
    || (message.includes('no scope has permission') && message.includes('delete'));
}

async function deleteRemViaBridge(remId: string): Promise<void> {
  const response = await fetch(REMNOTE_BRIDGE_CALL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'delete_note',
      payload: { remId },
    }),
  });
  const body = await response.json().catch(() => null) as {
    ok?: boolean;
    error?: string;
    result?: { success?: boolean; remId?: string };
  } | null;
  if (!response.ok || !body?.ok || body.result?.success !== true) {
    throw new Error(body?.error || `RemNote bridge delete failed: HTTP ${response.status}`);
  }
}

const shellStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'stretch',
  gap: 4,
  maxWidth: 'min(440px, calc(100vw - 28px))',
};

const rootStyle: CSSProperties = {
  boxSizing: 'border-box',
  display: 'block',
  width: '100%',
  overflow: 'visible',
  paddingBottom: 3,
};

const editingRootStyle: CSSProperties = {
  ...rootStyle,
  paddingBottom: 12,
};

const cardStyle: CSSProperties = {
  boxSizing: 'border-box',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  minHeight: 30,
  maxWidth: 'min(420px, calc(100vw - 74px))',
  margin: '2px 0 0',
  padding: '3px 8px 3px 6px',
  color: 'rgba(229, 233, 242, 0.94)',
  background: 'rgba(27, 30, 39, 0.88)',
  border: '1px solid rgba(139, 148, 170, 0.48)',
  borderRadius: 6,
  textDecoration: 'none',
  verticalAlign: 'middle',
  boxShadow: 'inset 2px 0 0 rgba(26, 115, 232, 0.95)',
  fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

const iconStyleBase: CSSProperties = {
  display: 'inline-grid',
  placeItems: 'center',
  flex: '0 0 auto',
  width: 25,
  height: 22,
  color: '#ffffff',
  borderRadius: 5,
  fontSize: 8,
  fontWeight: 800,
  lineHeight: 1,
};

const nameStyle: CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: 14,
  fontWeight: 560,
};

const badgeStyle: CSSProperties = {
  flex: '0 0 auto',
  color: '#c7d2fe',
  fontSize: 11,
  fontWeight: 680,
};

const actionButtonStyle: CSSProperties = {
  minWidth: 36,
  minHeight: 30,
  marginTop: 2,
  padding: '0 8px',
  color: '#e5e7eb',
  background: 'rgba(31, 35, 48, 0.9)',
  border: '1px solid rgba(139, 148, 170, 0.5)',
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
};

const panelStyle: CSSProperties = {
  display: 'grid',
  gap: 7,
  width: 'fit-content',
  minWidth: 'min(304px, calc(100vw - 28px))',
  maxWidth: 'min(420px, calc(100vw - 28px))',
  margin: '5px 0 10px',
  padding: 8,
  overflow: 'visible',
  color: '#e5e7eb',
  background: 'rgba(27, 31, 43, 0.97)',
  border: '1px solid rgba(115, 126, 158, 0.58)',
  borderRadius: 7,
  boxShadow: '0 6px 16px rgba(0, 0, 0, 0.18)',
  fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

const panelActionsStyle: CSSProperties = {
  display: 'flex',
  gap: 7,
  flexWrap: 'wrap',
};

const panelTopRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 14,
};

const panelButtonStyle: CSSProperties = {
  minHeight: 34,
  padding: '0 12px',
  color: '#f9fafb',
  background: '#3f465c',
  border: '1px solid #677095',
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
};

const dangerButtonStyle: CSSProperties = {
  ...panelButtonStyle,
  background: '#5f2630',
  borderColor: '#a84a5c',
};

const panelCloseButtonStyle: CSSProperties = {
  flex: '0 0 auto',
  display: 'inline-grid',
  placeItems: 'center',
  width: 32,
  height: 32,
  padding: 0,
  color: '#e5e7eb',
  background: 'rgba(16, 23, 36, 0.42)',
  border: '1px solid rgba(139, 148, 170, 0.52)',
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 800,
  lineHeight: 1,
  cursor: 'pointer',
};

const messageStyle: CSSProperties = {
  color: '#bfdbfe',
  fontSize: 12,
  maxWidth: 400,
  lineHeight: 1.35,
};

const errorStyle: CSSProperties = {
  color: '#fecdd3',
  fontSize: 12,
  maxWidth: 400,
  lineHeight: 1.35,
};

function MyDriveFileCard() {
  const plugin = usePlugin();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<MyDriveFileCardState | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadCard() {
    const context = await plugin.widget.getWidgetContext<WidgetLocation.UnderRemEditor>();
    const rem = await plugin.rem.findOne(context.remId);
    if (!rem) return;
    const [fileName, driveUrl, group, mimeType, fileId] = await Promise.all([
      rem.getPowerupPropertyAsRichText(MYDRIVE_FILE_POWERUP_CODE, MYDRIVE_FILE_NAME_SLOT).catch(() => undefined),
      rem.getPowerupPropertyAsRichText(MYDRIVE_FILE_POWERUP_CODE, MYDRIVE_FILE_URL_SLOT).catch(() => undefined),
      rem.getPowerupPropertyAsRichText(MYDRIVE_FILE_POWERUP_CODE, MYDRIVE_FILE_GROUP_SLOT).catch(() => undefined),
      rem.getPowerupPropertyAsRichText(MYDRIVE_FILE_POWERUP_CODE, MYDRIVE_FILE_MIME_SLOT).catch(() => undefined),
      rem.getPowerupPropertyAsRichText(MYDRIVE_FILE_POWERUP_CODE, MYDRIVE_FILE_ID_SLOT).catch(() => undefined),
    ]);
    const nextDriveUrl = richTextToPlain(driveUrl);
    const nextFileId = richTextToPlain(fileId) || extractDriveFileIdFromUrl(nextDriveUrl);
    setState({
      remId: context.remId,
      fileName: richTextToPlain(fileName) || richTextToPlain(rem.text) || 'Untitled file',
      driveUrl: nextDriveUrl,
      group: richTextToPlain(group) || 'file',
      mimeType: richTextToPlain(mimeType),
      fileId: nextFileId,
    });
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      await loadCard();
      if (cancelled) return;
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [plugin]);

  async function getAccessToken(): Promise<string> {
    const [clientId, clientSecret] = await Promise.all([
      plugin.storage.getLocal<string>(MYDRIVE_CLIENT_ID_STORAGE_KEY).catch(() => ''),
      plugin.storage.getLocal<string>(MYDRIVE_CLIENT_SECRET_STORAGE_KEY).catch(() => ''),
    ]);
    const session: DriveAccessTokenSession | null = await readCurrentDriveAccessToken(clientId || '', clientSecret || '');
    if (!session?.accessToken) {
      throw new Error('Open MyDrive and connect Google before editing this file.');
    }
    return session.accessToken;
  }

  async function setCardPowerup(rem: PluginRem, file: File, result: DriveFileResult) {
    const fileName = result.name || file.name;
    const link = myDriveCardLink(fileName, driveLink(result));
    const group = myDriveCardGroupFromFileName(fileName);
    const mimeType = normalizeMimeType(file);
    await rem.addPowerup(MYDRIVE_FILE_POWERUP_CODE);
    await rem.setText(visibleMyDriveCardRichText(fileName, link));
    await rem.setPowerupProperty(MYDRIVE_FILE_POWERUP_CODE, MYDRIVE_FILE_NAME_SLOT, plainRichText(fileName));
    await rem.setPowerupProperty(MYDRIVE_FILE_POWERUP_CODE, MYDRIVE_FILE_URL_SLOT, plainRichText(link));
    await rem.setPowerupProperty(MYDRIVE_FILE_POWERUP_CODE, MYDRIVE_FILE_GROUP_SLOT, plainRichText(group));
    await rem.setPowerupProperty(MYDRIVE_FILE_POWERUP_CODE, MYDRIVE_FILE_MIME_SLOT, plainRichText(mimeType));
    await rem.setPowerupProperty(MYDRIVE_FILE_POWERUP_CODE, MYDRIVE_FILE_ID_SLOT, plainRichText(result.id));
    setState({
      remId: rem._id,
      fileName,
      driveUrl: link,
      group,
      mimeType,
      fileId: result.id,
    });
  }

  async function handleReplaceFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !state || busy) return;
    setBusy(true);
    setError('');
    setMessage('Replacing file and removing old Drive file...');
    try {
      const token = await getAccessToken();
      const folderId = (await plugin.storage.getLocal<string>(MYDRIVE_FOLDER_ID_STORAGE_KEY).catch(() => '')) || MYDRIVE_DEFAULT_FOLDER_ID;
      const rem = await plugin.rem.findOne(state.remId);
      if (!rem) throw new Error('MyDrive Rem could not be found.');
      const previousFileId = state.fileId || extractDriveFileIdFromUrl(state.driveUrl);
      if (!previousFileId) throw new Error('Drive file ID is missing; cannot replace because the old Drive file cannot be removed.');
      const result = await uploadFileToDrive(file, folderId, token);
      await setCardPowerup(rem, file, result);
      const shouldTrashOldFile = previousFileId !== result.id;
      if (shouldTrashOldFile) {
        await trashDriveFile(previousFileId, token);
      }
      setMessage(shouldTrashOldFile ? 'File replaced. Old Drive file moved to trash.' : 'File replaced.');
      logCardEvent('file_card_replace_success', {
        remId: state.remId,
        fileName: file.name,
        trashedOldFile: shouldTrashOldFile,
      });
    } catch (replaceError) {
      const text = replaceError instanceof Error ? replaceError.message : String(replaceError);
      setError(text);
      setMessage('');
      logCardEvent('file_card_replace_failed', { remId: state.remId, error: text });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function handleRemove() {
    if (!state || busy) return;
    setBusy(true);
    setError('');
    setMessage('Removing from RemNote and Drive...');
    try {
      const rem = await plugin.rem.findOne(state.remId);
      if (!rem) throw new Error('MyDrive Rem could not be found.');
      const fileId = state.fileId || extractDriveFileIdFromUrl(state.driveUrl);
      if (!fileId) throw new Error('Drive file ID is missing; cannot remove this file from everywhere.');
      const token = await getAccessToken();
      await trashDriveFile(fileId, token);
      let deleteMethod: 'sdk' | 'bridge' = 'sdk';
      try {
        await rem.remove();
      } catch (deleteError) {
        if (!isRemNoteDeletePermissionError(deleteError)) {
          throw deleteError;
        }
        deleteMethod = 'bridge';
        setMessage('Drive file moved to trash. Removing RemNote card through bridge...');
        await deleteRemViaBridge(state.remId);
      }
      logCardEvent('file_card_remove_success', {
        remId: state.remId,
        fileName: state.fileName,
        trashedDriveFile: true,
        deleteMethod,
      });
      setState(null);
    } catch (removeError) {
      const text = errorMessage(removeError);
      setError(text);
      setMessage('');
      logCardEvent('file_card_remove_failed', { remId: state.remId, error: text });
    } finally {
      setBusy(false);
    }
  }

  const label = useMemo(() => state ? fileLabel(state.group, state.fileName) : 'FILE', [state]);
  if (!state?.driveUrl) return null;

  return (
    <div style={editing ? editingRootStyle : rootStyle}>
      <div className="mydrive-file-card-shell" style={shellStyle}>
        <a
          className="mydrive-file-card"
          href={state.driveUrl}
          target="_blank"
          rel="noreferrer"
          title={state.fileName}
          style={cardStyle}
        >
          <span
            className={`mydrive-file-card__icon mydrive-file-card__icon--${state.group}`}
            style={{ ...iconStyleBase, background: iconColor(state.group) }}
          >
            {label}
          </span>
          <span className="mydrive-file-card__name" style={nameStyle}>{state.fileName}</span>
          <span className="mydrive-file-card__badge" style={badgeStyle}>MyDrive</span>
        </a>
        <button
          className="mydrive-file-card__action"
          type="button"
          title="Edit MyDrive file"
          aria-label="Edit MyDrive file"
          style={actionButtonStyle}
          onClick={() => {
            setEditing((value) => !value);
            setMessage('');
            setError('');
          }}
          disabled={busy}
        >
          Edit
        </button>
      </div>
      {editing ? (
        <div className="mydrive-file-card__edit-panel" style={panelStyle}>
          <div style={panelTopRowStyle}>
            <div style={panelActionsStyle}>
              <button
                type="button"
                style={panelButtonStyle}
                disabled={busy}
                onClick={() => inputRef.current?.click()}
              >
                Replace file
              </button>
              <button
                type="button"
                style={dangerButtonStyle}
                title="Remove MyDrive file from RemNote and Drive"
                aria-label="Remove MyDrive file from RemNote and Drive"
                disabled={busy}
                onClick={() => void handleRemove()}
              >
                Remove
              </button>
            </div>
            <button
              type="button"
              className="mydrive-file-card__edit-close"
              title="Close MyDrive file menu"
              aria-label="Close MyDrive file menu"
              style={{ ...panelCloseButtonStyle, opacity: busy ? 0.55 : 1 }}
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setMessage('');
                setError('');
              }}
            >
              x
            </button>
          </div>
          <input
            ref={inputRef}
            type="file"
            hidden
            onChange={(event) => void handleReplaceFile(event)}
          />
          {message ? <div style={messageStyle}>{message}</div> : null}
          {error ? <div style={errorStyle}>{error}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

renderWidget(MyDriveFileCard);
