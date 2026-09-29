import type { MusicKit } from './types';
import { saveCatalog } from './storage';

const CATEGORY_URL = 'https://csgoskins.gg/categories/music-kit';
const PAGE_URLS = [CATEGORY_URL, `${CATEGORY_URL}?page=2`, `${CATEGORY_URL}?page=3`];

interface SchemaProduct {
  name?: string;
  url?: string;
  image?: string | string[];
  aggregateRating?: { ratingValue?: string; ratingCount?: string };
  offers?: {
    lowPrice?: string;
    offerCount?: string;
  };
}

export async function syncCatalog(): Promise<MusicKit[]> {
  const pages = await Promise.all(
    PAGE_URLS.map(async (url) => {
      const response = await fetch(url, { credentials: 'omit' });
      if (!response.ok) {
        throw new Error(`Could not load ${url} (${response.status}).`);
      }
      return response.text();
    }),
  );

  const kits = new Map<string, MusicKit>();
  pages.forEach((html) => {
    for (const kit of parseCategoryPage(html)) kits.set(kit.slug, kit);
  });

  const catalog = [...kits.values()].sort((a, b) => a.name.localeCompare(b.name));
  await saveCatalog(catalog);
  return catalog;
}

export function parseCategoryPage(html: string): MusicKit[] {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const schema = getSchemaProducts(document);
  const kits = new Map<string, MusicKit>();

  const anchors = [...document.querySelectorAll<HTMLAnchorElement>('a')].filter((anchor) =>
    /\/items\/music-kit-[^/?#]+$/.test(anchor.pathname),
  );

  for (const anchor of anchors) {
    const slugMatch = anchor.pathname.match(/\/items\/(music-kit-[^/?#]+)/);
    const slug = slugMatch?.[1];
    if (!slug || kits.has(slug)) continue;

    const card = findCard(anchor);
    if (!card) continue;

    const product = schema.get(slug);
    const heading = card.querySelector('h2');
    const spans = heading ? [...heading.querySelectorAll('span')] : [];
    const artist = clean(spans[0]?.textContent) || product?.artist || 'Unknown artist';
    const name = clean(spans[1]?.textContent) || product?.name || slug;
    const text = clean(card.textContent);
    const prices = [...card.querySelectorAll<HTMLAnchorElement>('a')].map((item) => ({
      href: item.pathname,
      price: parsePrice(item.textContent),
    }));
    const image = card.querySelector<HTMLImageElement>('img');
    const imageUrl =
      image?.currentSrc ||
      image?.src ||
      image?.getAttribute('data-src') ||
      (typeof product?.image === 'string' ? product.image : product?.image?.[0]) ||
      null;

    kits.set(slug, {
      slug,
      url: `https://csgoskins.gg/items/${slug}`,
      artist,
      name,
      title: `${artist}, ${name}`,
      imageUrl,
      rarity: parseRarity(text),
      quality: text.includes('StatTrak') ? 'Normal / StatTrak' : 'Normal',
      normalPrice: prices.find((item) => item.href.endsWith('/normal'))?.price ?? null,
      stattrakPrice: prices.find((item) => item.href.endsWith('/stattrak'))?.price ?? null,
      offers: parseCount(text, 'OFFERS'),
      markets: parseCount(text, 'MARKETS'),
      communityRating: product?.communityRating ?? null,
      communityVotes: product?.communityVotes ?? null,
      updatedAt: new Date().toISOString(),
    });
  }

  // JSON-LD keeps the catalog useful if the site's card markup changes.
  for (const product of schema.values()) {
    if (!product.url) continue;
    const slug = product.url.match(/\/items\/(music-kit-[^/?#]+)/)?.[1];
    if (!slug || kits.has(slug)) continue;
    const title = product.name?.replace(/^Music Kit\s*\|\s*/i, '') || slug;
    const comma = title.indexOf(',');
    const artist = comma === -1 ? title : title.slice(0, comma).trim();
    const name = comma === -1 ? title : title.slice(comma + 1).trim();
    const image = Array.isArray(product.image) ? product.image[0] : product.image;
    kits.set(slug, {
      slug,
      url: product.url,
      artist,
      name,
      title,
      imageUrl: image ?? null,
      rarity: 'High Grade',
      quality: null,
      normalPrice: numberOrNull(product.offers?.lowPrice),
      stattrakPrice: null,
      offers: numberOrNull(product.offers?.offerCount),
      markets: null,
      communityRating: numberOrNull(product.aggregateRating?.ratingValue),
      communityVotes: numberOrNull(product.aggregateRating?.ratingCount),
      updatedAt: new Date().toISOString(),
    });
  }

  return [...kits.values()];
}

function getSchemaProducts(document: Document): Map<string, SchemaProduct & {
  artist?: string;
  communityRating?: number | null;
  communityVotes?: number | null;
}> {
  const products = new Map<string, SchemaProduct & {
    artist?: string;
    communityRating?: number | null;
    communityVotes?: number | null;
  }>();

  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const json = JSON.parse(script.textContent || '');
      const items = json?.itemListElement || [];
      for (const entry of items) {
        const product = entry?.item;
        if (!product?.url) continue;
        const slug = product.url.match(/\/items\/(music-kit-[^/?#]+)/)?.[1];
        if (!slug) continue;
        const title = String(product.name || '').replace(/^Music Kit\s*\|\s*/i, '');
        const comma = title.indexOf(',');
        products.set(slug, {
          ...product,
          artist: comma === -1 ? title : title.slice(0, comma).trim(),
          communityRating: numberOrNull(product.aggregateRating?.ratingValue),
          communityVotes: numberOrNull(product.aggregateRating?.ratingCount),
        });
      }
    } catch {
      // Ignore malformed JSON-LD; the visible card remains the primary source.
    }
  }
  return products;
}

function findCard(element: Element): HTMLElement | null {
  let current: HTMLElement | null = element.parentElement;
  while (current) {
    if (current.className.includes('h-[545px]')) return current;
    current = current.parentElement;
  }
  return null;
}

function clean(value: string | null | undefined): string {
  return value?.replace(/\s+/g, ' ').trim() || '';
}

function parsePrice(value: string | null): number | null {
  const match = clean(value).match(/\$(\d+(?:\.\d{1,2})?)/);
  return match ? Number(match[1]) : null;
}

function parseCount(value: string, label: string): number | null {
  const match = value.match(new RegExp(`([\\d,.]+)\\s*([Kk])?\\s+${label}`, 'i'));
  if (!match) return null;
  const numberText = match[1];
  if (!numberText) return null;
  const number = Number(numberText.replace(',', ''));
  return match[2] ? number * 1000 : number;
}

function parseRarity(value: string): string {
  const match = value.match(
    /(Consumer Grade|Industrial Grade|Mil-Spec|Restricted|Classified|Covert|High Grade|Remarkable|Exotic|Extraordinary)(?: Music Kit)?/i,
  );
  return match?.[1] || 'High Grade';
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
