use crate::file_manager::{read_json_file, write_json_file};
use crate::models::{Download, DownloadStatus, Settings};
use crate::process_manager::{spawn_python_worker_async, WorkerMessage};
use crate::utils::{get_downloads_json_path, get_settings_json_path, get_videos_dir};
use log::debug;
use parking_lot::RwLock;
use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;

struct DownloadsCache {
    data: Option<Vec<Download>>,
    last_updated: Option<Instant>,
}

impl DownloadsCache {
    const TTL: Duration = Duration::from_secs(5);

    fn new() -> Self {
        Self { data: None, last_updated: None }
    }

    fn get(&self) -> Option<&Vec<Download>> {
        if let (Some(data), Some(updated)) = (&self.data, self.last_updated) {
            if updated.elapsed() < Self::TTL {
                return Some(data);
            }
        }
        None
    }

    fn set(&mut self, data: Vec<Download>) {
        self.data = Some(data);
        self.last_updated = Some(Instant::now());
    }

    fn invalidate(&mut self) {
        self.data = None;
        self.last_updated = None;
    }
}

lazy_static::lazy_static! {
    static ref DOWNLOADS_CACHE: RwLock<DownloadsCache> = RwLock::new(DownloadsCache::new());
}

/// Progress event payload for frontend
#[derive(Debug, Clone, Serialize)]
pub struct DownloadProgressEvent {
    pub job_id: String,
    pub percent: u8,
    pub stage: String,
    pub speed: Option<String>,
    pub eta: Option<String>,
}

/// Download status change event
#[derive(Debug, Clone, Serialize)]
pub struct DownloadStatusEvent {
    pub job_id: String,
    pub status: String,
    pub title: Option<String>,
    pub file_path: Option<String>,
    pub error: Option<String>,
}

/// Resolve Windows special folder names to actual paths
fn resolve_special_folder(name: &str) -> Option<PathBuf> {
    match name.to_lowercase().as_str() {
        "downloads" | "download" => dirs::download_dir(),
        "desktop" => dirs::desktop_dir(),
        "documents" | "document" => dirs::document_dir(),
        "videos" | "video" => dirs::video_dir(),
        "music" => dirs::audio_dir(),
        "pictures" | "picture" => dirs::picture_dir(),
        _ => None,
    }
}

/// Get the download directory from settings
fn get_download_directory() -> PathBuf {
    let settings_path = get_settings_json_path();

    if settings_path.exists() {
        if let Ok(settings) = read_json_file::<Settings>(&settings_path) {
            let download_path = settings.download_path.trim();

            if !download_path.is_empty() {
                if let Some(special_path) = resolve_special_folder(download_path) {
                    if !special_path.exists() {
                        let _ = fs::create_dir_all(&special_path);
                    }
                    return special_path;
                }

                let path = PathBuf::from(download_path);
                if path.is_absolute() {
                    if !path.exists() {
                        let _ = fs::create_dir_all(&path);
                    }
                    return path;
                }

                // If it's a relative path, make it relative to Downloads folder (not AppData)
                let downloads_base = dirs::download_dir().unwrap_or_else(get_videos_dir);
                let custom_path = downloads_base.join(download_path);
                if !custom_path.exists() {
                    let _ = fs::create_dir_all(&custom_path);
                }
                return custom_path;
            }
        }
    }

    dirs::download_dir().unwrap_or_else(get_videos_dir)
}

/// Get settings with defaults if file doesn't exist
fn get_current_settings() -> Settings {
    let settings_path = get_settings_json_path();
    if settings_path.exists() {
        read_json_file::<Settings>(&settings_path).unwrap_or_default()
    } else {
        Settings::default()
    }
}

/// Count currently active (downloading) downloads
fn count_active_downloads() -> Result<u32, String> {
    let path = get_downloads_json_path();

    if !path.exists() {
        return Ok(0);
    }

    let downloads: Vec<Download> = read_json_file(&path)?;
    let active_count = downloads
        .iter()
        .filter(|d| d.status == DownloadStatus::Downloading)
        .count() as u32;

    Ok(active_count)
}

