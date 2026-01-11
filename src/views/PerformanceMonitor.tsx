// Performance Monitor view
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Activity, AlertCircle, RefreshCw, Play, Pause } from 'lucide-react';
import { usePerformanceData } from '../hooks/usePerformanceData';
import { CpuChart, GpuChart, RamChart, CoreBars } from '../components/performance';

export default function PerformanceMonitor() {
  const {
    currentMetrics,
    cpuHistory,
    gpuHistory,
    ramHistory,
    isMonitoring,
    isLoading,
    error,
    startMonitoring,
    stopMonitoring,
  } = usePerformanceData();

  const [hasNvidia, setHasNvidia] = useState<boolean | null>(null);

  useEffect(() => {
    invoke<boolean>('has_nvidia_gpu')
      .then(setHasNvidia)
      .catch(() => setHasNvidia(false));
  }, []);

  const handleToggleMonitoring = async () => {
    if (isMonitoring) {
      await stopMonitoring();
    } else {
      await startMonitoring();
    }
  };

  if (isLoading && !currentMetrics) {
    return (
      <div className="p-6 animate-fade-in">
        <div className="flex items-center gap-3 mb-6">
          <Activity size={28} className="text-cyan-400" />
          <h1 className="section-title mb-0">Performance Monitor</h1>
        </div>
        <div className="glass-elevated rounded-xl p-8 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="loading-spinner w-8 h-8" />
            <span className="text-text-secondary">Initializing performance monitoring...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 animate-fade-in">
        <div className="flex items-center gap-3 mb-6">
          <Activity size={28} className="text-cyan-400" />
          <h1 className="section-title mb-0">Performance Monitor</h1>
        </div>
        <div className="glass-elevated rounded-xl p-6">
          <div className="flex items-center gap-3 text-red-400">
            <AlertCircle size={20} />
            <span>{error}</span>
          </div>
          <button
            onClick={startMonitoring}
            className="btn btn-secondary mt-4"
          >
            <RefreshCw size={16} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity size={28} className="text-cyan-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">Performance Monitor</h1>
            <p className="text-sm text-text-muted">
              Real-time system performance metrics
            </p>
          </div>
        </div>

        {/* Monitoring controls */}
        <div className="flex items-center gap-3">
          {/* Status indicator */}
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                isMonitoring ? 'bg-green-400 animate-pulse' : 'bg-gray-500'
              }`}
            />
            <span className="text-sm text-text-secondary">
              {isMonitoring ? 'Monitoring' : 'Paused'}
            </span>
          </div>

          {/* Toggle button */}
          <button
            onClick={handleToggleMonitoring}
            className="btn btn-secondary"
          >
            {isMonitoring ? (
              <>
                <Pause size={16} />
                Pause
              </>
            ) : (
              <>
                <Play size={16} />
                Resume
              </>
            )}
          </button>
        </div>
      </div>

      {/* CPU Section */}
      <section>
        <h2 className="text-sm text-text-muted uppercase tracking-wider mb-3">
          Processor
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <CpuChart data={cpuHistory} metrics={currentMetrics?.cpu ?? null} />
          <CoreBars metrics={currentMetrics?.cpu ?? null} />
        </div>
      </section>

      {/* GPU Section */}
      <section>
        <h2 className="text-sm text-text-muted uppercase tracking-wider mb-3">
          Graphics
        </h2>
        {currentMetrics?.gpu || hasNvidia ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <GpuChart data={gpuHistory} metrics={currentMetrics?.gpu ?? null} />
            {/* GPU Info Card */}
            <div className="glass-elevated rounded-xl p-4 animate-fade-in">
              <h3 className="text-sm text-text-secondary font-medium mb-3">
                GPU Information
              </h3>
              {currentMetrics?.gpu ? (
                <div className="space-y-3">
                  <div>
                    <span className="text-xs text-text-muted">Model</span>
                    <p className="text-white text-sm truncate" title={currentMetrics.gpu.name}>
                      {currentMetrics.gpu.name}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-xs text-text-muted">Utilization</span>
                      <p className="text-lg font-semibold text-green-400">
                        {currentMetrics.gpu.usage_percent.toFixed(0)}%
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-text-muted">Temperature</span>
                      <p className="text-lg font-semibold text-white">
                        {currentMetrics.gpu.temperature_celsius?.toFixed(0) ?? 'N/A'}°C
                      </p>
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-text-muted">VRAM Usage</span>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-green-500 transition-all duration-300"
                          style={{
                            width: `${(currentMetrics.gpu.memory_used_mb / currentMetrics.gpu.memory_total_mb) * 100}%`
                          }}
                        />
                      </div>
                      <span className="text-xs text-text-secondary">
                        {(currentMetrics.gpu.memory_used_mb / 1024).toFixed(1)} / {(currentMetrics.gpu.memory_total_mb / 1024).toFixed(0)} GB
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-text-muted text-sm">
                  Waiting for GPU data...
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="glass-elevated rounded-xl p-6">
            <div className="flex items-center gap-3 text-text-muted">
              <AlertCircle size={20} />
              <span>
                GPU monitoring not available. NVIDIA GPU with drivers required.
              </span>
            </div>
          </div>
        )}
      </section>

      {/* Memory Section */}
      <section>
        <h2 className="text-sm text-text-muted uppercase tracking-wider mb-3">
          Memory
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <RamChart data={ramHistory} metrics={currentMetrics?.ram ?? null} />
          {/* Memory Info Card */}
          <div className="glass-elevated rounded-xl p-4 animate-fade-in">
            <h3 className="text-sm text-text-secondary font-medium mb-3">
              Memory Details
            </h3>
            {currentMetrics?.ram ? (
              <div className="space-y-4">
                {/* Memory breakdown */}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <span className="text-xs text-text-muted">Used</span>
                    <p className="text-lg font-semibold text-purple-400">
                      {(currentMetrics.ram.used_bytes / (1024 * 1024 * 1024)).toFixed(1)} GB
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-text-muted">Available</span>
                    <p className="text-lg font-semibold text-white">
                      {(currentMetrics.ram.available_bytes / (1024 * 1024 * 1024)).toFixed(1)} GB
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-text-muted">Total</span>
                    <p className="text-lg font-semibold text-text-secondary">
                      {(currentMetrics.ram.total_bytes / (1024 * 1024 * 1024)).toFixed(0)} GB
                    </p>
                  </div>
                </div>

                {/* Visual breakdown bar */}
                <div>
                  <div className="flex justify-between text-xs text-text-muted mb-1">
                    <span>Memory Composition</span>
                    <span>{currentMetrics.ram.usage_percent.toFixed(1)}% in use</span>
                  </div>
                  <div className="h-4 rounded-full bg-white/5 overflow-hidden flex">
                    <div
                      className="h-full bg-purple-500 transition-all duration-300"
                      style={{ width: `${currentMetrics.ram.usage_percent}%` }}
                      title={`Used: ${(currentMetrics.ram.used_bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`}
                    />
                    <div
                      className="h-full bg-purple-500/30"
                      style={{
                        width: `${100 - currentMetrics.ram.usage_percent}%`
                      }}
                      title={`Available: ${(currentMetrics.ram.available_bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`}
                    />
                  </div>
                  <div className="flex justify-between mt-1">
                    <div className="flex items-center gap-1 text-xs">
                      <div className="w-2 h-2 rounded-full bg-purple-500" />
                      <span className="text-text-muted">In Use</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs">
                      <div className="w-2 h-2 rounded-full bg-purple-500/30" />
                      <span className="text-text-muted">Available</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-text-muted text-sm">
                Waiting for memory data...
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Footer info */}
      <div className="text-center text-xs text-text-muted pt-4 border-t border-white/10">
        Updates every 1 second • 60-second history window
      </div>
    </div>
  );
}
