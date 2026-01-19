import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import {
  GameWhitelist,
  GameEntry,
  GamingSession,
  GamingSessionData,
  CurrentBottleneckStatus,
  MetricsSnapshot,
  GamingSessionStartedEvent,
  GamingSessionEndedEvent,
  GamingBottleneckEvent,
  GamingMetricsEvent,
  ActiveSessionState,
} from '../types';

interface UseGamingDataReturn {
  // Whitelist
  whitelist: GameWhitelist | null;
  loadWhitelist: () => Promise<void>;
  updateWhitelist: (whitelist: GameWhitelist) => Promise<void>;
  addGame: (game: GameEntry) => Promise<void>;
  removeGame: (processName: string) => Promise<void>;
  toggleGame: (processName: string, enabled: boolean) => Promise<void>;

  // Detection
  isDetecting: boolean;
  startDetection: () => Promise<void>;
  stopDetection: () => Promise<void>;

  // Active Session
  activeSession: GamingSession | null;
  currentBottleneck: CurrentBottleneckStatus | null;
  realtimeMetrics: MetricsSnapshot[];
  endSession: () => Promise<void>;

  // History
  sessions: GamingSession[];
  loadSessions: () => Promise<void>;
  getSessionDetails: (sessionId: string) => Promise<GamingSessionData>;
  deleteSession: (sessionId: string) => Promise<void>;

  // State
  isLoading: boolean;
  error: string | null;
}

const FIVE_MINUTES_MS = 5 * 60 * 1000;

