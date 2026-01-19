export interface ProcessInfo {
  pid: number;
  name: string;
  display_name: string;
  exe_path: string | null;
  cpu_usage: number;
  memory_mb: number;
  gpu_usage: number | null;
  category: ProcessCategory;
  description: string | null;
  can_kill: boolean;
  parent_pid: number | null;
}

export interface GroupedProcessInfo {
  name: string;
  display_name: string;
  pids: number[];  
  instance_count: number;
  cpu_usage: number;  
  memory_mb: number;  
  gpu_usage: number | null;  
  category: ProcessCategory;
  description: string | null;
  can_kill: boolean;  
  exe_path: string | null;  
}

export type ProcessCategory =
  | 'AntiCheatProtected'
  | 'SystemCritical'
  | 'SystemService'
  | 'MicrosoftBloat'
  | 'SecuritySoftware'
  | 'UserApplication'
  | 'BackgroundService'
  | 'DriverHardware'
  | 'Unknown';

export interface GamingProfile {
  id: string;
  name: string;
  processes_to_kill: string[];
  is_default: boolean;
}

export interface KillResult {
  killed: number;
  failed: number;
  errors: string[];
}

export interface SystemSummary {
  total_processes: number;
  total_ram_gb: number;
  used_ram_gb: number;
  cpu_usage_percent: number;
  cpu_count: number;
}

export const CATEGORY_CONFIG: Record<
  ProcessCategory,
  { label: string; color: string; canKill: boolean }
> = {
  AntiCheatProtected: { label: 'Protected', color: 'text-red-400', canKill: false },
  SystemCritical: { label: 'System', color: 'text-orange-400', canKill: false },
  SystemService: { label: 'Service', color: 'text-yellow-400', canKill: false },
  MicrosoftBloat: { label: 'Bloat', color: 'text-purple-400', canKill: true },
  SecuritySoftware: { label: 'Security', color: 'text-blue-400', canKill: false },
  UserApplication: { label: 'App', color: 'text-green-400', canKill: true },
  BackgroundService: { label: 'Background', color: 'text-gray-400', canKill: true },
  DriverHardware: { label: 'Driver', color: 'text-cyan-400', canKill: false },
  Unknown: { label: 'Unknown', color: 'text-gray-500', canKill: true },
};

export interface KilledProcessInfo {
  exe_path: string;
  name: string;
  killed_at: number;
  is_self_restoring: boolean;
  working_dir: string | null;
}

export interface RestoreList {
  session_id: string | null;
  processes: KilledProcessInfo[];
  created_at: number;
  detected_respawns: string[];
}

export interface RestoreError {
  exe_path: string;
  error: string;
}

export interface RestoreResult {
  restored: number;
  skipped_self_restoring: number;
  failed: number;
  errors: RestoreError[];
}
