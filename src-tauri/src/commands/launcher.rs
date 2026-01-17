// Game Launcher Tauri commands

use crate::file_manager::{read_json_file, write_json_file};
use crate::launcher::{
    detect_hoyoplay_games, detect_steam_games, detect_riot_games,
    playtime_tracker::{start_game_session, PlaytimeTrackerState},
};
use crate::models::{AddGameRequest, DetectedGame, GameEntry, GameLibrary, GameSource, GameWhitelist, LibraryGame, GameScanCache};
use crate::utils::{get_game_library_json_path, get_game_whitelist_json_path, get_game_scan_cache_json_path};
use std::path::Path;
use std::sync::Arc;
use tauri::{AppHandle, State, Emitter};
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

/// Scan for games (Steam + HoyoPlay) with caching
#[tauri::command]
pub fn scan_for_games(force_rescan: Option<bool>) -> Result<Vec<DetectedGame>, String> {
    let cache_path = get_game_scan_cache_json_path();
    let force = force_rescan.unwrap_or(false);

    // Try cache first
    if !force {
        if let Ok(cache) = read_json_file::<GameScanCache>(&cache_path) {
            if cache.is_valid(GameScanCache::DEFAULT_TTL_SECONDS) {
                let library: GameLibrary = read_json_file(&get_game_library_json_path()).unwrap_or_default();
                let new_games: Vec<DetectedGame> = cache.games
                    .into_iter()
                    .filter(|g| !library.has_game_with_path(&g.executable_path))
                    .collect();
                return Ok(new_games);
            }
        }
    }

    // Fresh scan
    let mut all_games = Vec::new();
    let steam_games = detect_steam_games();
    all_games.extend(steam_games);
    let hoyoplay_games = detect_hoyoplay_games();
    all_games.extend(hoyoplay_games);
    let riot_games = detect_riot_games();  // NEW: Detect Riot Games (Valorant, LoL, etc.)
    all_games.extend(riot_games);

    // Save to cache
    let cache = GameScanCache::new(all_games.clone());
    let _ = write_json_file(&cache_path, &cache);

    // Filter against library
    let library: GameLibrary = read_json_file(&get_game_library_json_path()).unwrap_or_default();
    let new_games: Vec<DetectedGame> = all_games
        .into_iter()
        .filter(|g| !library.has_game_with_path(&g.executable_path))
        .collect();

    Ok(new_games)
}

/// Clear game scan cache
#[tauri::command]
pub fn clear_game_scan_cache() -> Result<(), String> {
    let cache_path = get_game_scan_cache_json_path();
    if cache_path.exists() {
        std::fs::remove_file(&cache_path)
            .map_err(|e| format!("Failed to clear cache: {}", e))?;
    }
    Ok(())
}

/// Add detected games to library
#[tauri::command]
pub fn add_detected_games(games: Vec<DetectedGame>) -> Result<GameLibrary, String> {
    let mut library: GameLibrary = read_json_file(&get_game_library_json_path()).unwrap_or_default();
    let mut whitelist: GameWhitelist = read_json_file(&get_game_whitelist_json_path()).unwrap_or_default();

    for game in games {
        // Skip if already in library (check by app_id for Riot games, executable_path for others)
        if game.app_id.is_some() {
            if library.games.iter().any(|g| g.app_id == game.app_id) {
                continue;
            }
        } else if library.has_game_with_path(&game.executable_path) {
            continue;
        }

        // For Riot games, get the actual game process name from the app_id
        // For others, extract from executable path
        let process_name = get_process_name_for_game(&game);

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
            launch_args: game.launch_args,
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

/// Get the process name to monitor for a game
fn get_process_name_for_game(game: &DetectedGame) -> String {
    // For Riot games, use the actual game process name (not Riot Client)
    if game.source == GameSource::Riot {
        if let Some(app_id) = &game.app_id {
            return match app_id.as_str() {
                "riot_valorant" => "VALORANT-Win64-Shipping.exe".to_string(),
                "riot_league_of_legends" => "League of Legends.exe".to_string(),
                "riot_bacon" => "Legends of Runeterra.exe".to_string(),
                _ => Path::new(&game.executable_path)
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_else(|| "unknown.exe".to_string()),
            };
        }
    }

    // Default: extract from executable path
    Path::new(&game.executable_path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown.exe".to_string())
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
        launch_args: None,
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
pub fn launch_game(
    app_handle: AppHandle,
    game_id: String,
    playtime_state: State<'_, Arc<PlaytimeTrackerState>>,
) -> Result<(), String> {
    let mut library: GameLibrary = read_json_file(&get_game_library_json_path())
        .map_err(|e| format!("Failed to read game library: {}", e))?;

    let game = library
        .find_by_id(&game_id)
        .ok_or_else(|| "Game not found".to_string())?;

    let exe_path = game.executable_path.clone();
    let launch_args = game.launch_args.clone();
    let process_name = game.process_name.clone();
    let game_id_clone = game_id.clone();

    // Update last played
    if let Some(game_mut) = library.find_by_id_mut(&game_id) {
        game_mut.last_played = Some(chrono::Utc::now().to_rfc3339());
    }
    let _ = write_json_file(&get_game_library_json_path(), &library);

    launch_process_silent(&exe_path, launch_args.as_deref())?;

    start_game_session(
        app_handle.clone(),
        playtime_state.inner().clone(),
        game_id_clone,
        process_name,
    );

    let _ = app_handle.emit("launcher:navigate_to_gaming", ());

    Ok(())
}

#[cfg(windows)]
fn launch_process_silent(exe_path: &str, args: Option<&str>) -> Result<(), String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::ptr::null_mut;
    use windows_sys::Win32::UI::Shell::ShellExecuteW;
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    fn to_wide(s: &str) -> Vec<u16> {
        OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
    }

    let operation = to_wide("open");
    let file = to_wide(exe_path);

    // Convert args to wide string if present
    let args_wide = args.map(|a| to_wide(a));
    let args_ptr = args_wide.as_ref().map(|a| a.as_ptr()).unwrap_or(null_mut());

    let result = unsafe {
        ShellExecuteW(
            null_mut(),           // hwnd
            operation.as_ptr(),   // lpOperation ("open")
            file.as_ptr(),        // lpFile (executable path)
            args_ptr,             // lpParameters (command line arguments)
            null_mut(),           // lpDirectory (working directory)
            SW_SHOWNORMAL as i32, // nShowCmd
        )
    };

    if result as isize > 32 {
        Ok(())
    } else {
        let error_msg = match result as isize {
            0 => "Out of memory",
            2 => "File not found",
            3 => "Path not found",
            5 => "Access denied",
            8 => "Out of memory",
            11 => "Invalid executable format",
            26 => "Sharing violation",
            27 => "Association incomplete",
            28 => "DDE timeout",
            29 => "DDE failed",
            30 => "DDE busy",
            31 => "No association",
            32 => "DLL not found",
            _ => "Unknown error",
        };
        Err(format!("Failed to launch game: {} (code {})", error_msg, result as isize))
    }
}

#[cfg(not(windows))]
fn launch_process_silent(exe_path: &str, args: Option<&str>) -> Result<(), String> {
    let mut cmd = std::process::Command::new(exe_path);
    if let Some(args_str) = args {
        cmd.args(args_str.split_whitespace());
    }
    cmd.spawn()
        .map_err(|e| format!("Failed to launch game: {}", e))?;

    Ok(())
}
