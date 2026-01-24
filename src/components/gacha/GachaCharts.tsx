import { useMemo } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import type { GachaRecord, GachaStats, GachaGame } from '../../types/gacha';
import { getGachaTypeName } from '../../types/gacha';

interface GachaChartsProps {
  game: GachaGame;
  records: GachaRecord[];
  stats: GachaStats;
}

const RARITY_COLORS = {
  '5': '#f59e0b', // amber-400
  '4': '#a855f7', // purple-400
  '3': '#3b82f6', // blue-400
};

export function GachaCharts({ game, records, stats }: GachaChartsProps) {
  // Rarity distribution data
  const rarityData = useMemo(() => [
    { name: '5-Star', value: stats.five_star_count, color: RARITY_COLORS['5'] },
    { name: '4-Star', value: stats.four_star_count, color: RARITY_COLORS['4'] },
    { name: '3-Star', value: stats.three_star_count, color: RARITY_COLORS['3'] },
  ], [stats]);

  // Banner comparison data
  const bannerData = useMemo(() => {
    return Object.entries(stats.banner_stats).map(([gachaType, bannerStats]) => ({
      name: getGachaTypeName(game, gachaType),
      total: bannerStats.total_pulls,
      fiveStar: bannerStats.five_star_count,
      fourStar: bannerStats.four_star_count,
    }));
  }, [game, stats.banner_stats]);

  // Pulls over time data (by month)
  const timelineData = useMemo(() => {
    const monthlyData: Record<string, { month: string; pulls: number; fiveStar: number }> = {};

    records.forEach((record) => {
      const date = new Date(record.time);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });

      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { month: monthLabel, pulls: 0, fiveStar: 0 };
      }

      monthlyData[monthKey].pulls += 1;
      if (record.rank_type === '5') {
        monthlyData[monthKey].fiveStar += 1;
      }
    });

    // Sort by date and return as array
    return Object.entries(monthlyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, data]) => data);
  }, [records]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Rarity Distribution Pie Chart */}
      <div className="card">
        <h3 className="text-lg font-medium text-text-primary mb-4">Rarity Distribution</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={rarityData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={2}
                dataKey="value"
                label={({ name, percent }) => `${name} (${((percent ?? 0) * 100).toFixed(1)}%)`}
                labelLine={false}
              >
                {rarityData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e1e2e',
                  border: '1px solid #3f3f5a',
                  borderRadius: '8px',
                }}
                labelStyle={{ color: '#e0e0e0' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Banner Comparison Bar Chart */}
      <div className="card">
        <h3 className="text-lg font-medium text-text-primary mb-4">Banner Comparison</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={bannerData} layout="vertical">
              <XAxis type="number" stroke="#6b7280" />
              <YAxis
                type="category"
                dataKey="name"
                stroke="#6b7280"
                width={120}
                tick={{ fontSize: 12 }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e1e2e',
                  border: '1px solid #3f3f5a',
                  borderRadius: '8px',
                }}
                labelStyle={{ color: '#e0e0e0' }}
              />
              <Bar dataKey="total" name="Total Pulls" fill="#6366f1" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Pulls Over Time Line Chart */}
      <div className="card lg:col-span-2">
        <h3 className="text-lg font-medium text-text-primary mb-4">Pulls Over Time</h3>
        <div className="h-64">
          {timelineData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timelineData}>
                <XAxis
                  dataKey="month"
                  stroke="#6b7280"
                  tick={{ fontSize: 12 }}
                  interval="preserveStartEnd"
                />
                <YAxis stroke="#6b7280" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e1e2e',
                    border: '1px solid #3f3f5a',
                    borderRadius: '8px',
                  }}
                  labelStyle={{ color: '#e0e0e0' }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="pulls"
                  name="Total Pulls"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={{ fill: '#6366f1', strokeWidth: 0, r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="fiveStar"
                  name="5-Star Pulls"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={{ fill: '#f59e0b', strokeWidth: 0, r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-text-tertiary">
              No data available
            </div>
          )}
        </div>
      </div>

      {/* 5-Star Timeline */}
      <div className="card lg:col-span-2">
        <h3 className="text-lg font-medium text-text-primary mb-4">5-Star Pull Timeline</h3>
        <FiveStarTimeline records={records} game={game} />
      </div>
    </div>
  );
}

interface FiveStarTimelineProps {
  records: GachaRecord[];
  game: GachaGame;
}

function FiveStarTimeline({ records, game }: FiveStarTimelineProps) {
  // Get 5-star pulls with pity calculation
  const fiveStars = useMemo(() => {
    const result: { record: GachaRecord; pity: number }[] = [];
    let currentPity = 0;

    // Records are sorted newest first, so we iterate in reverse
    for (let i = records.length - 1; i >= 0; i--) {
      const record = records[i];
      currentPity++;

      if (record.rank_type === '5') {
        result.push({ record, pity: currentPity });
        currentPity = 0;
      }
    }

    // Return in chronological order (most recent last)
    return result;
  }, [records]);

  if (fiveStars.length === 0) {
    return (
      <div className="text-center text-text-tertiary py-8">
        No 5-star pulls recorded yet
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-4 min-w-max p-2">
        {fiveStars.slice(-20).map(({ record, pity }, idx) => (
          <div
            key={record.id}
            className="flex flex-col items-center gap-2 min-w-[100px]"
          >
            <div className="relative">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center text-white font-bold text-lg shadow-lg">
                {idx + 1}
              </div>
              <div className="absolute -bottom-1 -right-1 bg-white/5 border border-white/10 rounded-full px-1.5 py-0.5 text-xs font-medium text-amber-400">
                {pity}
              </div>
            </div>
            <div className="text-center">
              <div className="text-sm font-medium text-amber-400 truncate max-w-[100px]">
                {record.name}
              </div>
              <div className="text-xs text-text-tertiary">
                {getGachaTypeName(game, record.gacha_type)}
              </div>
              <div className="text-xs text-text-tertiary">
                {new Date(record.time).toLocaleDateString()}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
