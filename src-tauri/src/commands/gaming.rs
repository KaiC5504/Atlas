// Gaming Performance Analyzer Tauri commands

use std::fs;
use std::sync::Arc;
use tauri::{AppHandle, State};

use crate::file_manager::{read_json_file, write_json_file};
use crate::gaming::{
    is_detection_running, start_game_detection, stop_game_detection, BottleneckAnalyzer,
    GameDetectionState, GamingSessionManager,
};
use crate::performance::MonitoringState;
use crate::models::gaming::*;
use crate::utils::{
    get_bottleneck_thresholds_json_path, get_game_whitelist_json_path,
    get_gaming_sessions_json_path, get_session_data_path,
};

// ============================================
// Whitelist Commands
// ============================================

/// Get the current game whitelist
#[tauri::command]
pub fn get_game_whitelist() -> Result<GameWhitelist, String> {
    read_json_file(&get_game_whitelist_json_path())
}

/// Update the entire game whitelist
#[tauri::command]
pub fn update_game_whitelist(whitelist: GameWhitelist) -> Result<(), String> {
    write_json_file(&get_game_whitelist_json_path(), &whitelist)
}

/// Add a game to the whitelist
#[tauri::command]
pub fn add_game_to_whitelist(game: GameEntry) -> Result<(), String> {
    let mut whitelist = get_game_whitelist()?;

    // Check if game already exists
    if whitelist
        .games
        .iter()
        .any(|g| g.process_name.to_lowercase() == game.process_name.to_lowercase())
    {
        return Err("Game already exists in whitelist".to_string());
    }

    whitelist.games.push(game);
    write_json_file(&get_game_whitelist_json_path(), &whitelist)
}

/// Remove a game from the whitelist by process name
#[tauri::command]
pub fn remove_game_from_whitelist(process_name: String) -> Result<(), String> {
    let mut whitelist = get_game_whitelist()?;

    let initial_len = whitelist.games.len();
    whitelist.games.retain(|g| {
        g.process_name.to_lowercase() != process_name.to_lowercase()
    });

    if whitelist.games.len() == initial_len {
        return Err("Game not found in whitelist".to_string());
    }

    write_json_file(&get_game_whitelist_json_path(), &whitelist)
}

/// Toggle a game's enabled status
#[tauri::command]
pub fn toggle_game_enabled(process_name: String, enabled: bool) -> Result<(), String> {
    let mut whitelist = get_game_whitelist()?;

    let game = whitelist.games.iter_mut().find(|g| {
        g.process_name.to_lowercase() == process_name.to_lowercase()
    });

    match game {
        Some(g) => {
            g.enabled = enabled;
            write_json_file(&get_game_whitelist_json_path(), &whitelist)
        }
        None => Err("Game not found in whitelist".to_string()),
    }
}

// ============================================
// Detection Commands
// ============================================

/// Start game detection monitoring
#[tauri::command]
pub fn start_gaming_detection(
    app: AppHandle,
    detection_state: State<'_, Arc<GameDetectionState>>,
    session_manager: State<'_, Arc<GamingSessionManager>>,
    monitoring_state: State<'_, Arc<MonitoringState>>,
) -> Result<(), String> {
    let detection_state = (*detection_state).clone();
    let session_manager = (*session_manager).clone();
    let monitoring_state = (*monitoring_state).clone();

    start_game_detection(app, detection_state, session_manager, monitoring_state);
    Ok(())
}

/// Stop game detection monitoring
#[tauri::command]
pub fn stop_gaming_detection(
    detection_state: State<'_, Arc<GameDetectionState>>,
) -> Result<(), String> {
    stop_game_detection((*detection_state).clone());
    Ok(())
}

/// Check if game detection is running
#[tauri::command]
pub fn is_gaming_detection_running(
    detection_state: State<'_, Arc<GameDetectionState>>,
) -> bool {
    is_detection_running((*detection_state).clone())
}

// ============================================
// Session Commands
// ============================================

/// Get the currently active gaming session
#[tauri::command]
pub fn get_active_gaming_session(
    session_manager: State<'_, Arc<GamingSessionManager>>,
) -> Result<Option<GamingSession>, String> {
    Ok(session_manager.get_active_session())
}

/// Get all gaming sessions (list view)
#[tauri::command]
pub fn get_gaming_sessions() -> Result<Vec<GamingSession>, String> {
    read_json_file(&get_gaming_sessions_json_path())
        .or_else(|_| Ok(Vec::new()))
}

/// Get detailed session data including all snapshots and events
#[tauri::command]
pub fn get_session_details(session_id: String) -> Result<GamingSessionData, String> {
    let path = get_session_data_path(&session_id);
    read_json_file(&path)
}

/// Delete a gaming session and its data
#[tauri::command]
pub fn delete_gaming_session(session_id: String) -> Result<(), String> {
    // Remove from sessions list
    let mut sessions: Vec<GamingSession> = get_gaming_sessions()?;
    sessions.retain(|s| s.id != session_id);
    write_json_file(&get_gaming_sessions_json_path(), &sessions)?;

    // Delete session data file
    let data_path = get_session_data_path(&session_id);
    if data_path.exists() {
        fs::remove_file(&data_path)
            .map_err(|e| format!("Failed to delete session data: {}", e))?;
    }

    Ok(())
}

/// Manually end the current gaming session
#[tauri::command]
pub fn end_gaming_session(
    session_manager: State<'_, Arc<GamingSessionManager>>,
) -> Result<GamingSession, String> {
    session_manager.end_session()
}

// ============================================
// Threshold Commands
// ============================================

/// Get bottleneck detection thresholds
#[tauri::command]
pub fn get_bottleneck_thresholds() -> Result<BottleneckThresholds, String> {
    read_json_file(&get_bottleneck_thresholds_json_path())
        .or_else(|_| Ok(BottleneckThresholds::default()))
}

/// Update bottleneck detection thresholds
#[tauri::command]
pub fn update_bottleneck_thresholds(thresholds: BottleneckThresholds) -> Result<(), String> {
    write_json_file(&get_bottleneck_thresholds_json_path(), &thresholds)
}
