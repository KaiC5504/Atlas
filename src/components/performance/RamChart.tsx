import { AreaChart, Area, YAxis, ResponsiveContainer } from 'recharts';
import { MetricDataPoint, RamMetrics } from '../../types/performance';
import { MemoryStick } from 'lucide-react';

interface RamChartProps {
  data: MetricDataPoint[];
  metrics: RamMetrics | null;
}

export function RamChart({ data, metrics }: RamChartProps) {
  const currentValue = metrics?.usage_percent ?? 0;

  const formatBytes = (bytes: number): string => {
    const gigabytes = bytes / (1024 * 1024 * 1024);
    if (gigabytes >= 1) {
      return `${gigabytes.toFixed(1)} GB`;
    }
    const megabytes = bytes / (1024 * 1024);
    return `${megabytes.toFixed(0)} MB`;
  };

  return (
    <div className="glass-elevated rounded-xl p-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <MemoryStick size={18} className="text-purple-400" />
          <span className="text-sm text-text-secondary font-medium">RAM Usage</span>
        </div>
        <span className="text-2xl font-bold text-purple-400">
          {currentValue.toFixed(1)}%
        </span>
      </div>

      {/* Chart */}
      <div className="h-28">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="ramGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#a855f7" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
              </linearGradient>
            </defs>
            <YAxis domain={[0, 100]} hide />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#a855f7"
              fill="url(#ramGradient)"
              strokeWidth={2}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* RAM Info */}
      {metrics && (
        <div className="mt-3 pt-3 border-t border-white/10">
          <div className="flex justify-between text-xs">
            <span className="text-text-secondary">
              Used: {formatBytes(metrics.used_bytes)}
            </span>
            <span className="text-text-muted">
              Total: {formatBytes(metrics.total_bytes)}
            </span>
          </div>
          <div className="text-xs text-text-muted mt-1">
            Available: {formatBytes(metrics.available_bytes)}
          </div>
          {/* Memory usage bar */}
          <div className="mt-2">
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-purple-500 transition-all duration-300"
                style={{ width: `${metrics.usage_percent}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
