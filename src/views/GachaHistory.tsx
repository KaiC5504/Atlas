import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  RefreshCw,
  Trash2,
  Star,
  BarChart3,
  Table,
  Clock,
  PieChart,
  FileDown,
  AlertCircle,
  Loader2,
  ChevronDown,
  Check,
} from 'lucide-react';
import { useGachaHistory } from '../hooks/useGachaHistory';
import {
  GachaOverview,
  GachaRecordsTable,
  GachaCharts,
  GachaTimeline,
  GachaExport,
} from '../components/gacha';
import type { GachaGame, GachaAccount, DetectedGachaGame } from '../types/gacha';
import { getGameDisplayName, getGameShortName, formatRelativeTime } from '../types/gacha';

type TabId = 'overview' | 'records' | 'charts' | 'timeline' | 'export';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <BarChart3 className="w-4 h-4" /> },
  { id: 'records', label: 'Records', icon: <Table className="w-4 h-4" /> },
  { id: 'charts', label: 'Charts', icon: <PieChart className="w-4 h-4" /> },
  { id: 'timeline', label: 'Timeline', icon: <Clock className="w-4 h-4" /> },
  { id: 'export', label: 'Export/Import', icon: <FileDown className="w-4 h-4" /> },
];

const ALL_GAMES: GachaGame[] = ['genshin', 'star_rail', 'zzz'];

// Cache for icon base64 data to prevent repeated backend calls
const iconDataCache = new Map<string, string>();

async function getIconData(iconPath: string): Promise<string> {
  const cached = iconDataCache.get(iconPath);
  if (cached) return cached;

  const base64Data = await invoke<string>('get_icon_base64', { iconPath });
  iconDataCache.set(iconPath, base64Data);
  return base64Data;
}

