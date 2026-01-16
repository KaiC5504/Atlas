use crate::file_manager::read_json_file;
use crate::models::{
    DownloadResult, MusicIndex, Playlist, PlaylistUploaderProgress, ServerConfig, SyncResult,
    UploadResult,
};
use crate::process_manager::{spawn_python_worker_async, WorkerMessage};
use crate::utils::{
    get_music_dir, get_music_index_json_path, get_music_playlists_dir, get_music_tracks_dir,
    get_server_config_json_path, get_ssh_credentials_json_path,
};
use serde_json::json;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;

/// Get the music directory path
#[tauri::command]
pub fn get_music_directory() -> Result<String, String> {
    Ok(get_music_dir().to_string_lossy().to_string())
}

/// Get local music index
#[tauri::command]
pub fn get_local_music_index() -> Result<MusicIndex, String> {
    let index_path = get_music_index_json_path();
    let tracks_dir = get_music_tracks_dir();

    if !index_path.exists() {
        return Ok(MusicIndex::new());
    }

    let full_index: MusicIndex = read_json_file(&index_path)?;

    // Filter include tracks
    let local_index: MusicIndex = full_index
        .into_iter()
        .filter(|(track_id, _)| {
            let opus_path = tracks_dir.join(format!("{}.opus", track_id));
            opus_path.exists()
        })
        .collect();

    Ok(local_index)
}

/// Get list of local playlist names
#[tauri::command]
pub fn get_local_playlists() -> Result<Vec<String>, String> {
    let playlists_dir = get_music_playlists_dir();

    if !playlists_dir.exists() {
        return Ok(Vec::new());
    }

    let mut names = Vec::new();

    let entries = std::fs::read_dir(&playlists_dir)
        .map_err(|e| format!("Failed to read playlists directory: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().map_or(false, |ext| ext == "json") {
            // Read playlist to get name
            if let Ok(content) = std::fs::read_to_string(&path) {
                if let Ok(playlist) = serde_json::from_str::<Playlist>(&content) {
                    names.push(playlist.name);
                } else {
                    // JSON parsing failed, use filename as fallback
                    if let Some(stem) = path.file_stem() {
                        names.push(stem.to_string_lossy().to_string());
                    }
                }
            }
        }
    }

    Ok(names)
}

/// Sync from server
#[tauri::command]
pub async fn sync_from_server(
    app: AppHandle,
    password: Option<String>,
) -> Result<SyncResult, String> {
    // Get server config
    let config_path = get_server_config_json_path();
    let server_config: ServerConfig = if config_path.exists() {
        read_json_file(&config_path)?
    } else {
        return Err("Server not configured. Please configure in Server Monitor.".to_string());
    };

    // Get password
    let ssh_password = if let Some(pwd) = password {
        pwd
    } else {
        let creds_path = get_ssh_credentials_json_path();
        if !creds_path.exists() {
            return Err("No SSH credentials saved. Please provide a password.".to_string());
        }
        let creds: serde_json::Value = read_json_file(&creds_path)?;
        creds
            .get("password")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "Invalid credentials format".to_string())?
            .to_string()
    };

    let music_dir = get_music_dir();

    // Prepare worker input
    let worker_input = json!({
        "action": "sync_from_server",
        "music_dir": music_dir.to_string_lossy(),
        "host": server_config.host,
        "port": server_config.port,
        "username": server_config.username,
        "password": ssh_password
    });


    // Set up progress channel
    let (progress_tx, mut progress_rx) = mpsc::channel::<WorkerMessage>(100);

    let app_clone = app.clone();

    // Forward progress events
    tokio::spawn(async move {
        while let Some(msg) = progress_rx.recv().await {
            if let WorkerMessage::Progress { percent, stage } = msg {
                let _ = app_clone.emit(
                    "playlist-uploader:sync-progress",
                    PlaylistUploaderProgress {
                        stage: stage.clone(),
                        current: percent as u32,
                        total: 100,
                        message: stage,
                    },
                );
            }
        }
    });

    // Execute worker
    let result =
        spawn_python_worker_async("playlist_uploader_worker.py", worker_input, Some(progress_tx))
            .await;

    match result {
        Ok(output) => {
            let success = output
                .get("success")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);

            if success {
                let _ = app.emit(
                    "playlist-uploader:complete",
                    json!({"success": true, "action": "sync"}),
                );

                Ok(SyncResult {
                    success: true,
                    index_entries: output
                        .get("indexEntries")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0) as u32,
                    playlists_count: output
                        .get("playlistsCount")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0) as u32,
                    playlist_names: output
                        .get("playlistNames")
                        .and_then(|v| v.as_array())
                        .map(|arr| {
                            arr.iter()
                                .filter_map(|v| v.as_str().map(String::from))
                                .collect()
                        })
                        .unwrap_or_default(),
                    error: None,
                })
            } else {
                let error = output
                    .get("error")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Unknown error")
                    .to_string();

                let _ = app.emit(
                    "playlist-uploader:complete",
                    json!({"success": false, "error": error}),
                );

                Ok(SyncResult {
                    success: false,
                    index_entries: 0,
                    playlists_count: 0,
                    playlist_names: Vec::new(),
                    error: Some(error),
                })
            }
        }
        Err(e) => {
            let _ = app.emit(
                "playlist-uploader:complete",
                json!({"success": false, "error": e}),
            );

            Ok(SyncResult {
                success: false,
                index_entries: 0,
                playlists_count: 0,
                playlist_names: Vec::new(),
                error: Some(e),
            })
        }
    }
}

