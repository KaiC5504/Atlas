// GPU Usage Chart Component
import { AreaChart, Area, YAxis, ResponsiveContainer } from 'recharts';
import { MetricDataPoint, GpuMetrics } from '../../types/performance';
import { MonitorSpeaker } from 'lucide-react';

interface GpuChartProps {
  /** Historical GPU usage data for the chart */
  data: MetricDataPoint[];
  /** Current GPU metrics */
  metrics: GpuMetrics | null;
}

/**
 * GPU usage time-series chart with current value display.
 * Shows a 60-second rolling window of GPU utilization.
 */
export function GpuChart({ data, metrics }: GpuChartProps) {
  const currentValue = metrics?.usage_percent ?? 0;

  // Format memory for display
  const formatMemory = (mb: number): string => {
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(1)} GB`;
    }
    return `${mb} MB`;
  };

  return (
    <div className="glass-elevated rounded-xl p-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <MonitorSpeaker size={18} className="text-green-400" />
          <span className="text-sm text-text-secondary font-medium">GPU Usage</span>
        </div>
        <span className="text-2xl font-bold text-green-400">
          {currentValue.toFixed(1)}%
        </span>
      </div>

      {/* Chart */}
      <div className="h-28">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gpuGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
            </defs>
            <YAxis domain={[0, 100]} hide />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#22c55e"
              fill="url(#gpuGradient)"
              strokeWidth={2}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* GPU Info */}
      {metrics && (
        <div className="mt-3 pt-3 border-t border-white/10">
          <div className="text-xs text-text-muted truncate" title={metrics.name}>
            {metrics.name}
          </div>
          <div className="flex gap-4 mt-1 text-xs text-text-secondary">
            <span>
              VRAM: {formatMemory(metrics.memory_used_mb)} / {formatMemory(metrics.memory_total_mb)}
            </span>
            {metrics.temperature_celsius && (
              <span>{metrics.temperature_celsius.toFixed(0)}°C</span>
            )}
          </div>
          {/* VRAM usage bar */}
          <div className="mt-2">
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-green-500 transition-all duration-300"
                style={{
                  width: `${(metrics.memory_used_mb / metrics.memory_total_mb) * 100}%`
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
