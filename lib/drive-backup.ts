import { mergeTracks, strongerListen } from './listening';
import type { UserKitState } from './types';

export interface DriveBackup {
  version: 1;
  updatedAt: string;
  states: Record<string, UserKitState>;
  deleted: Record<string, string>;
}

export function emptyBackup(updatedAt = new Date().toISOString()): DriveBackup {
  return { version: 1, updatedAt, states: {}, deleted: {} };
}

function timeOf(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function later(left: string | undefined, right: string | undefined): string | undefined {
  if (!left) return right;
  if (!right) return left;
  return timeOf(left) >= timeOf(right) ? left : right;
}

export function mergeKitState(
  local: UserKitState | undefined,
  remote: UserKitState | undefined,
): UserKitState | null {
  if (!local) return remote ?? null;
  if (!remote) return local;

  const localTime = timeOf(local.updatedAt);
  const remoteTime = timeOf(remote.updatedAt);
  const timesDiffer = remoteTime !== localTime;
  const newer = remoteTime > localTime ? remote : local;
  const merged: UserKitState = {
    stars: timesDiffer ? newer.stars : (local.stars ?? remote.stars),
    status: timesDiffer ? newer.status : (local.status ?? remote.status),
    listened: strongerListen(local.listened, remote.listened),
    tracks: mergeTracks(local.tracks, remote.tracks),
  };
  const updatedAt = later(local.updatedAt, remote.updatedAt);
  if (updatedAt) merged.updatedAt = updatedAt;
  if (
    merged.stars == null &&
    merged.status == null &&
    merged.listened == null &&
    Object.keys(merged.tracks).length === 0
  ) {
    return null;
  }
  return merged;
}

export function mergeBackups(local: DriveBackup, remote: DriveBackup): DriveBackup {
  const slugs = new Set([
    ...Object.keys(local.states),
    ...Object.keys(remote.states),
    ...Object.keys(local.deleted),
    ...Object.keys(remote.deleted),
  ]);
  const states: Record<string, UserKitState> = {};
  const deleted: Record<string, string> = {};

  for (const slug of slugs) {
    const deletedAt = later(local.deleted[slug], remote.deleted[slug]);
    const state = mergeKitState(local.states[slug], remote.states[slug]);
    if (deletedAt && timeOf(deletedAt) > timeOf(state?.updatedAt)) {
      deleted[slug] = deletedAt;
      continue;
    }
    if (state) states[slug] = state;
  }

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    states,
    deleted,
  };
}

export function sameBackup(left: DriveBackup, right: DriveBackup): boolean {
  return stable(left.states) === stable(right.states) && stable(left.deleted) === stable(right.deleted);
}

function stable(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, sortValue(nested)]),
  );
}
