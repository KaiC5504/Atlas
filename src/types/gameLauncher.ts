// Game Launcher types

export type GameSource = 'steam' | 'hoyo_play' | 'manual';

export interface DetectedGame {
  name: string;
  executable_path: string;
  install_path: string;
  source: GameSource;
  app_id: string | null;
  icon_path: string | null;
}

export interface LibraryGame {
  id: string;
  name: string;
  executable_path: string;
  install_path: string;
  source: GameSource;
  app_id: string | null;
  icon_path: string | null;
  process_name: string;
  added_at: string;
  last_played: string | null;
  total_playtime_seconds: number;
}

export interface GameLibrary {
  games: LibraryGame[];
}

export interface AddGameRequest {
  name: string;
  executable_path: string;
  icon_path: string | null;
}

// Helper function to format playtime
export function formatPlaytime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

// Helper function to get source display name
export function getSourceDisplayName(source: GameSource): string {
  switch (source) {
    case 'steam':
      return 'Steam';
    case 'hoyo_play':
      return 'HoYoPlay';
    case 'manual':
      return 'Manual';
    default:
      return 'Unknown';
  }
}