// Helper component to display game icon with rounded corners
function GameIconDisplay({
  game,
  iconPath,
  size = 'normal',
  showDropdownIndicator = false,
}: {
  game: GachaGame;
  iconPath: string | null;
  size?: 'normal' | 'small';
  showDropdownIndicator?: boolean;
}) {
  const [iconSrc, setIconSrc] = useState<string | null>(() =>
    iconPath ? iconDataCache.get(iconPath) || null : null
  );
  const [iconError, setIconError] = useState(false);

  // Reset icon when iconPath changes
  useEffect(() => {
    if (!iconPath) {
      setIconSrc(null);
      return;
    }

    const cached = iconDataCache.get(iconPath);
    if (cached) {
      setIconSrc(cached);
      setIconError(false);
      return;
    }

    let cancelled = false;

    async function loadIcon() {
      try {
        const data = await getIconData(iconPath!);
        if (!cancelled) {
          setIconSrc(data);
          setIconError(false);
        }
      } catch (e) {
        if (!cancelled) {
          setIconError(true);
        }
      }
    }

    setIconSrc(null);
    loadIcon();

    return () => {
      cancelled = true;
    };
  }, [iconPath]);

  const containerClass = size === 'small' ? 'w-10 h-10' : 'w-12 h-12';

  if (iconSrc && !iconError) {
    return (
      <div className={`${containerClass} rounded-xl overflow-hidden relative`}>
        <img
          src={iconSrc}
          alt={getGameDisplayName(game)}
          className="w-full h-full object-cover"
          onError={() => setIconError(true)}
        />
        {showDropdownIndicator && (
          <div className="absolute bottom-0 right-0 bg-black/50 rounded-tl p-0.5">
            <ChevronDown className="w-3 h-3 text-white" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`${containerClass} flex items-center justify-center bg-surface-base rounded-xl overflow-hidden relative`}>
      <span className="text-sm font-bold text-text-tertiary">{getGameShortName(game)}</span>
      {showDropdownIndicator && (
        <div className="absolute bottom-0 right-0 bg-black/50 rounded-tl p-0.5">
          <ChevronDown className="w-3 h-3 text-white" />
        </div>
      )}
    </div>
  );
}

export default function GachaHistory() {
  const {
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
    selectGame,
    selectAccount,
    refreshHistory,
    deleteHistory,
    exportUigf,
    importUigf,
  } = useGachaHistory();

  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [gameDropdownOpen, setGameDropdownOpen] = useState(false);
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);

  const gameDropdownRef = useRef<HTMLDivElement>(null);
  const accountDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (gameDropdownRef.current && !gameDropdownRef.current.contains(event.target as Node)) {
        setGameDropdownOpen(false);
      }
      if (accountDropdownRef.current && !accountDropdownRef.current.contains(event.target as Node)) {
        setAccountDropdownOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Check if a game is detected
  const isGameDetected = (game: GachaGame) => supportedGames.some((g) => g.game === game);

  // Get detected game info
  const getDetectedGame = (game: GachaGame): DetectedGachaGame | undefined =>
    supportedGames.find((g) => g.game === game);

  // Get other detected games (for dropdown)
  const otherDetectedGames = ALL_GAMES.filter(
    (game) => game !== selectedGame && isGameDetected(game)
  );

  // Handle game selection
  const handleGameSelect = (game: GachaGame) => {
    if (!isGameDetected(game)) return;
    selectGame(game);
    setGameDropdownOpen(false);

    // Auto-select first account for this game if available
    const gameAccounts = accounts.filter((acc) => acc.game === game);
    if (gameAccounts.length > 0 && (!selectedAccount || selectedAccount.game !== game)) {
      selectAccount(gameAccounts[0]);
    }
  };

  // Handle account selection
  const handleAccountSelect = (account: GachaAccount) => {
    selectAccount(account);
    setAccountDropdownOpen(false);
  };

  // Handle sync for selected game
  const handleSync = async () => {
    if (!selectedGame) return;
    const detectedGame = getDetectedGame(selectedGame);
    if (!detectedGame) return;

    await refreshHistory({ game: selectedGame, game_path: detectedGame.install_path });
  };

  const handleDelete = async (account: GachaAccount, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteHistory(account.game, account.uid);
    setDeleteConfirm(null);
  };

  // Get the selected game's detected info
  const selectedDetectedGame = selectedGame ? getDetectedGame(selectedGame) : null;

  // Determine if we have any detected games
  const hasDetectedGames = supportedGames.length > 0;

  return (
    <div className="h-full flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <Star className="w-6 h-6 text-amber-400" />
            Gacha History
          </h1>
          <p className="text-text-secondary mt-1">
            Track your wishes, warps, and signals across HoYoverse games
          </p>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="text-red-400">{error}</div>
        </div>
      )}

      {/* Top Banner with Game/Account Selection */}
      <div className="flex items-center gap-4 bg-surface-raised border border-border rounded-lg p-4">
        {/* Game Selector Dropdown */}
        <div className="relative" ref={gameDropdownRef}>
          <button
            onClick={() => {
              if (hasDetectedGames) {
                setGameDropdownOpen(!gameDropdownOpen);
                setAccountDropdownOpen(false);
              }
            }}
            className={`flex items-center gap-2 p-1 rounded-xl transition-colors ${
              hasDetectedGames
                ? 'hover:bg-surface-base cursor-pointer'
                : 'opacity-50 cursor-not-allowed'
            }`}
            disabled={!hasDetectedGames}
            title={hasDetectedGames ? 'Select game' : 'No games detected'}
          >
            {selectedGame ? (
              <GameIconDisplay
                game={selectedGame}
                iconPath={selectedDetectedGame?.icon_path ?? null}
                showDropdownIndicator={otherDetectedGames.length > 0}
              />
            ) : (
              <div className="w-12 h-12 flex items-center justify-center bg-surface-base rounded-xl">
                <Star className="w-6 h-6 text-text-tertiary" />
              </div>
            )}
          </button>

          {/* Game Dropdown */}
          {gameDropdownOpen && otherDetectedGames.length > 0 && (
            <div className="absolute top-full -left-2 mt-1 p-2 bg-zinc-800 border border-border rounded-lg shadow-lg z-50">
              <div className="flex flex-col gap-2">
                {otherDetectedGames.map((game) => (
                  <button
                    key={game}
                    onClick={() => handleGameSelect(game)}
                    className="p-1 rounded-xl hover:bg-surface-base transition-colors"
                    title={getGameDisplayName(game)}
                  >
                    <GameIconDisplay game={game} iconPath={getDetectedGame(game)?.icon_path ?? null} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Account Selector Dropdown */}
        <div className="relative flex-1" ref={accountDropdownRef}>
          <button
            onClick={() => {
              if (selectedGame && filteredAccounts.length > 0) {
                setAccountDropdownOpen(!accountDropdownOpen);
                setGameDropdownOpen(false);
              }
            }}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
              selectedGame && filteredAccounts.length > 0
                ? 'hover:bg-surface-base cursor-pointer'
                : 'cursor-default'
            }`}
            disabled={!selectedGame || filteredAccounts.length === 0}
          >
            <span className="text-text-primary font-medium">
              {selectedAccount ? (
                <>UID: {selectedAccount.uid}</>
              ) : selectedGame ? (
                filteredAccounts.length === 0 ? (
                  'No accounts'
                ) : (
                  'Select account'
                )
              ) : (
                'Select a game'
              )}
            </span>
            {selectedGame && filteredAccounts.length > 1 && (
              <ChevronDown className="w-4 h-4 text-text-tertiary" />
            )}
          </button>

          {/* Account Dropdown */}
          {accountDropdownOpen && filteredAccounts.length > 0 && (
            <div className="absolute top-full left-0 min-w-64 bg-zinc-800 border border-border rounded-lg shadow-lg z-50 overflow-hidden">
              {filteredAccounts.map((account) => {
                const isSelected =
                  selectedAccount?.game === account.game &&
                  selectedAccount?.uid === account.uid;
                const deleteKey = `${account.game}:${account.uid}`;

                return (
                  <div
                    key={deleteKey}
                    onClick={() => handleAccountSelect(account)}
                    className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-colors ${
                      isSelected ? 'bg-indigo-500/20' : 'hover:bg-surface-base'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {isSelected && <Check className="w-4 h-4 text-indigo-400" />}
                      <div>
                        <div className="text-sm font-medium text-text-primary">
                          UID: {account.uid}
                        </div>
                        <div className="text-xs text-text-tertiary">
                          {account.total_records} records • {formatRelativeTime(account.last_sync)}
                        </div>
                      </div>
                    </div>
                    {deleteConfirm === deleteKey ? (
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => handleDelete(account, e)}
                          className="text-xs px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                        >
                          Delete
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirm(null);
                          }}
                          className="text-xs px-2 py-1 bg-surface-base rounded hover:bg-surface-raised"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirm(deleteKey);
                        }}
                        className="p-1.5 text-text-tertiary hover:text-red-400 rounded transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Sync Status / Button */}
        <div className="flex items-center gap-3">
          {selectedGame && !selectedDetectedGame?.cache_exists && (
            <span className="text-xs text-amber-400">Open history in-game first</span>
          )}
          <button
            onClick={handleSync}
            disabled={!selectedGame || isSyncing || !selectedDetectedGame?.cache_exists}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-600/50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          >
            {isSyncing && syncProgress?.game === selectedGame ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Sync
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-0">
        {selectedGame ? (
          <>
            {/* Sync Progress */}
            {isSyncing && syncProgress && syncProgress.game === selectedGame && (
              <div className="bg-surface-raised border border-border rounded-lg p-4 mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                  <span className="text-sm text-text-primary">
                    Syncing {getGameDisplayName(selectedGame)}...
                  </span>
                </div>
                <div className="text-xs text-text-tertiary mb-2">{syncProgress.stage}</div>
                <div className="h-2 bg-surface-base rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 transition-all"
                    style={{ width: `${syncProgress.percent}%` }}
                  />
                </div>
              </div>
            )}

            {selectedAccount && history && stats ? (
              <>
                {/* Tabs */}
                <div className="flex gap-1 p-1 bg-surface-raised border border-border rounded-lg mb-4">
                  {TABS.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                        activeTab === tab.id
                          ? 'bg-indigo-600 text-white'
                          : 'text-text-secondary hover:text-text-primary hover:bg-surface-base'
                      }`}
                    >
                      {tab.icon}
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-auto">
                  {isLoading ? (
                    <div className="flex items-center justify-center h-full">
                      <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                    </div>
                  ) : (
                    <>
                      {activeTab === 'overview' && (
                        <GachaOverview game={selectedAccount.game} stats={stats} />
                      )}
                      {activeTab === 'records' && (
                        <GachaRecordsTable game={selectedAccount.game} records={history.records} />
                      )}
                      {activeTab === 'charts' && (
                        <GachaCharts
                          game={selectedAccount.game}
                          records={history.records}
                          stats={stats}
                        />
                      )}
                      {activeTab === 'timeline' && (
                        <GachaTimeline game={selectedAccount.game} records={history.records} />
                      )}
                      {activeTab === 'export' && (
                        <GachaExport
                          accounts={accounts}
                          history={history}
                          onExport={exportUigf}
                          onImport={importUigf}
                        />
                      )}
                    </>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center max-w-md">
                  <h2 className="text-xl font-medium text-text-primary mb-2">
                    {filteredAccounts.length === 0 ? 'No Accounts Yet' : 'Select an Account'}
                  </h2>
                  <p className="text-text-secondary mb-4">
                    {filteredAccounts.length === 0
                      ? `Sync ${getGameDisplayName(selectedGame)} to import your wish history. Make sure to open the wish/warp history in-game first.`
                      : 'Click the account dropdown above to select an account and view your gacha history.'}
                  </p>
                  {filteredAccounts.length === 0 && (
                    <button
                      onClick={handleSync}
                      disabled={isSyncing || !selectedDetectedGame?.cache_exists}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-600/50 text-white rounded-lg transition-colors mx-auto"
                    >
                      {isSyncing ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}
                      Sync Now
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-md">
              <h2 className="text-xl font-medium text-text-primary mb-2">Select a Game</h2>
              <p className="text-text-secondary">
                {supportedGames.length === 0
                  ? 'No supported games detected. Install Genshin Impact, Honkai Star Rail, or Zenless Zone Zero via HoYoPlay.'
                  : 'Click the game icon in the top bar to select a game and view your gacha history.'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
