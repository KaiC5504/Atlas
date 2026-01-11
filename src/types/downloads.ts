// Download types

export type DownloadStatus = 'pending' | 'downloading' | 'completed' | 'failed' | 'cancelled';

export interface Download {
  id: string;
  url: string;
  quality: string;
  title: string | null;
  status: DownloadStatus;
  progress: number; // 0-100
  speed: string | null; // e.g., "1.5MB/s"
  eta: string | null; // e.g., "00:30"
  file_path: string | null;
  error: string | null;
  created_at: string; // ISO timestamp
  completed_at: string | null;
}

export interface AddDownloadParams {
  url: string;
  quality: string; // e.g., "best", "1080p", "720p", "audio_only"
}

export interface AddDownloadResult {
  job_id: string;
}

export interface CancelDownloadParams {
  job_id: string;
}

export interface DeleteDownloadParams {
  job_id: string;
  delete_file: boolean;
}

// Event payloads - matches Rust event structures
export interface DownloadProgressEvent {
  job_id: string;
  percent: number;
  stage: string;
  speed: string | null;
  eta: string | null;
}

export interface DownloadStatusEvent {
  job_id: string;
  status: string;
  title: string | null;
  file_path: string | null;
  error: string | null;
}
