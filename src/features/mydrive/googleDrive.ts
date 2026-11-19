import { MYDRIVE_DRIVE_SCOPE, MYDRIVE_SERVER_ORIGIN } from './constants';

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: string; error_description?: string }) => void;
            error_callback?: (error: unknown) => void;
          }) => {
            requestAccessToken: (options?: { prompt?: string }) => void;
          };
        };
      };
    };
  }
}

export interface DriveUploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

export interface DriveFileResult {
  id: string;
  name: string;
  mimeType?: string;
  size?: string;
  webViewLink?: string;
  webContentLink?: string;
}

export interface DriveAccountInfo {
  emailAddress?: string;
  displayName?: string;
  photoLink?: string;
  permissionId?: string;
}

export interface DriveAccessTokenSession {
  accessToken: string;
  hasStoredRefreshToken: boolean;
  expiresAt?: number;
  account?: DriveAccountInfo | null;
}

export interface OAuthRedirectManualPrompt {
  authUrl: string;
  redirectUri: string;
  reason: 'popup-blocked';
}

export interface DriveAccessTokenOptions {
  onManualOAuthRedirect?: (prompt: OAuthRedirectManualPrompt) => void;
}

export interface DriveTrashResult {
  id: string;
  name?: string;
  trashed?: boolean;
}

let googleIdentityLoadPromise: Promise<void> | null = null;
const GOOGLE_IDENTITY_SCRIPT_TIMEOUT_MS = 12000;
const GOOGLE_OAUTH_POPUP_TIMEOUT_MS = 60000;
const GOOGLE_OAUTH_REDIRECT_TIMEOUT_MS = 120000;
const MYDRIVE_OAUTH_REDIRECT_PATH = '/oauth2/callback';
const MYDRIVE_OAUTH_RESULT_SERVER_PATH = '/__mydrive_oauth_result';
const MYDRIVE_OAUTH_SESSION_SERVER_PATH = '/__mydrive_oauth_session';
const MYDRIVE_OAUTH_START_SERVER_PATH = '/__mydrive_oauth_start';
const MYDRIVE_OAUTH_RESULT_TYPE = 'mydrive.oauth.redirect.result'; // 8083 oauth2-callback.html bu türü gönderir; değişmez.
const MYDRIVE_OAUTH_RESULT_STORAGE_KEY = 'mydrive_oauth_redirect_result';

export function normalizeMimeType(file: File): string {
  return file.type || 'application/octet-stream';
}

export function getOAuthRedirectUri(): string {
  const origin = MYDRIVE_SERVER_ORIGIN;
  return `${origin}${MYDRIVE_OAUTH_REDIRECT_PATH}`;
}

function getOAuthResultServerUrl(state: string): string {
  const origin = MYDRIVE_SERVER_ORIGIN;
  return `${origin}${MYDRIVE_OAUTH_RESULT_SERVER_PATH}?state=${encodeURIComponent(state)}`;
}

function getOAuthSessionServerUrl(): string {
  const origin = MYDRIVE_SERVER_ORIGIN;
  return `${origin}${MYDRIVE_OAUTH_SESSION_SERVER_PATH}`;
}

function getOAuthStartServerUrl(): string {
  const origin = MYDRIVE_SERVER_ORIGIN;
  return `${origin}${MYDRIVE_OAUTH_START_SERVER_PATH}`;
}

