// Download data models
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum DownloadStatus {
    Pending,
    Downloading,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Download {
    pub id: String,
    pub url: String,
    pub quality: String,
    pub title: Option<String>,
    pub status: DownloadStatus,
    pub progress: u8, // 0-100
    pub speed: Option<String>,
    pub eta: Option<String>,
    pub file_path: Option<String>,
    pub error: Option<String>,
    pub created_at: String,
    pub completed_at: Option<String>,
}

impl Download {
    pub fn new(id: String, url: String, quality: String) -> Self {
        Self {
            id,
            url,
            quality,
            title: None,
            status: DownloadStatus::Pending,
            progress: 0,
            speed: None,
            eta: None,
            file_path: None,
            error: None,
            created_at: chrono::Utc::now().to_rfc3339(),
            completed_at: None,
        }
    }
}
