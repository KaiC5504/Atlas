// Real-time performance metrics hook
import { useEffect, useState, useCallback, useRef } from 'react';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { SystemMetrics, MetricDataPoint } from '../types/performance';

// Rolling window duration in milliseconds (60 seconds)
const HISTORY_DURATION_MS = 60000;

export interface UsePerformanceDataReturn {
  currentMetrics: SystemMetrics | null;
  cpuHistory: MetricDataPoint[];
  gpuHistory: MetricDataPoint[];
  ramHistory: MetricDataPoint[];
  isMonitoring: boolean;
  isLoading: boolean;
  error: string | null;
  startMonitoring: () => Promise<void>;
  stopMonitoring: () => Promise<void>;
}

/**
 * Hook for real-time performance metrics with 60-second rolling history.
 */
export function usePerformanceData(): UsePerformanceDataReturn {
  const [currentMetrics, setCurrentMetrics] = useState<SystemMetrics | null>(null);
  const [cpuHistory, setCpuHistory] = useState<MetricDataPoint[]>([]);
  const [gpuHistory, setGpuHistory] = useState<MetricDataPoint[]>([]);
  const [ramHistory, setRamHistory] = useState<MetricDataPoint[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const hasStarted = useRef(false);

  const trimHistory = useCallback((history: MetricDataPoint[], now: number): MetricDataPoint[] => {
    const cutoff = now - HISTORY_DURATION_MS;
    return history.filter(p => p.timestamp > cutoff);
  }, []);

  const startMonitoring = useCallback(async () => {
    try {
      setError(null);
      await invoke('start_performance_monitoring');
      setIsMonitoring(true);
    } catch (e) {
      setError(`Failed to start monitoring: ${e}`);
      console.error('Failed to start performance monitoring:', e);
    }
  }, []);

  const stopMonitoring = useCallback(async () => {
    try {
      await invoke('stop_performance_monitoring');
      setIsMonitoring(false);
    } catch (e) {
      console.error('Failed to stop performance monitoring:', e);
    }
  }, []);

  useEffect(() => {
    let unlistenUpdate: UnlistenFn | undefined;
    let unlistenStopped: UnlistenFn | undefined;

    const setup = async () => {
      unlistenUpdate = await listen<SystemMetrics>('performance:update', (event) => {
        if (document.hidden) return;

        const metrics = event.payload;
        const now = metrics.timestamp;

        setCurrentMetrics(metrics);
        setIsLoading(false);

        setCpuHistory(prev => {
          const trimmed = trimHistory(prev, now);
          return [...trimmed, { timestamp: now, value: metrics.cpu.usage_percent }];
        });

        if (metrics.gpu) {
          setGpuHistory(prev => {
            const trimmed = trimHistory(prev, now);
            return [...trimmed, { timestamp: now, value: metrics.gpu!.usage_percent }];
          });
        }

        setRamHistory(prev => {
          const trimmed = trimHistory(prev, now);
          return [...trimmed, { timestamp: now, value: metrics.ram.usage_percent }];
        });
      });

      unlistenStopped = await listen<{ reason: string }>('performance:monitoring_stopped', (event) => {
        console.log('Performance monitoring stopped:', event.payload.reason);
        setIsMonitoring(false);
      });

      if (!hasStarted.current) {
        hasStarted.current = true;
        await startMonitoring();
      }
    };

    setup();

    return () => {
      if (unlistenUpdate) {
        unlistenUpdate();
      }
      if (unlistenStopped) {
        unlistenStopped();
      }
      invoke('stop_performance_monitoring').catch(console.error);
      hasStarted.current = false;
    };
  }, [trimHistory, startMonitoring]);

  return {
    currentMetrics,
    cpuHistory,
    gpuHistory,
    ramHistory,
    isMonitoring,
    isLoading,
    error,
    startMonitoring,
    stopMonitoring,
  };
}
