// Playtime tracker - background thread for tracking game play time

use crate::file_manager::{read_json_file, write_json_file};
use crate::models::GameLibrary;
use crate::utils::get_game_library_json_path;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};
use sysinfo::System;
use tauri::{AppHandle, Emitter};

/// State for the playtime tracker
pub struct PlaytimeTrackerState {
    pub is_running: AtomicBool,
    pub running_games: RwLock<HashMap<String, RunningGameInfo>>,
}

/// Info about a currently running game
#[derive(Debug, Clone)]
pub struct RunningGameInfo {
    pub game_id: String,
    pub process_name: String,
    pub start_time: Instant,
}

impl Default for PlaytimeTrackerState {
    fn default() -> Self {
        Self {
            is_running: AtomicBool::new(false),
            running_games: RwLock::new(HashMap::new()),
        }
    }
}

impl PlaytimeTrackerState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn is_running(&self) -> bool {
        self.is_running.load(Ordering::SeqCst)
    }

    pub fn set_running(&self, running: bool) {
        self.is_running.store(running, Ordering::SeqCst);
    }
}

/// Start the playtime tracking background thread
pub fn start_playtime_tracker(
    app_handle: AppHandle,
    state: Arc<PlaytimeTrackerState>,
) {
    if state.is_running() {
        return;
    }

    state.set_running(true);

    std::thread::spawn(move || {
        let mut sys = System::new_all();

        while state.is_running() {
            // Refresh process list
            sys.refresh_processes();

            // Load current library
            let library: GameLibrary = read_json_file(&get_game_library_json_path())
                .unwrap_or_default();

            // Build a map of process names to game IDs
            let process_to_game: HashMap<String, (String, String)> = library
                .games
                .iter()
                .map(|g| (g.process_name.to_lowercase(), (g.id.clone(), g.process_name.clone())))
                .collect();

            // Get currently running processes
            let running_processes: Vec<String> = sys
                .processes()
                .values()
                .filter_map(|p| {
                    let name = p.name().to_lowercase();
                    if process_to_game.contains_key(&name) {
                        Some(name)
                    } else {
                        None
                    }
                })
                .collect();

            // Check for newly started games
            {
                let mut running_games = state.running_games.write().unwrap();

                for process_name in &running_processes {
                    if let Some((game_id, original_name)) = process_to_game.get(process_name) {
                        if !running_games.contains_key(game_id) {
                            // Game just started
                            running_games.insert(
                                game_id.clone(),
                                RunningGameInfo {
                                    game_id: game_id.clone(),
                                    process_name: original_name.clone(),
                                    start_time: Instant::now(),
                                },
                            );

                            // Emit event
                            let _ = app_handle.emit("launcher:game_started", game_id.clone());
                        }
                    }
                }

                // Check for games that have stopped
                let running_game_ids: Vec<String> = running_games.keys().cloned().collect();
                for game_id in running_game_ids {
                    let info = running_games.get(&game_id).unwrap();
                    let process_lower = info.process_name.to_lowercase();

                    if !running_processes.contains(&process_lower) {
                        // Game stopped - calculate playtime
                        let elapsed_secs = info.start_time.elapsed().as_secs();

                        // Update library with new playtime
                        if let Ok(mut lib) = read_json_file::<GameLibrary>(&get_game_library_json_path()) {
                            if let Some(game) = lib.find_by_id_mut(&game_id) {
                                game.total_playtime_seconds += elapsed_secs;
                                game.last_played = Some(chrono::Utc::now().to_rfc3339());
                                let _ = write_json_file(&get_game_library_json_path(), &lib);
                            }
                        }

                        // Emit event
                        let _ = app_handle.emit("launcher:game_stopped", serde_json::json!({
                            "game_id": game_id,
                            "session_seconds": elapsed_secs
                        }));

                        running_games.remove(&game_id);
                    }
                }
            }

            // Sleep for 10 seconds before next check
            std::thread::sleep(Duration::from_secs(10));
        }
    });
}

/// Stop the playtime tracking background thread
pub fn stop_playtime_tracker(state: Arc<PlaytimeTrackerState>) {
    state.set_running(false);

    // Save any remaining playtime for running games
    let running_games = state.running_games.read().unwrap();
    if !running_games.is_empty() {
        if let Ok(mut lib) = read_json_file::<GameLibrary>(&get_game_library_json_path()) {
            for (game_id, info) in running_games.iter() {
                let elapsed_secs = info.start_time.elapsed().as_secs();
                if let Some(game) = lib.find_by_id_mut(game_id) {
                    game.total_playtime_seconds += elapsed_secs;
                    game.last_played = Some(chrono::Utc::now().to_rfc3339());
                }
            }
            let _ = write_json_file(&get_game_library_json_path(), &lib);
        }
    }
}

/// Get list of currently running games
pub fn get_running_games(state: &PlaytimeTrackerState) -> Vec<String> {
    state
        .running_games
        .read()
        .unwrap()
        .keys()
        .cloned()
        .collect()
}