/// Download YouTube playlist/video
#[tauri::command]
pub async fn download_playlist(
    app: AppHandle,
    url: String,
    playlist_name: Option<String>,
    parallel: Option<u32>,
) -> Result<DownloadResult, String> {
    let music_dir = get_music_dir();

    let worker_input = json!({
        "action": "download_playlist",
        "music_dir": music_dir.to_string_lossy(),
        "url": url,
        "playlist_name": playlist_name,
        "parallel": parallel.unwrap_or(5)
    });

    // Set up progress channel
    let (progress_tx, mut progress_rx) = mpsc::channel::<WorkerMessage>(100);

    let app_clone = app.clone();

    tokio::spawn(async move {
        while let Some(msg) = progress_rx.recv().await {
            if let WorkerMessage::Progress { percent, stage } = msg {
                let _ = app_clone.emit(
                    "playlist-uploader:download-progress",
                    PlaylistUploaderProgress {
                        stage: stage.clone(),
                        current: percent as u32,
                        total: 100,
                        message: stage,
                    },
                );
            }
        }
    });

    let result =
        spawn_python_worker_async("playlist_uploader_worker.py", worker_input, Some(progress_tx))
            .await;

    match result {
        Ok(output) => {
            let success = output
                .get("success")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);

            let _ = app.emit(
                "playlist-uploader:complete",
                json!({"success": success, "action": "download"}),
            );

            Ok(DownloadResult {
                success,
                downloaded: output
                    .get("downloaded")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0) as u32,
                cached: output
                    .get("cached")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0) as u32,
                failed: output
                    .get("failed")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0) as u32,
                total: output
                    .get("total")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0) as u32,
                index_entries: output
                    .get("indexEntries")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0) as u32,
                playlist_tracks: output
                    .get("playlistTracks")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0) as u32,
                playlist_name: output
                    .get("playlistName")
                    .and_then(|v| v.as_str())
                    .map(String::from),
                downloaded_track_ids: output
                    .get("downloadedTrackIds")
                    .and_then(|v| v.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|v| v.as_str().map(String::from))
                            .collect()
                    })
                    .unwrap_or_default(),
                error: output
                    .get("error")
                    .and_then(|v| v.as_str())
                    .map(String::from),
            })
        }
        Err(e) => {
            let _ = app.emit(
                "playlist-uploader:complete",
                json!({"success": false, "error": e}),
            );

            Ok(DownloadResult {
                success: false,
                downloaded: 0,
                cached: 0,
                failed: 0,
                total: 0,
                index_entries: 0,
                playlist_tracks: 0,
                playlist_name: None,
                downloaded_track_ids: Vec::new(),
                error: Some(e),
            })
        }
    }
}

