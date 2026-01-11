// Auto-update hook
import { useState, useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type {
  UpdateState,
  UpdateInfo,
  UpdateProgressEvent,
} from '../types/updater';

export interface UseUpdaterReturn {
  state: UpdateState;
  checkForUpdate: () => Promise<void>;
  downloadAndInstall: () => Promise<void>;
  dismissUpdate: () => void;
  isUpdateAvailable: boolean;
  isDownloading: boolean;
  isReady: boolean;
}

const initialState: UpdateState = {
  status: 'idle',
  info: null,
  progress: null,
  error: null,
};

export function useUpdater(): UseUpdaterReturn {
  const [state, setState] = useState<UpdateState>(initialState);
  const unlistenersRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    const setupListeners = async () => {
      const unlistenProgress = await listen<UpdateProgressEvent>('update:progress', (event) => {
        setState((prev) => ({
          ...prev,
          status: 'downloading',
          progress: {
            downloaded: event.payload.downloaded,
            total: event.payload.total,
            percent: event.payload.percent,
          },
        }));
      });

      const unlistenDownloaded = await listen('update:downloaded', () => {
        setState((prev) => ({
          ...prev,
          status: 'downloaded',
          progress: prev.progress ? { ...prev.progress, percent: 100 } : null,
        }));
      });

      const unlistenDownloading = await listen('update:downloading', () => {
        setState((prev) => ({
          ...prev,
          status: 'downloading',
          progress: { downloaded: 0, total: 0, percent: 0 },
        }));
      });

      unlistenersRef.current = [
        unlistenProgress,
        unlistenDownloaded,
        unlistenDownloading,
      ];
    };

    setupListeners();

    return () => {
      unlistenersRef.current.forEach((unlisten) => unlisten());
    };
  }, []);

  const checkForUpdate = useCallback(async () => {
    setState((prev) => ({ ...prev, status: 'checking', error: null }));

    try {
      const result = await invoke<UpdateInfo | null>('check_for_update');

      if (result) {
        setState({
          status: 'available',
          info: result,
          progress: null,
          error: null,
        });
      } else {
        // No update available, reset to idle
        setState(initialState);
      }
    } catch (err) {
      setState({
        status: 'error',
        info: null,
        progress: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  const downloadAndInstall = useCallback(async () => {
    if (state.status !== 'available' && state.status !== 'error') {
      return;
    }

    setState((prev) => ({
      ...prev,
      status: 'downloading',
      progress: { downloaded: 0, total: 0, percent: 0 },
      error: null,
    }));

    try {
      await invoke('download_and_install_update');
      // After download_and_install_update completes, the app should restart
      // If it doesn't, we'll be in 'downloaded' state from the event listener
    } catch (err) {
      setState((prev) => ({
        ...prev,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, [state.status]);

  const dismissUpdate = useCallback(() => {
    setState((prev) => ({
      ...prev,
      status: 'idle',
    }));
  }, []);

  const isUpdateAvailable = state.status === 'available';
  const isDownloading = state.status === 'downloading';
  const isReady = state.status === 'downloaded';

  return {
    state,
    checkForUpdate,
    downloadAndInstall,
    dismissUpdate,
    isUpdateAvailable,
    isDownloading,
    isReady,
  };
}