export function loadGoogleIdentityScript(): Promise<void> {
  if (window.google?.accounts?.oauth2?.initTokenClient) {
    return Promise.resolve();
  }

  if (googleIdentityLoadPromise) {
    return googleIdentityLoadPromise;
  }

  googleIdentityLoadPromise = new Promise((resolve, reject) => {
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      finish(new Error('Google Identity script timed out. Check internet access and RemNote plugin frame permissions.'));
    }, GOOGLE_IDENTITY_SCRIPT_TIMEOUT_MS);

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      if (error) {
        googleIdentityLoadPromise = null;
        reject(error);
        return;
      }
      resolve();
    };

    const existing = document.querySelector<HTMLScriptElement>('script[data-mydrive-google-identity="true"]');
    if (existing) {
      existing.addEventListener('load', () => finish(), { once: true });
      existing.addEventListener('error', () => finish(new Error('Google Identity script failed to load.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.mydriveGoogleIdentity = 'true';
    script.onload = () => finish();
    script.onerror = () => finish(new Error('Google Identity script failed to load.'));
    document.head.appendChild(script);
  });

  return googleIdentityLoadPromise;
}

function stringifyOAuthError(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const record = error as { message?: unknown; type?: unknown; error?: unknown };
    const message = record.message || record.type || record.error;
    if (typeof message === 'string' && message.trim()) return message;
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

export function extractDriveFileIdFromUrl(url: string): string {
  const cleanUrl = url.trim();
  if (!cleanUrl) return '';
  try {
    const parsed = new URL(cleanUrl);
    const id = parsed.searchParams.get('id');
    if (id) return id;
    const fileMatch = parsed.pathname.match(/\/file\/d\/([^/]+)/);
    if (fileMatch?.[1]) return decodeURIComponent(fileMatch[1]);
  } catch {
    // Fall back to regex parsing below for partial or legacy URLs.
  }
  const queryMatch = cleanUrl.match(/[?&]id=([^&#]+)/);
  if (queryMatch?.[1]) return decodeURIComponent(queryMatch[1]);
  const fileMatch = cleanUrl.match(/\/file\/d\/([^/?#]+)/);
  return fileMatch?.[1] ? decodeURIComponent(fileMatch[1]) : '';
}

interface OAuthRedirectPayload {
  type: string;
  state?: string;
  accessToken?: string;
  error?: string;
  errorDescription?: string;
  scope?: string;
  expiresIn?: string;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function normalizeDriveAccountInfo(value: unknown): DriveAccountInfo | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const account = {
    emailAddress: asString(record.emailAddress),
    displayName: asString(record.displayName),
    photoLink: asString(record.photoLink),
    permissionId: asString(record.permissionId),
  };
  return account.emailAddress || account.displayName || account.permissionId ? account : null;
}

function normalizeOAuthRedirectPayload(value: unknown): OAuthRedirectPayload | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (record.type !== MYDRIVE_OAUTH_RESULT_TYPE) return null;
  return {
    type: MYDRIVE_OAUTH_RESULT_TYPE,
    state: asString(record.state),
    accessToken: asString(record.accessToken),
    error: asString(record.error),
    errorDescription: asString(record.errorDescription),
    scope: asString(record.scope),
    expiresIn: asString(record.expiresIn),
  };
}

function readStoredOAuthRedirectPayload(): OAuthRedirectPayload | null {
  try {
    const raw = window.localStorage.getItem(MYDRIVE_OAUTH_RESULT_STORAGE_KEY);
    if (!raw) return null;
    return normalizeOAuthRedirectPayload(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function readServerOAuthRedirectPayload(state: string): Promise<OAuthRedirectPayload | null> {
  try {
    const response = await fetch(getOAuthResultServerUrl(state), {
      method: 'GET',
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const body = await response.json();
    if (!body?.ok) return null;
    return normalizeOAuthRedirectPayload(body.payload);
  } catch {
    return null;
  }
}

export async function readCurrentDriveAccessToken(clientId?: string, clientSecret?: string): Promise<DriveAccessTokenSession | null> {
  try {
    const response = await fetch(getOAuthSessionServerUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        clientId: clientId?.trim() || undefined,
        clientSecret: clientSecret?.trim() || undefined,
      }),
    });
    if (!response.ok) return null;
    const body = await response.json();
    if (!body?.ok) return null;
    const payload = normalizeOAuthRedirectPayload(body.payload);
    if (!payload?.accessToken) return null;
    return {
      accessToken: payload.accessToken,
      hasStoredRefreshToken: Boolean(body.hasStoredRefreshToken),
      expiresAt: typeof body.expiresAt === 'number' ? body.expiresAt : undefined,
      account: normalizeDriveAccountInfo(body.account),
    };
  } catch {
    return null;
  }
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  if (window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(bytes);
    return base64UrlEncode(bytes);
  }
  return `${Date.now()}-${Math.random().toString(36).repeat(6)}`.slice(0, 64);
}

async function codeChallengeFromVerifier(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await window.crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(digest));
}

function randomOAuthState(): string {
  const bytes = new Uint8Array(16);
  if (window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function registerOAuthCodeStart(
  clientId: string,
  clientSecret: string,
  state: string,
  codeVerifier: string,
  redirectUri: string,
): Promise<void> {
  const response = await fetch(getOAuthStartServerUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({
      state,
      clientId,
      clientSecret: clientSecret || undefined,
      codeVerifier,
      redirectUri,
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`MyDrive OAuth start failed: ${text || response.statusText}`);
  }
}

function buildOAuthRedirectUrl(clientId: string, interactive: boolean, state: string, codeChallenge: string): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', getOAuthRedirectUri());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', MYDRIVE_DRIVE_SCOPE);
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', state);
  if (interactive) {
    url.searchParams.set('prompt', 'consent');
  }
  return url.toString();
}

function formatOAuthRedirectError(payload: OAuthRedirectPayload): Error {
  const detail = payload.errorDescription ? `${payload.error}: ${payload.errorDescription}` : payload.error;
  return new Error(`Google OAuth redirect failed: ${detail || 'unknown error'}`);
}

async function requestDriveAccessTokenViaOAuthRedirect(
  clientId: string,
  clientSecret: string,
  interactive: boolean,
  options: DriveAccessTokenOptions = {},
): Promise<string> {
  const state = randomOAuthState();
  const redirectUri = getOAuthRedirectUri();
  const codeVerifier = randomCodeVerifier();
  const codeChallenge = await codeChallengeFromVerifier(codeVerifier);
  await registerOAuthCodeStart(clientId, clientSecret, state, codeVerifier, redirectUri);
  const authUrl = buildOAuthRedirectUrl(clientId, interactive, state, codeChallenge);

  try {
    window.localStorage.removeItem(MYDRIVE_OAUTH_RESULT_STORAGE_KEY);
  } catch {
    // Storage can be unavailable in restricted plugin frames; postMessage is still attempted.
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let popup: Window | null = null;
    let serverPollPending = false;
    let popupClosedAt = 0;
    try {
      popup = window.open(authUrl, 'mydrive-google-oauth', 'width=520,height=720,popup=yes');
    } catch {
      popup = null;
    }

    if (!popup) {
      options.onManualOAuthRedirect?.({ authUrl, redirectUri, reason: 'popup-blocked' });
    }

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(pollId);
      window.removeEventListener('message', onMessage);
    };

    const finish = (payload?: OAuthRedirectPayload, error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();

      if (error) {
        reject(error);
        return;
      }
      if (!payload) {
        reject(new Error('Google OAuth redirect did not return a response.'));
        return;
      }
      if (payload.error) {
        reject(formatOAuthRedirectError(payload));
        return;
      }
      if (!payload.accessToken) {
        reject(new Error('Google OAuth redirect did not return an access token.'));
        return;
      }

      try {
        if (popup && !popup.closed) popup.close();
      } catch {
        // The popup may already be gone or browser-controlled.
      }
      resolve(payload.accessToken);
    };

    const acceptPayload = (payload: OAuthRedirectPayload | null) => {
      if (!payload || payload.state !== state) return;
      finish(payload);
    };

    function onMessage(event: MessageEvent) {
      if (event.origin !== MYDRIVE_SERVER_ORIGIN) return;
      acceptPayload(normalizeOAuthRedirectPayload(event.data));
    }

    const pollId = window.setInterval(() => {
      acceptPayload(readStoredOAuthRedirectPayload());
      if (!serverPollPending) {
        serverPollPending = true;
        readServerOAuthRedirectPayload(state)
          .then(acceptPayload)
          .catch(() => null)
          .finally(() => {
            serverPollPending = false;
          });
      }
      try {
        if (popup && popup.closed) {
          popupClosedAt ||= Date.now();
          if (Date.now() - popupClosedAt > 15000) {
            finish(undefined, new Error(
              `Google OAuth window was closed before MyDrive received a token. If Google showed redirect_uri_mismatch, add this Authorized redirect URI in Google Cloud: ${redirectUri}`,
            ));
          }
        }
      } catch {
        // Ignore cross-window polling errors and wait for timeout.
      }
    }, 500);

    const timeoutId = window.setTimeout(() => {
      finish(undefined, new Error(
        `Google OAuth redirect sign-in timed out. Add this Authorized redirect URI in Google Cloud and try again: ${redirectUri}`,
      ));
    }, GOOGLE_OAUTH_REDIRECT_TIMEOUT_MS);

    window.addEventListener('message', onMessage);
    popup?.focus();
  });
}

async function requestDriveAccessTokenViaGoogleIdentity(clientId: string, interactive: boolean): Promise<string> {
  await loadGoogleIdentityScript();

  const initTokenClient = window.google?.accounts?.oauth2?.initTokenClient;
  if (!initTokenClient) {
    throw new Error('Google Identity Services is unavailable in this RemNote plugin frame.');
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      finish(new Error(
        'Google OAuth sign-in timed out. If the Brave tab is stuck on accounts.google.com/gsi/transform, disable Brave Shields/ad blockers for accounts.google.com and allow third-party cookies, then try again.',
      ));
    }, GOOGLE_OAUTH_POPUP_TIMEOUT_MS);

    const finish = (error?: Error, token?: string) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      if (error) {
        reject(error);
        return;
      }
      if (!token) {
        reject(new Error('Google did not return an access token.'));
        return;
      }
      resolve(token);
    };

    const tokenClient = initTokenClient({
      client_id: clientId,
      scope: MYDRIVE_DRIVE_SCOPE,
      callback: (response) => {
        if (response.error) {
          finish(new Error(response.error_description || response.error));
          return;
        }
        if (!response.access_token) {
          finish(new Error('Google did not return an access token.'));
          return;
        }
        finish(undefined, response.access_token);
      },
      error_callback: (error) => finish(new Error(`Google OAuth failed: ${stringifyOAuthError(error)}`)),
    });

    try {
      tokenClient.requestAccessToken({ prompt: interactive ? 'consent' : '' });
    } catch (error) {
      finish(new Error(`Google OAuth popup could not open: ${stringifyOAuthError(error)}`));
    }
  });
}

export async function requestDriveAccessToken(
  clientId: string,
  clientSecret: string,
  interactive: boolean,
  options: DriveAccessTokenOptions = {},
): Promise<string> {
  const cleanClientId = clientId.trim();
  if (!cleanClientId) {
    throw new Error('Google OAuth Client ID is required.');
  }

  return requestDriveAccessTokenViaOAuthRedirect(cleanClientId, clientSecret.trim(), interactive, options);
}

async function readError(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  if (!text) return `${response.status} ${response.statusText}`.trim();
  try {
    const parsed = JSON.parse(text);
    return parsed?.error?.message || parsed?.error_description || text;
  } catch {
    return text;
  }
}

async function createResumableUploadSession(file: File, folderId: string, accessToken: string): Promise<string> {
  const mimeType = normalizeMimeType(file);
  const metadata = {
    name: file.name,
    mimeType,
    parents: [folderId],
  };

  const fields = encodeURIComponent('id,name,mimeType,size,webViewLink,webContentLink');
  const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=${fields}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': mimeType,
      'X-Upload-Content-Length': String(file.size),
    },
    body: JSON.stringify(metadata),
  });

  if (!response.ok) {
    throw new Error(`Drive upload session failed: ${await readError(response)}`);
  }

  const location = response.headers.get('Location') || response.headers.get('location');
  if (!location) {
    throw new Error('Drive did not return a resumable upload location.');
  }
  return location;
}

