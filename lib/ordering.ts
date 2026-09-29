import type { UserKitState } from './types';

export type KitFilter = 'all' | 'unrated' | 'owned' | 'rated';
export type KitSort = 'default' | 'rating' | 'price' | 'name';
export type KitSection = 'unrated' | 'rated' | 'wishlisted' | 'owned' | 'sold';

export const KIT_SECTIONS: { id: KitSection; label: string }[] = [
  { id: 'unrated', label: 'Unrated' },
  { id: 'rated', label: 'Rated' },
  { id: 'wishlisted', label: 'Wishlisted' },
  { id: 'owned', label: 'Owned' },
  { id: 'sold', label: 'Sold' },
];

export interface OrderedKit {
  name: string;
  price: number | null;
  state: UserKitState;
}

export function matchesFilter(state: UserKitState, filter: KitFilter): boolean {
  if (filter === 'unrated') return state.stars == null;
  if (filter === 'owned') return state.status === 'owned';
  if (filter === 'rated') return state.stars != null;
  return true;
}

export function compareKits(a: OrderedKit, b: OrderedKit, sort: KitSort): number {
  if (sort === 'name') return a.name.localeCompare(b.name);
  if (sort === 'price') return compareNumbers(a.price, b.price) || a.name.localeCompare(b.name);
  if (sort === 'rating') return compareNumbers(b.state.stars, a.state.stars) || a.name.localeCompare(b.name);
  return compareDefault(a, b);
}

export function kitSection(state: UserKitState): KitSection {
  if (state.status === 'wishlisted' || state.status === 'owned' || state.status === 'sold') {
    return state.status;
  }
  if (state.stars != null) return 'rated';
  return 'unrated';
}

function compareDefault(a: OrderedKit, b: OrderedKit): number {
  const group = groupRank(a.state) - groupRank(b.state);
  if (group !== 0) return group;
  if (a.state.stars != null || b.state.stars != null) {
    const stars = compareNumbers(b.state.stars, a.state.stars);
    if (stars !== 0) return stars;
  }
  return a.name.localeCompare(b.name);
}

function groupRank(state: UserKitState): number {
  return KIT_SECTIONS.findIndex((section) => section.id === kitSection(state));
}

function compareNumbers(a: number | null, b: number | null): number {
  return (a ?? Number.POSITIVE_INFINITY) - (b ?? Number.POSITIVE_INFINITY);
}
