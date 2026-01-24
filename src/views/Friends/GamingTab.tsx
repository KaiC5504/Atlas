import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Gamepad2,
  Star,
  TrendingUp,
  Clock,
  Heart,
  Sparkles,
  Target,
  Loader2,
  Settings as SettingsIcon,
  RefreshCw,
} from 'lucide-react';
import { useGachaHistory } from '../../hooks/useGachaHistory';
import type { FriendWithDetails, PartnerGachaStats, SharedGachaStatsPayload } from '../../types/friends';
import type { Settings } from '../../types/settings';
import { getGameDisplayName } from '../../types/gacha';

interface GamingTabProps {
  partner: FriendWithDetails | null;
}

export function GamingTab({ partner }: GamingTabProps) {
  const { accounts, stats, selectedGame, selectGame, selectAccount, supportedGames, isLoading } = useGachaHistory();
  const [selectedComparison, setSelectedComparison] = useState<'gacha' | 'playtime'>('gacha');
  const [selectedGachaAccounts, setSelectedGachaAccounts] = useState<Record<string, string>>({});
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [partnerStats, setPartnerStats] = useState<PartnerGachaStats | null>(null);
  const [isLoadingPartnerStats, setIsLoadingPartnerStats] = useState(false);
  const [lastUploadedGame, setLastUploadedGame] = useState<string | null>(null);

  // Load selected accounts from settings
  useEffect(() => {
    async function loadSettings() {
      try {
        const settings = await invoke<Settings>('get_settings');
        setSelectedGachaAccounts(settings.selected_gacha_accounts || {});
        setSettingsLoaded(true);
      } catch (err) {
        console.error('Failed to load settings:', err);
        setSettingsLoaded(true);
      }
    }
    loadSettings();
  }, []);

  // Auto-select account when game changes based on settings
  useEffect(() => {
    if (!settingsLoaded || !selectedGame || accounts.length === 0) return;

    const savedUid = selectedGachaAccounts[selectedGame];
    if (savedUid) {
      const account = accounts.find((a) => a.game === selectedGame && a.uid === savedUid);
      if (account) {
        selectAccount(account);
      }
    }
  }, [selectedGame, selectedGachaAccounts, accounts, settingsLoaded, selectAccount]);

  // Auto-select first available game with a saved account on mount
  useEffect(() => {
    if (!settingsLoaded || selectedGame || supportedGames.length === 0) return;

    // Find first game that has a saved account
    for (const game of supportedGames) {
      if (selectedGachaAccounts[game.game]) {
        selectGame(game.game);
        return;
      }
    }
    // Fallback to first supported game
    if (supportedGames.length > 0) {
      selectGame(supportedGames[0].game);
    }
  }, [settingsLoaded, selectedGame, supportedGames, selectedGachaAccounts, selectGame]);

  const hasAccountForSelectedGame = selectedGame && selectedGachaAccounts[selectedGame];

  // Get the Character Event banner ID for the selected game
  const getCharacterEventBannerId = (game: string | null): string => {
    switch (game) {
      case 'genshin': return '301';
      case 'star_rail': return '11';
      case 'zzz': return '2001';
      default: return '301';
    }
  };

  const characterBannerId = getCharacterEventBannerId(selectedGame);

  // Upload own stats to server when they change
  const uploadStats = useCallback(async () => {
    if (!stats || !selectedGame || !hasAccountForSelectedGame) return;

    const characterBannerStats = stats.banner_stats[getCharacterEventBannerId(selectedGame)];

    const payload: SharedGachaStatsPayload = {
      game: selectedGame,
      total_pulls: stats.total_pulls,
      five_star_count: stats.five_star_count,
      four_star_count: stats.four_star_count,
      average_pity: characterBannerStats?.average_pity || 0,
      current_pity: characterBannerStats?.current_pity || 0,
    };

    try {
      await invoke('upload_gacha_stats', { stats: payload });
      setLastUploadedGame(selectedGame);
    } catch (err) {
      console.error('Failed to upload gacha stats:', err);
    }
  }, [stats, selectedGame, hasAccountForSelectedGame]);

  // Fetch partner stats from server
  const fetchPartnerStats = useCallback(async () => {
    if (!partner || !selectedGame) {
      setPartnerStats(null);
      return;
    }

    setIsLoadingPartnerStats(true);
    try {
      const result = await invoke<PartnerGachaStats | null>('get_partner_gacha_stats_for_game', { game: selectedGame });
      setPartnerStats(result);
    } catch (err) {
      console.error('Failed to fetch partner stats:', err);
      setPartnerStats(null);
    } finally {
      setIsLoadingPartnerStats(false);
    }
  }, [partner, selectedGame]);

  // Upload stats when game changes and stats are loaded
  useEffect(() => {
    if (stats && selectedGame && hasAccountForSelectedGame && lastUploadedGame !== selectedGame) {
      uploadStats();
    }
  }, [stats, selectedGame, hasAccountForSelectedGame, lastUploadedGame, uploadStats]);

  // Fetch partner stats when game changes
  useEffect(() => {
    fetchPartnerStats();
  }, [fetchPartnerStats]);

  // Use Character Event banner stats for average_pity and current_pity
  const characterBannerStats = stats?.banner_stats[characterBannerId];

  const yourStats = stats
    ? {
        total_pulls: stats.total_pulls,
        five_star_count: stats.five_star_count,
        four_star_count: stats.four_star_count,
        average_pity: characterBannerStats?.average_pity || 0,
        current_pity: characterBannerStats?.current_pity || 0,
      }
    : null;

  return (
    <div className="space-y-6">
      {/* Game Selection */}
      <div className="flex items-center gap-4">
        <span className="text-sm text-text-secondary">Game:</span>
        <div className="flex gap-2">
          {supportedGames.map((game) => (
            <button
              key={game.game}
              onClick={() => selectGame(game.game)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedGame === game.game
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white/5 text-text-secondary hover:bg-white/10'
              }`}
            >
              {getGameDisplayName(game.game)}
            </button>
          ))}
        </div>
      </div>

      {/* Comparison Toggle */}
      <div className="flex gap-2 p-1 glass-elevated rounded-xl w-fit">
        <button
          onClick={() => setSelectedComparison('gacha')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            selectedComparison === 'gacha'
              ? 'bg-amber-500/20 text-amber-400'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          <Star className="w-4 h-4 inline mr-2" />
          Gacha Stats
        </button>
        <button
          onClick={() => setSelectedComparison('playtime')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            selectedComparison === 'playtime'
              ? 'bg-purple-500/20 text-purple-400'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          <Clock className="w-4 h-4 inline mr-2" />
          Playtime
        </button>
      </div>

      {selectedComparison === 'gacha' && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Your Stats */}
          <div className="glass-elevated rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-5 h-5 text-indigo-400" />
              <h3 className="text-lg font-medium text-text-primary">Your Stats</h3>
            </div>

            {isLoading ? (
              <div className="text-center py-8 text-text-tertiary">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                Loading stats...
              </div>
            ) : yourStats ? (
              <div className="space-y-4">
                <StatRow
                  label="Total Pulls"
                  value={yourStats.total_pulls}
                  icon={<Target className="w-4 h-4" />}
                />
                <StatRow
                  label="5-Star Count"
                  value={yourStats.five_star_count}
                  icon={<Star className="w-4 h-4 text-amber-400" />}
                  highlight
                />
                <StatRow
                  label="4-Star Count"
                  value={yourStats.four_star_count}
                  icon={<Star className="w-4 h-4 text-purple-400" />}
                />
                <StatRow
                  label="Average Pity"
                  value={Math.floor(yourStats.average_pity)}
                  icon={<TrendingUp className="w-4 h-4" />}
                />
                <StatRow
                  label="Current Pity"
                  value={yourStats.current_pity}
                  icon={<Gamepad2 className="w-4 h-4" />}
                />

                {/* 5-Star Rate */}
                <div className="pt-4 border-t border-white/10">
                  <div className="text-sm text-text-secondary mb-1">5-Star Rate</div>
                  <div className="text-2xl font-bold text-amber-400">
                    {yourStats.total_pulls > 0
                      ? ((yourStats.five_star_count / yourStats.total_pulls) * 100).toFixed(2)
                      : '0.00'}
                    %
                  </div>
                </div>
              </div>
            ) : !hasAccountForSelectedGame ? (
              <div className="text-center py-8 text-text-tertiary">
                <SettingsIcon className="w-6 h-6 mx-auto mb-2 opacity-50" />
                <p className="mb-2">No account selected for this game</p>
                <p className="text-xs">
                  Go to Settings to select your default gacha account
                </p>
              </div>
            ) : (
              <div className="text-center py-8 text-text-tertiary">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                Loading stats...
              </div>
            )}
          </div>

          {/* Partner Stats */}
          <div className="glass-elevated rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Heart className="w-5 h-5 text-pink-400" />
              <h3 className="text-lg font-medium text-text-primary">
                {partner ? partner.friend.nickname || partner.user.username : 'Partner'}&apos;s
                Stats
              </h3>
            </div>

            {!partner ? (
              <div className="empty-state py-8">
                <Heart className="empty-state-icon" />
                <h3 className="empty-state-title">No partner connected</h3>
                <p className="empty-state-description">
                  Connect with your partner to compare gacha stats
                </p>
              </div>
            ) : isLoadingPartnerStats ? (
              <div className="text-center py-8 text-text-tertiary">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                Loading partner stats...
              </div>
            ) : partnerStats ? (
              <div className="space-y-4">
                <StatRow
                  label="Total Pulls"
                  value={partnerStats.total_pulls}
                  icon={<Target className="w-4 h-4" />}
                />
                <StatRow
                  label="5-Star Count"
                  value={partnerStats.five_star_count}
                  icon={<Star className="w-4 h-4 text-amber-400" />}
                  highlight
                />
                <StatRow
                  label="4-Star Count"
                  value={partnerStats.four_star_count}
                  icon={<Star className="w-4 h-4 text-purple-400" />}
                />
                <StatRow
                  label="Average Pity"
                  value={Math.floor(partnerStats.average_pity)}
                  icon={<TrendingUp className="w-4 h-4" />}
                />
                <StatRow
                  label="Current Pity"
                  value={partnerStats.current_pity}
                  icon={<Gamepad2 className="w-4 h-4" />}
                />

                {/* 5-Star Rate */}
                <div className="pt-4 border-t border-white/10">
                  <div className="text-sm text-text-secondary mb-1">5-Star Rate</div>
                  <div className="text-2xl font-bold text-amber-400">
                    {partnerStats.total_pulls > 0
                      ? ((partnerStats.five_star_count / partnerStats.total_pulls) * 100).toFixed(2)
                      : '0.00'}%
                  </div>
                </div>

                {/* Last updated */}
                <div className="text-xs text-text-tertiary pt-2">
                  Updated {new Date(partnerStats.updated_at).toLocaleString()}
                </div>
              </div>
            ) : (
              <div className="empty-state py-8">
                <Star className="empty-state-icon" />
                <h3 className="empty-state-title">No stats available</h3>
                <p className="empty-state-description">
                  Your partner hasn&apos;t shared their gacha stats yet
                </p>
                <button
                  onClick={fetchPartnerStats}
                  className="btn btn-secondary mt-4 inline-flex items-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Refresh
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {selectedComparison === 'playtime' && (
        <div className="glass-elevated rounded-xl p-6">
          <div className="text-center py-12 text-text-tertiary">
            <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium text-text-primary mb-2">Playtime Comparison</h3>
            <p>Playtime tracking will be available when connected to server</p>
          </div>
        </div>
      )}

      {/* Shared Games */}
      <div className="glass-elevated rounded-xl p-6">
        <h3 className="text-lg font-medium text-text-primary mb-4 flex items-center gap-2">
          <Gamepad2 className="w-5 h-5 text-purple-400" />
          Games You Both Play
        </h3>

        {supportedGames.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {supportedGames.map((game) => (
              <div
                key={game.game}
                className="glass rounded-lg p-4 flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                  <Gamepad2 className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="font-medium text-text-primary">
                    {getGameDisplayName(game.game)}
                  </div>
                  <div className="text-xs text-text-tertiary">
                    {accounts.filter((a) => a.game === game.game).length} account(s)
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-text-tertiary">
            No shared games detected yet
          </div>
        )}
      </div>
    </div>
  );
}

function StatRow({
  label,
  value,
  icon,
  highlight,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-text-secondary">
        {icon}
        <span>{label}</span>
      </div>
      <span className={`font-medium ${highlight ? 'text-amber-400' : 'text-text-primary'}`}>
        {value}
      </span>
    </div>
  );
}
