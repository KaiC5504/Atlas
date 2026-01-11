// Auto-update types

export type UpdateStatus =
  | 'idle'           // No update activity
  | 'checking'       // Checking for updates
  | 'available'      // Update found, ready to download
  | 'downloading'    // Download in progress
  | 'downloaded'     // Ready to install
  | 'installing'     // Installation in progress
  | 'error';         // Error occurred

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  date?: string;
  body?: string;      // Changelog/release notes
}

export interface UpdateProgress {
  downloaded: number;  // Bytes downloaded
  total: number;       // Total bytes
  percent: number;     // 0-100
}

export interface UpdateState {
  status: UpdateStatus;
  info: UpdateInfo | null;
  progress: UpdateProgress | null;
  error: string | null;
}

export interface UpdateProgressEvent {
  downloaded: number;
  total: number;
  percent: number;
}

export interface UpdateAvailableEvent {
  version: string;
  current_version: string;
  date?: string;
  body?: string;
}

export interface UpdateErrorEvent {
  message: string;
}