/// Upload to server and restart bot
#[tauri::command]
pub async fn upload_to_server(
    app: AppHandle,
    track_ids: Vec<String>,
    playlist_name: Option<String>,
    password: Option<String>,
) -> Result<UploadResult, String> {
    // Get server config
    let config_path = get_server_config_json_path();
    let server_config: ServerConfig = if config_path.exists() {
        read_json_file(&config_path)?
    } else {
        return Err("Server not configured. Please configure in Server Monitor.".to_string());
    };

    // Get password
    let ssh_password = if let Some(pwd) = password {
        pwd
    } else {
        let creds_path = get_ssh_credentials_json_path();
        if !creds_path.exists() {
            return Err("No SSH credentials saved. Please provide a password.".to_string());
        }
        let creds: serde_json::Value = read_json_file(&creds_path)?;
        creds
            .get("password")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "Invalid credentials format".to_string())?
            .to_string()
    };

    let music_dir = get_music_dir();

    let worker_input = json!({
        "action": "upload_to_server",
        "music_dir": music_dir.to_string_lossy(),
        "host": server_config.host,
        "port": server_config.port,
        "username": server_config.username,
        "password": ssh_password,
        "track_ids": track_ids,
        "playlist_name": playlist_name
    });

    // Set up progress channel
    let (progress_tx, mut progress_rx) = mpsc::channel::<WorkerMessage>(100);

    let app_clone = app.clone();

    tokio::spawn(async move {
        while let Some(msg) = progress_rx.recv().await {
            if let WorkerMessage::Progress { percent, stage } = msg {
                let _ = app_clone.emit(
                    "playlist-uploader:upload-progress",
                    PlaylistUploaderProgress {
                        stage: stage.clone(),
                        current: percent as u32,
                        total: 100,
                        message: stage,
                    },
                );
            }
        }
    });

    let result =
        spawn_python_worker_async("playlist_uploader_worker.py", worker_input, Some(progress_tx))
            .await;

    match result {
        Ok(output) => {
            let success = output
                .get("success")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);

            let _ = app.emit(
                "playlist-uploader:complete",
                json!({"success": success, "action": "upload"}),
            );

            Ok(UploadResult {
                success,
                uploaded_tracks: output
                    .get("uploadedTracks")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0) as u32,
                skipped_tracks: output
                    .get("skippedTracks")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0) as u32,
                playlist_uploaded: output
                    .get("playlistUploaded")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false),
                playlist_js_updated: output
                    .get("playlistJsUpdated")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false),
                bot_restarted: output
                    .get("botRestarted")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false),
                error: output
                    .get("error")
                    .and_then(|v| v.as_str())
                    .map(String::from),
            })
        }
        Err(e) => {
            let _ = app.emit(
                "playlist-uploader:complete",
                json!({"success": false, "error": e}),
            );

            Ok(UploadResult {
                success: false,
                uploaded_tracks: 0,
                skipped_tracks: 0,
                playlist_uploaded: false,
                playlist_js_updated: false,
                bot_restarted: false,
                error: Some(e),
            })
        }
    }
}

/// Restart Discord bot only
#[tauri::command]
pub async fn restart_discord_bot(_app: AppHandle, password: Option<String>) -> Result<bool, String> {
    // Get server config
    let config_path = get_server_config_json_path();
    let server_config: ServerConfig = if config_path.exists() {
        read_json_file(&config_path)?
    } else {
        return Err("Server not configured.".to_string());
    };

    // Get password
    let ssh_password = if let Some(pwd) = password {
        pwd
    } else {
        let creds_path = get_ssh_credentials_json_path();
        if !creds_path.exists() {
            return Err("No SSH credentials saved.".to_string());
        }
        let creds: serde_json::Value = read_json_file(&creds_path)?;
        creds
            .get("password")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "Invalid credentials format".to_string())?
            .to_string()
    };

    // Use ssh_worker to execute the restart command
    let worker_input = json!({
        "host": server_config.host,
        "port": server_config.port,
        "username": server_config.username,
        "password": ssh_password,
        "command": "export PATH=\"/root/.nvm/versions/node/v24.13.0/bin:$PATH\" && pm2 restart nino-music",
        "session_id": uuid::Uuid::new_v4().to_string()
    });

    let result = spawn_python_worker_async("ssh_worker.py", worker_input, None).await;

    match result {
        Ok(output) => {
            let exit_code = output.get("exit_code").and_then(|v| v.as_i64());
            Ok(exit_code == Some(0))
        }
        Err(e) => Err(format!("Failed to restart bot: {}", e)),
    }
}
