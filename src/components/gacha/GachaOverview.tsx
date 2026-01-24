import { Star, TrendingUp, Target, BarChart3 } from 'lucide-react';
import type { GachaStats, GachaGame, BannerStats } from '../../types/gacha';
import {
  getGachaTypeName,
  calculateFiveStarRate,
  calculateFourStarRate,
  getSoftPityThreshold,
  getHardPityThreshold,
} from '../../types/gacha';

interface GachaOverviewProps {
  game: GachaGame;
  stats: GachaStats;
}

export function GachaOverview({ game, stats }: GachaOverviewProps) {
  const fiveStarRate = calculateFiveStarRate(stats);
  const fourStarRate = calculateFourStarRate(stats);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<BarChart3 className="w-5 h-5" />}
          label="Total Pulls"
          value={stats.total_pulls.toLocaleString()}
          color="text-blue-400"
        />
        <StatCard
          icon={<Star className="w-5 h-5" />}
          label="5-Star Pulls"
          value={stats.five_star_count.toString()}
          subtext={`${fiveStarRate.toFixed(2)}%`}
          color="text-amber-400"
        />
        <StatCard
          icon={<Star className="w-5 h-5" />}
          label="4-Star Pulls"
          value={stats.four_star_count.toString()}
          subtext={`${fourStarRate.toFixed(2)}%`}
          color="text-purple-400"
        />
        <StatCard
          icon={<TrendingUp className="w-5 h-5" />}
          label="3-Star Pulls"
          value={stats.three_star_count.toString()}
          color="text-blue-400"
        />
      </div>

      {/* Banner Stats */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-text-primary">Banner Statistics</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Object.entries(stats.banner_stats).map(([gachaType, bannerStats]) => (
            <BannerStatCard
              key={gachaType}
              game={game}
              gachaType={gachaType}
              stats={bannerStats}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtext?: string;
  color: string;
}

function StatCard({ icon, label, value, subtext, color }: StatCardProps) {
  return (
    <div className="bg-surface-raised border border-border rounded-lg p-4">
      <div className="flex items-center gap-2 text-text-secondary mb-2">
        <span className={color}>{icon}</span>
        <span className="text-sm">{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className={`text-2xl font-bold ${color}`}>{value}</span>
        {subtext && (
          <span className="text-sm text-text-tertiary">{subtext}</span>
        )}
      </div>
    </div>
  );
}

interface BannerStatCardProps {
  game: GachaGame;
  gachaType: string;
  stats: BannerStats;
}

function BannerStatCard({ game, gachaType, stats }: BannerStatCardProps) {
  const bannerName = getGachaTypeName(game, gachaType);
  const softPity = getSoftPityThreshold(game, gachaType);
  const hardPity = getHardPityThreshold(game, gachaType);
  const pityProgress = (stats.current_pity / hardPity) * 100;
  const isInSoftPity = stats.current_pity >= softPity;

  return (
    <div className="bg-surface-raised border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-medium text-text-primary">{bannerName}</h4>
        <span className="text-sm text-text-secondary">
          {stats.total_pulls} pulls
        </span>
      </div>

      {/* Pity Counter */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm text-text-secondary flex items-center gap-1">
            <Target className="w-4 h-4" />
            Current Pity
          </span>
          <span className={`font-medium ${isInSoftPity ? 'text-amber-400' : 'text-text-primary'}`}>
            {stats.current_pity} / {hardPity}
          </span>
        </div>
        <div className="h-2 bg-surface-base rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              isInSoftPity
                ? 'bg-gradient-to-r from-amber-500 to-amber-400'
                : 'bg-gradient-to-r from-indigo-600 to-indigo-500'
            }`}
            style={{ width: `${Math.min(pityProgress, 100)}%` }}
          />
        </div>
        {isInSoftPity && (
          <p className="text-xs text-amber-400 mt-1">
            In soft pity range ({softPity}+)
          </p>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-surface-base rounded p-2">
          <div className="text-amber-400 font-bold">{stats.five_star_count}</div>
          <div className="text-xs text-text-tertiary">5-Star</div>
        </div>
        <div className="bg-surface-base rounded p-2">
          <div className="text-purple-400 font-bold">{stats.four_star_count}</div>
          <div className="text-xs text-text-tertiary">4-Star</div>
        </div>
        <div className="bg-surface-base rounded p-2">
          <div className="text-text-primary font-bold">
            {stats.average_pity > 0 ? stats.average_pity.toFixed(1) : '-'}
          </div>
          <div className="text-xs text-text-tertiary">Avg Pity</div>
        </div>
      </div>

      {/* Recent 5-Stars */}
      {stats.five_star_pulls.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border">
          <h5 className="text-sm text-text-secondary mb-2">Recent 5-Stars</h5>
          <div className="space-y-1">
            {stats.five_star_pulls.slice(-3).reverse().map((pull, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm">
                <span className="text-amber-400">{pull.name}</span>
                <span className="text-text-tertiary">@ {pull.pity} pity</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
