import { useState, useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type {
  Presence,
  PresenceStatus,
  UpdatePresenceRequest,
  FriendsSyncResult,
  ServerPresenceResponse,
} from '../types/friends';

// Polling intervals in milliseconds
const NORMAL_POLL_INTERVAL = 60000; // 60 seconds when not on Partner tab
const ACTIVE_POLL_INTERVAL = 10000; // 10 seconds when on Partner tab
const POST_MESSAGE_POLL_DELAY = 2000; // 2 seconds after sending a message

export interface UsePartnerPresenceReturn {
  // State
  partnerPresence: Presence | null;
  localPresence: Presence | null;
  isLoading: boolean;
  error: string | null;
  lastSyncTime: number | null;

  // Actions
  loadPartnerPresence: () => Promise<void>;
  updatePresence: (request: UpdatePresenceRequest) => Promise<void>;
  setMoodMessage: (message: string | null) => Promise<void>;
  goOnline: () => Promise<void>;
  goOffline: () => Promise<void>;
  setInGame: (game: string) => Promise<void>;
  // Polling control
  startPolling: (isActiveTab: boolean) => void;
  stopPolling: () => void;
  setActiveTab: (isActive: boolean) => void;
  triggerImmediateSync: () => Promise<void>;
}

export function usePartnerPresence(): UsePartnerPresenceReturn {
  const [partnerPresence, setPartnerPresence] = useState<Presence | null>(null);
  const [localPresence, setLocalPresence] = useState<Presence | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);

  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isActiveTabRef = useRef(false);
  const isPollingRef = useRef(false);
  const partnerPresenceRef = useRef<Presence | null>(null);
  const localPresenceRef = useRef<Presence | null>(null);

  // Keep refs in sync with state
  partnerPresenceRef.current = partnerPresence;
  localPresenceRef.current = localPresence;

  // Load partner's presence
  const loadPartnerPresence = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const presence = await invoke<Presence | null>('get_partner_presence');
      setPartnerPresence(presence);

      const local = await invoke<Presence>('get_local_presence');
      setLocalPresence(local);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Update local presence
  const updatePresence = useCallback(async (request: UpdatePresenceRequest) => {
    try {
      await invoke('update_presence', { request });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      throw new Error(msg);
    }
  }, []);

  // Set mood message
  const setMoodMessage = useCallback(async (message: string | null) => {
    try {
      await invoke('set_mood_message', { message });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      throw new Error(msg);
    }
  }, []);

  // Go online
  const goOnline = useCallback(async () => {
    await updatePresence({ status: 'online' as PresenceStatus });
  }, [updatePresence]);

  // Go offline
  const goOffline = useCallback(async () => {
    await updatePresence({ status: 'offline' as PresenceStatus });
  }, [updatePresence]);

  // Set in-game status
  const setInGame = useCallback(
    async (game: string) => {
      await updatePresence({
        status: 'in_game' as PresenceStatus,
        current_game: game,
      });
    },
    [updatePresence]
  );

  // Sync with server
  const doSync = useCallback(async () => {
    try {
      const result = await invoke<FriendsSyncResult>('sync_now');
      if (result.success) {
        setLastSyncTime(result.timestamp);
      }
    } catch (e) {
      console.error('Sync failed:', e);
    }
  }, []);

  // Start polling with specified interval
  const startPolling = useCallback((isActiveTab: boolean) => {
    // Stop any existing polling
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    isActiveTabRef.current = isActiveTab;
    isPollingRef.current = true;

    const interval = isActiveTab ? ACTIVE_POLL_INTERVAL : NORMAL_POLL_INTERVAL;
    pollingIntervalRef.current = setInterval(() => {
      if (isPollingRef.current) {
        doSync();
      }
    }, interval);

    // Also do an immediate sync
    doSync();
  }, [doSync]);

  // Stop polling
  const stopPolling = useCallback(() => {
    isPollingRef.current = false;
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  // Update polling interval when tab changes
  const setActiveTab = useCallback((isActive: boolean) => {
    if (isActiveTabRef.current === isActive) return;

    isActiveTabRef.current = isActive;

    // Only restart polling if it's already running
    if (isPollingRef.current) {
      startPolling(isActive);
    }
  }, [startPolling]);

  // Trigger immediate sync (useful after sending a message)
  const triggerImmediateSync = useCallback(async () => {
    // Wait a short delay then sync
    setTimeout(() => {
      doSync();
    }, POST_MESSAGE_POLL_DELAY);
  }, [doSync]);

  // Listen for presence updates (only register once)
  useEffect(() => {
    const unlisten = listen<Presence>('friends:presence_updated', (event) => {
      // Check if it's partner's presence or local using refs to avoid re-registration
      const currentPartner = partnerPresenceRef.current;
      const currentLocal = localPresenceRef.current;
      if (currentPartner && event.payload.user_id === currentPartner.user_id) {
        setPartnerPresence(event.payload);
      } else if (currentLocal && event.payload.user_id === currentLocal.user_id) {
        setLocalPresence(event.payload);
      }
    });

    const unlistenPartner = listen<ServerPresenceResponse>('friends:partner_presence', (event) => {
      setPartnerPresence({
        user_id: event.payload.user_id,
        status: event.payload.status as PresenceStatus,
        current_game: event.payload.current_game,
        game_start_time: null,
        mood_message: event.payload.mood_message,
        performance_stats: event.payload.performance_stats,
        last_updated: event.payload.last_updated,
        last_seen: event.payload.last_updated,
      });
    });

    return () => {
      unlisten.then((fn) => fn());
      unlistenPartner.then((fn) => fn());
    };
  }, []); // Empty deps - register listeners only once

  // Store startPolling in a ref to avoid effect re-runs
  const startPollingRef = useRef(startPolling);
  const stopPollingRef = useRef(stopPolling);
  startPollingRef.current = startPolling;
  stopPollingRef.current = stopPolling;

  // Handle visibility change to pause/resume polling
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Page is hidden, stop polling
        stopPollingRef.current();
      } else if (isPollingRef.current === false && isActiveTabRef.current) {
        // Page became visible and we were polling before, resume
        startPollingRef.current(isActiveTabRef.current);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []); // Empty deps - only register once

  // Initial load
  useEffect(() => {
    loadPartnerPresence();
  }, [loadPartnerPresence]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  return {
    partnerPresence,
    localPresence,
    isLoading,
    error,
    lastSyncTime,
    loadPartnerPresence,
    updatePresence,
    setMoodMessage,
    goOnline,
    goOffline,
    setInGame,
    startPolling,
    stopPolling,
    setActiveTab,
    triggerImmediateSync,
  };
}
