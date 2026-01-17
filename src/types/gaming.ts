// Gaming Performance Analyzer types

export interface GameWhitelist {
  games: GameEntry[];
}

export interface GameEntry {
  name: string;
  process_name: string;
  icon?: string;
  enabled: boolean;
}

export interface GamingSession {
  id: string;
  game_name: string;
  process_name: string;
  start_time: string;
  end_time: string | null;
  status: SessionStatus;
  summary: SessionSummary | null;
}

export type SessionStatus = 'active' | 'completed' | 'cancelled';

export interface TopCoreInfo {
  core_index: number;
  usage_percent: number;
}

export interface MetricsSnapshot {
  timestamp: number;
  cpu_percent: number;
  top_core_1: TopCoreInfo | null;
  top_core_2: TopCoreInfo | null;
  gpu_percent: number | null;
  ram_percent: number;
  vram_percent: number | null;
  cpu_temp: number | null;
  gpu_temp: number | null;
}

export interface BottleneckEvent {
  timestamp: number;
  bottleneck_type: BottleneckType;
  severity: number;
  duration_seconds: number | null;
  metrics: MetricsSnapshot;
}

export type BottleneckType =
  | 'cpu_bound'
  | 'gpu_bound'
  | 'ram_limited'
  | 'vram_limited'
  | 'cpu_thermal'
  | 'gpu_thermal'
  | 'balanced';

export interface SessionSummary {
  duration_seconds: number;
  cpu: MetricStats;
  top_core_1: MetricStats | null;
  top_core_2: MetricStats | null;
  gpu: MetricStats | null;
  ram: MetricStats;
  vram: MetricStats | null;
  cpu_temp: MetricStats | null;
  gpu_temp: MetricStats | null;
  total_bottleneck_seconds: number;
  dominant_bottleneck: BottleneckType;
  bottleneck_breakdown: BottleneckBreakdown[];
  total_bottleneck_events: number;
}

export interface MetricStats {
  avg: number;
  min: number;
  max: number;
  p95: number;
}

export interface BottleneckBreakdown {
  bottleneck_type: BottleneckType;
  duration_seconds: number;
  percentage: number;
  event_count: number;
}

export interface GamingSessionData {
  session: GamingSession;
  snapshots: MetricsSnapshot[];
  bottleneck_events: BottleneckEvent[];
}

// Active session state for frontend recovery after navigation
export interface ActiveSessionState {
  session: GamingSession;
  recent_metrics: MetricsSnapshot[];
  current_bottleneck: CurrentBottleneckStatus | null;
}

export interface CurrentBottleneckStatus {
  bottleneck_type: BottleneckType;
  severity: number;
  active_duration_seconds: number;
  metrics: MetricsSnapshot;
}

export interface BottleneckThresholds {
  cpu_high: number;
  gpu_high: number;
  cpu_low: number;
  gpu_low: number;
  ram_high: number;
  ram_available_min_mb: number;
  vram_high: number;
  cpu_thermal_limit: number;
  gpu_thermal_limit: number;
}

// Tauri event payloads
export interface GamingSessionStartedEvent {
  session: GamingSession;
}

export interface GamingSessionEndedEvent {
  session: GamingSession;
}

export interface GamingBottleneckEvent {
  session_id: string;
  status: CurrentBottleneckStatus;
}

export interface GamingMetricsEvent {
  session_id: string;
  snapshot: MetricsSnapshot;
}
