import type { ListenProgress } from './types';

export function mergeTracks(
  current: Record<string, ListenProgress>,
  update: Record<string, ListenProgress>,
): Record<string, ListenProgress> {
  const tracks: Record<string, ListenProgress> = { ...current, ...update };
  for (const name of Object.keys(tracks)) {
    if (current[name] === 'full' || update[name] === 'full') tracks[name] = 'full';
    else if (current[name] === 'partial' || update[name] === 'partial') tracks[name] = 'partial';
  }
  return tracks;
}

export function strongerListen(
  current: ListenProgress | null,
  next: ListenProgress | null,
): ListenProgress | null {
  if (current === 'full' || next === 'full') return 'full';
  if (current === 'partial' || next === 'partial') return 'partial';
  return null;
}

export function upgradeListen(
  current: ListenProgress | null | undefined,
  next: ListenProgress,
): ListenProgress | null {
  if (current === 'full' || current === next) return null;
  return next;
}

export function normalizeTracks(value: unknown): Record<string, ListenProgress> {
  if (!value || typeof value !== 'object') return {};
  const tracks: Record<string, ListenProgress> = {};
  for (const [name, progress] of Object.entries(value)) {
    if (progress === 'partial' || progress === 'full') tracks[name] = progress;
  }
  return tracks;
}

export function kitListenStatus(
  names: string[],
  tracks: Record<string, ListenProgress>,
): ListenProgress | null {
  if (names.length === 0) return null;
  let played = 0;
  let full = 0;
  for (const name of names) {
    const status = tracks[name];
    if (status === 'full') {
      full += 1;
      played += 1;
    } else if (status === 'partial') {
      played += 1;
    }
  }
  if (full === names.length) return 'full';
  if (played > 0) return 'partial';
  return null;
}

export function listenDotLabel(
  status: ListenProgress | null,
  counts?: { played: number; total: number },
): string {
  const name = status === 'full' ? 'Fully played' : status === 'partial' ? 'Partly played' : 'Not played';
  if (!counts || counts.total === 0) return name;
  return `${name}, ${counts.played} of ${counts.total}`;
}

export function progressFromPlayback(audio: HTMLAudioElement): ListenProgress | null {
  const duration = audio.duration;
  if (audio.ended || (Number.isFinite(duration) && duration > 0 && audio.currentTime >= duration - 0.4)) {
    return 'full';
  }
  if (audio.currentTime >= 0.5) return 'partial';
  return null;
}
