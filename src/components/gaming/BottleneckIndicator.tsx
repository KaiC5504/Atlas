// Bottleneck Indicator component
// Displays real-time bottleneck status with visual indicators

import {
  CheckCircle,
  Cpu,
  Monitor,
  HardDrive,
  Thermometer,
  Loader2,
  LucideIcon,
} from 'lucide-react';
import { CurrentBottleneckStatus, BottleneckType } from '../../types';

interface BottleneckConfig {
  label: string;
  color: string;
  bgColor: string;
  icon: LucideIcon;
  description: string;
}

const bottleneckConfig: Record<BottleneckType, BottleneckConfig> = {
  balanced: {
    label: 'Balanced',
    color: 'text-green-400',
    bgColor: 'bg-green-500/20',
    icon: CheckCircle,
    description: 'System is running optimally',
  },
  cpu_bound: {
    label: 'CPU Bottleneck',
    color: 'text-red-400',
    bgColor: 'bg-red-500/20',
    icon: Cpu,
    description: 'CPU is limiting performance',
  },
  gpu_bound: {
    label: 'GPU Bottleneck',
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/20',
    icon: Monitor,
    description: 'GPU is limiting performance',
  },
  ram_limited: {
    label: 'RAM Limited',
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/20',
    icon: HardDrive,
    description: 'System memory is constrained',
  },
  vram_limited: {
    label: 'VRAM Limited',
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/20',
    icon: Monitor,
    description: 'GPU memory is constrained',
  },
  cpu_thermal: {
    label: 'CPU Throttling',
    color: 'text-red-500',
    bgColor: 'bg-red-600/20',
    icon: Thermometer,
    description: 'CPU is thermal throttling',
  },
  gpu_thermal: {
    label: 'GPU Throttling',
    color: 'text-red-500',
    bgColor: 'bg-red-600/20',
    icon: Thermometer,
    description: 'GPU is thermal throttling',
  },
};

interface BottleneckIndicatorProps {
  status: CurrentBottleneckStatus | null;
  compact?: boolean;
}

export function BottleneckIndicator({ status, compact = false }: BottleneckIndicatorProps) {
  // Loading state
  if (!status) {
    return (
      <div className={`flex items-center gap-2 ${compact ? 'p-2' : 'p-4'} glass-subtle rounded-lg`}>
        <Loader2 className="w-4 h-4 animate-spin text-muted" />
        <span className="text-sm text-muted">Analyzing...</span>
      </div>
    );
  }

  const config = bottleneckConfig[status.bottleneck_type];
  const Icon = config.icon;

  // Compact mode - just a colored pill
  if (compact) {
    return (
      <div
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${config.bgColor} border border-white/10`}
      >
        <Icon className={`w-4 h-4 ${config.color}`} />
        <span className={`text-sm font-medium ${config.color}`}>{config.label}</span>
      </div>
    );
  }

  // Full mode - detailed display
  return (
    <div className={`p-4 rounded-lg ${config.bgColor} border border-white/10`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${config.bgColor} border border-white/10`}>
            <Icon className={`w-6 h-6 ${config.color}`} />
          </div>
          <div>
            <h3 className={`text-lg font-semibold ${config.color}`}>{config.label}</h3>
            <p className="text-sm text-secondary">{config.description}</p>
          </div>
        </div>

        {/* Severity dots */}
        {status.bottleneck_type !== 'balanced' && (
          <div className="flex items-center gap-1">
            {[1, 2, 3].map((level) => (
              <div
                key={level}
                className={`w-2 h-2 rounded-full ${
                  level <= status.severity
                    ? config.color.replace('text-', 'bg-')
                    : 'bg-white/20'
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Metrics pills */}
      <div className="flex flex-wrap gap-2 mt-3">
        <MetricPill
          label="CPU"
          value={`${status.metrics.cpu_percent.toFixed(0)}%`}
          highlight={['cpu_bound', 'cpu_thermal'].includes(status.bottleneck_type)}
        />
        {status.metrics.gpu_percent !== null && (
          <MetricPill
            label="GPU"
            value={`${status.metrics.gpu_percent.toFixed(0)}%`}
            highlight={['gpu_bound', 'gpu_thermal'].includes(status.bottleneck_type)}
          />
        )}
        <MetricPill
          label="RAM"
          value={`${status.metrics.ram_percent.toFixed(0)}%`}
          highlight={status.bottleneck_type === 'ram_limited'}
        />
        {status.metrics.vram_percent !== null && (
          <MetricPill
            label="VRAM"
            value={`${status.metrics.vram_percent.toFixed(0)}%`}
            highlight={status.bottleneck_type === 'vram_limited'}
          />
        )}
        {status.metrics.cpu_temp !== null && (
          <MetricPill
            label="CPU Temp"
            value={`${status.metrics.cpu_temp.toFixed(0)}C`}
            highlight={status.bottleneck_type === 'cpu_thermal'}
          />
        )}
        {status.metrics.gpu_temp !== null && (
          <MetricPill
            label="GPU Temp"
            value={`${status.metrics.gpu_temp.toFixed(0)}C`}
            highlight={status.bottleneck_type === 'gpu_thermal'}
          />
        )}
      </div>

      {/* Duration */}
      {status.active_duration_seconds > 0 && status.bottleneck_type !== 'balanced' && (
        <p className="text-xs text-muted mt-2">
          Active for {formatDuration(status.active_duration_seconds)}
        </p>
      )}
    </div>
  );
}

interface MetricPillProps {
  label: string;
  value: string;
  highlight?: boolean;
}

function MetricPill({ label, value, highlight = false }: MetricPillProps) {
  return (
    <div
      className={`px-2 py-1 rounded text-xs ${
        highlight
          ? 'bg-red-500/20 text-red-400 border border-red-500/30'
          : 'bg-white/5 text-secondary border border-white/10'
      }`}
    >
      <span className="font-medium">{label}:</span> {value}
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${Math.floor(seconds)}s`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}m ${secs}s`;
}

export default BottleneckIndicator;
