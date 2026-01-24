// Gacha history types for HoYoverse games

export type GachaGame = 'genshin' | 'star_rail' | 'zzz';

export interface GachaType {
  id: string;
  name: string;
}

export interface GachaRecord {
  id: string;
  uid: string;
  gacha_type: string;
  item_id: string | null;
  name: string;
  item_type: string;
  rank_type: string;
  time: string;
}

export interface GachaHistory {
  game: GachaGame;
  uid: string;
  records: GachaRecord[];
  last_sync: number;
  region: string | null;
}

export interface FiveStarPull {
  name: string;
  pity: number;
  time: string;
}

export interface BannerStats {
  total_pulls: number;
  five_star_count: number;
  four_star_count: number;
  current_pity: number;
  average_pity: number;
  five_star_pulls: FiveStarPull[];
}

export interface GachaStats {
  total_pulls: number;
  five_star_count: number;
  four_star_count: number;
  three_star_count: number;
  banner_stats: Record<string, BannerStats>;
}

export interface GachaAccount {
  game: GachaGame;
  uid: string;
  last_sync: number;
  total_records: number;
  region: string | null;
}

export interface DetectedGachaGame {
  game: GachaGame;
  install_path: string;
  cache_exists: boolean;
  icon_path: string | null;
}

export interface RefreshGachaRequest {
  game: GachaGame;
  game_path: string;
}

// UIGF v4 export format
export interface UigfInfo {
  export_timestamp: number;
  export_app: string;
  export_app_version: string;
  version: string;
}

export interface UigfRecord {
  id: string;
  gacha_type: string;
  item_id?: string;
  name: string;
  item_type: string;
  rank_type: string;
  time: string;
}

export interface UigfGameData {
  uid: string;
  list: UigfRecord[];
}

export interface UigfExport {
  info: UigfInfo;
  hk4e?: UigfGameData[];
  hkrpg?: UigfGameData[];
  nap?: UigfGameData[];
}

// Helper functions

export function getGameDisplayName(game: GachaGame): string {
  switch (game) {
    case 'genshin':
      return 'Genshin Impact';
    case 'star_rail':
      return 'Honkai: Star Rail';
    case 'zzz':
      return 'Zenless Zone Zero';
    default:
      return 'Unknown';
  }
}

export function getGameShortName(game: GachaGame): string {
  switch (game) {
    case 'genshin':
      return 'GI';
    case 'star_rail':
      return 'HSR';
    case 'zzz':
      return 'ZZZ';
    default:
      return '?';
  }
}

export function getGameIconFilename(game: GachaGame): string {
  switch (game) {
    case 'genshin':
      return 'GenshinImpact.png';
    case 'star_rail':
      return 'StarRail.png';
    case 'zzz':
      return 'ZenlessZoneZero.png';
  }
}

export function getGachaTypeName(game: GachaGame, gachaType: string): string {
  const typeNames: Record<GachaGame, Record<string, string>> = {
    genshin: {
      '301': 'Character Event',
      '302': 'Weapon Event',
      '200': 'Standard',
      '100': 'Beginner',
      '500': 'Chronicled Wish',
    },
    star_rail: {
      '11': 'Character Event',
      '12': 'Light Cone Event',
      '1': 'Standard',
      '2': 'Departure',
    },
    zzz: {
      '2001': 'Exclusive Channel',
      '3001': 'W-Engine Channel',
      '1001': 'Standard Channel',
      '5001': 'Bangboo Channel',
    },
  };

  return typeNames[game]?.[gachaType] || `Banner ${gachaType}`;
}

export function getGachaTypes(game: GachaGame): GachaType[] {
  const types: Record<GachaGame, GachaType[]> = {
    genshin: [
      { id: '301', name: 'Character Event' },
      { id: '302', name: 'Weapon Event' },
      { id: '200', name: 'Standard' },
      { id: '100', name: 'Beginner' },
      { id: '500', name: 'Chronicled Wish' },
    ],
    star_rail: [
      { id: '11', name: 'Character Event' },
      { id: '12', name: 'Light Cone Event' },
      { id: '1', name: 'Standard' },
      { id: '2', name: 'Departure' },
    ],
    zzz: [
      { id: '2001', name: 'Exclusive Channel' },
      { id: '3001', name: 'W-Engine Channel' },
      { id: '1001', name: 'Standard Channel' },
      { id: '5001', name: 'Bangboo Channel' },
    ],
  };

  return types[game] || [];
}

export function getRarityColor(rarity: string | number): string {
  const r = typeof rarity === 'string' ? parseInt(rarity) : rarity;
  switch (r) {
    case 5:
      return 'text-amber-400';
    case 4:
      return 'text-purple-400';
    default:
      return 'text-blue-400';
  }
}

export function getRarityBgColor(rarity: string | number): string {
  const r = typeof rarity === 'string' ? parseInt(rarity) : rarity;
  switch (r) {
    case 5:
      return 'bg-amber-400/20';
    case 4:
      return 'bg-purple-400/20';
    default:
      return 'bg-blue-400/20';
  }
}

export function formatTimestamp(ms: number): string {
  if (!ms) return 'Never';
  const date = new Date(ms);
  return date.toLocaleString();
}

export function formatRelativeTime(ms: number): string {
  if (!ms) return 'Never';

  const now = Date.now();
  const diff = now - ms;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}

export function calculateFiveStarRate(stats: GachaStats): number {
  if (stats.total_pulls === 0) return 0;
  return (stats.five_star_count / stats.total_pulls) * 100;
}

export function calculateFourStarRate(stats: GachaStats): number {
  if (stats.total_pulls === 0) return 0;
  return (stats.four_star_count / stats.total_pulls) * 100;
}

// Soft pity thresholds
export function getSoftPityThreshold(game: GachaGame, gachaType: string): number {
  // Most banners have soft pity at around 74-75 for 5-star
  // Weapon banners typically have lower pity
  if (game === 'genshin' && gachaType === '302') {
    return 63; // Weapon banner
  }
  return 74; // Standard for most banners
}

export function getHardPityThreshold(game: GachaGame, gachaType: string): number {
  if (game === 'genshin' && gachaType === '302') {
    return 80; // Weapon banner
  }
  return 90; // Standard for most banners
}
