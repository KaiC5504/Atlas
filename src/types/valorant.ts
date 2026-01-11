// Valorant TypeScript types

export interface ValorantItem {
  name: string;
  price: number; // VP
  image_url: string | null;
  item_type: string; // e.g., "skin", "bundle"
  uuid?: string; // Item UUID
}

export interface ValorantStore {
  date: string; // ISO date
  items: ValorantItem[];
  checked_at: string; // ISO timestamp
  is_real_data?: boolean; // Whether this is real API data or mock data
}

export interface GetStoreHistoryParams {
  limit: number | null;
}

// Authentication status
export interface AuthStatus {
  is_authenticated: boolean;
  has_full_cookies: boolean;
  username: string | null;
  region: string;
  puuid: string | null;
  expires_hint: string | null; // "3 weeks" or "1 week"
}

// Event payloads
export interface ValorantUpdatedEvent {
  store: ValorantStore;
}
