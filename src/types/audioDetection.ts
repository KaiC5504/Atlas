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

// ============================================================================
// Enhance Model Mode Types
// ============================================================================

// Feedback types for user corrections on inference results
export interface FeedbackSample {
  id: string;
  source_file: string;
  start_seconds: number;
  end_seconds: number;
  original_confidence: number;
  user_label: 'correct' | 'wrong';
  is_manual: boolean; // true for user-added false negatives
  created_at: string;
}

// Manual segment for false negatives (segments the model missed)
export interface ManualSegment {
  id: string;
  start_seconds: number;
  end_seconds: number;
  created_at: string;
}

export interface FeedbackSession {
  id: string;
  source_file: string;
  job_id: string;
  model_version: string;
  samples: FeedbackSample[];
  manual_positives: ManualSegment[]; // User-marked false negatives
  created_at: string;
  updated_at: string;
}

// UI-facing training configuration (simplified)
export interface UITrainingConfig {
  epochs: number;
  learning_rate: number;
  bulk_positive_files?: string[]; // Full audio files to slice as positive samples
  bulk_negative_files?: string[]; // Full audio files to slice as negative samples
  fine_tune?: boolean;           // Default: true - fine-tune existing model instead of training from scratch
  freeze_layers?: boolean;       // Default: true - freeze early conv layers to prevent forgetting
  unfreeze_after?: number;       // Default: 5 - unfreeze all layers after N epochs for gradual fine-tuning
}

export const DEFAULT_UI_TRAINING_CONFIG: UITrainingConfig = {
  epochs: 15,             // Reduced from 30 for fine-tuning
  learning_rate: 0.0001,  // Reduced from 0.001 for fine-tuning
  bulk_positive_files: [],
  bulk_negative_files: [],
  fine_tune: true,
  freeze_layers: true,
  unfreeze_after: 5,
};

// Training progress state
export interface TrainingProgress {
  percent: number;
  epoch: number;
  total_epochs: number;
  stage: string;
  metrics: {
    train_loss: number;
    val_loss: number;
    val_f1: number;
    val_accuracy: number;
  } | null;
}

// Event payloads for training
export interface TrainingProgressEvent {
  percent: number;
  stage: string;
  metrics: TrainingProgress['metrics'];
}

export interface TrainingCompleteEvent {
  success: boolean;
  model_path: string;
  final_metrics: TrainingProgress['metrics'];
  samples_used: number;
}
