export type AudioDetectionStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface TimestampSegment {
  start_seconds: number;
  end_seconds: number;
  confidence: number; // 0.0 - 1.0
  label: 'target_audio';
}

export interface AudioDetectionResult {
  segments: TimestampSegment[];
  total_duration_seconds: number;
  detected_duration_seconds: number;
  model_version: string;
}

export interface AudioDetectionJob {
  id: string;
  input_file: string;
  status: AudioDetectionStatus;
  progress: number;
  stage: string | null;
  created_at: string;
  completed_at: string | null;
  error: string | null;
  result: AudioDetectionResult | null;
}

export interface ModelConfig {
  model_path: string | null; 
  window_size_ms: number; 
  hop_size_ms: number; 
  confidence_threshold: number; 
  min_segment_duration_ms: number; 
  merge_gap_ms: number; 
}

export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  model_path: null,
  window_size_ms: 1000,
  hop_size_ms: 250,
  confidence_threshold: 0.7,
  min_segment_duration_ms: 500,
  merge_gap_ms: 300,
};

// Command parameters
export interface SubmitAudioDetectionParams {
  input_file: string;
  config: ModelConfig | null; 
}

export interface SubmitAudioDetectionResult {
  job_id: string;
}

// Event payloads
export interface AudioDetectionProgressEvent {
  job_id: string;
  percent: number;
  stage: string;
}

export interface AudioDetectionCompletedEvent {
  job_id: string;
  result: AudioDetectionResult;
}

export interface AudioDetectionFailedEvent {
  job_id: string;
  error: string;
}

// Training data manifest types 
export interface TrainingSample {
  file: string;
  label: 'target_audio' | 'other';
  source: string; 
}

export interface TrainingManifest {
  positive_samples: TrainingSample[];
  negative_samples: TrainingSample[];
  hard_negative_samples: TrainingSample[];
}

// Training configuration
export interface TrainingConfig {
  batch_size: number;
  learning_rate: number;
  weight_decay: number;
  epochs: number;
  early_stopping_patience: number;
  augmentation: {
    time_mask_max_width: number;
    freq_mask_max_width: number;
    gain_range: [number, number]; 
    mixup_alpha: number;
  };
  class_weights: {
    positive: number;
    negative: number;
  };
  output_dir: string;
  export_onnx: boolean;
}
