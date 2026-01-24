// Settings command handlers - real implementation with file storage
use crate::file_manager::{read_json_file, write_json_file};
use crate::models::Settings;
use crate::utils::{get_settings_json_path, get_data_dir};
use log::debug;
use serde::Deserialize;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};

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
    pub auto_restore_enabled: Option<bool>,
    pub selected_gacha_accounts: Option<HashMap<String, String>>,
    pub user_display_name: Option<String>,
    pub user_avatar_path: Option<String>,
    pub partner_widget_enabled: Option<bool>,
    pub partner_widget_position_x: Option<f64>,
    pub partner_widget_position_y: Option<f64>,
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
    if let Some(auto_restore_enabled) = settings.auto_restore_enabled {
        current_settings.auto_restore_enabled = auto_restore_enabled;
    }
    if let Some(selected_gacha_accounts) = settings.selected_gacha_accounts {
        current_settings.selected_gacha_accounts = if selected_gacha_accounts.is_empty() {
            None
        } else {
            Some(selected_gacha_accounts)
        };
    }
    if let Some(user_display_name) = settings.user_display_name {
        current_settings.user_display_name = if user_display_name.is_empty() {
            None
        } else {
            Some(user_display_name)
        };
    }
    if let Some(user_avatar_path) = settings.user_avatar_path {
        current_settings.user_avatar_path = if user_avatar_path.is_empty() {
            None
        } else {
            Some(user_avatar_path)
        };
    }
    if let Some(partner_widget_enabled) = settings.partner_widget_enabled {
        current_settings.partner_widget_enabled = partner_widget_enabled;
    }
    if let Some(partner_widget_position_x) = settings.partner_widget_position_x {
        current_settings.partner_widget_position_x = Some(partner_widget_position_x);
    }
    if let Some(partner_widget_position_y) = settings.partner_widget_position_y {
        current_settings.partner_widget_position_y = Some(partner_widget_position_y);
    }

    write_json_file(&path, &current_settings)?;

    debug!("Updated settings: {:?}", current_settings);

    Ok(current_settings)
}

/// Save user avatar image from base64 data
#[tauri::command]
pub fn save_user_avatar(image_data: String, file_extension: String) -> Result<String, String> {
    // Decode base64 image data
    let image_bytes = BASE64.decode(&image_data)
        .map_err(|e| format!("Failed to decode image: {}", e))?;

    // Create avatars directory
    let avatars_dir = get_data_dir().join("avatars");
    fs::create_dir_all(&avatars_dir)
        .map_err(|e| format!("Failed to create avatars directory: {}", e))?;

    // Save with a fixed filename (overwrite previous avatar)
    let avatar_path = avatars_dir.join(format!("user_avatar.{}", file_extension));
    fs::write(&avatar_path, image_bytes)
        .map_err(|e| format!("Failed to save avatar: {}", e))?;

    let path_str = avatar_path.to_string_lossy().to_string();

    // Update settings with new avatar path
    let settings_path = get_settings_json_path();
    let mut current_settings: Settings = if settings_path.exists() {
        read_json_file(&settings_path)?
    } else {
        Settings::default()
    };
    current_settings.user_avatar_path = Some(path_str.clone());
    write_json_file(&settings_path, &current_settings)?;

    debug!("Saved user avatar to: {}", path_str);

    Ok(path_str)
}

/// Get the full path to the user's avatar if it exists
#[tauri::command]
pub fn get_user_avatar_path() -> Result<Option<String>, String> {
    let settings_path = get_settings_json_path();
    if !settings_path.exists() {
        return Ok(None);
    }

    let settings: Settings = read_json_file(&settings_path)?;

    // Verify the file still exists
    if let Some(ref path) = settings.user_avatar_path {
        let path_buf = PathBuf::from(path);
        if path_buf.exists() {
            return Ok(Some(path.clone()));
        }
    }

    Ok(None)
}

/// Get user avatar as base64 data URL (bypasses asset protocol)
#[tauri::command]
pub fn get_user_avatar_base64() -> Result<Option<String>, String> {
    let settings_path = get_settings_json_path();
    if !settings_path.exists() {
        return Ok(None);
    }

    let settings: Settings = read_json_file(&settings_path)?;

    if let Some(ref path) = settings.user_avatar_path {
        let path_buf = PathBuf::from(path);
        if path_buf.exists() {
            // Read file and encode as base64
            let image_bytes = fs::read(&path_buf)
                .map_err(|e| format!("Failed to read avatar file: {}", e))?;

            // Determine MIME type from extension
            let extension = path_buf.extension()
                .and_then(|e| e.to_str())
                .unwrap_or("png")
                .to_lowercase();

            let mime_type = match extension.as_str() {
                "jpg" | "jpeg" => "image/jpeg",
                "png" => "image/png",
                "gif" => "image/gif",
                "webp" => "image/webp",
                _ => "image/png",
            };

            let base64_data = BASE64.encode(&image_bytes);
            let data_url = format!("data:{};base64,{}", mime_type, base64_data);

            return Ok(Some(data_url));
        }
    }

    Ok(None)
}