export function useGamingData(): UseGamingDataReturn {
  const [whitelist, setWhitelist] = useState<GameWhitelist | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [activeSession, setActiveSession] = useState<GamingSession | null>(null);
  const [currentBottleneck, setCurrentBottleneck] = useState<CurrentBottleneckStatus | null>(null);
  const [realtimeMetrics, setRealtimeMetrics] = useState<MetricsSnapshot[]>([]);
  const [sessions, setSessions] = useState<GamingSession[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Avoid stale closures in event handlers
  const activeSessionRef = useRef<GamingSession | null>(null);
  activeSessionRef.current = activeSession;

  const loadWhitelist = useCallback(async () => {
    try {
      const data = await invoke<GameWhitelist>('get_game_whitelist');
      setWhitelist(data);
    } catch (e) {
      setError(`Failed to load whitelist: ${e}`);
    }
  }, []);

  const updateWhitelist = useCallback(async (newWhitelist: GameWhitelist) => {
    try {
      await invoke('update_game_whitelist', { whitelist: newWhitelist });
      setWhitelist(newWhitelist);
    } catch (e) {
      setError(`Failed to update whitelist: ${e}`);
      throw e;
    }
  }, []);

  const addGame = useCallback(async (game: GameEntry) => {
    try {
      await invoke('add_game_to_whitelist', { game });
      await loadWhitelist();
    } catch (e) {
      setError(`Failed to add game: ${e}`);
      throw e;
    }
  }, [loadWhitelist]);

  const removeGame = useCallback(async (processName: string) => {
    try {
      await invoke('remove_game_from_whitelist', { processName });
      await loadWhitelist();
    } catch (e) {
      setError(`Failed to remove game: ${e}`);
      throw e;
    }
  }, [loadWhitelist]);

  const toggleGame = useCallback(async (processName: string, enabled: boolean) => {
    try {
      await invoke('toggle_game_enabled', { processName, enabled });
      await loadWhitelist();
    } catch (e) {
      setError(`Failed to toggle game: ${e}`);
      throw e;
    }
  }, [loadWhitelist]);

  const checkDetectionStatus = useCallback(async () => {
    try {
      const running = await invoke<boolean>('is_gaming_detection_running');
      setIsDetecting(running);
      if (running) {
        await invoke('start_performance_monitoring');
      }
    } catch (e) {
      console.error('Failed to check detection status:', e);
    }
  }, []);

  const startDetection = useCallback(async () => {
    try {
      await invoke('start_performance_monitoring');
      await invoke('start_gaming_detection');
      setIsDetecting(true);
    } catch (e) {
      setError(`Failed to start detection: ${e}`);
      throw e;
    }
  }, []);

  const stopDetection = useCallback(async () => {
    try {
      await invoke('stop_gaming_detection');
      await invoke('stop_performance_monitoring');
      setIsDetecting(false);
    } catch (e) {
      setError(`Failed to stop detection: ${e}`);
      throw e;
    }
  }, []);

  const checkActiveSession = useCallback(async () => {
    try {
      // Fetch full session state including recent metrics (for recovery after navigation)
      const state = await invoke<ActiveSessionState | null>('get_active_session_state');
      if (state) {
        setActiveSession(state.session);
        setRealtimeMetrics(state.recent_metrics);
        setCurrentBottleneck(state.current_bottleneck);
      } else {
        setActiveSession(null);
        setRealtimeMetrics([]);
        setCurrentBottleneck(null);
      }
    } catch (e) {
      console.error('Failed to check active session:', e);
    }
  }, []);

  const endSession = useCallback(async () => {
    try {
      await invoke('end_gaming_session');
      setActiveSession(null);
      setCurrentBottleneck(null);
      setRealtimeMetrics([]);
      await loadSessions();
    } catch (e) {
      setError(`Failed to end session: ${e}`);
      throw e;
    }
  }, []);

  const loadSessions = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await invoke<GamingSession[]>('get_gaming_sessions');
      // Sort by start time descending (newest first)
      data.sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
      setSessions(data);
    } catch (e) {
      setError(`Failed to load sessions: ${e}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getSessionDetails = useCallback(async (sessionId: string): Promise<GamingSessionData> => {
    try {
      return await invoke<GamingSessionData>('get_session_details', { sessionId });
    } catch (e) {
      setError(`Failed to load session details: ${e}`);
      throw e;
    }
  }, []);

  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      await invoke('delete_gaming_session', { sessionId });
      await loadSessions();
    } catch (e) {
      setError(`Failed to delete session: ${e}`);
      throw e;
    }
  }, [loadSessions]);

  useEffect(() => {
    const unlistenFns: UnlistenFn[] = [];

    const setupListeners = async () => {
      const unlistenStart = await listen<GamingSessionStartedEvent>(
        'gaming:session_started',
        (event) => {
          console.log('Gaming session started:', event.payload);
          setActiveSession(event.payload.session);
          setRealtimeMetrics([]);
          setCurrentBottleneck(null);
        }
      );
      unlistenFns.push(unlistenStart);

      // Listen for detection stopped event
      const unlistenDetectionStopped = await listen<{ reason: string }>(
        'gaming:detection_stopped',
        (event) => {
          console.log('Detection stopped:', event.payload.reason);
          setIsDetecting(false);
        }
      );
      unlistenFns.push(unlistenDetectionStopped);

      const unlistenEnd = await listen<GamingSessionEndedEvent>(
        'gaming:session_ended',
        (event) => {
          console.log('Gaming session ended:', event.payload);
          setActiveSession(null);
          setCurrentBottleneck(null);
          setRealtimeMetrics([]);
          loadSessions();
        }
      );
      unlistenFns.push(unlistenEnd);

      const unlistenBottleneck = await listen<GamingBottleneckEvent>(
        'gaming:bottleneck',
        (event) => {
          if (document.hidden) return;

          const currentSession = activeSessionRef.current;
          if (event.payload.session_id === currentSession?.id) {
            setCurrentBottleneck(event.payload.status);
          }
        }
      );
      unlistenFns.push(unlistenBottleneck);

      const unlistenMetrics = await listen<GamingMetricsEvent>(
        'gaming:metrics',
        (event) => {
          if (document.hidden) return;

          const currentSession = activeSessionRef.current;
          if (event.payload.session_id === currentSession?.id) {
            setRealtimeMetrics((prev) => {
              const now = Date.now();
              const fiveMinutesAgo = now - FIVE_MINUTES_MS;
              const filtered = prev.filter((m) => m.timestamp > fiveMinutesAgo);
              return [...filtered, event.payload.snapshot];
            });

            // Update currentBottleneck metrics in real-time (bottleneck type stays the same)
            const snapshot = event.payload.snapshot;
            setCurrentBottleneck((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                metrics: snapshot,
              };
            });
          }
        }
      );
      unlistenFns.push(unlistenMetrics);
    };

    setupListeners();

    return () => {
      unlistenFns.forEach((unlisten) => unlisten());
    };
  }, [loadSessions]);

  useEffect(() => {
    loadWhitelist();
    loadSessions();
    checkDetectionStatus();
    checkActiveSession();
  }, [loadWhitelist, loadSessions, checkDetectionStatus, checkActiveSession]);

  return {
    // Whitelist
    whitelist,
    loadWhitelist,
    updateWhitelist,
    addGame,
    removeGame,
    toggleGame,

    // Detection
    isDetecting,
    startDetection,
    stopDetection,

    // Active Session
    activeSession,
    currentBottleneck,
    realtimeMetrics,
    endSession,

    // History
    sessions,
    loadSessions,
    getSessionDetails,
    deleteSession,

    // State
    isLoading,
    error,
  };
}
