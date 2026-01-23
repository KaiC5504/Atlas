// Settings command handlers - real implementation with file storage
use crate::file_manager::{read_json_file, write_json_file};
use crate::models::Settings;
use crate::utils::get_settings_json_path;
use log::debug;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct UpdateSettingsParams {
    pub download_path: Option<String>,
    pub default_quality: Option<String>,
    pub max_concurrent_downloads: Option<u32>,
    pub max_concurrent_ml_jobs: Option<u32>,
    pub atlas_project_path: Option<String>,
    pub remote_update_path: Option<String>,
    pub update_url_base: Option<String>,
    pub developer_mode_enabled: Option<bool>,
    pub sidebar_order: Option<Vec<String>>,
    pub hidden_sidebar_items: Option<Vec<String>>,
    pub discord_rich_presence_enabled: Option<bool>,
    pub run_on_startup: Option<bool>,
    pub close_to_tray: Option<bool>,
}

/// Get current settings from the JSON file
#[tauri::command]
pub fn get_settings() -> Result<Settings, String> {
    let path = get_settings_json_path();

    if !path.exists() {
        return Ok(Settings::default());
    }

    read_json_file(&path)
}

/// Update settings with partial update support
#[tauri::command]
pub fn update_settings(settings: UpdateSettingsParams) -> Result<Settings, String> {
    let path = get_settings_json_path();

    let mut current_settings: Settings = if path.exists() {
        read_json_file(&path)?
    } else {
        Settings::default()
    };

    // Apply partial updates
    if let Some(download_path) = settings.download_path {
        current_settings.download_path = download_path;
    }
    if let Some(default_quality) = settings.default_quality {
        current_settings.default_quality = default_quality;
    }
    if let Some(max_concurrent_downloads) = settings.max_concurrent_downloads {
        current_settings.max_concurrent_downloads = max_concurrent_downloads;
    }
    if let Some(max_concurrent_ml_jobs) = settings.max_concurrent_ml_jobs {
        current_settings.max_concurrent_ml_jobs = max_concurrent_ml_jobs;
    }
    if let Some(atlas_project_path) = settings.atlas_project_path {
        current_settings.atlas_project_path = if atlas_project_path.is_empty() {
            None
        } else {
            Some(atlas_project_path)
        };
    }
    if let Some(remote_update_path) = settings.remote_update_path {
        current_settings.remote_update_path = if remote_update_path.is_empty() {
            None
        } else {
            Some(remote_update_path)
        };
    }
    if let Some(update_url_base) = settings.update_url_base {
        current_settings.update_url_base = if update_url_base.is_empty() {
            None
        } else {
            Some(update_url_base)
        };
    }
    if let Some(developer_mode_enabled) = settings.developer_mode_enabled {
        current_settings.developer_mode_enabled = developer_mode_enabled;
    }
    if let Some(sidebar_order) = settings.sidebar_order {
        current_settings.sidebar_order = if sidebar_order.is_empty() {
            None
        } else {
            Some(sidebar_order)
        };
    }
    if let Some(hidden_sidebar_items) = settings.hidden_sidebar_items {
        current_settings.hidden_sidebar_items = if hidden_sidebar_items.is_empty() {
            None
        } else {
            Some(hidden_sidebar_items)
        };
    }
    if let Some(discord_rich_presence_enabled) = settings.discord_rich_presence_enabled {
        current_settings.discord_rich_presence_enabled = discord_rich_presence_enabled;
    }
    if let Some(run_on_startup) = settings.run_on_startup {
        current_settings.run_on_startup = run_on_startup;
    }
    if let Some(close_to_tray) = settings.close_to_tray {
        current_settings.close_to_tray = close_to_tray;
    }

    write_json_file(&path, &current_settings)?;

    debug!("Updated settings: {:?}", current_settings);

    Ok(current_settings)
}