function uploadFileToSession(
  uploadUrl: string,
  file: File,
  accessToken: string,
  onProgress?: (progress: DriveUploadProgress) => void,
): Promise<DriveFileResult> {
  const mimeType = normalizeMimeType(file);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    xhr.setRequestHeader('Content-Type', mimeType);

    xhr.upload.onprogress = (event) => {
      const total = event.lengthComputable ? event.total : file.size;
      const loaded = event.loaded;
      const percent = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
      onProgress?.({ loaded, total, percent });
    };

    xhr.onerror = () => reject(new Error('Drive upload network error.'));
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`Drive upload failed: ${xhr.status} ${xhr.responseText || xhr.statusText}`.trim()));
        return;
      }
      try {
        resolve(JSON.parse(xhr.responseText) as DriveFileResult);
      } catch {
        reject(new Error('Drive upload succeeded but returned invalid JSON.'));
      }
    };

    xhr.send(file);
  });
}

export async function uploadFileToDrive(
  file: File,
  folderId: string,
  accessToken: string,
  onProgress?: (progress: DriveUploadProgress) => void,
): Promise<DriveFileResult> {
  if (!String(folderId || '').trim()) {
    throw new Error('Google Drive klasör kimliği boş. MyDrive penceresinde klasör kimliğini girip kaydedin. / Drive folder ID is empty.');
  }
  const uploadUrl = await createResumableUploadSession(file, folderId, accessToken);
  return uploadFileToSession(uploadUrl, file, accessToken, onProgress);
}

export async function trashDriveFile(fileId: string, accessToken: string): Promise<DriveTrashResult> {
  const cleanFileId = fileId.trim();
  if (!cleanFileId) throw new Error('Drive file ID is required before moving a file to trash.');
  const fields = encodeURIComponent('id,name,trashed');
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(cleanFileId)}?fields=${fields}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({ trashed: true }),
  });

  if (!response.ok) {
    throw new Error(`Drive trash failed: ${await readError(response)}`);
  }
  return response.json() as Promise<DriveTrashResult>;
}
