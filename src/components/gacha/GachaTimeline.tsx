import { useMemo } from 'react';
import { Star, Calendar } from 'lucide-react';
import type { GachaRecord, GachaGame } from '../../types/gacha';
import { getGachaTypeName, getRarityColor } from '../../types/gacha';

interface GachaTimelineProps {
  game: GachaGame;
  records: GachaRecord[];
}

interface TimelineGroup {
  date: string;
  records: {
    record: GachaRecord;
    pityInBanner: number;
  }[];
}

export function GachaTimeline({ game, records }: GachaTimelineProps) {
  // Group records by date and calculate pity
  const timelineGroups = useMemo(() => {
    const groups: Record<string, TimelineGroup> = {};
    const bannerPity: Record<string, number> = {};

    // Process records from oldest to newest
    const sortedRecords = [...records].reverse();

    for (const record of sortedRecords) {
      // Calculate pity for this banner
      const bannerKey = record.gacha_type;
      bannerPity[bannerKey] = (bannerPity[bannerKey] || 0) + 1;
      const currentPity = bannerPity[bannerKey];

      // Reset pity on 5-star
      if (record.rank_type === '5') {
        bannerPity[bannerKey] = 0;
      }

      // Only show 4-star and 5-star in timeline
      if (record.rank_type === '3') continue;

      // Group by date
      const date = record.time.split(' ')[0];
      if (!groups[date]) {
        groups[date] = { date, records: [] };
      }

      groups[date].records.push({
        record,
        pityInBanner: record.rank_type === '5' ? currentPity : 0,
      });
    }

    // Sort by date descending and reverse records within each group
    return Object.values(groups)
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((group) => ({
        ...group,
        records: group.records.reverse(),
      }));
  }, [records]);

  if (timelineGroups.length === 0) {
    return (
      <div className="text-center text-text-tertiary py-8">
        No 4-star or 5-star pulls recorded yet
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {timelineGroups.map((group) => (
        <div key={group.date} className="relative">
          {/* Date Header */}
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-4 h-4 text-text-tertiary" />
            <h3 className="text-sm font-medium text-text-secondary">
              {formatDate(group.date)}
            </h3>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* Records */}
          <div className="space-y-2 pl-6">
            {group.records.map(({ record, pityInBanner }) => (
              <TimelineItem
                key={record.id}
                record={record}
                pity={pityInBanner}
                game={game}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

interface TimelineItemProps {
  record: GachaRecord;
  pity: number;
  game: GachaGame;
}

function TimelineItem({ record, pity, game }: TimelineItemProps) {
  const isFiveStar = record.rank_type === '5';

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
        isFiveStar
          ? 'bg-amber-500/10 border border-amber-500/20'
          : 'glass border border-white/10'
      }`}
    >
      {/* Rarity Icon */}
      <div
        className={`flex items-center justify-center w-8 h-8 rounded-full ${
          isFiveStar ? 'bg-amber-500/20' : 'bg-purple-500/20'
        }`}
      >
        <Star
          className={`w-4 h-4 ${isFiveStar ? 'text-amber-400' : 'text-purple-400'}`}
          fill={isFiveStar ? 'currentColor' : 'none'}
        />
      </div>

      {/* Item Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`font-medium truncate ${getRarityColor(record.rank_type)}`}>
            {record.name}
          </span>
          {isFiveStar && pity > 0 && (
            <span className="flex-shrink-0 text-xs px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded">
              {pity} pity
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-text-tertiary">
          <span>{record.item_type}</span>
          <span>•</span>
          <span>{getGachaTypeName(game, record.gacha_type)}</span>
          <span>•</span>
          <span>{record.time.split(' ')[1]}</span>
        </div>
      </div>

      {/* Rarity Badge */}
      <div
        className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
          isFiveStar
            ? 'bg-amber-500/20 text-amber-400'
            : 'bg-purple-500/20 text-purple-400'
        }`}
      >
        {record.rank_type}
      </div>
    </div>
  );
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const dateOnly = (d: Date) => d.toISOString().split('T')[0];

  if (dateOnly(date) === dateOnly(today)) {
    return 'Today';
  }
  if (dateOnly(date) === dateOnly(yesterday)) {
    return 'Yesterday';
  }

  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
