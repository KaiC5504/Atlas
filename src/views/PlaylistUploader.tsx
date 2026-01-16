import { useState, useEffect } from 'react';
import { Music2, FolderOpen, AlertCircle, Loader2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { usePlaylistUploader } from '../hooks/usePlaylistUploader';
import {
  SyncStatusCard,
  DownloadCard,
  UploadCard,
  TrackList,
} from '../components/playlist-uploader';

export default function PlaylistUploader() {
  const {
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
    canDownload,
    canUpload,
    isOperationInProgress,
  } = usePlaylistUploader();

  const [selectedTracks, setSelectedTracks] = useState<string[]>([]);
  const [playlistFilter, setPlaylistFilter] = useState('');
  const [playlistName, setPlaylistName] = useState('');
  const [musicDir, setMusicDir] = useState<string>('');

  const [downloadedPlaylistName, setDownloadedPlaylistName] = useState<string | null>(null);

  // Get music directory path on mount
  useEffect(() => {
    invoke<string>('get_music_directory')
      .then(setMusicDir)
      .catch(console.error);
  }, []);

  // Reset sync state when leaving page and refresh local data on mount
  useEffect(() => {
    refreshLocalData();
    return () => {
      resetSyncState();
    };
  }, [refreshLocalData, resetSyncState]);

  useEffect(() => {
    setSelectedTracks([]);
  }, [localIndex]);

  // Wrapper for download 
  const handleDownload = async (url: string, customName?: string, parallel?: number) => {
    const result = await downloadPlaylist(url, customName, parallel);
    if (result.success) {
      setDownloadedPlaylistName(result.playlistName ?? null);
    }
    return result;
  };

  const handleUpload = async (trackIds: string[], _playlistName?: string) => {
    const result = await uploadToServer(trackIds, downloadedPlaylistName ?? undefined);
    if (result.success) {
      await refreshLocalData();
      setSelectedTracks([]);
    }
    return result;
  };

  const trackCount = Object.keys(localIndex).length;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-500/20">
            <Music2 className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-primary">Playlist Uploader</h1>
            <p className="text-sm text-muted">
              Download, manage, and upload music to Discord bot
            </p>
          </div>
        </div>

        {/* Music folder path */}
        {musicDir && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10">
            <FolderOpen className="w-4 h-4 text-muted" />
            <span className="text-sm text-secondary font-mono">{musicDir}</span>
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="mx-6 mt-4 p-4 rounded-lg bg-red-500/20 border border-red-500/30 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <span className="text-red-400">{error}</span>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Status Cards Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Sync Status Card */}
            <SyncStatusCard
              status={syncStatus}
              lastResult={lastSyncResult}
              progress={syncStatus === 'syncing' ? progress : null}
              error={syncStatus === 'failed' ? error : null}
              onSync={syncFromServer}
              disabled={isOperationInProgress}
            />

            {/* Download Card */}
            <DownloadCard
              status={downloadStatus}
              progress={
                downloadStatus !== 'idle' &&
                downloadStatus !== 'completed' &&
                downloadStatus !== 'failed'
                  ? progress
                  : null
              }
              error={downloadStatus === 'failed' ? error : null}
              disabled={!canDownload}
              playlistName={playlistName}
              onPlaylistNameChange={setPlaylistName}
              onDownload={handleDownload}
            />
          </div>

          {/* Upload Section */}
          <UploadCard
            status={downloadStatus}
            progress={
              downloadStatus === 'uploading' ||
              downloadStatus === 'updating_playlist_js' ||
              downloadStatus === 'restarting_bot'
                ? progress
                : null
            }
            error={downloadStatus === 'failed' ? error : null}
            selectedTracks={selectedTracks}
            playlistName={downloadedPlaylistName ?? ''}
            disabled={!canUpload}
            onUpload={handleUpload}
            onRestartBot={restartBot}
          />

          {/* Track List */}
          {trackCount > 0 ? (
            <TrackList
              index={localIndex}
              selectedTracks={selectedTracks}
              onSelectionChange={setSelectedTracks}
              playlistFilter={playlistFilter}
              playlists={localPlaylists}
              onPlaylistFilterChange={setPlaylistFilter}
            />
          ) : (
            <div className="glass-subtle rounded-xl p-12 border border-white/10 text-center">
              {syncStatus === 'idle' ? (
                <>
                  <Music2 className="w-16 h-16 mx-auto mb-4 text-muted opacity-50" />
                  <h3 className="text-lg font-semibold text-secondary mb-2">
                    No Local Tracks
                  </h3>
                  <p className="text-sm text-muted max-w-md mx-auto">
                    Sync from the server first to pull the existing music index,
                    then download playlists to add new tracks.
                  </p>
                </>
              ) : syncStatus === 'syncing' ? (
                <>
                  <Loader2 className="w-16 h-16 mx-auto mb-4 text-cyan-400 animate-spin" />
                  <h3 className="text-lg font-semibold text-secondary mb-2">
                    Syncing...
                  </h3>
                  <p className="text-sm text-muted">
                    Pulling index and playlists from server
                  </p>
                </>
              ) : (
                <>
                  <Music2 className="w-16 h-16 mx-auto mb-4 text-muted opacity-50" />
                  <h3 className="text-lg font-semibold text-secondary mb-2">
                    Index is Empty
                  </h3>
                  <p className="text-sm text-muted max-w-md mx-auto">
                    Download a YouTube playlist to add tracks to the index.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
