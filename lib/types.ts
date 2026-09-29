export type Rating = 1 | 2 | 3 | 4 | 5;

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

export interface UserKitState {
  stars: Rating | null;
  owned: boolean;
  listened: ListenProgress | null;
  tracks: Record<string, ListenProgress>;
}

export interface StoredData {
  catalog: MusicKit[];
  states: Record<string, UserKitState>;
  lastSyncedAt: string | null;
}

export type Filter = 'all' | 'unrated' | 'rated' | 'owned';
export type Sort = 'default' | 'rating' | 'name' | 'price' | 'community';
