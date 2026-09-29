import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { KitCard } from '../../components/KitCard';
import {
  createExport,
  getKitState,
  getStoredData,
  importData,
  updateKitState,
} from '../../lib/storage';
import { compareKits, kitSection, KIT_SECTIONS, matchesFilter } from '../../lib/ordering';
import { syncCatalog } from '../../lib/sync';
import type { Filter, Sort, StoredData } from '../../lib/types';

const initialData: StoredData = { catalog: [], states: {}, lastSyncedAt: null };

export default function App() {
  const [data, setData] = useState<StoredData>(initialData);
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('default');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncError, setSyncError] = useState<string | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const scrollLock = useRef<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const lock = scrollLock.current;
    if (!lock) return;
    scrollLock.current = null;
    window.scrollTo(lock.x, lock.y);
    const frame = requestAnimationFrame(() => window.scrollTo(lock.x, lock.y));
    return () => cancelAnimationFrame(frame);
  }, [data]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const stored = await getStoredData();
      if (!active) return;
      setData(stored);
      if (stored.catalog.length === 0) await refresh(active);
      else setLoading(false);
    })();

    const listener = () => {
      void getStoredData().then((stored) => {
        if (active) setData(stored);
      });
    };
    browser.storage.onChanged.addListener(listener);
    return () => {
      active = false;
      browser.storage.onChanged.removeListener(listener);
    };
  }, []);

  async function refresh(active = true) {
    setLoading(true);
    setSyncError(null);
    try {
      const catalog = await syncCatalog();
      if (active) setData(await getStoredData());
      return catalog;
    } catch (error) {
      if (active) setSyncError(error instanceof Error ? error.message : 'Sync failed.');
      return null;
    } finally {
      if (active) setLoading(false);
    }
  }

  async function update(slug: string, updateValue: Parameters<typeof updateKitState>[1]) {
    const next = await updateKitState(slug, updateValue);
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && focused.matches('select.mkr-status')) focused.blur();
    scrollLock.current = { x: window.scrollX, y: window.scrollY };
    setData(next);
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setData(await importData(await file.text()));
      setSyncError(null);
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Import failed.');
    } finally {
      event.target.value = '';
    }
  }

  function exportRatings() {
    const blob = new Blob([createExport(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'cs2-music-kit-ratings.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  const visibleKits = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...data.catalog]
      .filter((kit) => {
        const state = getKitState(data.states, kit.slug);
        const matchesSearch =
          !query ||
          `${kit.artist} ${kit.name} ${kit.title}`.toLowerCase().includes(query);
        return matchesFilter(state, filter) && matchesSearch;
      })
      .sort((a, b) =>
        sort === 'community'
          ? (b.communityRating ?? -1) - (a.communityRating ?? -1) || a.name.localeCompare(b.name)
          : compareKits(
              { name: a.name, price: a.normalPrice, state: getKitState(data.states, a.slug) },
              { name: b.name, price: b.normalPrice, state: getKitState(data.states, b.slug) },
              sort,
            ),
      );
  }, [data, filter, search, sort]);

  const sections = useMemo(() => {
    const groups = KIT_SECTIONS.map((section) => ({
      ...section,
      kits: [] as typeof visibleKits,
    }));
    for (const kit of visibleKits) {
      const section = kitSection(getKitState(data.states, kit.slug));
      groups.find((group) => group.id === section)?.kits.push(kit);
    }
    return groups.filter((group) => group.kits.length > 0);
  }, [data.states, visibleKits]);
  const showSections = sort === 'default' && filter === 'all' && sections.length > 1;

  const ratedCount = data.catalog.filter(
    (kit) => getKitState(data.states, kit.slug).stars !== null,
  ).length;
  const ownedCount = data.catalog.filter(
    (kit) => getKitState(data.states, kit.slug).status === 'owned',
  ).length;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">CS2 MUSIC KITS</p>
          <h1>CS Music Kit Explorer</h1>
          <p className="subtitle">
            Listen on csgoskins.gg, then keep your personal ranking here.
          </p>
        </div>
        <div className="header-actions">
          <button className="button button--primary" type="button" onClick={() => void refresh()}>
            {loading ? 'Syncing…' : 'Refresh prices'}
          </button>
          <button className="button" type="button" onClick={exportRatings}>
            Export
          </button>
          <button className="button" type="button" onClick={() => importInput.current?.click()}>
            Import
          </button>
          <input
            ref={importInput}
            className="visually-hidden"
            type="file"
            accept="application/json,.json"
            onChange={handleImport}
          />
        </div>
      </header>

      <section className="toolbar" aria-label="Catalog controls">
        <div className="filters">
          {([
            ['all', 'All'],
            ['unrated', 'Unrated'],
            ['rated', `Rated (${ratedCount})`],
            ['owned', `Owned (${ownedCount})`],
          ] as [Filter, string][]).map(([value, label]) => (
            <button
              className={`filter-button ${filter === value ? 'filter-button--active' : ''}`}
              key={value}
              type="button"
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="search-box">
          <span className="visually-hidden">Search kits</span>
          <input
            type="search"
            placeholder="Search artist or kit…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label className="sort-box">
          <span>Sort</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as Sort)}>
            <option value="default">Unrated, rated, wishlisted, owned, sold</option>
            <option value="rating">Rating: high to low</option>
            <option value="name">Name</option>
            <option value="price">Price: low to high</option>
            <option value="community">Community rating</option>
          </select>
        </label>
      </section>

      {syncError && <div className="notice notice--error">{syncError}</div>}
      {loading && data.catalog.length === 0 && (
        <div className="empty-state">Loading the music kit catalog…</div>
      )}
      {!loading && data.catalog.length === 0 && !syncError && (
        <div className="empty-state">No kits loaded yet. Click Refresh prices to try again.</div>
      )}
      {data.catalog.length > 0 && visibleKits.length === 0 && (
        <div className="empty-state">No kits match these filters.</div>
      )}
      <main className="kit-grid">
        {(showSections ? sections : [{ id: 'all', label: '', kits: visibleKits }]).map((section) => (
          <Fragment key={section.id}>
            {showSections && (
              <h2 className="kit-section">
                {section.label}
                <span>{section.kits.length}</span>
              </h2>
            )}
            {section.kits.map((kit) => {
              const state = getKitState(data.states, kit.slug);
              return (
                <KitCard
                  key={kit.slug}
                  kit={kit}
                  state={state}
                  onRatingChange={(stars) => void update(kit.slug, { stars })}
                  onStatusChange={(status) => void update(kit.slug, { status })}
                />
              );
            })}
          </Fragment>
        ))}
      </main>
      <footer className="app-footer">
        <span>
          Showing {visibleKits.length} of {data.catalog.length} kits
        </span>
        <span>
          {data.lastSyncedAt
            ? `Prices synced ${new Date(data.lastSyncedAt).toLocaleString()}`
            : 'Prices have not been synced'}
        </span>
      </footer>
    </div>
  );
}

