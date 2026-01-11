// ML Job types

export type MLJobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface OutputFile {
  stem: string; // e.g., "vocals", "drums", "bass", "other"
  path: string;
}

export interface MLJob {
  id: string;
  input_file: string;
  model: string; // e.g., "htdemucs_ft"
  output_dir: string | null;
  status: MLJobStatus;
  progress: number; // 0-100
  stage: string | null; // e.g., "Processing segment 5/10"
  output_files: OutputFile[] | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface SubmitMLJobParams {
  input_file: string;
  model: string;
  output_dir: string | null; // null = use default
}

export interface SubmitMLJobResult {
  job_id: string;
}

export interface CancelMLJobParams {
  job_id: string;
}

export interface DeleteMLJobParams {
  job_id: string;
  delete_output: boolean;
}

export interface Model {
  id: string; // e.g., "htdemucs_ft"
  name: string; // e.g., "Demucs Fine-Tuned"
  description: string;
  is_downloaded: boolean;
}

// Event payloads
export interface MLJobProgressEvent {
  job_id: string;
  percent: number;
  stage: string;
}

export interface MLJobCompletedEvent {
  job_id: string;
  output_files: OutputFile[];
}

export interface MLJobFailedEvent {
  job_id: string;
  error: string;
}

export interface ModelDownloadProgressEvent {
  model_id: string;
  percent: number;
}
