import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Memory, CreateMemoryRequest } from '../types/friends';

export interface UseMemoriesReturn {
  // State
  memories: Memory[];
  countdowns: Memory[];
  isLoading: boolean;
  error: string | null;

  // Actions
  loadMemories: () => Promise<void>;
  createMemory: (request: CreateMemoryRequest) => Promise<Memory>;
  createCountdown: (title: string, targetDate: number) => Promise<Memory>;
  deleteMemory: (memoryId: string) => Promise<void>;

  // Computed
  photos: Memory[];
  videos: Memory[];
  notes: Memory[];
  milestones: Memory[];
}

export function useMemories(): UseMemoriesReturn {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [countdowns, setCountdowns] = useState<Memory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Computed filtered arrays
  const photos = memories.filter((m) => m.memory_type === 'photo');
  const videos = memories.filter((m) => m.memory_type === 'video');
  const notes = memories.filter((m) => m.memory_type === 'note');
  const milestones = memories.filter((m) => m.memory_type === 'milestone');

  // Load all memories
  const loadMemories = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [allMemories, allCountdowns] = await Promise.all([
        invoke<Memory[]>('get_memories'),
        invoke<Memory[]>('get_countdowns'),
      ]);
      setMemories(allMemories);
      setCountdowns(allCountdowns);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Create a new memory
  const createMemory = useCallback(
    async (request: CreateMemoryRequest): Promise<Memory> => {
      try {
        const memory = await invoke<Memory>('create_memory', { request });
        await loadMemories();
        return memory;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        throw new Error(msg);
      }
    },
    [loadMemories]
  );

  // Create a countdown
  const createCountdown = useCallback(
    async (title: string, targetDate: number): Promise<Memory> => {
      try {
        const memory = await invoke<Memory>('create_countdown', { title, targetDate });
        await loadMemories();
        return memory;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        throw new Error(msg);
      }
    },
    [loadMemories]
  );

  // Delete a memory
  const deleteMemory = useCallback(
    async (memoryId: string) => {
      try {
        await invoke('delete_memory', { memoryId });
        await loadMemories();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        throw new Error(msg);
      }
    },
    [loadMemories]
  );

  // Initial load
  useEffect(() => {
    loadMemories();
  }, [loadMemories]);

  return {
    memories,
    countdowns,
    isLoading,
    error,
    loadMemories,
    createMemory,
    createCountdown,
    deleteMemory,
    photos,
    videos,
    notes,
    milestones,
  };
}
