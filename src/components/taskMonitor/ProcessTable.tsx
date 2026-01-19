import { useState, useMemo } from 'react';
import {
  Trash2,
  ChevronUp,
  ChevronDown,
  Search,
  Shield,
  AlertTriangle,
  Loader2,
  Layers,
} from 'lucide-react';
import type { ProcessInfo, ProcessCategory, GroupedProcessInfo } from '../../types/taskMonitor';
import { CATEGORY_CONFIG } from '../../types/taskMonitor';
import { CustomSelect } from '../ui/CustomSelect';

interface ProcessTableProps {
  processes: ProcessInfo[];
  isLoading: boolean;
  onKillProcess: (pid: number) => Promise<void>;
  onKillMultiple: (pids: number[]) => Promise<void>;
  selectedPids: Set<number>;
  onSelectionChange: (pids: Set<number>) => void;
}


function groupProcessesByName(processes: ProcessInfo[]): GroupedProcessInfo[] {
  const groups = new Map<string, ProcessInfo[]>();

  for (const process of processes) {
    const existing = groups.get(process.name) || [];
    existing.push(process);
    groups.set(process.name, existing);
  }

  const grouped: GroupedProcessInfo[] = [];
  for (const [name, procs] of groups) {
    const first = procs[0];

    let totalCpu = 0;
    let totalMemory = 0;
    let totalGpu: number | null = null;

    for (const p of procs) {
      totalCpu += p.cpu_usage;
      totalMemory += p.memory_mb;
      if (p.gpu_usage !== null) {
        totalGpu = (totalGpu ?? 0) + p.gpu_usage;
      }
    }

    grouped.push({
      name,
      display_name: first.display_name,
      pids: procs.map(p => p.pid),
      instance_count: procs.length,
      cpu_usage: totalCpu,
      memory_mb: totalMemory,
      gpu_usage: totalGpu,
      category: first.category,
      description: first.description,
      can_kill: procs.some(p => p.can_kill),
      exe_path: procs.find(p => p.exe_path)?.exe_path ?? null,
    });
  }

  return grouped;
}

type SortKey = 'name' | 'cpu_usage' | 'memory_mb' | 'gpu_usage' | 'category';
type SortDirection = 'asc' | 'desc';

const CATEGORY_ORDER: ProcessCategory[] = [
  'AntiCheatProtected',
  'SystemCritical',
  'SecuritySoftware',
  'DriverHardware',
  'SystemService',
  'MicrosoftBloat',
  'BackgroundService',
  'UserApplication',
  'Unknown',
];

const CATEGORY_OPTIONS = [
  { value: 'all', label: 'All Categories' },
  ...CATEGORY_ORDER.map((cat) => ({
    value: cat,
    label: CATEGORY_CONFIG[cat].label,
  })),
];

