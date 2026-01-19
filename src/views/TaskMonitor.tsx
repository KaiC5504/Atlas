import { useEffect, useState, useMemo } from 'react';
import {
  RefreshCw,
  Cpu,
  HardDrive,
  Activity,
  AlertCircle,
  ListTodo,
} from 'lucide-react';
import { useTaskMonitor } from '../hooks/useTaskMonitor';
import { ProcessTable } from '../components/taskMonitor/ProcessTable';
import { QuickActions } from '../components/taskMonitor/QuickActions';
import type { KillResult } from '../types/taskMonitor';

export default function TaskMonitor() {
  const {
    processes,
    profiles,
    systemSummary,
    isLoading,
    error,
    refreshProcesses,
    refreshProfiles,
    killProcess,
    killMultipleProcesses,
    killByCategory,
    executeProfile,
  } = useTaskMonitor();

  const [selectedPids, setSelectedPids] = useState<Set<number>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    refreshProcesses();
    refreshProfiles();
  }, [refreshProcesses, refreshProfiles]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshProcesses();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleKillProcess = async (pid: number) => {
    await killProcess(pid);
    setSelectedPids((prev) => {
      const next = new Set(prev);
      next.delete(pid);
      return next;
    });
  };

  const handleKillMultiple = async (pids: number[]): Promise<void> => {
    await killMultipleProcesses(pids);
    setSelectedPids(new Set());
  };

  const handleKillBloat = async (): Promise<KillResult> => {
    const result = await killByCategory('MicrosoftBloat');
    setSelectedPids(new Set());
    return result;
  };

  const stats = useMemo(() => {
    const groupedByName = new Map<string, typeof processes>();
    for (const p of processes) {
      const existing = groupedByName.get(p.name) || [];
      existing.push(p);
      groupedByName.set(p.name, existing);
    }

    const uniqueProcessCount = groupedByName.size;
    const bloatCount = [...groupedByName.values()].filter(
      (group) => group[0].category === 'MicrosoftBloat'
    ).length;
    const bloatMemory = processes
      .filter((p) => p.category === 'MicrosoftBloat')
      .reduce((sum, p) => sum + p.memory_mb, 0);
    const killableCount = [...groupedByName.values()].filter(
      (group) => group.some((p) => p.can_kill)
    ).length;

    return { bloatCount, bloatMemory, killableCount, uniqueProcessCount };
  }, [processes]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-500/20 rounded-lg">
            <ListTodo className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Task Monitor</h1>
            <p className="text-white/60">Manage running processes and optimize for gaming</p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* System Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-4 bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <Activity className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <div className="text-sm text-white/60">Processes</div>
              <div className="text-xl font-semibold text-white">
                {systemSummary?.total_processes ?? '-'}
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/20 rounded-lg">
              <HardDrive className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <div className="text-sm text-white/60">RAM Usage</div>
              <div className="text-xl font-semibold text-white">
                {systemSummary
                  ? `${systemSummary.used_ram_gb.toFixed(1)} / ${systemSummary.total_ram_gb.toFixed(0)} GB`
                  : '-'}
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-500/20 rounded-lg">
              <Cpu className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <div className="text-sm text-white/60">CPU Usage</div>
              <div className="text-xl font-semibold text-white">
                {systemSummary ? `${systemSummary.cpu_usage_percent.toFixed(0)}%` : '-'}
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <AlertCircle className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <div className="text-sm text-white/60">Bloatware</div>
              <div className="text-xl font-semibold text-white">
                {stats.bloatCount} ({(stats.bloatMemory / 1024).toFixed(1)} GB)
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="p-6 bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl">
        <QuickActions
          profiles={profiles}
          onExecuteProfile={executeProfile}
          onKillBloat={handleKillBloat}
          disabled={isLoading}
        />
      </div>

      {/* Error display */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
          <div className="flex items-center gap-2 text-red-400">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Process Table */}
      <div className="p-6 bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-white">Running Processes</h3>
          <span className="text-sm text-white/60">
            {stats.killableCount} killable of {stats.uniqueProcessCount} unique ({processes.length} total instances)
          </span>
        </div>
        <ProcessTable
          processes={processes}
          isLoading={isLoading}
          onKillProcess={handleKillProcess}
          onKillMultiple={handleKillMultiple}
          selectedPids={selectedPids}
          onSelectionChange={setSelectedPids}
        />
      </div>
    </div>
  );
}
