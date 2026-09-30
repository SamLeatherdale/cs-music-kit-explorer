export type Rating = 0.5 | 1 | 1.5 | 2 | 2.5 | 3 | 3.5 | 4 | 4.5 | 5;

export interface MusicKit {
  slug: string;
  url: string;
  artist: string;
  name: string;
  title: string;
  imageUrl: string | null;
  rarity: string;
  quality: string | null;
  normalPrice: number | null;
  stattrakPrice: number | null;
  offers: number | null;
  markets: number | null;
  communityRating: number | null;
  communityVotes: number | null;
  updatedAt: string;
}

export type ListenProgress = 'partial' | 'full';

export type KitStatus = 'owned' | 'wishlisted' | 'sold';

export interface UserKitState {
  stars: Rating | null;
  status: KitStatus | null;
  listened: ListenProgress | null;
  tracks: Record<string, ListenProgress>;
  updatedAt?: string;
}

export interface StoredData {
  catalog: MusicKit[];
  states: Record<string, UserKitState>;
  lastSyncedAt: string | null;
}

export type Filter = 'all' | 'unrated' | 'rated' | 'owned';
export type Sort = 'default' | 'rating' | 'name' | 'price' | 'community';
