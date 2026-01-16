use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::UpdaterExt;
use time::format_description::well_known::Rfc3339;

pub struct DownloadedUpdateBytes(pub Mutex<Option<Vec<u8>>>);

/// Information about an available update
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateInfo {
    pub version: String,
    pub current_version: String,
    pub date: Option<String>,
    pub body: Option<String>,
}

/// Progress information during download
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateProgress {
    pub downloaded: u64,
    pub total: u64,
    pub percent: u32,
}

/// Check if an update is available
#[tauri::command]
pub async fn check_for_update(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    let updater = app.updater().map_err(|e| e.to_string())?;

    match updater.check().await {
        Ok(Some(update)) => {
            let info = UpdateInfo {
                version: update.version.clone(),
                current_version: update.current_version.clone(),
                date: update.date.and_then(|d| d.format(&Rfc3339).ok()),
                body: update.body.clone(),
            };
            Ok(Some(info))
        }
        Ok(None) => Ok(None),
        Err(e) => Err(format!("Failed to check for updates: {}", e)),
    }
}

#[tauri::command]
pub async fn download_update(app: AppHandle) -> Result<(), String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    let app_handle = app.clone();
    let app_handle_complete = app.clone();
    let app_for_store = app.clone();

    let update = updater
        .check()
        .await
        .map_err(|e| format!("Failed to check for updates: {}", e))?
        .ok_or_else(|| "No update available".to_string())?;

    let _ = app.emit("update:downloading", ());

    let bytes = update
        .download(
            |downloaded, total| {
                let total_bytes = total.unwrap_or(0);
                let percent = if total_bytes > 0 {
                    ((downloaded as f64 / total_bytes as f64) * 100.0) as u32
                } else {
                    0
                };

                let progress = UpdateProgress {
                    downloaded: downloaded as u64,
                    total: total_bytes,
                    percent,
                };

                let _ = app_handle.emit("update:progress", progress);
            },
            || {
                let _ = app_handle_complete.emit("update:downloaded", ());
            },
        )
        .await
        .map_err(|e| format!("Failed to download update: {}", e))?;

    let state = app_for_store.state::<DownloadedUpdateBytes>();
    let mut stored_bytes = state.0.lock().map_err(|e| e.to_string())?;
    *stored_bytes = Some(bytes);

    Ok(())
}

#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    let bytes = {
        let state = app.state::<DownloadedUpdateBytes>();
        let mut stored_bytes = state.0.lock().map_err(|e| e.to_string())?;
        stored_bytes
            .take()
            .ok_or_else(|| "No downloaded update available. Please download first.".to_string())?
    };

    let updater = app.updater().map_err(|e| e.to_string())?;

    let update = updater
        .check()
        .await
        .map_err(|e| format!("Failed to check for updates: {}", e))?
        .ok_or_else(|| "No update available".to_string())?;

    update
        .install(bytes)
        .map_err(|e| format!("Failed to install update: {}", e))?;

    Ok(())
}

/// Get the current app version
#[tauri::command]
pub fn get_current_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}
