// Settings data models
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ValorantCredentials {
    pub username: Option<String>,
    pub region: String,
    pub puuid: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub download_path: String,
    pub default_quality: String,
    pub max_concurrent_downloads: u32,
    pub max_concurrent_ml_jobs: u32,
    pub valorant_credentials: Option<ValorantCredentials>,
    #[serde(default)]
    pub atlas_project_path: Option<String>,
    #[serde(default)]
    pub remote_update_path: Option<String>,
    #[serde(default)]
    pub update_url_base: Option<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            download_path: String::from("downloads"),
            default_quality: String::from("best"),
            max_concurrent_downloads: 3,
            max_concurrent_ml_jobs: 1,
            valorant_credentials: None,
            atlas_project_path: None,
            remote_update_path: None,
            update_url_base: None,
        }
    }
}
