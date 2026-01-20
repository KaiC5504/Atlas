use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AudioDetectionStatus {
    Pending,
    Processing,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimestampSegment {
    pub start_seconds: f64,
    pub end_seconds: f64,
    pub confidence: f64, 
    pub label: String,   
}

/// Result of audio event detection inference
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioDetectionResult {
    pub segments: Vec<TimestampSegment>,
    pub total_duration_seconds: f64,
    pub detected_duration_seconds: f64,
    pub model_version: String,
}

/// Audio detection job status and metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioDetectionJob {
    pub id: String,
    pub input_file: String,
    pub status: AudioDetectionStatus,
    pub progress: u8, 
    pub stage: Option<String>,
    pub created_at: String,
    pub completed_at: Option<String>,
    pub error: Option<String>,
    pub result: Option<AudioDetectionResult>,
}

impl AudioDetectionJob {
    pub fn new(id: String, input_file: String) -> Self {
        Self {
            id,
            input_file,
            status: AudioDetectionStatus::Pending,
            progress: 0,
            stage: None,
            created_at: chrono::Utc::now().to_rfc3339(),
            completed_at: None,
            error: None,
            result: None,
        }
    }
}

/// Model configuration for inference
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelConfig {
    pub model_path: Option<String>,
    pub window_size_ms: u32,
    pub hop_size_ms: u32,
    pub confidence_threshold: f64,
    pub min_segment_duration_ms: u32,
    pub merge_gap_ms: u32,
}

impl Default for ModelConfig {
    fn default() -> Self {
        Self {
            model_path: None,
            window_size_ms: 1000,
            hop_size_ms: 250,
            confidence_threshold: 0.7,
            min_segment_duration_ms: 500,
            merge_gap_ms: 300,
        }
    }
}

/// Training sample entry for manifest
#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)] 
pub struct TrainingSample {
    pub file: String,
    pub label: String, 
    pub source: String,
}

/// Training data manifest
#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct TrainingManifest {
    pub positive_samples: Vec<TrainingSample>,
    pub negative_samples: Vec<TrainingSample>,
    pub hard_negative_samples: Vec<TrainingSample>,
}

// ============================================================================
// Enhance Model Mode Types
// ============================================================================

/// A single feedback sample from user labeling
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeedbackSample {
    pub id: String,
    pub source_file: String,
    pub start_seconds: f64,
    pub end_seconds: f64,
    pub original_confidence: f64,
    pub user_label: String, // "correct" or "wrong"
    pub is_manual: bool,
    pub created_at: String,
}

/// A manually-marked segment (false negative)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManualSegment {
    pub id: String,
    pub start_seconds: f64,
    pub end_seconds: f64,
    pub created_at: String,
}

/// A feedback session containing all corrections for a detection job
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeedbackSession {
    pub id: String,
    pub source_file: String,
    pub job_id: String,
    pub model_version: String,
    pub samples: Vec<FeedbackSample>,
    pub manual_positives: Vec<ManualSegment>,
    pub created_at: String,
    pub updated_at: String,
}

/// UI-facing training configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UITrainingConfig {
    pub epochs: u32,
    pub learning_rate: f64,
    #[serde(default)]
    pub bulk_positive_files: Vec<String>,
    #[serde(default = "default_fine_tune")]
    pub fine_tune: bool,
    #[serde(default = "default_freeze_layers")]
    pub freeze_layers: bool,
    #[serde(default = "default_unfreeze_after")]
    pub unfreeze_after: u32,
}

fn default_fine_tune() -> bool {
    true
}

fn default_freeze_layers() -> bool {
    true
}

fn default_unfreeze_after() -> u32 {
    5
}

impl Default for UITrainingConfig {
    fn default() -> Self {
        Self {
            epochs: 15,           // Reduced from 30 for fine-tuning
            learning_rate: 0.0001, // Reduced from 0.001 for fine-tuning
            bulk_positive_files: vec![],
            fine_tune: true,
            freeze_layers: true,
            unfreeze_after: 5,
        }
    }
}
