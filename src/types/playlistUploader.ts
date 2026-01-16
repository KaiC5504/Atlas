export interface TrackMetadata {
  title: string;
  artist: string;
  titlePinyin: string;
  artistPinyin: string;
  searchTerms: string[];
  duration: number;
  thumbnail: string;
}

export interface Playlist {
  name: string;
  tracks: string[];
}

export type MusicIndex = Record<string, TrackMetadata>;

export type SyncStatus = 'idle' | 'syncing' | 'completed' | 'failed';
export type PlaylistDownloadStatus =
  | 'idle'
  | 'fetching_metadata'
  | 'downloading'
  | 'building_index'
  | 'uploading'
  | 'updating_playlist_js'
  | 'restarting_bot'
  | 'completed'
  | 'failed';

export interface PlaylistUploaderProgress {
  stage: string;
  current: number;
  total: number;
  message: string;
}

export interface SyncResult {
  success: boolean;
  indexEntries: number;
  playlistsCount: number;
  playlistNames: string[];
  error?: string;
}

export interface DownloadResult {
  success: boolean;
  downloaded: number;
  cached: number;
  failed: number;
  total: number;
  indexEntries: number;
  playlistTracks: number;
  playlistName?: string;
  downloadedTrackIds: string[];
  error?: string;
}

export interface UploadResult {
  success: boolean;
  uploadedTracks: number;
  skippedTracks: number;
  playlistUploaded: boolean;
  playlistJsUpdated: boolean;
  botRestarted: boolean;
  error?: string;
}

export interface PlaylistUploaderCompleteEvent {
  success: boolean;
  action?: 'sync' | 'download' | 'upload';
  error?: string;
}