export function ProcessTable({
  processes,
  isLoading,
  onKillProcess: _onKillProcess,
  onKillMultiple,
  selectedPids,
  onSelectionChange,
}: ProcessTableProps) {
  void _onKillProcess; 
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<ProcessCategory | 'all'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('memory_mb');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [killingPids, setKillingPids] = useState<Set<number>>(new Set());

  const groupedProcesses = useMemo(() => groupProcessesByName(processes), [processes]);

  const filteredProcesses = useMemo(() => {
    let result = groupedProcesses;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.display_name.toLowerCase().includes(query) ||
          p.description?.toLowerCase().includes(query)
      );
    }

    if (categoryFilter !== 'all') {
      result = result.filter((p) => p.category === categoryFilter);
    }

    result = [...result].sort((a, b) => {
      let comparison = 0;
      switch (sortKey) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'cpu_usage':
          comparison = a.cpu_usage - b.cpu_usage;
          break;
        case 'memory_mb':
          comparison = a.memory_mb - b.memory_mb;
          break;
        case 'gpu_usage':
          if (a.gpu_usage === null && b.gpu_usage === null) comparison = 0;
          else if (a.gpu_usage === null) comparison = -1;
          else if (b.gpu_usage === null) comparison = 1;
          else comparison = a.gpu_usage - b.gpu_usage;
          break;
        case 'category':
          comparison =
            CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [groupedProcesses, searchQuery, categoryFilter, sortKey, sortDirection]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('desc');
    }
  };

  const handleKillGroup = async (group: GroupedProcessInfo) => {
    const pidsToKill = group.pids;
    setKillingPids(new Set(pidsToKill));
    try {
      await onKillMultiple(pidsToKill);
    } finally {
      setKillingPids(new Set());
    }
  };

  const allKillablePids = useMemo(() => {
    const pids: number[] = [];
    for (const group of filteredProcesses) {
      if (group.can_kill) {
        pids.push(...group.pids);
      }
    }
    return pids;
  }, [filteredProcesses]);

  const handleSelectAll = () => {
    if (selectedPids.size === allKillablePids.length && allKillablePids.length > 0) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(allKillablePids));
    }
  };

  const handleToggleSelect = (group: GroupedProcessInfo) => {
    const newSelection = new Set(selectedPids);
    const allSelected = group.pids.every(pid => selectedPids.has(pid));

    if (allSelected) {
      for (const pid of group.pids) {
        newSelection.delete(pid);
      }
    } else {
      for (const pid of group.pids) {
        newSelection.add(pid);
      }
    }
    onSelectionChange(newSelection);
  };

  const isGroupSelected = (group: GroupedProcessInfo) => {
    return group.pids.every(pid => selectedPids.has(pid));
  };

  const isGroupPartiallySelected = (group: GroupedProcessInfo) => {
    const selectedCount = group.pids.filter(pid => selectedPids.has(pid)).length;
    return selectedCount > 0 && selectedCount < group.pids.length;
  };

  const isGroupBeingKilled = (group: GroupedProcessInfo) => {
    return group.pids.some(pid => killingPids.has(pid));
  };

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return null;
    return sortDirection === 'asc' ? (
      <ChevronUp className="w-4 h-4" />
    ) : (
      <ChevronDown className="w-4 h-4" />
    );
  };

  const getCategoryIcon = (category: ProcessCategory) => {
    switch (category) {
      case 'AntiCheatProtected':
        return <Shield className="w-4 h-4 text-red-400" />;
      case 'SystemCritical':
      case 'SecuritySoftware':
        return <AlertTriangle className="w-4 h-4 text-orange-400" />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input
            type="text"
            placeholder="Search processes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-indigo-500/50"
          />
        </div>
        <CustomSelect
          value={categoryFilter}
          onChange={(value) => setCategoryFilter(value as ProcessCategory | 'all')}
          options={CATEGORY_OPTIONS}
          className="w-48"
        />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-white/10">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-white/5">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={
                      selectedPids.size > 0 &&
                      selectedPids.size === allKillablePids.length
                    }
                    onChange={handleSelectAll}
                    className="rounded border-white/20 bg-white/5 text-indigo-500 focus:ring-indigo-500"
                  />
                </th>
                <th
                  className="px-4 py-3 text-left text-sm font-medium text-white/60 cursor-pointer hover:text-white"
                  onClick={() => handleSort('name')}
                >
                  <div className="flex items-center gap-1">
                    Name <SortIcon column="name" />
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-left text-sm font-medium text-white/60 cursor-pointer hover:text-white"
                  onClick={() => handleSort('cpu_usage')}
                >
                  <div className="flex items-center gap-1">
                    CPU <SortIcon column="cpu_usage" />
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-left text-sm font-medium text-white/60 cursor-pointer hover:text-white"
                  onClick={() => handleSort('memory_mb')}
                >
                  <div className="flex items-center gap-1">
                    RAM <SortIcon column="memory_mb" />
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-left text-sm font-medium text-white/60 cursor-pointer hover:text-white"
                  onClick={() => handleSort('gpu_usage')}
                >
                  <div className="flex items-center gap-1">
                    GPU <SortIcon column="gpu_usage" />
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-left text-sm font-medium text-white/60 cursor-pointer hover:text-white"
                  onClick={() => handleSort('category')}
                >
                  <div className="flex items-center gap-1">
                    Category <SortIcon column="category" />
                  </div>
                </th>
                <th className="px-4 py-3 text-right text-sm font-medium text-white/60">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-indigo-400" />
                    <p className="mt-2 text-white/60">Loading processes...</p>
                  </td>
                </tr>
              ) : filteredProcesses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-white/40">
                    No processes found
                  </td>
                </tr>
              ) : (
                filteredProcesses.map((group) => (
                  <tr
                    key={group.name}
                    className={`hover:bg-white/5 transition-colors ${
                      !group.can_kill ? 'opacity-60' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={isGroupSelected(group)}
                        ref={(el) => {
                          if (el) el.indeterminate = isGroupPartiallySelected(group);
                        }}
                        onChange={() => handleToggleSelect(group)}
                        disabled={!group.can_kill}
                        className="rounded border-white/20 bg-white/5 text-indigo-500 focus:ring-indigo-500 disabled:opacity-30"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {getCategoryIcon(group.category)}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-white">{group.display_name}</span>
                            {group.instance_count > 1 && (
                              <span className="flex items-center gap-1 px-1.5 py-0.5 bg-indigo-500/20 text-indigo-300 text-xs rounded-md">
                                <Layers className="w-3 h-3" />
                                {group.instance_count}
                              </span>
                            )}
                          </div>
                          {group.description && (
                            <div className="text-xs text-white/40 truncate max-w-[200px]">
                              {group.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-white/60 font-mono text-sm">
                      {group.cpu_usage.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-white/60 font-mono text-sm">
                      {group.memory_mb >= 1024
                        ? `${(group.memory_mb / 1024).toFixed(1)} GB`
                        : `${group.memory_mb.toFixed(0)} MB`}
                    </td>
                    <td className="px-4 py-3 text-white/40 font-mono text-sm">
                      {group.gpu_usage !== null ? `${group.gpu_usage.toFixed(1)}%` : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          CATEGORY_CONFIG[group.category].color
                        } bg-white/5`}
                      >
                        {CATEGORY_CONFIG[group.category].label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {group.can_kill && (
                        <button
                          onClick={() => handleKillGroup(group)}
                          disabled={isGroupBeingKilled(group)}
                          className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
                          title={group.instance_count > 1 ? `Kill all ${group.instance_count} instances` : 'Kill process'}
                        >
                          {isGroupBeingKilled(group) ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Selected count and bulk action */}
      {selectedPids.size > 0 && (
        <div className="flex items-center justify-between px-4 py-3 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">
          <span className="text-white/80">
            {selectedPids.size} process{selectedPids.size > 1 ? 'es' : ''} selected
          </span>
          <button
            onClick={() => onKillMultiple(Array.from(selectedPids))}
            className="flex items-center gap-2 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Kill Selected
          </button>
        </div>
      )}
    </div>
  );
}
