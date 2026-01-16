use crate::file_manager::{read_json_file, write_json_file};
use crate::models::GameLibrary;
use crate::utils::get_game_library_json_path;
use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use std::time::Instant;
use tauri::{AppHandle, Emitter};

pub struct PlaytimeTrackerState {
    pub active_sessions: RwLock<HashMap<String, ActiveGameSession>>,
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct ActiveGameSession {
    pub game_id: String,
    pub process_name: String,
    pub start_time: Instant,
}

impl Default for PlaytimeTrackerState {
    fn default() -> Self {
        Self {
            active_sessions: RwLock::new(HashMap::new()),
        }
    }
}

impl PlaytimeTrackerState {
    pub fn new() -> Self {
        Self::default()
    }
}

/// Start tracking game's playtime.
pub fn start_game_session(
    app_handle: AppHandle,
    state: Arc<PlaytimeTrackerState>,
    game_id: String,
    process_name: String,
) {
    {
        let sessions = state.active_sessions.read().unwrap();
        if sessions.contains_key(&game_id) {
            return; 
        }
    }

    let session = ActiveGameSession {
        game_id: game_id.clone(),
        process_name: process_name.clone(),
        start_time: Instant::now(),
    };

    {
        let mut sessions = state.active_sessions.write().unwrap();
        sessions.insert(game_id.clone(), session);
    }

    let _ = app_handle.emit("launcher:game_started", game_id.clone());

    let state_clone = state.clone();
    let game_id_clone = game_id.clone();
    let process_name_clone = process_name.clone();

    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(3));
        wait_for_process_exit(&process_name_clone);
        let elapsed_secs = {
            let sessions = state_clone.active_sessions.read().unwrap();
            if let Some(session) = sessions.get(&game_id_clone) {
                session.start_time.elapsed().as_secs()
            } else {
                0
            }
        };

        if elapsed_secs > 0 {
            if let Ok(mut lib) = read_json_file::<GameLibrary>(&get_game_library_json_path()) {
                if let Some(game) = lib.find_by_id_mut(&game_id_clone) {
                    game.total_playtime_seconds += elapsed_secs;
                    game.last_played = Some(chrono::Utc::now().to_rfc3339());
                    let _ = write_json_file(&get_game_library_json_path(), &lib);
                }
            }
        }

        let _ = app_handle.emit("launcher:game_stopped", serde_json::json!({
            "game_id": game_id_clone,
            "session_seconds": elapsed_secs
        }));

        {
            let mut sessions = state_clone.active_sessions.write().unwrap();
            sessions.remove(&game_id_clone);
        }
    });
}

fn wait_for_process_exit(process_name: &str) {
    use sysinfo::System;

    let process_name_lower = process_name.to_lowercase();
    let mut sys = System::new();

    let mut check_interval_secs = 5u64;
    const MAX_INTERVAL: u64 = 30;

    loop {
        sys.refresh_processes();

        let is_running = sys.processes().values().any(|p| {
            p.name().to_lowercase() == process_name_lower
        });

        if !is_running {
            break;
        }

        std::thread::sleep(std::time::Duration::from_secs(check_interval_secs));
        check_interval_secs = (check_interval_secs * 2).min(MAX_INTERVAL);
    }
}

#[allow(dead_code)] 
pub fn get_active_game_sessions(state: &PlaytimeTrackerState) -> Vec<String> {
    state
        .active_sessions
        .read()
        .unwrap()
        .keys()
        .cloned()
        .collect()
}
