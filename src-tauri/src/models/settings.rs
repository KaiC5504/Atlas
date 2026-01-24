use serde::{Deserialize, Serialize};
use std::collections::HashMap;

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
    /// Selected gacha accounts for each game (game -> uid)
    #[serde(default)]
    pub selected_gacha_accounts: Option<HashMap<String, String>>,
    /// User's display name for the profile
    #[serde(default)]
    pub user_display_name: Option<String>,
    /// Path to the user's avatar image (stored locally)
    #[serde(default)]
    pub user_avatar_path: Option<String>,
    /// Whether the floating partner widget is enabled
    #[serde(default = "default_partner_widget_enabled")]
    pub partner_widget_enabled: bool,
    /// X position of the floating partner widget
    #[serde(default)]
    pub partner_widget_position_x: Option<f64>,
    /// Y position of the floating partner widget
    #[serde(default)]
    pub partner_widget_position_y: Option<f64>,
}

fn default_partner_widget_enabled() -> bool {
    true
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
            selected_gacha_accounts: None,
            user_display_name: None,
            user_avatar_path: None,
            partner_widget_enabled: true,
            partner_widget_position_x: None,
            partner_widget_position_y: None,
        }
    }
}
