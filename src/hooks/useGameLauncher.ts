import { useState, useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { GameLibrary, DetectedGame, AddGameRequest, LibraryGame } from '../types';

const CACHE_TTL_MS = 30000;

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

  const lastFetchRef = useRef<number>(0);

  const loadLibrary = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && lastFetchRef.current > 0 && (now - lastFetchRef.current) < CACHE_TTL_MS) {
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const lib = await invoke<GameLibrary>('get_game_library');
      setLibrary(lib);
      lastFetchRef.current = Date.now();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const invalidateCache = useCallback(() => {
    lastFetchRef.current = 0;
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
      invalidateCache(); 
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [invalidateCache]);

  const addManualGame = useCallback(async (request: AddGameRequest) => {
    setError(null);
    try {
      const lib = await invoke<GameLibrary>('add_manual_game', { request });
      setLibrary(lib);
      invalidateCache(); 
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [invalidateCache]);

  const removeGame = useCallback(async (gameId: string) => {
    setError(null);
    try {
      const lib = await invoke<GameLibrary>('remove_game_from_library', { gameId });
      setLibrary(lib);
      invalidateCache(); 
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [invalidateCache]);

  const launchGame = useCallback(async (gameId: string) => {
    setError(null);
    try {
      await invoke('launch_game', { gameId });
      invalidateCache();
      await loadLibrary(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [loadLibrary, invalidateCache]);

  const getGameById = useCallback((gameId: string): LibraryGame | undefined => {
    return library.games.find(g => g.id === gameId);
  }, [library]);

  // Load library on mount
  useEffect(() => {
    loadLibrary();
  }, [loadLibrary]);

  useEffect(() => {
    const unlistenStarted = listen<string>('launcher:game_started', () => {
      invalidateCache();
      loadLibrary(true);
    });

    const unlistenStopped = listen<{ game_id: string; session_seconds: number }>('launcher:game_stopped', () => {
      invalidateCache();
      loadLibrary(true);
    });

    return () => {
      unlistenStarted.then(fn => fn());
      unlistenStopped.then(fn => fn());
    };
  }, [loadLibrary, invalidateCache]);

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
