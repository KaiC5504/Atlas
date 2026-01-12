// Game Launcher Tauri commands

use crate::file_manager::{read_json_file, write_json_file};
use crate::launcher::{
    detect_hoyoplay_games, detect_steam_games,
    playtime_tracker::{start_playtime_tracker, stop_playtime_tracker, PlaytimeTrackerState},
    download_steam_icon, extract_icon_from_exe, get_icon_cache_dir,
};
use crate::models::{AddGameRequest, DetectedGame, GameEntry, GameLibrary, GameSource, GameWhitelist, LibraryGame};
use crate::utils::{get_game_library_json_path, get_game_whitelist_json_path};
use std::path::Path;
use std::sync::Arc;
use tauri::{AppHandle, State};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};

/// Read an icon file and return as base64 data URL
#[tauri::command]
pub fn get_icon_base64(icon_path: String) -> Result<String, String> {
    let path = Path::new(&icon_path);
    if !path.exists() {
        return Err("Icon file not found".to_string());
    }

    let data = std::fs::read(path).map_err(|e| e.to_string())?;
    let base64_data = BASE64.encode(&data);

    // Determine MIME type from extension
    let mime_type = match path.extension().and_then(|e| e.to_str()) {
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("png") => "image/png",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        _ => "image/png",
    };

    Ok(format!("data:{};base64,{}", mime_type, base64_data))
}

/// Get the game library
#[tauri::command]
pub fn get_game_library() -> Result<GameLibrary, String> {
    read_json_file(&get_game_library_json_path())
        .map_err(|e| format!("Failed to read game library: {}", e))
}

/// Scan for games (Steam + HoyoPlay)
#[tauri::command]
pub fn scan_for_games() -> Result<Vec<DetectedGame>, String> {
    let mut all_games = Vec::new();

    // Detect Steam games
    let steam_games = detect_steam_games();
    all_games.extend(steam_games);

    // Detect HoyoPlay games
    let hoyoplay_games = detect_hoyoplay_games();
    all_games.extend(hoyoplay_games);

    // Filter out games already in library
    let library: GameLibrary = read_json_file(&get_game_library_json_path()).unwrap_or_default();

    let new_games: Vec<DetectedGame> = all_games
        .into_iter()
        .filter(|g| !library.has_game_with_path(&g.executable_path))
        .collect();

    Ok(new_games)
}

/// Add detected games to library
#[tauri::command]
pub fn add_detected_games(games: Vec<DetectedGame>) -> Result<GameLibrary, String> {
    let mut library: GameLibrary = read_json_file(&get_game_library_json_path()).unwrap_or_default();
    let mut whitelist: GameWhitelist = read_json_file(&get_game_whitelist_json_path()).unwrap_or_default();

    for game in games {
        // Skip if already in library
        if library.has_game_with_path(&game.executable_path) {
            continue;
        }

        // Extract process name from executable path
        let process_name = Path::new(&game.executable_path)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "unknown.exe".to_string());

        let library_game = LibraryGame {
            id: uuid::Uuid::new_v4().to_string(),
            name: game.name.clone(),
            executable_path: game.executable_path,
            install_path: game.install_path,
            source: game.source,
            app_id: game.app_id,
            icon_path: game.icon_path,
            process_name: process_name.clone(),
            added_at: chrono::Utc::now().to_rfc3339(),
            last_played: None,
            total_playtime_seconds: 0,
        };

        library.add_game(library_game);

        // Add to gaming whitelist if not already present
        if !whitelist.games.iter().any(|g| g.process_name.to_lowercase() == process_name.to_lowercase()) {
            whitelist.games.push(GameEntry {
                name: game.name,
                process_name,
                icon: None,
                enabled: true,
            });
        }
    }

    write_json_file(&get_game_library_json_path(), &library)
        .map_err(|e| format!("Failed to save game library: {}", e))?;

    write_json_file(&get_game_whitelist_json_path(), &whitelist)
        .map_err(|e| format!("Failed to save whitelist: {}", e))?;

    Ok(library)
}