/// Result of validating a download path
#[derive(Debug, Clone, Serialize)]
pub struct DownloadPathValidation {
    /// Whether the path is valid and usable
    pub valid: bool,
    /// The resolved absolute path
    pub resolved_path: String,
    /// Whether the path currently exists
    pub exists: bool,
    /// Whether this is a special folder (Downloads, Desktop, etc.)
    pub is_special_folder: bool,
    /// Human-readable status message
    pub message: String,
}

/// Validate and resolve a download path without saving it
#[tauri::command]
pub fn validate_download_path(path: String) -> DownloadPathValidation {
    let input_path = path.trim();

    // Empty path - will use default
    if input_path.is_empty() {
        let default_path = dirs::download_dir().unwrap_or_else(get_videos_dir);
        return DownloadPathValidation {
            valid: true,
            resolved_path: default_path.to_string_lossy().to_string(),
            exists: default_path.exists(),
            is_special_folder: true,
            message: "Will use default Downloads folder".to_string(),
        };
    }

    // Check if it's a special folder name
    if let Some(special_path) = resolve_special_folder(input_path) {
        return DownloadPathValidation {
            valid: true,
            resolved_path: special_path.to_string_lossy().to_string(),
            exists: special_path.exists(),
            is_special_folder: true,
            message: format!("Recognized as Windows {} folder", input_path),
        };
    }

    // Check if it's an absolute path
    let path_buf = PathBuf::from(input_path);
    if path_buf.is_absolute() {
        // Check if the path or its parent exists
        let exists = path_buf.exists();
        let parent_exists = path_buf.parent().map(|p| p.exists()).unwrap_or(false);

        if exists {
            // Check if it's a directory
            if path_buf.is_dir() {
                return DownloadPathValidation {
                    valid: true,
                    resolved_path: path_buf.to_string_lossy().to_string(),
                    exists: true,
                    is_special_folder: false,
                    message: "Path exists and is ready to use".to_string(),
                };
            } else {
                return DownloadPathValidation {
                    valid: false,
                    resolved_path: path_buf.to_string_lossy().to_string(),
                    exists: true,
                    is_special_folder: false,
                    message: "Path exists but is a file, not a directory".to_string(),
                };
            }
        } else if parent_exists {
            return DownloadPathValidation {
                valid: true,
                resolved_path: path_buf.to_string_lossy().to_string(),
                exists: false,
                is_special_folder: false,
                message: "Folder will be created when downloading".to_string(),
            };
        } else {
            return DownloadPathValidation {
                valid: false,
                resolved_path: path_buf.to_string_lossy().to_string(),
                exists: false,
                is_special_folder: false,
                message: "Parent directory does not exist".to_string(),
            };
        }
    }

    // Relative path - will be relative to Downloads folder
    let downloads_base = dirs::download_dir().unwrap_or_else(get_videos_dir);
    let resolved = downloads_base.join(input_path);
    DownloadPathValidation {
        valid: true,
        resolved_path: resolved.to_string_lossy().to_string(),
        exists: resolved.exists(),
        is_special_folder: false,
        message: format!(
            "Will create \"{}\" folder inside Downloads{}",
            input_path,
            if resolved.exists() { " (already exists)" } else { "" }
        ),
    }
}

#[tauri::command]
pub fn list_downloads() -> Result<Vec<Download>, String> {
    {
        let cache = DOWNLOADS_CACHE.read();
        if let Some(data) = cache.get() {
            return Ok(data.clone());
        }
    }

    let path = get_downloads_json_path();

    if !path.exists() {
        return Ok(vec![]);
    }

    let downloads: Vec<Download> = read_json_file(&path)?;

    {
        let mut cache = DOWNLOADS_CACHE.write();
        cache.set(downloads.clone());
    }

    Ok(downloads)
}

