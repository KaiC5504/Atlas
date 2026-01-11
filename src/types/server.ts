// Server Monitoring types

export interface ServerConfig {
  host: string;
  port: number;
  username: string;
  domain?: string;
}

export interface SSHCredentials {
  password: string;
  saved_at: string;
}

export type CommandStatus = 'running' | 'completed' | 'failed';

export interface CommandResult {
  command: string;
  status: CommandStatus;
  exit_code?: number;
  output: string;
  error?: string;
  started_at: string;
  completed_at?: string;
}

export type QuickActionCategory = 'login' | 'status' | 'service' | 'logs';

export interface QuickAction {
  id: string;
  label: string;
  command: string;
  category: QuickActionCategory;
  icon: string;
  description: string;
}

export interface SystemStatus {
  uptime: string;
  load_average: string;
  memory_used: string;
  memory_total: string;
  disk_used: string;
  disk_total: string;
  cpu_usage: string;
}

// Tauri event payloads
export interface SSHOutputEvent {
  session_id: string;
  output: string;
  is_stderr: boolean;
}

export interface SSHCompleteEvent {
  session_id: string;
  exit_code: number;
  error?: string;
}

// Terminal line for display
export interface TerminalLine {
  text: string;
  isStderr: boolean;
  isCommand?: boolean;
  timestamp: Date;
}

// Update Release types
export type UpdateReleaseStep = 'idle' | 'uploading' | 'updating_json' | 'setting_ownership' | 'verifying' | 'completed' | 'failed';

export interface UpdateReleaseState {
  step: UpdateReleaseStep;
  progress: number;
  error?: string;
}

export interface UploadProgressEvent {
  session_id: string;
  percent: number;
  stage: string;
}

export interface UploadCompleteEvent {
  session_id: string;
  success: boolean;
  error?: string;
}
