// Session Timeline Chart component
// Visualizes gaming session metrics over time

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from 'recharts';
import { MetricsSnapshot } from '../../types';

interface SessionTimelineChartProps {
  snapshots: MetricsSnapshot[];
  showGpu?: boolean;
  height?: number;
  startTime?: number;
}

export function SessionTimelineChart({
  snapshots,
  showGpu = true,
  height = 300,
  startTime,
}: SessionTimelineChartProps) {
  // Empty state
  if (snapshots.length === 0) {
    return (
      <div
        className="flex items-center justify-center glass-subtle rounded-lg"
        style={{ height }}
      >
        <p className="text-muted">No data available</p>
      </div>
    );
  }

  // Calculate base time for relative display
  const baseTime = startTime || snapshots[0]?.timestamp || 0;

  // Transform data for Recharts
  const chartData = snapshots.map((snapshot) => ({
    time: (snapshot.timestamp - baseTime) / 1000, // Seconds from start
    cpu: snapshot.cpu_percent,
    gpu: snapshot.gpu_percent,
    ram: snapshot.ram_percent,
    vram: snapshot.vram_percent,
    timestamp: snapshot.timestamp,
  }));

  // Generate ticks - use 30-second boundaries for longer sessions
  const generateTicks = (): number[] | undefined => {
    if (chartData.length === 0) return undefined;

    const times = chartData.map(d => d.time);
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const range = maxTime - minTime;

    // For short durations (< 3 minutes), let Recharts auto-generate ticks
    if (range < 180) {
      return undefined;
    }

    // For longer durations, use 30-second boundary ticks
    // Calculate interval to get ~6 ticks, rounded to 30-second multiples
    const idealInterval = range / 5;
    const interval = Math.max(30, Math.round(idealInterval / 30) * 30);

    // Start from nearest interval boundary at or before minTime
    const startTick = Math.floor(minTime / interval) * interval;

    const ticks: number[] = [];
    for (let t = startTick; t <= maxTime + interval * 0.5; t += interval) {
      ticks.push(t);
    }
    return ticks;
  };
  const timeTicks = generateTicks();

  // Check if GPU data is available
  const hasGpu = showGpu && snapshots.some((s) => s.gpu_percent !== null);

  return (
    <div className="glass-elevated rounded-lg p-4">
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <defs>
            {/* CPU gradient */}
            <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
            </linearGradient>
            {/* GPU gradient */}
            <linearGradient id="colorGpu" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
            </linearGradient>
            {/* RAM gradient */}
            <linearGradient id="colorRam" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />

          <XAxis
            dataKey="time"
            type="number"
            domain={['dataMin', 'dataMax']}
            ticks={timeTicks}
            tickCount={timeTicks ? undefined : 6}
            stroke="rgba(255,255,255,0.5)"
            tickFormatter={formatTime}
            tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }}
          />

          <YAxis
            domain={[0, 100]}
            stroke="rgba(255,255,255,0.5)"
            tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }}
            tickFormatter={(value) => `${value}%`}
          />

          <Tooltip content={<CustomTooltip />} />

          {/* 90% threshold line */}
          <ReferenceLine
            y={90}
            stroke="#ef4444"
            strokeDasharray="5 5"
            label={{
              value: '90%',
              position: 'right',
              fill: '#ef4444',
              fontSize: 10,
            }}
          />

          {/* Areas */}
          <Area
            type="monotone"
            dataKey="cpu"
            stroke="#06b6d4"
            fill="url(#colorCpu)"
            strokeWidth={2}
            name="CPU"
          />

          {hasGpu && (
            <Area
              type="monotone"
              dataKey="gpu"
              stroke="#22c55e"
              fill="url(#colorGpu)"
              strokeWidth={2}
              name="GPU"
            />
          )}

          <Area
            type="monotone"
            dataKey="ram"
            stroke="#a855f7"
            fill="url(#colorRam)"
            strokeWidth={2}
            name="RAM"
          />

          <Legend
            wrapperStyle={{ paddingTop: '10px' }}
            formatter={(value) => <span style={{ color: 'rgba(255,255,255,0.8)' }}>{value}</span>}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// Custom tooltip component
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  return (
    <div className="glass-elevated rounded-lg p-3 border border-white/10">
      <p className="text-xs text-muted mb-2">{formatTime(label)}</p>
      <div className="space-y-1">
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center justify-between gap-4">
            <span className="text-xs" style={{ color: entry.stroke }}>
              {entry.name}
            </span>
            <span className="text-xs font-medium text-primary">
              {entry.value !== null ? `${entry.value.toFixed(1)}%` : 'N/A'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Format time from seconds to MM:SS
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default SessionTimelineChart;