#[tauri::command]
pub fn add_download(url: String, quality: String) -> Result<serde_json::Value, String> {
    let path = get_downloads_json_path();

    // Generate unique ID
    let job_id = uuid::Uuid::new_v4().to_string();

    // Create new download entry
    let download = Download::new(job_id.clone(), url.clone(), quality.clone());

    // Read existing downloads
    let mut downloads: Vec<Download> = if path.exists() {
        read_json_file(&path)?
    } else {
        vec![]
    };

    // Add new download
    downloads.push(download);

    write_json_file(&path, &downloads)?;
    DOWNLOADS_CACHE.write().invalidate();

    debug!("Added download: {} with quality: {}", url, quality);

    Ok(serde_json::json!({ "job_id": job_id }))
}

#[tauri::command]
pub async fn start_download(app: AppHandle, job_id: String) -> Result<serde_json::Value, String> {
    let path = get_downloads_json_path();

    if !path.exists() {
        return Err("No downloads file found".to_string());
    }

    let settings = get_current_settings();
    let active_count = count_active_downloads()?;

    if active_count >= settings.max_concurrent_downloads {
        return Err(format!(
            "Maximum concurrent downloads reached ({}/{}). Please wait for a download to complete.",
            active_count, settings.max_concurrent_downloads
        ));
    }

    let mut downloads: Vec<Download> = read_json_file(&path)?;

    let (url, quality) = {
        let download = downloads
            .iter_mut()
            .find(|d| d.id == job_id)
            .ok_or_else(|| format!("Download not found: {}", job_id))?;

        if download.status != DownloadStatus::Pending {
            return Err(format!(
                "Cannot start download with status {:?}",
                download.status
            ));
        }

        // Update status to downloading
        download.status = DownloadStatus::Downloading;

        // Clone values we need for worker input
        (download.url.clone(), download.quality.clone())
    };

    write_json_file(&path, &downloads)?;
    DOWNLOADS_CACHE.write().invalidate();

    let _ = app.emit(
        "download:started",
        DownloadStatusEvent {
            job_id: job_id.clone(),
            status: "downloading".to_string(),
            title: None,
            file_path: None,
            error: None,
        },
    );

    // Create a channel for progress updates
    let (tx, mut rx) = mpsc::channel::<WorkerMessage>(100);

    // Prepare worker input
    let output_dir = get_download_directory();
    let worker_input = serde_json::json!({
        "url": url,
        "quality": quality,
        "output_dir": output_dir.to_string_lossy(),
        "job_id": job_id.clone()
    });

    // Clone values needed for the spawned task
    let job_id_clone = job_id.clone();
    let app_clone = app.clone();

    // Spawn a task to handle progress updates
    let progress_handle = tauri::async_runtime::spawn(async move {
        while let Some(message) = rx.recv().await {
            if let WorkerMessage::Progress { percent, stage } = message {
                // Parse speed and ETA from stage if present
                let (speed, eta) = parse_stage_info(&stage);

                // Emit progress event to frontend
                let _ = app_clone.emit(
                    "download:progress",
                    DownloadProgressEvent {
                        job_id: job_id_clone.clone(),
                        percent,
                        stage: stage.clone(),
                        speed,
                        eta,
                    },
                );

            }
        }
    });

    // Spawn the Python worker asynchronously
    let result = spawn_python_worker_async("yt_dlp_worker.py", worker_input, Some(tx)).await;

    // Wait for progress handler to finish
    let _ = progress_handle.await;

    // Re-read downloads to update with result
    let mut downloads: Vec<Download> = read_json_file(&path)?;
    let download = downloads
        .iter_mut()
        .find(|d| d.id == job_id)
        .ok_or_else(|| format!("Download not found after worker: {}", job_id))?;

    match result {
        Ok(data) => {
            // Extract file_path from result
            let file_path = data
                .get("file_path")
                .and_then(|v| v.as_str())
                .map(String::from);

            let title = data.get("title").and_then(|v| v.as_str()).map(String::from);

            // Update download with success info
            download.status = DownloadStatus::Completed;
            download.progress = 100;
            download.title = title.clone();
            download.file_path = file_path.clone();
            download.completed_at = Some(chrono::Utc::now().to_rfc3339());
            download.speed = None;
            download.eta = None;

            write_json_file(&path, &downloads)?;
            DOWNLOADS_CACHE.write().invalidate();

            // Emit completion event
            let _ = app.emit(
                "download:completed",
                DownloadStatusEvent {
                    job_id: job_id.clone(),
                    status: "completed".to_string(),
                    title,
                    file_path: file_path.clone(),
                    error: None,
                },
            );

            Ok(serde_json::json!({
                "status": "completed",
                "file_path": file_path
            }))
        }
        Err(error) => {
            // Update download with failure info
            download.status = DownloadStatus::Failed;
            download.error = Some(error.clone());

            write_json_file(&path, &downloads)?;
            DOWNLOADS_CACHE.write().invalidate();

            // Emit failure event
            let _ = app.emit(
                "download:failed",
                DownloadStatusEvent {
                    job_id: job_id.clone(),
                    status: "failed".to_string(),
                    title: None,
                    file_path: None,
                    error: Some(error.clone()),
                },
            );

            Err(error)
        }
    }
}

