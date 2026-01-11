// ML Job data models
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum MLJobStatus {
    Pending,
    Processing,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutputFile {
    pub stem: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MLJob {
    pub id: String,
    pub input_file: String,
    pub model: String,
    pub output_dir: Option<String>,
    pub status: MLJobStatus,
    pub progress: u8, // 0-100
    pub stage: Option<String>,
    pub output_files: Option<Vec<OutputFile>>,
    pub error: Option<String>,
    pub created_at: String,
    pub completed_at: Option<String>,
}

impl MLJob {
    pub fn new(id: String, input_file: String, model: String, output_dir: Option<String>) -> Self {
        Self {
            id,
            input_file,
            model,
            output_dir,
            status: MLJobStatus::Pending,
            progress: 0,
            stage: None,
            output_files: None,
            error: None,
            created_at: chrono::Utc::now().to_rfc3339(),
            completed_at: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Model {
    pub id: String,
    pub name: String,
    pub description: String,
    pub is_downloaded: bool,
}
