import { mergeTracks, normalizeTracks, strongerListen } from './listening';
import type { MusicKit, Rating, StoredData, UserKitState } from './types';

const STORAGE_KEY = 'musicKitRater';

const emptyData: StoredData = {
  catalog: [],
  states: {},
  lastSyncedAt: null,
};

export async function getStoredData(): Promise<StoredData> {
  const result = await browser.storage.local.get(STORAGE_KEY);
  const value = result[STORAGE_KEY] as Partial<StoredData> | undefined;

  return {
    catalog: Array.isArray(value?.catalog) ? value.catalog : [],
    states: value?.states && typeof value.states === 'object' ? value.states : {},
    lastSyncedAt: value?.lastSyncedAt ?? null,
  };
}

export async function saveCatalog(catalog: MusicKit[]): Promise<StoredData> {
  const current = await getStoredData();
  const next: StoredData = {
    catalog,
    states: current.states,
    lastSyncedAt: new Date().toISOString(),
  };
  await browser.storage.local.set({ [STORAGE_KEY]: next });
  return next;
}

export async function updateKitState(
  slug: string,
  update: Partial<UserKitState>,
): Promise<StoredData> {
  const current = await getStoredData();
  const previous = getKitState(current.states, slug);
  const next: StoredData = {
    ...current,
    states: {
      ...current.states,
      [slug]: {
        ...previous,
        ...update,
        tracks: update.tracks ? mergeTracks(previous.tracks, update.tracks) : previous.tracks,
        listened:
          update.listened !== undefined
            ? strongerListen(previous.listened, update.listened)
            : previous.listened,
      },
    },
  };
  await browser.storage.local.set({ [STORAGE_KEY]: next });
  return next;
}

export async function clearKitRating(slug: string): Promise<StoredData> {
  return updateKitState(slug, { stars: null });
}

export function getKitState(
  states: Record<string, UserKitState>,
  slug: string,
): UserKitState {
  const state = states[slug];
  return {
    stars: state?.stars ?? null,
    owned: Boolean(state?.owned),
    listened: state?.listened === 'partial' || state?.listened === 'full' ? state.listened : null,
    tracks: normalizeTracks(state?.tracks),
  };
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
  const parsed = JSON.parse(raw) as Partial<StoredData>;
  if (!Array.isArray(parsed.catalog) || !parsed.states || typeof parsed.states !== 'object') {
    throw new Error('That file is not a Music Kit Rater export.');
  }

  const states: Record<string, UserKitState> = {};
  for (const [slug, state] of Object.entries(parsed.states)) {
    if (!state || typeof state !== 'object') continue;
    const stars = state.stars;
    states[slug] = {
      stars: stars === null || stars === undefined ? null : clampRating(stars),
      owned: Boolean(state.owned),
      listened: state.listened === 'partial' || state.listened === 'full' ? state.listened : null,
      tracks: normalizeTracks(state.tracks),
    };
  }

  const next: StoredData = {
    catalog: parsed.catalog as MusicKit[],
    states,
    lastSyncedAt: typeof parsed.lastSyncedAt === 'string' ? parsed.lastSyncedAt : null,
  };
  await browser.storage.local.set({ [STORAGE_KEY]: next });
  return next;
}

function clampRating(value: unknown): Rating {
  const number = Number(value);
  if (number <= 1) return 1;
  if (number >= 5) return 5;
  return Math.round(number) as Rating;
}

export { emptyData };
