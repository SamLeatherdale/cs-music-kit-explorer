import { createRoot, type Root } from 'react-dom/client';
import { RatingBar } from '../components/RatingBar';
import {
  kitListenStatus,
  listenDotLabel,
  progressFromPlayback,
  strongerListen,
  upgradeListen,
  mergeTracks,
} from '../lib/listening';
import { compareKits, matchesFilter, type KitFilter, type KitSort } from '../lib/ordering';
import { getKitState, updateKitState } from '../lib/storage';
import type { ListenProgress, StoredData, UserKitState } from '../lib/types';

const CATEGORY_PAGES = [
  'https://csgoskins.gg/categories/music-kit',
  'https://csgoskins.gg/categories/music-kit?page=2',
  'https://csgoskins.gg/categories/music-kit?page=3',
];

export default defineContentScript({
  matches: [
    'https://csgoskins.gg/categories/music-kit*',
    'https://csgoskins.gg/items/music-kit-*',
  ],
  runAt: 'document_idle',
  main() {
    let states: Record<string, UserKitState> = {};
    let filter: KitFilter = 'all';
    let sort: KitSort = 'default';
    let ignoreMutations = 0;
    let rendering = false;
    let queued = false;
    let listenQueue = Promise.resolve();
    const roots = new Map<HTMLElement, Root>();

    resetInjectedLayout();
    void loadStates().then(schedule);
    browser.storage.onChanged.addListener((changes) => {
      const next = changes.musicKitRater?.newValue as Partial<StoredData> | undefined;
      if (!next?.states) return;
      states = mergeStoredStates(states, next.states);
      schedule();
    });

    const observer = new MutationObserver((records) => {
      if (ignoreMutations > 0 || records.every(isOwnMutation)) return;
      schedule();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    function schedule() {
      queued = true;
      requestAnimationFrame(flush);
    }

    function flush() {
      if (!queued || rendering) return;
      queued = false;
      void render();
    }

    async function render() {
      rendering = true;
      ignoreMutations += 1;
      try {
        if (location.pathname.startsWith('/categories/music-kit')) await renderCategory();
        else if (location.pathname.startsWith('/items/music-kit-')) renderItem();
      } catch (error) {
        const count = document.querySelector('#mkr-toolbar .mkr-count');
        if (count) count.textContent = error instanceof Error ? error.message : 'Could not load every kit.';
      } finally {
        rendering = false;
        window.setTimeout(() => {
          ignoreMutations = Math.max(0, ignoreMutations - 1);
          if (queued) flush();
        }, 0);
      }
    }

    async function loadStates() {
      const result = await browser.storage.local.get('musicKitRater');
      const stored = result.musicKitRater as Partial<StoredData> | undefined;
      states = stored?.states ?? {};
    }

    async function renderCategory() {
      const grid = findGrid();
      if (!grid) return;
      ensureToolbar(grid);
      await ensureAllKits(grid);
      orderColumns(grid);
      for (const column of kitColumns(grid)) {
        const card = column.querySelector<HTMLElement>('[class*="h-[545px]"]');
        const slug = slugFrom(column);
        if (!card || !slug) continue;
        mountBar(card, slug, true);
      }
    }

    function renderItem() {
      const slug = location.pathname.match(/\/items\/(music-kit-[^/?#]+)/)?.[1];
      const heading = document.querySelector('h1');
      if (!slug || !heading?.parentElement) return;
      mountBar(heading.parentElement, slug, false);
      reorderSoundtracks();
      setupSoundtrackTransport((name, progress) => rememberListen(slug, name, progress));
      paintSoundtrackProgress(getKitState(states, slug));
    }

    function rememberListen(slug: string, name: string, progress: ListenProgress) {
      const state = getKitState(states, slug);
      const nextProgress = upgradeListen(state.tracks[name], progress);
      if (!nextProgress) return;
      const tracks = { ...state.tracks, [name]: nextProgress };
      const listened = kitListenStatus(soundtrackNames(), tracks);
      const nextState: UserKitState = { ...state, tracks, listened };
      states = { ...states, [slug]: nextState };
      paintSoundtrackProgress(nextState);
      listenQueue = listenQueue
        .then(() => updateKitState(slug, { tracks, listened }))
        .then((stored) => {
          states = mergeStoredStates(states, stored.states);
          paintSoundtrackProgress(getKitState(states, slug));
        })
        .catch(() => undefined);
    }

    function mountBar(container: HTMLElement, slug: string, overlay: boolean) {
      let host = container.querySelector<HTMLElement>(`[data-music-kit-rater="${slug}"]`);
      if (!host) {
        host = document.createElement('div');
        host.dataset.musicKitRater = slug;
      }
      host.className = overlay ? 'mkr-host' : 'mkr-host mkr-host--flow';
      if (overlay) {
        host.style.position = 'absolute';
        host.style.zIndex = '40';
        host.style.top = '0';
        host.style.left = '0';
        host.style.right = '0';
        host.style.width = '100%';
        rememberCardLayout(container);
      }
      if (host.parentElement !== container) container.prepend(host);
      const state = getKitState(states, slug);
      let root = roots.get(host);
      if (!root) {
        root = createRoot(host);
        roots.set(host, root);
      }
      const card = overlay ? container : null;
      root.render(
        <RatingBar
          value={state.stars}
          owned={state.owned}
          listened={state.listened}
          onRatingChange={(stars) => void persist(slug, { stars })}
          onOwnedChange={(owned) => void persist(slug, { owned })}
          onLayout={(height) => {
            if (card) shiftCard(card, height);
          }}
        />,
      );
    }

    async function persist(slug: string, update: Partial<UserKitState>) {
      const next = await updateKitState(slug, update);
      states = mergeStoredStates(states, next.states);
      schedule();
    }

    function ensureToolbar(grid: HTMLElement) {
      let toolbar = document.getElementById('mkr-toolbar');
      if (!toolbar) {
        toolbar = document.createElement('div');
        toolbar.id = 'mkr-toolbar';
        toolbar.innerHTML = `
          <button type="button" data-filter="all">All</button>
          <button type="button" data-filter="unrated">Unrated</button>
          <button type="button" data-filter="owned">Owned</button>
          <button type="button" data-filter="rated">Rated</button>
          <label>
            <select aria-label="Sort music kits">
              <option value="default">Unrated, owned, rating</option>
              <option value="rating">Rating: high to low</option>
              <option value="price">Price: low to high</option>
              <option value="name">Name</option>
            </select>
          </label>
          <span class="mkr-count"></span>
        `;
        grid.before(toolbar);
        toolbar.addEventListener('click', (event) => {
          const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-filter]');
          if (!button?.dataset.filter) return;
          filter = button.dataset.filter as KitFilter;
          schedule();
        });
        toolbar.querySelector('select')?.addEventListener('change', (event) => {
          sort = (event.target as HTMLSelectElement).value as KitSort;
          schedule();
        });
      }
      toolbar.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((button) => {
        button.classList.toggle('is-active', button.dataset.filter === filter);
      });
      const select = toolbar.querySelector('select');
      if (select) select.value = sort;
    }

    function orderColumns(grid: HTMLElement) {
      const columns = kitColumns(grid);
      const visible = columns.filter((column) => {
        const slug = slugFrom(column);
        const include = slug ? matchesFilter(getKitState(states, slug), filter) : false;
        column.classList.toggle('mkr-hidden', !include);
        return include;
      });
      [...columns]
        .sort((a, b) =>
          compareKits(
            {
              name: nameFrom(a),
              price: priceFrom(a),
              state: getKitState(states, slugFrom(a) ?? ''),
            },
            {
              name: nameFrom(b),
              price: priceFrom(b),
              state: getKitState(states, slugFrom(b) ?? ''),
            },
            sort,
          ),
        )
        .forEach((column) => grid.append(column));
      const count = document.querySelector('#mkr-toolbar .mkr-count');
      if (count) count.textContent = `${visible.length} of ${columns.length}`;
    }
  },
});

function resetInjectedLayout() {
  document.querySelectorAll('[data-music-kit-rater]').forEach((element) => element.remove());
  document.getElementById('mkr-toolbar')?.remove();
  document.getElementById('mkr-transport')?.remove();
  document.querySelectorAll<HTMLAudioElement>('audio[data-mkr-bound]').forEach((audio) => {
    delete audio.dataset.mkrBound;
  });
  document.querySelectorAll('[data-mkr-listen], [data-mkr-emoji]').forEach((element) => element.remove());
  document.querySelectorAll<HTMLElement>('[data-mkr-base-height]').forEach((card) => {
    card.style.height = '';
    delete card.dataset.mkrBaseHeight;
    card.querySelectorAll<HTMLElement>('[data-mkr-top]').forEach((child) => {
      child.style.top = '';
      delete child.dataset.mkrTop;
    });
  });
}

function rememberCardLayout(card: HTMLElement) {
  if (card.dataset.mkrBaseHeight) return;
  card.dataset.mkrBaseHeight = String(Math.round(card.getBoundingClientRect().height));
  for (const child of card.children) {
    if (!(child instanceof HTMLElement) || child.hasAttribute('data-music-kit-rater')) continue;
    if (child.className.includes('bottom-0')) continue;
    const top = getComputedStyle(child).top;
    if (top.endsWith('px')) child.dataset.mkrTop = String(parseFloat(top));
  }
}

function shiftCard(card: HTMLElement, shift: number) {
  rememberCardLayout(card);
  const height = `${Number(card.dataset.mkrBaseHeight) + shift}px`;
  if (card.style.height !== height) card.style.height = height;
  for (const child of card.children) {
    if (!(child instanceof HTMLElement) || !child.dataset.mkrTop) continue;
    const top = `${Number(child.dataset.mkrTop) + shift}px`;
    if (child.style.top !== top) child.style.top = top;
  }
}

async function ensureAllKits(grid: HTMLElement) {
  if (grid.dataset.mkrComplete === '1') return;
  const seen = new Set<string>();
  const columns: HTMLElement[] = [];
  for (const url of CATEGORY_PAGES) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not load ${url}.`);
    const documentFragment = new DOMParser().parseFromString(await response.text(), 'text/html');
    for (const card of documentFragment.querySelectorAll<HTMLElement>('[class*="h-[545px]"]')) {
      const column = card.parentElement;
      const slug = column ? slugFrom(column) : null;
      if (!column || !slug || seen.has(slug)) continue;
      seen.add(slug);
      columns.push(column);
    }
  }
  if (columns.length < 90) throw new Error(`Only found ${columns.length} music kits.`);
  grid.replaceChildren(...columns.map((column) => document.importNode(column, true)));
  grid.dataset.mkrComplete = '1';
  for (const nav of document.querySelectorAll('nav')) {
    if (/Page \d+ of \d+|of \d+ results/.test(nav.textContent || '')) nav.style.display = 'none';
  }
}

function findGrid(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[class*="h-[545px]"]')?.parentElement?.parentElement ?? null;
}

function kitColumns(grid: HTMLElement): HTMLElement[] {
  return [...grid.children].filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && child.querySelector('[class*="h-[545px]"]') !== null,
  );
}

function slugFrom(container: ParentNode): string | null {
  const anchor = [...container.querySelectorAll<HTMLAnchorElement>('a')].find((link) =>
    /\/items\/music-kit-[^/?#]+$/.test(link.pathname),
  );
  return anchor?.pathname.match(/\/items\/(music-kit-[^/?#]+)/)?.[1] ?? null;
}

function nameFrom(column: ParentNode): string {
  return [...column.querySelectorAll('h2 span')]
    .map((span) => span.textContent?.trim() || '')
    .filter(Boolean)
    .join(' ');
}

function priceFrom(column: ParentNode): number | null {
  const price = [...column.querySelectorAll<HTMLAnchorElement>('a')].find((link) =>
    link.pathname.endsWith('/normal'),
  );
  const value = Number(price?.textContent?.replace(/[^0-9.]/g, ''));
  return Number.isFinite(value) && value > 0 ? value : null;
}

const PLAY_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5-11-6.5z"/></svg>';
const PAUSE_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z"/></svg>';
const VOLUME_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4zm11.5 3a3.5 3.5 0 0 0-1.5-2.9v5.8a3.5 3.5 0 0 0 1.5-2.9zM14 4.2v2.1a6.5 6.5 0 0 1 0 11.4v2.1a8.5 8.5 0 0 0 0-15.6z"/></svg>';

let lastPlayedAudio: HTMLAudioElement | null = null;

let onSoundtrackProgress: (name: string, progress: ListenProgress) => void = () => {};

function setupSoundtrackTransport(onProgress: (name: string, progress: ListenProgress) => void) {
  onSoundtrackProgress = onProgress;
  const list = soundtrackList();
  if (!list) return;
  let bar = document.getElementById('mkr-transport');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'mkr-transport';
    bar.className = 'mkr-transport';
    bar.innerHTML = `
      <button type="button" class="mkr-transport__play"></button>
      <label class="mkr-transport__volume">
        <span class="mkr-transport__speaker">${VOLUME_ICON}</span>
        <input type="range" min="0" max="1" step="any" value="1" aria-label="Volume" />
      </label>
    `;
    bar.querySelector('button')?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const audio = lastPlayedAudio ?? soundtrackList()?.querySelector('audio') ?? null;
      if (!audio) return;
      lastPlayedAudio = audio;
      if (audio.paused) {
        pauseOtherSoundtracks(audio);
        void audio.play();
      } else {
        audio.pause();
      }
    });
    bar.querySelector('input')?.addEventListener('input', (event) => {
      event.stopPropagation();
      const slider = event.currentTarget;
      if (!(slider instanceof HTMLInputElement)) return;
      const volume = Number(slider.value);
      paintVolumeSlider(slider, volume);
      applySoundtrackVolume(volume);
    });
  }
  if (bar.parentElement !== list) list.prepend(bar);

  for (const audio of list.querySelectorAll<HTMLAudioElement>('audio')) {
    if (audio.dataset.mkrBound === '1') continue;
    audio.dataset.mkrBound = '1';
    audio.addEventListener('play', () => {
      lastPlayedAudio = audio;
      pauseOtherSoundtracks(audio);
      updateSoundtrackTransport();
      noteSoundtrackProgress(audio);
    });
    audio.addEventListener('timeupdate', () => noteSoundtrackProgress(audio));
    audio.addEventListener('pause', () => {
      noteSoundtrackProgress(audio);
      updateSoundtrackTransport();
    });
    audio.addEventListener('ended', () => {
      onSoundtrackProgress(soundtrackName(audio), 'full');
      updateSoundtrackTransport();
    });
    audio.addEventListener('volumechange', updateVolumeSlider);
  }

  const playing = [...list.querySelectorAll<HTMLAudioElement>('audio')].find((audio) => !audio.paused);
  if (playing) lastPlayedAudio = playing;
  updateSoundtrackTransport();
  updateVolumeSlider();
}

function reorderSoundtracks() {
  const list = soundtrackList();
  if (!list) return;
  const rows = [...list.children].filter(
    (child): child is HTMLElement => child instanceof HTMLElement && child.querySelector('audio') !== null,
  );
  const sorted = rows
    .map((row) => ({ row, name: soundtrackName(row.querySelector('audio')!) }))
    .sort((a, b) => compareSoundtrackNames(a.name, b.name));
  if (sorted.every((entry, index) => entry.row === rows[index])) return;
  for (const entry of sorted) list.append(entry.row);
}

function compareSoundtrackNames(a: string, b: string): number {
  const left = soundtrackSortKey(a);
  const right = soundtrackSortKey(b);
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2] || left[3].localeCompare(right[3]);
}

function soundtrackSortKey(name: string): [number, number, number, string] {
  const label = name.toLowerCase();
  if (label === 'main menu') return [0, 0, 0, label];
  if (label.startsWith('mvp anthem')) return [1, variationNumber(label), 0, label];
  if (label === 'won round') return [2, 0, 0, label];
  if (label === 'lost round') return [3, 0, 0, label];
  if (label === 'match end') return [4, 0, 0, label];
  if (label === 'death cam') return [5, 0, 0, label];
  if (label === 'bomb planted') return [6, 0, 0, label];
  if (label.includes('bomb') && /10|ten/.test(label)) return [7, 0, 0, label];
  if (label.includes('round') && /10|ten/.test(label)) return [8, 0, 0, label];
  if (label === 'match start') return [9, 0, 0, label];
  if (label.startsWith('start round')) return [10, variationNumber(label), 0, label];
  if (label.startsWith('start action')) return [10, variationNumber(label), 1, label];
  if (label === 'choose team') return [12, 0, 0, label];
  return [11, 0, 0, label];
}

function variationNumber(label: string): number {
  const match = label.match(/variation\s*(\d+)/);
  return match ? Number(match[1]) : 0;
}

function soundtrackList(): HTMLElement | null {
  const heading = [...document.querySelectorAll('h2')].find((node) =>
    /soundtracks/i.test(node.textContent || ''),
  );
  const list = heading?.parentElement?.nextElementSibling;
  return list instanceof HTMLElement && list.querySelector('audio') ? list : null;
}

function updateSoundtrackTransport() {
  const button = document.querySelector<HTMLButtonElement>('#mkr-transport .mkr-transport__play');
  const audio = lastPlayedAudio ?? soundtrackList()?.querySelector('audio') ?? null;
  if (!button || !audio) return;
  const playing = !audio.paused && !audio.ended;
  const name = soundtrackName(audio);
  const action = playing ? 'Pause' : 'Play';
  button.setAttribute('aria-label', `${action} ${name}`);
  button.innerHTML = `
    <span class="mkr-transport__icon">${playing ? PAUSE_ICON : PLAY_ICON}</span>
    <span class="mkr-transport__copy">
      <span class="mkr-transport__action">${action}</span>
      <span class="mkr-transport__title">${escapeHtml(name)}</span>
    </span>
  `;
}

function updateVolumeSlider() {
  const slider = document.querySelector<HTMLInputElement>('#mkr-transport input[type="range"]');
  const audio = soundtrackList()?.querySelector('audio');
  if (!slider || !audio || document.activeElement === slider) return;
  slider.value = String(audio.volume);
  paintVolumeSlider(slider, audio.volume);
}

function paintVolumeSlider(slider: HTMLInputElement, volume: number) {
  const percent = Math.round(Math.min(1, Math.max(0, volume)) * 100);
  slider.style.setProperty('--mkr-volume', `${percent}%`);
  slider.setAttribute('aria-valuetext', `${percent}%`);
}

function applySoundtrackVolume(volume: number) {
  const list = soundtrackList();
  if (!list) return;
  for (const audio of list.querySelectorAll<HTMLAudioElement>('audio')) {
    if (audio.muted) audio.muted = false;
    if (Math.abs(audio.volume - volume) > 0.0005) audio.volume = volume;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character] ?? character;
  });
}

function noteSoundtrackProgress(audio: HTMLAudioElement) {
  const progress = progressFromPlayback(audio);
  if (progress) onSoundtrackProgress(soundtrackName(audio), progress);
}

function soundtrackNames(): string[] {
  const list = soundtrackList();
  if (!list) return [];
  return [...list.querySelectorAll('audio')].map((audio) => soundtrackName(audio));
}

function paintSoundtrackProgress(state: UserKitState) {
  const list = soundtrackList();
  if (!list) return;
  const names: string[] = [];
  for (const audio of list.querySelectorAll('audio')) {
    const name = soundtrackName(audio);
    names.push(name);
    const label = [...(audio.parentElement?.children ?? [])].find(
      (child) => child instanceof HTMLElement && child.tagName !== 'AUDIO',
    );
    if (!(label instanceof HTMLElement)) continue;
    const progress = state.tracks[name] ?? null;
    paintListenBadge(label, 'track', progress, listenDotLabel(progress));
    paintSoundtrackEmoji(label, name);
  }
  const heading = list.previousElementSibling;
  if (!(heading instanceof HTMLElement)) return;
  const status = kitListenStatus(names, state.tracks);
  const played = names.filter((name) => state.tracks[name]).length;
  paintListenBadge(heading, 'kit', status, listenDotLabel(status, { played, total: names.length }));
}

function paintSoundtrackEmoji(label: HTMLElement, name: string) {
  const emoji = soundtrackEmoji(name);
  let mark = label.querySelector<HTMLElement>(':scope > [data-mkr-emoji]');
  if (mark?.textContent === emoji) return;
  if (!mark) {
    mark = document.createElement('span');
    mark.dataset.mkrEmoji = '';
    mark.className = 'mkr-emoji';
    mark.setAttribute('aria-hidden', 'true');
    const badge = label.querySelector(':scope > [data-mkr-listen]');
    if (badge) badge.after(mark);
    else label.prepend(mark);
  }
  mark.textContent = emoji;
}

function soundtrackEmoji(name: string): string {
  const label = name.toLowerCase();
  if (label === 'main menu') return '🎵';
  if (label.startsWith('mvp anthem')) return '🏆';
  if (label === 'won round') return '🎉';
  if (label === 'lost round') return '💔';
  if (label === 'match end') return '🏁';
  if (label === 'death cam') return '💀';
  if (label === 'bomb planted') return '💣';
  if (label.includes('bomb') && /10|ten/.test(label)) return '⏱️';
  if (label.includes('round') && /10|ten/.test(label)) return '⌛';
  if (label === 'match start') return '🟢';
  if (label.startsWith('start round')) return '🔔';
  if (label.startsWith('start action')) return '⚔️';
  if (label === 'choose team') return '👥';
  return '🎵';
}

function paintListenBadge(
  parent: HTMLElement,
  slot: 'track' | 'kit',
  progress: ListenProgress | null,
  label: string,
) {
  const shown = progress ?? 'empty';
  const existing = parent.querySelector<HTMLElement>(`:scope > [data-mkr-listen="${slot}"]`);
  if (existing?.dataset.progress === shown && existing.getAttribute('aria-label') === label) return;
  const badge = existing ?? document.createElement('span');
  badge.dataset.mkrListen = slot;
  badge.dataset.progress = shown;
  badge.className = `mkr-listen mkr-listen--${slot} mkr-listen--${shown}`;
  badge.title = label;
  badge.setAttribute('aria-label', label);
  badge.textContent = '';
  if (!existing) {
    if (slot === 'track') parent.prepend(badge);
    else parent.append(badge);
  }
}

function mergeStoredStates(
  current: Record<string, UserKitState>,
  incoming: Record<string, UserKitState>,
): Record<string, UserKitState> {
  const merged: Record<string, UserKitState> = {};
  for (const slug of new Set([...Object.keys(current), ...Object.keys(incoming)])) {
    const local = getKitState(current, slug);
    const remote = getKitState(incoming, slug);
    const fromRemote = Object.prototype.hasOwnProperty.call(incoming, slug);
    merged[slug] = {
      stars: fromRemote ? remote.stars : local.stars,
      owned: fromRemote ? remote.owned : local.owned,
      tracks: mergeTracks(local.tracks, remote.tracks),
      listened: strongerListen(local.listened, remote.listened),
    };
  }
  return merged;
}

function soundtrackName(audio: HTMLAudioElement): string {
  const label = [...(audio.parentElement?.children ?? [])].find(
    (child) => child instanceof HTMLElement && child.tagName !== 'AUDIO',
  );
  if (!(label instanceof HTMLElement)) return 'soundtrack';
  const text = [...label.childNodes]
    .filter((node) => !(node instanceof Element && (node.hasAttribute('data-mkr-listen') || node.hasAttribute('data-mkr-emoji'))))
    .map((node) => node.textContent ?? '')
    .join(' ');
  return text.replace(/\s+/g, ' ').trim() || 'soundtrack';
}

function pauseOtherSoundtracks(current: HTMLAudioElement) {
  for (const audio of document.querySelectorAll<HTMLAudioElement>('audio')) {
    if (audio !== current && !audio.paused) audio.pause();
  }
}

function isOwnMutation(record: MutationRecord): boolean {
  const target = record.target instanceof Element ? record.target : record.target.parentElement;
  if (target?.closest('#mkr-toolbar, #mkr-transport, [data-music-kit-rater], [data-mkr-listen], [data-mkr-emoji]')) {
    return true;
  }
  const changed = [...record.addedNodes, ...record.removedNodes];
  return (
    changed.length > 0 &&
    changed.every(
      (node) =>
        node instanceof Element &&
        (node.hasAttribute('data-mkr-listen') || node.hasAttribute('data-mkr-emoji')),
    )
  );
}
