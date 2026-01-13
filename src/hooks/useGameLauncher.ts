// Game Launcher hook

import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { GameLibrary, DetectedGame, AddGameRequest, LibraryGame } from '../types';

export interface UseGameLauncherReturn {
  library: GameLibrary;
  isLoading: boolean;
  isScanning: boolean;
  error: string | null;
  loadLibrary: () => Promise<void>;
  scanForGames: () => Promise<DetectedGame[]>;
  addDetectedGames: (games: DetectedGame[]) => Promise<void>;
  addManualGame: (request: AddGameRequest) => Promise<void>;
  removeGame: (gameId: string) => Promise<void>;
  launchGame: (gameId: string) => Promise<void>;
  getGameById: (gameId: string) => LibraryGame | undefined;
}

export function useGameLauncher(): UseGameLauncherReturn {
  const [library, setLibrary] = useState<GameLibrary>({ games: [] });
  const [isLoading, setIsLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLibrary = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const lib = await invoke<GameLibrary>('get_game_library');
      setLibrary(lib);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const scanForGames = useCallback(async (): Promise<DetectedGame[]> => {
    setIsScanning(true);
    setError(null);
    try {
      const games = await invoke<DetectedGame[]>('scan_for_games');
      return games;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return [];
    } finally {
      setIsScanning(false);
    }
  }, []);

  const addDetectedGames = useCallback(async (games: DetectedGame[]) => {
    setError(null);
    try {
      const lib = await invoke<GameLibrary>('add_detected_games', { games });
      setLibrary(lib);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const addManualGame = useCallback(async (request: AddGameRequest) => {
    setError(null);
    try {
      const lib = await invoke<GameLibrary>('add_manual_game', { request });
      setLibrary(lib);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const removeGame = useCallback(async (gameId: string) => {
    setError(null);
    try {
      const lib = await invoke<GameLibrary>('remove_game_from_library', { gameId });
      setLibrary(lib);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const launchGame = useCallback(async (gameId: string) => {
    setError(null);
    try {
      await invoke('launch_game', { gameId });
      // Reload library to get updated last_played
      await loadLibrary();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [loadLibrary]);

  const getGameById = useCallback((gameId: string): LibraryGame | undefined => {
    return library.games.find(g => g.id === gameId);
  }, [library]);

  // Load library on mount
  useEffect(() => {
    loadLibrary();
  }, [loadLibrary]);

  // Listen for game events
  useEffect(() => {
    const unlistenStarted = listen<string>('launcher:game_started', () => {
      loadLibrary();
    });

    const unlistenStopped = listen<{ game_id: string; session_seconds: number }>('launcher:game_stopped', () => {
      loadLibrary();
    });

    return () => {
      unlistenStarted.then(fn => fn());
      unlistenStopped.then(fn => fn());
    };
  }, [loadLibrary]);

  return {
    library,
    isLoading,
    isScanning,
    error,
    loadLibrary,
    scanForGames,
    addDetectedGames,
    addManualGame,
    removeGame,
    launchGame,
    getGameById,
  };
}
