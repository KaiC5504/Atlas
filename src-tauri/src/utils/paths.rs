use std::fs;
use std::path::PathBuf;
use std::sync::OnceLock;

static APP_DATA_DIR: OnceLock<PathBuf> = OnceLock::new();

pub fn get_app_data_dir() -> PathBuf {
    APP_DATA_DIR
        .get_or_init(|| {
            let base_dir = dirs::data_dir()
                .unwrap_or_else(|| PathBuf::from("."));
            base_dir.join("Atlas")
        })
        .clone()
}

pub fn get_data_dir() -> PathBuf {
    get_app_data_dir().join("data")
}

pub fn get_downloads_dir() -> PathBuf {
    get_app_data_dir().join("downloads")
}

pub fn get_videos_dir() -> PathBuf {
    get_downloads_dir().join("videos")
}

pub fn get_audio_dir() -> PathBuf {
    get_downloads_dir().join("audio")
}

pub fn get_processed_dir() -> PathBuf {
    get_app_data_dir().join("processed")
}

pub fn get_separated_audio_dir() -> PathBuf {
    get_processed_dir().join("separated_audio")
}

pub fn get_models_dir() -> PathBuf {
    get_app_data_dir().join("models")
}

pub fn get_logs_dir() -> PathBuf {
    get_app_data_dir().join("logs")
}

pub fn get_downloads_json_path() -> PathBuf {
    get_data_dir().join("downloads.json")
}

pub fn get_ml_jobs_json_path() -> PathBuf {
    get_data_dir().join("ml_jobs.json")
}

pub fn get_valorant_store_json_path() -> PathBuf {
    get_data_dir().join("valorant_store.json")
}

pub fn get_settings_json_path() -> PathBuf {
    get_data_dir().join("settings.json")
}

pub fn get_auth_json_path() -> PathBuf {
    get_data_dir().join("auth.json")
}

pub fn get_audio_detection_jobs_json_path() -> PathBuf {
    get_data_dir().join("audio_detection_jobs.json")
}

pub fn get_server_config_json_path() -> PathBuf {
    get_data_dir().join("server_config.json")
}

pub fn get_ssh_credentials_json_path() -> PathBuf {
    get_data_dir().join("ssh_credentials.json")
}

pub fn get_quick_actions_json_path() -> PathBuf {
    get_data_dir().join("quick_actions.json")
}

pub fn get_game_whitelist_json_path() -> PathBuf {
    get_data_dir().join("game_whitelist.json")
}

pub fn get_gaming_sessions_json_path() -> PathBuf {
    get_data_dir().join("gaming_sessions.json")
}

pub fn get_gaming_sessions_dir() -> PathBuf {
    get_data_dir().join("gaming_sessions")
}

pub fn get_session_data_path(session_id: &str) -> PathBuf {
    get_gaming_sessions_dir().join(format!("{}.json", session_id))
}

pub fn get_bottleneck_thresholds_json_path() -> PathBuf {
    get_data_dir().join("bottleneck_thresholds.json")
}

pub fn get_game_library_json_path() -> PathBuf {
    get_data_dir().join("game_library.json")
}

pub fn get_game_scan_cache_json_path() -> PathBuf {
    get_data_dir().join("game_scan_cache.json")
}

pub fn get_music_dir() -> PathBuf {
    get_app_data_dir().join("music")
}

pub fn get_music_tracks_dir() -> PathBuf {
    get_music_dir().join("tracks")
}

pub fn get_music_playlists_dir() -> PathBuf {
    get_music_dir().join("playlists")
}

pub fn get_music_index_json_path() -> PathBuf {
    get_music_dir().join("index.json")
}

pub fn get_last_run_version_path() -> PathBuf {
    get_data_dir().join("last_run_version.txt")
}

pub fn get_gaming_profiles_json_path() -> PathBuf {
    get_data_dir().join("gaming_profiles.json")
}

pub fn get_restore_list_json_path() -> PathBuf {
    get_data_dir().join("restore_list.json")
}

pub fn initialize_data_directories() -> Result<(), String> {
    let directories = [
        get_data_dir(),
        get_videos_dir(),
        get_audio_dir(),
        get_separated_audio_dir(),
        get_models_dir(),
        get_logs_dir(),
        get_gaming_sessions_dir(),
        get_music_tracks_dir(),
        get_music_playlists_dir(),
    ];

    for dir in &directories {
        if !dir.exists() {
            fs::create_dir_all(dir).map_err(|e| {
                format!("Failed to create directory {:?}: {}", dir, e)
            })?;
            println!("Created directory: {:?}", dir);
        }
    }

    println!("Data directories initialized at: {:?}", get_app_data_dir());
    Ok(())
}
