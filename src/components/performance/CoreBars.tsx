// Per-Core CPU Usage Bars Component
import { CpuMetrics } from '../../types/performance';

interface CoreBarsProps {
  /** CPU metrics containing per-core usage */
  metrics: CpuMetrics | null;
  /** Maximum number of cores to display (default: 16) */
  maxCores?: number;
}

/**
 * Per-core CPU usage mini bar charts.
 * Displays individual utilization for each CPU core.
 */
export function CoreBars({ metrics, maxCores = 16 }: CoreBarsProps) {
  if (!metrics) {
    return (
      <div className="glass-elevated rounded-xl p-4 animate-fade-in">
        <span className="text-sm text-text-muted">Loading core data...</span>
      </div>
    );
  }

  const { per_core_usage, core_count } = metrics;

  // Limit displayed cores if there are too many
  const displayedCores = per_core_usage.slice(0, maxCores);
  const hasMoreCores = core_count > maxCores;

  // Determine color based on usage level
  const getBarColor = (usage: number): string => {
    if (usage >= 90) return 'bg-red-500';
    if (usage >= 70) return 'bg-amber-500';
    if (usage >= 50) return 'bg-cyan-400';
    return 'bg-cyan-500/70';
  };

  return (
    <div className="glass-elevated rounded-xl p-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-text-secondary font-medium">Per-Core Usage</span>
        <span className="text-xs text-text-muted">{core_count} cores</span>
      </div>

      {/* Core Bars */}
      <div className="space-y-1.5">
        {displayedCores.map((usage, index) => (
          <div key={index} className="flex items-center gap-2">
            <span className="text-xs text-text-muted w-10 shrink-0">
              Core {index}
            </span>
            <div className="flex-1 h-2.5 bg-white/5 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${getBarColor(usage)}`}
                style={{ width: `${Math.min(usage, 100)}%` }}
              />
            </div>
            <span className="text-xs text-text-secondary w-10 text-right shrink-0">
              {usage.toFixed(0)}%
            </span>
          </div>
        ))}
      </div>

      {/* "And more" indicator */}
      {hasMoreCores && (
        <div className="mt-2 text-xs text-text-muted text-center">
          +{core_count - maxCores} more cores
        </div>
      )}

      {/* Legend */}
      <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-center gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-cyan-500/70" />
          <span className="text-text-muted">&lt;50%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-cyan-400" />
          <span className="text-text-muted">50-70%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-amber-500" />
          <span className="text-text-muted">70-90%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-text-muted">&gt;90%</span>
        </div>
      </div>
    </div>
  );
}
