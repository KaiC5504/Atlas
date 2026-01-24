import { useState, useCallback, useEffect } from 'react';
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
  const [accounts, setAccounts] = useState<GachaAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<GachaAccount | null>(null);
  const [selectedGame, setSelectedGame] = useState<GachaGame | null>(null);
  const [history, setHistory] = useState<GachaHistory | null>(null);
  const [stats, setStats] = useState<GachaStats | null>(null);
  const [supportedGames, setSupportedGames] = useState<DetectedGachaGame[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<GachaProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Computed: filter accounts by selected game
  const filteredAccounts = selectedGame
    ? accounts.filter((acc) => acc.game === selectedGame)
    : accounts;

  // Load all saved accounts
  const loadAccounts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const accs = await invoke<GachaAccount[]>('get_gacha_accounts');
      setAccounts(accs);
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
    } catch (e) {
      console.error('Failed to load supported games:', e);
    }
  }, []);

  // Force refresh supported games (bypasses cache)
  const refreshSupportedGames = useCallback(async () => {
    try {
      const games = await invoke<DetectedGachaGame[]>('refresh_gacha_games_cache');
      setSupportedGames(games);
    } catch (e) {
      console.error('Failed to refresh supported games:', e);
    }
  }, []);

  // Select a game (filters accounts)
  const selectGame = useCallback(
    (game: GachaGame | null) => {
      setSelectedGame(game);

      // Clear selected account if it doesn't match the new game
      if (game && selectedAccount && selectedAccount.game !== game) {
        setSelectedAccount(null);
        setHistory(null);
        setStats(null);
      }
    },
    [selectedAccount]
  );

  // Select an account and load its history
  const selectAccount = useCallback(async (account: GachaAccount | null) => {
    setSelectedAccount(account);

    if (!account) {
      setHistory(null);
      setStats(null);
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

      // Clear selection if deleted account was selected
      if (selectedAccount?.game === game && selectedAccount?.uid === uid) {
        setSelectedAccount(null);
        setHistory(null);
        setStats(null);
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

  // Initial load
  useEffect(() => {
    loadAccounts();
    loadSupportedGames();
  }, [loadAccounts, loadSupportedGames]);

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
