// Performance monitoring types

/** Container for all system performance metrics */
export interface SystemMetrics {
  cpu: CpuMetrics;
  gpu: GpuMetrics | null;
  ram: RamMetrics;
  timestamp: number;
}

/** CPU performance metrics */
export interface CpuMetrics {
  /** Overall CPU usage percentage (0-100) */
  usage_percent: number;
  /** Per-core usage percentages (0-100 each) */
  per_core_usage: number[];
  /** CPU temperature in Celsius (if available) */
  temperature_celsius: number | null;
  /** Current CPU frequency in MHz (if available) */
  frequency_mhz: number | null;
  /** Number of CPU cores */
  core_count: number;
  /** CPU model name */
  name: string;
}

/** GPU performance metrics (NVIDIA only for now) */
export interface GpuMetrics {
  /** GPU model name */
  name: string;
  /** GPU utilization percentage (0-100) */
  usage_percent: number;
  /** VRAM used in megabytes */
  memory_used_mb: number;
  /** Total VRAM in megabytes */
  memory_total_mb: number;
  /** GPU temperature in Celsius (if available) */
  temperature_celsius: number | null;
}

/** RAM/Memory performance metrics */
export interface RamMetrics {
  /** Total system memory in bytes */
  total_bytes: number;
  /** Used memory in bytes */
  used_bytes: number;
  /** Available memory in bytes */
  available_bytes: number;
  /** Memory usage percentage (0-100) */
  usage_percent: number;
}

/** Data point for time-series charts */
export interface MetricDataPoint {
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** Metric value */
  value: number;
}

/** Performance monitoring state */
export interface PerformanceState {
  isMonitoring: boolean;
  currentMetrics: SystemMetrics | null;
  cpuHistory: MetricDataPoint[];
  gpuHistory: MetricDataPoint[];
  ramHistory: MetricDataPoint[];
}
