// CPU Usage Chart Component
import { AreaChart, Area, YAxis, ResponsiveContainer } from 'recharts';
import { MetricDataPoint, CpuMetrics } from '../../types/performance';
import { Cpu } from 'lucide-react';

interface CpuChartProps {
  /** Historical CPU usage data for the chart */
  data: MetricDataPoint[];
  /** Current CPU metrics */
  metrics: CpuMetrics | null;
}

/**
 * CPU usage time-series chart with current value display.
 * Shows a 60-second rolling window of CPU usage.
 */
export function CpuChart({ data, metrics }: CpuChartProps) {
  const currentValue = metrics?.usage_percent ?? 0;

  return (
    <div className="glass-elevated rounded-xl p-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Cpu size={18} className="text-cyan-400" />
          <span className="text-sm text-text-secondary font-medium">CPU Usage</span>
        </div>
        <span className="text-2xl font-bold text-cyan-400">
          {currentValue.toFixed(1)}%
        </span>
      </div>

      {/* Chart */}
      <div className="h-28">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
              </linearGradient>
            </defs>
            <YAxis domain={[0, 100]} hide />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#06b6d4"
              fill="url(#cpuGradient)"
              strokeWidth={2}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* CPU Info */}
      {metrics && (
        <div className="mt-3 pt-3 border-t border-white/10">
          <div className="text-xs text-text-muted truncate" title={metrics.name}>
            {metrics.name}
          </div>
          <div className="flex gap-4 mt-1 text-xs text-text-secondary">
            <span>{metrics.core_count} cores</span>
            {metrics.frequency_mhz && (
              <span>{(metrics.frequency_mhz / 1000).toFixed(2)} GHz</span>
            )}
            {metrics.temperature_celsius && (
              <span>{metrics.temperature_celsius.toFixed(0)}°C</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
