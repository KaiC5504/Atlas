// Audio Event Detection data models
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

/// A detected timestamp segment with confidence score
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimestampSegment {
    pub start_seconds: f64,
    pub end_seconds: f64,
    pub confidence: f64, // 0.0 - 1.0
    pub label: String,   // "target_audio"
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
    pub progress: u8, // 0-100
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
pub struct TrainingSample {
    pub file: String,
    pub label: String, // "target_audio" or "other"
    pub source: String,
}

/// Training data manifest
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrainingManifest {
    pub positive_samples: Vec<TrainingSample>,
    pub negative_samples: Vec<TrainingSample>,
    pub hard_negatives: Vec<TrainingSample>,
}
