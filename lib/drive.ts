import { emptyBackup, mergeBackups, sameBackup } from './drive-backup';
import type { DriveBackup } from './drive-backup';
import { readDeleted, readUserStates, replaceUserStates, toStoredKitState } from './storage';

const FILE_NAME = 'CS Music Kit Explorer.json';
const DRIVE_META_KEY = 'mkrDrive';
const TOKEN_KEY = 'mkrDriveToken';
const SYNC_ALARM = 'mkr-drive-sync';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

export interface DriveMeta {
  fileId?: string;
  lastSavedAt?: string | null;
  lastError?: string | null;
  syncing?: boolean;
  signedOut?: boolean;
  connected?: boolean;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

let syncLock: Promise<void> = Promise.resolve();

export async function getDriveToken(interactive: boolean): Promise<string | null> {
  if (interactive) return completeInteractiveSignIn(requestToken(true));

  const meta = await readDriveMeta();
  if (meta.signedOut) return null;
  const cached = await readCachedToken();
  if (cached) return cached;
  const token = await requestToken(false);
  if (token) await updateMeta({ signedOut: false, connected: true });
  return token;
}

export async function readDriveMeta(): Promise<DriveMeta> {
  const result = await browser.storage.local.get(DRIVE_META_KEY);
  return driveMetaFrom(result[DRIVE_META_KEY]);
}

export function driveMetaFrom(value: unknown): DriveMeta {
  if (!value || typeof value !== 'object') return {};
  const record = value as DriveMeta;
  return {
    fileId: typeof record.fileId === 'string' ? record.fileId : undefined,
    lastSavedAt: typeof record.lastSavedAt === 'string' ? record.lastSavedAt : null,
    lastError: typeof record.lastError === 'string' ? record.lastError : null,
    syncing: record.syncing === true,
    signedOut: record.signedOut === true,
    connected: record.connected === true,
  };
}

export async function signOutOfDrive(): Promise<void> {
  await forgetToken();
  await browser.identity.clearAllCachedAuthTokens();
  await updateMeta({ syncing: false, lastError: null, signedOut: true });
}

export async function scheduleDriveSync(): Promise<void> {
  const meta = await readDriveMeta();
  if (!meta.connected || meta.signedOut) return;
  await browser.alarms.create(SYNC_ALARM, { delayInMinutes: 0.5 });
}

export async function syncDriveBackup(): Promise<void> {
  await withLock(syncOnce);
}

export { SYNC_ALARM };

async function syncOnce(): Promise<void> {
  const token = await getDriveToken(false);
  if (!token) return;

  await updateMeta({ syncing: true, lastError: null });
  try {
    const remote = await downloadBackup(token);
    const local = await readLocalBackup();
    if (remote && !sameBackup(local, remote)) {
      const merged = mergeBackups(local, remote);
      if (!sameBackup(local, merged)) await replaceUserStates(merged.states, merged.deleted);
    }
    const latest = await readLocalBackup();
    if (!remote || !sameBackup(latest, remote)) await uploadBackup(token, latest);
    await updateMeta({
      syncing: false,
      lastSavedAt: new Date().toISOString(),
      lastError: null,
    });
  } catch (error) {
    await updateMeta({
      syncing: false,
      lastError: error instanceof Error ? error.message : 'Drive sync failed.',
    });
  }
}

async function readLocalBackup(): Promise<DriveBackup> {
  const [states, deleted] = await Promise.all([readUserStates(), readDeleted()]);
  return { version: 1, updatedAt: new Date().toISOString(), states, deleted };
}

async function downloadBackup(token: string): Promise<DriveBackup | null> {
  const fileId = await resolveFileId(token);
  if (!fileId) return null;
  const response = await authorized(
    token,
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`,
  );
  if (response.status === 404) {
    await updateMeta({ fileId: undefined });
    return null;
  }
  if (!response.ok) throw new Error(await googleError(response));
  return parseBackup(await response.json());
}

async function uploadBackup(token: string, backup: DriveBackup): Promise<void> {
  const body = JSON.stringify({ ...backup, updatedAt: new Date().toISOString() }, null, 2);
  let fileId = await resolveFileId(token);
  if (!fileId) fileId = await createFile(token, body);
  else await updateFile(token, fileId, body);
  await updateMeta({ fileId });
}

async function resolveFileId(token: string): Promise<string | null> {
  const meta = await readDriveMeta();
  if (meta.fileId && (await fileExists(token, meta.fileId))) return meta.fileId;

  const query = `name = '${FILE_NAME}' and trashed = false`;
  const url = `${DRIVE_API}/files?spaces=drive&pageSize=1&orderBy=modifiedTime desc&fields=files(id)&q=${encodeURIComponent(query)}`;
  const response = await authorized(token, url);
  if (!response.ok) throw new Error(await googleError(response));
  const body = (await response.json()) as { files?: { id?: string }[] };
  const fileId = body.files?.[0]?.id ?? null;
  if (fileId) await updateMeta({ fileId });
  return fileId;
}

async function fileExists(token: string, fileId: string): Promise<boolean> {
  const response = await authorized(
    token,
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=id`,
  );
  if (response.status === 404) return false;
  if (!response.ok) throw new Error(await googleError(response));
  return true;
}

async function createFile(token: string, body: string): Promise<string> {
  const boundary = `mkr${crypto.randomUUID()}`;
  const metadata = JSON.stringify({
    name: FILE_NAME,
    mimeType: 'application/json',
    description: 'Ratings backup for CS Music Kit Explorer.',
  });
  const payload = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    metadata,
    `--${boundary}`,
    'Content-Type: application/json',
    '',
    body,
    `--${boundary}--`,
    '',
  ].join('\r\n');
  const response = await authorized(token, `${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: payload,
  });
  if (!response.ok) throw new Error(await googleError(response));
  const created = (await response.json()) as { id?: string };
  if (!created.id) throw new Error('Google Drive did not return a file id.');
  return created.id;
}

async function updateFile(token: string, fileId: string, body: string): Promise<void> {
  const response = await authorized(
    token,
    `${DRIVE_UPLOAD}/files/${encodeURIComponent(fileId)}?uploadType=media`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body,
    },
  );
  if (!response.ok) throw new Error(await googleError(response));
}

function parseBackup(value: unknown): DriveBackup {
  if (!value || typeof value !== 'object') throw new Error('The Drive backup is not a JSON object.');
  const record = value as { states?: unknown; deleted?: unknown };
  const backup = emptyBackup();
  if (record.states && typeof record.states === 'object') {
    for (const [slug, state] of Object.entries(record.states)) {
      const normalized = toStoredKitState(state);
      if (normalized) backup.states[slug] = normalized;
    }
  }
  if (record.deleted && typeof record.deleted === 'object') {
    for (const [slug, time] of Object.entries(record.deleted)) {
      if (typeof time === 'string' && time) backup.deleted[slug] = time;
    }
  }
  return backup;
}

async function authorized(token: string, url: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(url, withToken(token, init));
  if (response.status !== 401) return response;
  await forgetToken();
  const refreshed = await getDriveToken(false);
  if (!refreshed || refreshed === token) return response;
  return fetch(url, withToken(refreshed, init));
}

function withToken(token: string, init: RequestInit): RequestInit {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return { ...init, headers };
}

async function googleError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    if (body.error?.message) return body.error.message;
  } catch {
    // The body was not JSON.
  }
  return `Google Drive request failed (${response.status}).`;
}

async function updateMeta(patch: DriveMeta): Promise<void> {
  const current = await readDriveMeta();
  const next: DriveMeta = { ...current, ...patch };
  if (!next.fileId) delete next.fileId;
  await browser.storage.local.set({ [DRIVE_META_KEY]: next });
}

async function completeInteractiveSignIn(pending: Promise<string | null>): Promise<string | null> {
  const token = await pending;
  if (token) await updateMeta({ signedOut: false, connected: true });
  return token;
}

function requestToken(interactive: boolean): Promise<string | null> {
  const { clientId, scope } = oauthSettings();
  const redirectUri = browser.identity.getRedirectURL();
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('response_type', 'token');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', scope);
  if (!interactive) authUrl.searchParams.set('prompt', 'none');

  const pending = browser.identity.launchWebAuthFlow({
    url: authUrl.href,
    interactive,
  });
  return readAuthResult(pending, redirectUri, interactive);
}

async function readAuthResult(
  pending: Promise<string | undefined>,
  redirectUri: string,
  interactive: boolean,
): Promise<string | null> {
  let responseUrl: string | undefined;
  try {
    responseUrl = await pending;
  } catch (error) {
    if (!interactive) return null;
    throw authFailure(error, redirectUri);
  }
  if (!responseUrl) {
    if (!interactive) return null;
    throw new Error('Google did not return an access token.');
  }

  const parsed = readTokenRedirect(responseUrl);
  if (parsed.error) {
    if (!interactive || SILENT_AUTH_ERRORS.has(parsed.error)) return null;
    if (parsed.error === 'access_denied') throw new Error('Google sign-in was cancelled.');
    if (parsed.error === 'redirect_uri_mismatch') {
      throw new Error(
        `Google rejected the extension redirect ${redirectUri}. Reload the extension from the build that includes its signing key.`,
      );
    }
    throw new Error(parsed.description ?? parsed.error);
  }
  if (!parsed.token) {
    if (!interactive) return null;
    throw new Error('Google did not return an access token.');
  }

  const expiresIn = parsed.expiresIn ?? 3600;
  await browser.storage.session.set({
    [TOKEN_KEY]: { token: parsed.token, expiresAt: Date.now() + expiresIn * 1000 },
  });
  return parsed.token;
}

function oauthSettings(): { clientId: string; scope: string } {
  const manifest = browser.runtime.getManifest() as {
    oauth2?: { client_id?: string; scopes?: string[] };
  };
  const clientId = manifest.oauth2?.client_id;
  const scopes = manifest.oauth2?.scopes ?? [];
  if (!clientId || scopes.length === 0) {
    throw new Error('The extension manifest is missing its Google client ID.');
  }
  return { clientId, scope: scopes.join(' ') };
}

function readTokenRedirect(value: string): {
  token?: string;
  expiresIn?: number;
  error?: string;
  description?: string;
} {
  const url = new URL(value);
  const params = new URLSearchParams(url.hash.replace(/^#/, ''));
  for (const [key, item] of url.searchParams) {
    if (!params.has(key)) params.set(key, item);
  }
  const expiresRaw = params.get('expires_in');
  const expiresIn = expiresRaw === null ? undefined : Number(expiresRaw);
  return {
    token: params.get('access_token') ?? undefined,
    error: params.get('error') ?? undefined,
    description: params.get('error_description') ?? undefined,
    expiresIn: expiresIn !== undefined && Number.isFinite(expiresIn) ? expiresIn : undefined,
  };
}

function authFailure(error: unknown, redirectUri: string): Error {
  const message = error instanceof Error ? error.message : 'Google sign-in failed.';
  if (message.includes('Authorization page could not be loaded')) {
    return new Error(
      `Chrome lost Google's redirect (${redirectUri}). Reload the extension and click Sign in with Google again.`,
    );
  }
  if (/cancel|did not approve/i.test(message)) return new Error('Google sign-in was cancelled.');
  return error instanceof Error ? error : new Error(message);
}

async function readCachedToken(): Promise<string | null> {
  const stored = await browser.storage.session.get(TOKEN_KEY);
  const value = stored[TOKEN_KEY] as Partial<CachedToken> | undefined;
  if (!value || typeof value.token !== 'string' || typeof value.expiresAt !== 'number') return null;
  if (value.expiresAt <= Date.now() + 60_000) return null;
  return value.token;
}

async function forgetToken(): Promise<void> {
  await browser.storage.session.remove(TOKEN_KEY);
}

async function withLock(task: () => Promise<void>): Promise<void> {
  const previous = syncLock;
  let release: () => void = () => undefined;
  syncLock = new Promise((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    await task();
  } finally {
    release();
  }
}

const SILENT_AUTH_ERRORS = new Set([
  'interaction_required',
  'login_required',
  'consent_required',
  'immediate_failed',
]);

export { DRIVE_META_KEY };
