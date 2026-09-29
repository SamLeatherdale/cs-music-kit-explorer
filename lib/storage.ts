import { mergeTracks, normalizeTracks, strongerListen } from './listening';
import type { KitStatus, MusicKit, Rating, StoredData, UserKitState } from './types';

const STORAGE_KEY = 'musicKitRater';
const KIT_STATE_PREFIX = 'mkr:';

const emptyData: StoredData = {
  catalog: [],
  states: {},
  lastSyncedAt: null,
};

type LegacyKitState = Partial<UserKitState> & { owned?: boolean };

let migration: Promise<void> | null = null;

export function kitStateKey(slug: string): string {
  return `${KIT_STATE_PREFIX}${slug}`;
}

export function slugFromStateKey(key: string): string | null {
  return key.startsWith(KIT_STATE_PREFIX) ? key.slice(KIT_STATE_PREFIX.length) : null;
}

export async function getStoredData(): Promise<StoredData> {
  await migrateStates();
  const local = await readLocalCatalog();
  return {
    catalog: local.catalog,
    lastSyncedAt: local.lastSyncedAt,
    states: await readSyncStates(),
  };
}

export async function saveCatalog(catalog: MusicKit[]): Promise<StoredData> {
  await migrateStates();
  const lastSyncedAt = new Date().toISOString();
  await browser.storage.local.set({ [STORAGE_KEY]: { catalog, lastSyncedAt } });
  return {
    catalog,
    lastSyncedAt,
    states: await readSyncStates(),
  };
}

export async function updateKitState(
  slug: string,
  update: Partial<UserKitState>,
): Promise<StoredData> {
  await migrateStates();
  const previous = normalizeKitState(await readKitState(slug));
  const nextState: UserKitState = {
    ...previous,
    ...update,
    tracks: update.tracks ? mergeTracks(previous.tracks, update.tracks) : previous.tracks,
    listened:
      update.listened !== undefined
        ? strongerListen(previous.listened, update.listened)
        : previous.listened,
  };

  if (isEmptyState(nextState)) await browser.storage.sync.remove(kitStateKey(slug));
  else await browser.storage.sync.set({ [kitStateKey(slug)]: nextState });

  return getStoredData();
}

export async function clearKitRating(slug: string): Promise<StoredData> {
  return updateKitState(slug, { stars: null });
}

export function getKitState(
  states: Record<string, UserKitState | LegacyKitState>,
  slug: string,
): UserKitState {
  return normalizeKitState(states[slug]);
}

export function createExport(data: StoredData): string {
  return JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      catalog: data.catalog,
      states: data.states,
    },
    null,
    2,
  );
}

export async function importData(raw: string): Promise<StoredData> {
  const parsed = JSON.parse(raw) as Partial<StoredData> & {
    states?: Record<string, LegacyKitState>;
  };
  if (!Array.isArray(parsed.catalog) || !parsed.states || typeof parsed.states !== 'object') {
    throw new Error('That file is not a CS Music Kit Explorer export.');
  }

  await migrateStates();
  const states: Record<string, UserKitState> = {};
  const payload: Record<string, UserKitState> = {};
  for (const [slug, state] of Object.entries(parsed.states)) {
    if (!state || typeof state !== 'object') continue;
    const normalized = normalizeKitState(state);
    if (isEmptyState(normalized)) continue;
    states[slug] = normalized;
    payload[kitStateKey(slug)] = normalized;
  }

  const existing = await browser.storage.sync.get(null);
  const stale = Object.keys(existing).filter((key) => slugFromStateKey(key) && !(key in payload));
  if (stale.length > 0) await browser.storage.sync.remove(stale);
  if (Object.keys(payload).length > 0) await browser.storage.sync.set(payload);

  const lastSyncedAt = typeof parsed.lastSyncedAt === 'string' ? parsed.lastSyncedAt : null;
  await browser.storage.local.set({
    [STORAGE_KEY]: { catalog: parsed.catalog as MusicKit[], lastSyncedAt },
  });

  return {
    catalog: parsed.catalog as MusicKit[],
    states,
    lastSyncedAt,
  };
}

function migrateStates(): Promise<void> {
  migration ??= migrateOnce().catch((error: unknown) => {
    migration = null;
    throw error;
  });
  return migration;
}

async function migrateOnce(): Promise<void> {
  const result = await browser.storage.local.get(STORAGE_KEY);
  const value = result[STORAGE_KEY] as { states?: Record<string, LegacyKitState> } | undefined;
  const localStates = value?.states;
  if (!localStates || typeof localStates !== 'object') return;

  const synced = await browser.storage.sync.get(null);
  const toSet: Record<string, UserKitState> = {};
  for (const [slug, raw] of Object.entries(localStates)) {
    const key = kitStateKey(slug);
    if (Object.prototype.hasOwnProperty.call(synced, key)) continue;
    const normalized = normalizeKitState(raw);
    if (!isEmptyState(normalized)) toSet[key] = normalized;
  }
  if (Object.keys(toSet).length > 0) await browser.storage.sync.set(toSet);

  const fresh = await browser.storage.local.get(STORAGE_KEY);
  const current = fresh[STORAGE_KEY];
  if (!current || typeof current !== 'object' || !('states' in current)) return;
  const { states: _states, ...rest } = current as Record<string, unknown> & { states?: unknown };
  await browser.storage.local.set({ [STORAGE_KEY]: rest });
}

async function readLocalCatalog(): Promise<Pick<StoredData, 'catalog' | 'lastSyncedAt'>> {
  const result = await browser.storage.local.get(STORAGE_KEY);
  const value = result[STORAGE_KEY] as Partial<StoredData> | undefined;
  return {
    catalog: Array.isArray(value?.catalog) ? value.catalog : [],
    lastSyncedAt: value?.lastSyncedAt ?? null,
  };
}

async function readSyncStates(): Promise<Record<string, UserKitState>> {
  const all = await browser.storage.sync.get(null);
  const states: Record<string, UserKitState> = {};
  for (const [key, value] of Object.entries(all)) {
    const slug = slugFromStateKey(key);
    if (!slug || !value || typeof value !== 'object') continue;
    const normalized = normalizeKitState(value as LegacyKitState);
    if (!isEmptyState(normalized)) states[slug] = normalized;
  }
  return states;
}

async function readKitState(slug: string): Promise<LegacyKitState | undefined> {
  const key = kitStateKey(slug);
  const result = await browser.storage.sync.get(key);
  const value = result[key];
  return value && typeof value === 'object' ? (value as LegacyKitState) : undefined;
}

function normalizeKitState(state: LegacyKitState | undefined): UserKitState {
  return {
    stars: state?.stars == null ? null : clampRating(state.stars),
    status: normalizeStatus(state),
    listened: state?.listened === 'partial' || state?.listened === 'full' ? state.listened : null,
    tracks: normalizeTracks(state?.tracks),
  };
}

function normalizeStatus(state: LegacyKitState | undefined): KitStatus | null {
  if (state?.status === 'owned' || state?.status === 'wishlisted' || state?.status === 'sold') {
    return state.status;
  }
  return state?.owned === true ? 'owned' : null;
}

function isEmptyState(state: UserKitState): boolean {
  return (
    state.stars == null &&
    state.status == null &&
    state.listened == null &&
    Object.keys(state.tracks).length === 0
  );
}

function clampRating(value: unknown): Rating {
  const steps = Math.round(Number(value) * 2) / 2;
  if (!Number.isFinite(steps) || steps <= 0.5) return 0.5;
  if (steps >= 5) return 5;
  return steps as Rating;
}

export { emptyData };