/// Parse speed and ETA from the stage string
fn parse_stage_info(stage: &str) -> (Option<String>, Option<String>) {
    let mut speed = None;
    let mut eta = None;

    // Look for speed pattern
    if let Some(start) = stage.find(char::is_numeric) {
        let rest = &stage[start..];
        if rest.contains("MB/s") || rest.contains("KB/s") {
            if let Some(end) = rest.find("/s") {
                speed = Some(rest[..end + 2].to_string());
            }
        }
    }

    // Look for ETA pattern
    if stage.contains("ETA:") {
        if let Some(start) = stage.find("ETA:") {
            eta = Some(stage[start + 4..].trim().to_string());
        }
    }

    (speed, eta)
}

/// Cancel a pending or in-progress download
#[tauri::command]
pub fn cancel_download(job_id: String) -> Result<(), String> {
    let path = get_downloads_json_path();

    if !path.exists() {
        return Err("No downloads file found".to_string());
    }

    let mut downloads: Vec<Download> = read_json_file(&path)?;

    // Find and update the download
    let mut found = false;
    for download in &mut downloads {
        if download.id == job_id {
            if download.status == DownloadStatus::Pending
                || download.status == DownloadStatus::Downloading
            {
                download.status = DownloadStatus::Cancelled;
                found = true;
            } else {
                return Err(format!(
                    "Cannot cancel download with status {:?}",
                    download.status
                ));
            }
            break;
        }
    }

    if !found {
        return Err(format!("Download not found: {}", job_id));
    }

    write_json_file(&path, &downloads)?;
    DOWNLOADS_CACHE.write().invalidate();

    debug!("Cancelled download: {}", job_id);
    Ok(())
}

/// Delete a download from the list and optionally delete the file
#[tauri::command]
pub fn delete_download(job_id: String, delete_file: bool) -> Result<(), String> {
    let path = get_downloads_json_path();

    if !path.exists() {
        return Err("No downloads file found".to_string());
    }

    let mut downloads: Vec<Download> = read_json_file(&path)?;

    // Find the download to delete
    let download_index = downloads.iter().position(|d| d.id == job_id);

    match download_index {
        Some(index) => {
            let download = &downloads[index];

            // Delete the file if requested and file exists
            if delete_file {
                if let Some(file_path) = &download.file_path {
                    if std::path::Path::new(file_path).exists() {
                        fs::remove_file(file_path)
                            .map_err(|e| format!("Failed to delete file: {}", e))?;
                        debug!("Deleted file: {}", file_path);
                    }
                }
            }

            // Remove from list
            downloads.remove(index);
            write_json_file(&path, &downloads)?;
            DOWNLOADS_CACHE.write().invalidate();

            debug!("Deleted download: {}", job_id);
            Ok(())
        }
        None => Err(format!("Download not found: {}", job_id)),
    }
}