/// Add a manual game to library
#[tauri::command]
pub fn add_manual_game(request: AddGameRequest) -> Result<GameLibrary, String> {
    let mut library: GameLibrary = read_json_file(&get_game_library_json_path()).unwrap_or_default();
    let mut whitelist: GameWhitelist = read_json_file(&get_game_whitelist_json_path()).unwrap_or_default();

    // Check if already in library
    if library.has_game_with_path(&request.executable_path) {
        return Err("Game already in library".to_string());
    }

    // Extract process name and install path
    let exe_path = Path::new(&request.executable_path);
    let process_name = exe_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown.exe".to_string());

    let install_path = exe_path
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| request.executable_path.clone());

    let library_game = LibraryGame {
        id: uuid::Uuid::new_v4().to_string(),
        name: request.name.clone(),
        executable_path: request.executable_path,
        install_path,
        source: GameSource::Manual,
        app_id: None,
        icon_path: request.icon_path,
        process_name: process_name.clone(),
        added_at: chrono::Utc::now().to_rfc3339(),
        last_played: None,
        total_playtime_seconds: 0,
    };

    library.add_game(library_game);

    // Add to gaming whitelist
    if !whitelist.games.iter().any(|g| g.process_name.to_lowercase() == process_name.to_lowercase()) {
        whitelist.games.push(GameEntry {
            name: request.name,
            process_name,
            icon: None,
            enabled: true,
        });
    }

    write_json_file(&get_game_library_json_path(), &library)
        .map_err(|e| format!("Failed to save game library: {}", e))?;

    write_json_file(&get_game_whitelist_json_path(), &whitelist)
        .map_err(|e| format!("Failed to save whitelist: {}", e))?;

    Ok(library)
}

/// Remove a game from library
#[tauri::command]
pub fn remove_game_from_library(game_id: String) -> Result<GameLibrary, String> {
    let mut library: GameLibrary = read_json_file(&get_game_library_json_path())
        .map_err(|e| format!("Failed to read game library: {}", e))?;

    if !library.remove_game(&game_id) {
        return Err("Game not found in library".to_string());
    }

    write_json_file(&get_game_library_json_path(), &library)
        .map_err(|e| format!("Failed to save game library: {}", e))?;

    Ok(library)
}

/// Launch a game
#[tauri::command]
pub fn launch_game(game_id: String) -> Result<(), String> {
    let mut library: GameLibrary = read_json_file(&get_game_library_json_path())
        .map_err(|e| format!("Failed to read game library: {}", e))?;

    let game = library
        .find_by_id(&game_id)
        .ok_or_else(|| "Game not found".to_string())?;

    let exe_path = game.executable_path.clone();

    // Update last played
    if let Some(game_mut) = library.find_by_id_mut(&game_id) {
        game_mut.last_played = Some(chrono::Utc::now().to_rfc3339());
    }
    let _ = write_json_file(&get_game_library_json_path(), &library);

    // Launch the game using cmd /C start
    #[cfg(windows)]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &exe_path])
            .spawn()
            .map_err(|e| format!("Failed to launch game: {}", e))?;
    }

    #[cfg(not(windows))]
    {
        std::process::Command::new(&exe_path)
            .spawn()
            .map_err(|e| format!("Failed to launch game: {}", e))?;
    }

    Ok(())
}

/// Start playtime tracking
#[tauri::command]
pub fn start_playtime_tracking(
    app_handle: AppHandle,
    state: State<'_, Arc<PlaytimeTrackerState>>,
) -> Result<(), String> {
    start_playtime_tracker(app_handle, state.inner().clone());
    Ok(())
}

/// Stop playtime tracking
#[tauri::command]
pub fn stop_playtime_tracking(
    state: State<'_, Arc<PlaytimeTrackerState>>,
) -> Result<(), String> {
    stop_playtime_tracker(state.inner().clone());
    Ok(())
}

/// Check if playtime tracking is running
#[tauri::command]
pub fn is_playtime_tracking(
    state: State<'_, Arc<PlaytimeTrackerState>>,
) -> bool {
    state.is_running()
}

/// Refresh icons for all games in library (re-downloads HD icons)
#[tauri::command]
pub fn refresh_game_icons() -> Result<GameLibrary, String> {
    let mut library: GameLibrary = read_json_file(&get_game_library_json_path())
        .map_err(|e| format!("Failed to read game library: {}", e))?;

    let cache_dir = get_icon_cache_dir()
        .ok_or_else(|| "Failed to get icon cache directory".to_string())?;

    // Clear existing icons for this library
    for game in library.games.iter_mut() {
        // Delete old icon if exists
        if let Some(ref old_path) = game.icon_path {
            let _ = std::fs::remove_file(old_path);
        }

        // Try to get new HD icon
        let new_icon = match game.source {
            GameSource::Steam => {
                game.app_id.as_ref()
                    .and_then(|app_id| download_steam_icon(app_id, &cache_dir))
                    .or_else(|| {
                        let exe_path = Path::new(&game.executable_path);
                        extract_icon_from_exe(exe_path, &cache_dir)
                    })
            }
            _ => {
                let exe_path = Path::new(&game.executable_path);
                extract_icon_from_exe(exe_path, &cache_dir)
            }
        };

        game.icon_path = new_icon;
    }

    write_json_file(&get_game_library_json_path(), &library)
        .map_err(|e| format!("Failed to save game library: {}", e))?;

    Ok(library)
}
