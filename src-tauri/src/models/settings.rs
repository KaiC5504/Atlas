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
    #[serde(default)]
    pub developer_mode_enabled: bool,
    #[serde(default)]
    pub sidebar_order: Option<Vec<String>>,
    #[serde(default)]
    pub hidden_sidebar_items: Option<Vec<String>>,
    #[serde(default)]
    pub discord_rich_presence_enabled: bool,
    #[serde(default)]
    pub run_on_startup: bool,
    #[serde(default)]
    pub close_to_tray: bool,
    #[serde(default)]
    pub auto_restore_enabled: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            download_path: String::from("Downloads"),
            default_quality: String::from("best"),
            max_concurrent_downloads: 3,
            max_concurrent_ml_jobs: 1,
            valorant_credentials: None,
            atlas_project_path: None,
            remote_update_path: None,
            update_url_base: None,
            developer_mode_enabled: false,
            sidebar_order: None,
            hidden_sidebar_items: None,
            discord_rich_presence_enabled: false,
            run_on_startup: false,
            close_to_tray: false,
            auto_restore_enabled: false,
        }
    }
}
