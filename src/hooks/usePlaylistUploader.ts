import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTauriEvent } from './useTauriEvent';
import type {
  MusicIndex,
  SyncStatus,
  PlaylistDownloadStatus,
  PlaylistUploaderProgress,
  SyncResult,
  DownloadResult,
  UploadResult,
  PlaylistUploaderCompleteEvent,
} from '../types';

export interface UsePlaylistUploaderReturn {
  // State
  syncStatus: SyncStatus;
  downloadStatus: PlaylistDownloadStatus;
  progress: PlaylistUploaderProgress | null;
  localIndex: MusicIndex;
  localPlaylists: string[];
  error: string | null;
  lastSyncResult: SyncResult | null;

  // Actions
  syncFromServer: () => Promise<SyncResult>;
  downloadPlaylist: (url: string, playlistName?: string, parallel?: number) => Promise<DownloadResult>;
  uploadToServer: (trackIds: string[], playlistName?: string) => Promise<UploadResult>;
  restartBot: () => Promise<boolean>;
  refreshLocalData: () => Promise<void>;
  resetSyncState: () => void;

  // Computed
  isSynced: boolean;
  canDownload: boolean;
  canUpload: boolean;
  isOperationInProgress: boolean;
}

export function usePlaylistUploader(): UsePlaylistUploaderReturn {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [downloadStatus, setDownloadStatus] = useState<PlaylistDownloadStatus>('idle');
  const [progress, setProgress] = useState<PlaylistUploaderProgress | null>(null);
  const [localIndex, setLocalIndex] = useState<MusicIndex>({});
  const [localPlaylists, setLocalPlaylists] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);

  // Computed values
  const isSynced = syncStatus === 'completed';
  const isOperationInProgress = syncStatus === 'syncing' ||
    (downloadStatus !== 'idle' && downloadStatus !== 'completed' && downloadStatus !== 'failed');
  const canDownload = isSynced && !isOperationInProgress;
  const canUpload = isSynced && !isOperationInProgress;

  // Listen for progress events
  useTauriEvent<PlaylistUploaderProgress>('playlist-uploader:sync-progress', (payload) => {
    setProgress(payload);
  });

  useTauriEvent<PlaylistUploaderProgress>('playlist-uploader:download-progress', (payload) => {
    setProgress(payload);
  });

  useTauriEvent<PlaylistUploaderProgress>('playlist-uploader:upload-progress', (payload) => {
    setProgress(payload);
  });

  useTauriEvent<PlaylistUploaderCompleteEvent>('playlist-uploader:complete', (payload) => {
    setProgress(null);
    if (!payload.success && payload.error) {
      setError(payload.error);
    }
  });

  // Refresh local data from file system
  const refreshLocalData = useCallback(async () => {
    try {
      const [index, playlists] = await Promise.all([
        invoke<MusicIndex>('get_local_music_index'),
        invoke<string[]>('get_local_playlists'),
      ]);
      setLocalIndex(index);
      setLocalPlaylists(playlists);
    } catch (err) {
      console.error('Failed to refresh local data:', err);
    }
  }, []);

  // Reset sync state
  const resetSyncState = useCallback(() => {
    setSyncStatus('idle');
    setDownloadStatus('idle');
    setProgress(null);
    setError(null);
    setLastSyncResult(null);
  }, []);

  // Sync from server
  const syncFromServer = useCallback(async (): Promise<SyncResult> => {
    setSyncStatus('syncing');
    setError(null);
    setProgress({ stage: 'Starting sync...', current: 0, total: 100, message: 'Starting sync...' });

    try {
      const result = await invoke<SyncResult>('sync_from_server', {});

      if (result.success) {
        setSyncStatus('completed');
        setLastSyncResult(result);
        await refreshLocalData();
      } else {
        setSyncStatus('failed');
        setError(result.error || 'Sync failed');
      }

      return result;
    } catch (err) {
      setSyncStatus('failed');
      const errorMsg = String(err);
      setError(errorMsg);
      return {
        success: false,
        indexEntries: 0,
        playlistsCount: 0,
        playlistNames: [],
        error: errorMsg,
      };
    } finally {
      setProgress(null);
    }
  }, [refreshLocalData]);

  // Download playlist
  const downloadPlaylist = useCallback(async (
    url: string,
    playlistName?: string,
    parallel?: number
  ): Promise<DownloadResult> => {
    // Debug logging
    console.log('=== downloadPlaylist called ===');
    console.log('  url:', url);
    console.log('  playlistName:', playlistName, 'type:', typeof playlistName);
    console.log('  parallel:', parallel);

    setDownloadStatus('fetching_metadata');
    setError(null);
    setProgress({ stage: 'Fetching metadata...', current: 0, total: 100, message: 'Fetching metadata...' });

    try {
      const sanitizedPlaylistName = playlistName && playlistName.trim() ? playlistName.trim() : null;

      console.warn(`[usePlaylistUploader] playlistName param: "${playlistName}", sanitized: "${sanitizedPlaylistName}"`);

      const invokeArgs = {
        url,
        playlistName: sanitizedPlaylistName,  
        parallel,
      };
      console.log('  invokeArgs:', JSON.stringify(invokeArgs));
      const result = await invoke<DownloadResult>('download_playlist', invokeArgs);

      if (result.success) {
        setDownloadStatus('completed');
        await refreshLocalData();
      } else {
        setDownloadStatus('failed');
        setError(result.error || 'Download failed');
      }

      return result;
    } catch (err) {
      setDownloadStatus('failed');
      const errorMsg = String(err);
      setError(errorMsg);
      return {
        success: false,
        downloaded: 0,
        cached: 0,
        failed: 0,
        total: 0,
        indexEntries: 0,
        playlistTracks: 0,
        downloadedTrackIds: [],
        error: errorMsg,
      };
    } finally {
      setProgress(null);
    }
  }, [refreshLocalData]);

  // Upload to server
  const uploadToServer = useCallback(async (
    trackIds: string[],
    playlistName?: string
  ): Promise<UploadResult> => {
    console.log('=== uploadToServer called ===');
    console.log('  trackIds:', trackIds.length, 'items');
    console.log('  playlistName:', playlistName, 'type:', typeof playlistName);

    setDownloadStatus('uploading');
    setError(null);
    setProgress({ stage: 'Uploading...', current: 0, total: 100, message: 'Uploading...' });

    try {
      const invokeArgs = {
        trackIds: trackIds,       
        playlistName: playlistName, 
      };
      console.log('  invokeArgs:', JSON.stringify(invokeArgs));
      const result = await invoke<UploadResult>('upload_to_server', invokeArgs);

      if (result.success) {
        setDownloadStatus('completed');
      } else {
        setDownloadStatus('failed');
        setError(result.error || 'Upload failed');
      }

      return result;
    } catch (err) {
      setDownloadStatus('failed');
      const errorMsg = String(err);
      setError(errorMsg);
      return {
        success: false,
        uploadedTracks: 0,
        skippedTracks: 0,
        playlistUploaded: false,
        playlistJsUpdated: false,
        botRestarted: false,
        error: errorMsg,
      };
    } finally {
      setProgress(null);
    }
  }, []);

  const restartBot = useCallback(async (): Promise<boolean> => {
    try {
      return await invoke<boolean>('restart_discord_bot', {});
    } catch (err) {
      setError(String(err));
      return false;
    }
  }, []);

  return {
    syncStatus,
    downloadStatus,
    progress,
    localIndex,
    localPlaylists,
    error,
    lastSyncResult,
    syncFromServer,
    downloadPlaylist,
    uploadToServer,
    restartBot,
    refreshLocalData,
    resetSyncState,
    isSynced,
    canDownload,
    canUpload,
    isOperationInProgress,
  };
}
