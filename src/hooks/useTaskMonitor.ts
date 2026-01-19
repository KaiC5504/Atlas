import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type {
  ProcessInfo,
  GamingProfile,
  KillResult,
  SystemSummary,
} from '../types/taskMonitor';

export interface UseTaskMonitorReturn {
  // State
  processes: ProcessInfo[];
  profiles: GamingProfile[];
  systemSummary: SystemSummary | null;
  isLoading: boolean;
  error: string | null;
  // Actions
  refreshProcesses: () => Promise<void>;
  refreshProfiles: () => Promise<void>;
  killProcess: (pid: number) => Promise<void>;
  killMultipleProcesses: (pids: number[]) => Promise<KillResult>;
  killByCategory: (category: string) => Promise<KillResult>;
  saveProfile: (profile: GamingProfile) => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;
  setDefaultProfile: (id: string) => Promise<void>;
  executeProfile: (id: string) => Promise<KillResult>;
  getKillRecommendations: (minMemoryMb: number) => Promise<ProcessInfo[]>;
}

export function useTaskMonitor(): UseTaskMonitorReturn {
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [profiles, setProfiles] = useState<GamingProfile[]>([]);
  const [systemSummary, setSystemSummary] = useState<SystemSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshProcesses = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [processList, summary] = await Promise.all([
        invoke<ProcessInfo[]>('get_process_list'),
        invoke<SystemSummary>('get_system_summary'),
      ]);
      setProcesses(processList);
      setSystemSummary(summary);
    } catch (e) {
      setError(`Failed to load processes: ${e}`);
      console.error('Failed to load processes:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshProfiles = useCallback(async () => {
    try {
      const profileList = await invoke<GamingProfile[]>('get_gaming_profiles');
      setProfiles(profileList);
    } catch (e) {
      setError(`Failed to load profiles: ${e}`);
      console.error('Failed to load profiles:', e);
    }
  }, []);

  const killProcess = useCallback(
    async (pid: number) => {
      try {
        await invoke('kill_single_process', { pid });
        await refreshProcesses();
      } catch (e) {
        setError(`Failed to kill process: ${e}`);
        throw e;
      }
    },
    [refreshProcesses]
  );

  const killMultipleProcesses = useCallback(
    async (pids: number[]): Promise<KillResult> => {
      try {
        const result = await invoke<KillResult>('kill_multiple_processes', { pids });
        await refreshProcesses();
        return result;
      } catch (e) {
        setError(`Failed to kill processes: ${e}`);
        throw e;
      }
    },
    [refreshProcesses]
  );

  const killByCategory = useCallback(
    async (category: string): Promise<KillResult> => {
      try {
        const result = await invoke<KillResult>('kill_by_category', { category });
        await refreshProcesses();
        return result;
      } catch (e) {
        setError(`Failed to kill category: ${e}`);
        throw e;
      }
    },
    [refreshProcesses]
  );

  const saveProfile = useCallback(
    async (profile: GamingProfile) => {
      try {
        await invoke('save_gaming_profile', { profile });
        await refreshProfiles();
      } catch (e) {
        setError(`Failed to save profile: ${e}`);
        throw e;
      }
    },
    [refreshProfiles]
  );

  const deleteProfile = useCallback(
    async (id: string) => {
      try {
        await invoke('delete_gaming_profile', { id });
        await refreshProfiles();
      } catch (e) {
        setError(`Failed to delete profile: ${e}`);
        throw e;
      }
    },
    [refreshProfiles]
  );

  const setDefaultProfile = useCallback(
    async (id: string) => {
      try {
        await invoke('set_default_gaming_profile', { id });
        await refreshProfiles();
      } catch (e) {
        setError(`Failed to set default profile: ${e}`);
        throw e;
      }
    },
    [refreshProfiles]
  );

  const executeProfile = useCallback(
    async (id: string): Promise<KillResult> => {
      try {
        const result = await invoke<KillResult>('execute_gaming_profile', { id });
        await refreshProcesses();
        return result;
      } catch (e) {
        setError(`Failed to execute profile: ${e}`);
        throw e;
      }
    },
    [refreshProcesses]
  );

  const getKillRecommendations = useCallback(
    async (minMemoryMb: number): Promise<ProcessInfo[]> => {
      try {
        return await invoke<ProcessInfo[]>('get_kill_recommendations', { minMemoryMb });
      } catch (e) {
        setError(`Failed to get recommendations: ${e}`);
        throw e;
      }
    },
    []
  );

  return {
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
    saveProfile,
    deleteProfile,
    setDefaultProfile,
    executeProfile,
    getKillRecommendations,
  };
}
