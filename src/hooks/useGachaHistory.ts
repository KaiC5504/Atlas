import { useState, useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type {
  GachaAccount,
  GachaHistory,
  GachaStats,
  GachaGame,
  DetectedGachaGame,
  RefreshGachaRequest,
  UigfExport,
} from '../types/gacha';

// LocalStorage keys for persisting user selection
const STORAGE_KEY_GAME = 'gacha_selected_game';
const STORAGE_KEY_UID = 'gacha_selected_uid';

// Module-level cache to persist data across component mounts
interface GachaCache {
  accounts: GachaAccount[];
  supportedGames: DetectedGachaGame[];
  selectedGame: GachaGame | null;
  selectedAccount: GachaAccount | null;
  history: GachaHistory | null;
  stats: GachaStats | null;
  historyByAccount: Map<string, { history: GachaHistory; stats: GachaStats }>;
  initialized: boolean;
}

const cache: GachaCache = {
  accounts: [],
  supportedGames: [],
  selectedGame: null,
  selectedAccount: null,
  history: null,
  stats: null,
  historyByAccount: new Map(),
  initialized: false,
};

// Helper to create cache key for account data
function getAccountCacheKey(game: GachaGame, uid: string): string {
  return `${game}:${uid}`;
}

export interface GachaProgress {
  game: GachaGame;
  stage: string;
  percent: number;
  new_records?: number;
}

export interface UseGachaHistoryReturn {
  // State
  accounts: GachaAccount[];
  selectedAccount: GachaAccount | null;
  selectedGame: GachaGame | null;
  filteredAccounts: GachaAccount[];
  history: GachaHistory | null;
  stats: GachaStats | null;
  supportedGames: DetectedGachaGame[];
  isLoading: boolean;
  isSyncing: boolean;
  syncProgress: GachaProgress | null;
  error: string | null;

  // Actions
  loadAccounts: () => Promise<void>;
  loadSupportedGames: () => Promise<void>;
  refreshSupportedGames: () => Promise<void>;
  selectGame: (game: GachaGame | null) => void;
  selectAccount: (account: GachaAccount | null) => Promise<void>;
  refreshHistory: (request: RefreshGachaRequest) => Promise<void>;
  deleteHistory: (game: GachaGame, uid: string) => Promise<void>;
  exportUigf: (accounts: GachaAccount[]) => Promise<UigfExport>;
  importUigf: (data: UigfExport) => Promise<void>;
}

export function useGachaHistory(): UseGachaHistoryReturn {
  // Initialize state from cache if available
  const [accounts, setAccounts] = useState<GachaAccount[]>(cache.accounts);
  const [selectedAccount, setSelectedAccount] = useState<GachaAccount | null>(cache.selectedAccount);
  const [selectedGame, setSelectedGame] = useState<GachaGame | null>(cache.selectedGame);
  const [history, setHistory] = useState<GachaHistory | null>(cache.history);
  const [stats, setStats] = useState<GachaStats | null>(cache.stats);
  const [supportedGames, setSupportedGames] = useState<DetectedGachaGame[]>(cache.supportedGames);
  // Only show loading state if we don't have cached data
  const [isLoading, setIsLoading] = useState(!cache.initialized);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<GachaProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Track if we've restored from localStorage
  const hasRestoredSelection = useRef(cache.initialized);

  // Computed: filter accounts by selected game
  const filteredAccounts = selectedGame
    ? accounts.filter((acc) => acc.game === selectedGame)
    : accounts;

  // Load all saved accounts
  const loadAccounts = useCallback(async () => {
    // Only show loading if we have no cached data
    if (cache.accounts.length === 0) {
      setIsLoading(true);
    }
    setError(null);
    try {
      const accs = await invoke<GachaAccount[]>('get_gacha_accounts');
      setAccounts(accs);
      cache.accounts = accs;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load supported/detected games (uses cache)
  const loadSupportedGames = useCallback(async () => {
    try {
      const games = await invoke<DetectedGachaGame[]>('get_gacha_supported_games');
      setSupportedGames(games);
      cache.supportedGames = games;
    } catch (e) {
      console.error('Failed to load supported games:', e);
    }
  }, []);

  // Force refresh supported games (bypasses cache)
  const refreshSupportedGames = useCallback(async () => {
    try {
      const games = await invoke<DetectedGachaGame[]>('refresh_gacha_games_cache');
      setSupportedGames(games);
      cache.supportedGames = games;
    } catch (e) {
      console.error('Failed to refresh supported games:', e);
    }
  }, []);

  // Select a game (filters accounts)
  const selectGame = useCallback(
    (game: GachaGame | null) => {
      setSelectedGame(game);
      cache.selectedGame = game;

      // Persist to localStorage
      if (game) {
        localStorage.setItem(STORAGE_KEY_GAME, game);
      } else {
        localStorage.removeItem(STORAGE_KEY_GAME);
      }

      // Clear selected account if it doesn't match the new game
      if (game && selectedAccount && selectedAccount.game !== game) {
        setSelectedAccount(null);
        setHistory(null);
        setStats(null);
        cache.selectedAccount = null;
        cache.history = null;
        cache.stats = null;
        localStorage.removeItem(STORAGE_KEY_UID);
      }
    },
    [selectedAccount]
  );

  // Select an account and load its history
  const selectAccount = useCallback(async (account: GachaAccount | null) => {
    setSelectedAccount(account);
    cache.selectedAccount = account;

    // Persist to localStorage
    if (account) {
      localStorage.setItem(STORAGE_KEY_UID, account.uid);
    } else {
      localStorage.removeItem(STORAGE_KEY_UID);
    }

    if (!account) {
      setHistory(null);
      setStats(null);
      cache.history = null;
      cache.stats = null;
      return;
    }

    // Check if we have cached data for this account
    const cacheKey = getAccountCacheKey(account.game, account.uid);
    const cachedData = cache.historyByAccount.get(cacheKey);

    if (cachedData) {
      // Use cached data immediately
      setHistory(cachedData.history);
      setStats(cachedData.stats);
      cache.history = cachedData.history;
      cache.stats = cachedData.stats;
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const [historyData, statsData] = await Promise.all([
        invoke<GachaHistory>('get_gacha_history', { game: account.game, uid: account.uid }),
        invoke<GachaStats>('get_gacha_stats', { game: account.game, uid: account.uid }),
      ]);
      setHistory(historyData);
      setStats(statsData);

      // Cache the data
      cache.history = historyData;
      cache.stats = statsData;
      cache.historyByAccount.set(cacheKey, { history: historyData, stats: statsData });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setHistory(null);
      setStats(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Refresh/sync history from game cache
  const refreshHistory = useCallback(async (request: RefreshGachaRequest) => {
    setIsSyncing(true);
    setSyncProgress({ game: request.game, stage: 'starting', percent: 0 });
    setError(null);

    try {
      const historyData = await invoke<GachaHistory>('refresh_gacha_history', { request });

      // Reload accounts to update counts
      await loadAccounts();

      // If this is the selected account, update the display
      if (selectedAccount?.game === request.game && selectedAccount?.uid === historyData.uid) {
        setHistory(historyData);
        const statsData = await invoke<GachaStats>('get_gacha_stats', {
          game: request.game,
          uid: historyData.uid,
        });
        setStats(statsData);

        // Update cache
        cache.history = historyData;
        cache.stats = statsData;
        const cacheKey = getAccountCacheKey(request.game, historyData.uid);
        cache.historyByAccount.set(cacheKey, { history: historyData, stats: statsData });
      }

      // Auto-select if this is a new account
      if (!selectedAccount) {
        const account: GachaAccount = {
          game: historyData.game,
          uid: historyData.uid,
          last_sync: historyData.last_sync,
          total_records: historyData.records.length,
          region: historyData.region,
        };
        await selectAccount(account);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsSyncing(false);
      setSyncProgress(null);
    }
  }, [loadAccounts, selectedAccount, selectAccount]);

  // Delete history for an account
  const deleteHistory = useCallback(async (game: GachaGame, uid: string) => {
    setError(null);
    try {
      await invoke('delete_gacha_history', { game, uid });

      // Clear cache for this account
      const cacheKey = getAccountCacheKey(game, uid);
      cache.historyByAccount.delete(cacheKey);

      // Clear selection if deleted account was selected
      if (selectedAccount?.game === game && selectedAccount?.uid === uid) {
        setSelectedAccount(null);
        setHistory(null);
        setStats(null);
        cache.selectedAccount = null;
        cache.history = null;
        cache.stats = null;
        localStorage.removeItem(STORAGE_KEY_UID);
      }

      // Reload accounts
      await loadAccounts();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [selectedAccount, loadAccounts]);

  // Export to UIGF format
  const exportUigf = useCallback(async (accountsToExport: GachaAccount[]): Promise<UigfExport> => {
    const version = await invoke<string>('get_current_version');
    return invoke<UigfExport>('export_gacha_uigf', { accounts: accountsToExport, version });
  }, []);

  // Import from UIGF format
  const importUigf = useCallback(async (data: UigfExport) => {
    setError(null);
    try {
      await invoke<GachaAccount[]>('import_gacha_uigf', { data });
      // Clear history cache since imported data may have changed existing accounts
      cache.historyByAccount.clear();
      cache.history = null;
      cache.stats = null;
      await loadAccounts();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [loadAccounts]);

  // Listen for progress events
  useEffect(() => {
    const unlisten = listen<GachaProgress>('gacha:progress', (event) => {
      setSyncProgress(event.payload);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Initial load - skip if already cached
  useEffect(() => {
    if (!cache.initialized) {
      loadAccounts();
      loadSupportedGames();
    }
  }, [loadAccounts, loadSupportedGames]);

  // Restore selection from localStorage after initial data is loaded
  useEffect(() => {
    // Only restore once, and only after we have data to work with
    if (hasRestoredSelection.current) return;
    if (supportedGames.length === 0) return;

    hasRestoredSelection.current = true;
    cache.initialized = true;

    const savedGame = localStorage.getItem(STORAGE_KEY_GAME) as GachaGame | null;
    const savedUid = localStorage.getItem(STORAGE_KEY_UID);

    // Check if the saved game is still detected/supported
    const isGameSupported = savedGame && supportedGames.some((g) => g.game === savedGame);

    if (isGameSupported && savedGame) {
      // Set the game without triggering localStorage write (already saved)
      setSelectedGame(savedGame);
      cache.selectedGame = savedGame;

      // If we have accounts and a saved UID, try to restore the account selection
      if (savedUid && accounts.length > 0) {
        const savedAccount = accounts.find(
          (acc) => acc.game === savedGame && acc.uid === savedUid
        );
        if (savedAccount) {
          // Load the account's history
          selectAccount(savedAccount);
        }
      }
    } else if (supportedGames.length > 0) {
      // No saved game or saved game not supported - auto-select first detected game
      const firstGame = supportedGames[0].game;
      setSelectedGame(firstGame);
      cache.selectedGame = firstGame;
      localStorage.setItem(STORAGE_KEY_GAME, firstGame);
    }
  }, [supportedGames, accounts, selectAccount]);

  return {
    accounts,
    selectedAccount,
    selectedGame,
    filteredAccounts,
    history,
    stats,
    supportedGames,
    isLoading,
    isSyncing,
    syncProgress,
    error,
    loadAccounts,
    loadSupportedGames,
    refreshSupportedGames,
    selectGame,
    selectAccount,
    refreshHistory,
    deleteHistory,
    exportUigf,
    importUigf,
  };
}
