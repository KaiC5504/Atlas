// Game detection module
// Monitors running processes against the game whitelist

use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use serde_json::json;
use sysinfo::{ProcessRefreshKind, System};
use tauri::{AppHandle, Emitter};

use crate::file_manager::read_json_file;
use crate::models::gaming::GameWhitelist;
use crate::utils::get_game_whitelist_json_path;
use super::session::GamingSessionManager;

/// State for tracking if game detection is active
pub struct GameDetectionState {
    pub is_running: Arc<AtomicBool>,
}

impl Default for GameDetectionState {
    fn default() -> Self {
        Self {
            is_running: Arc::new(AtomicBool::new(false)),
        }
    }
}

/// Load the game whitelist from JSON file
fn load_game_whitelist() -> GameWhitelist {
    read_json_file::<GameWhitelist>(&get_game_whitelist_json_path())
        .unwrap_or_else(|_| GameWhitelist::default_whitelist())
}

/// Start game detection in a background thread
/// Monitors running processes against the whitelist every 5 seconds
pub fn start_game_detection(
    app: AppHandle,
    detection_state: Arc<GameDetectionState>,
    session_manager: Arc<GamingSessionManager>,
) {
    let is_running = detection_state.is_running.clone();

    // Only start if not already running
    if is_running.swap(true, Ordering::SeqCst) {
        println!("Game detection is already running");
        return;
    }

    println!("Starting game detection...");

    thread::spawn(move || {
        let mut system = System::new();
        let mut detected_games: HashSet<String> = HashSet::new();

        while is_running.load(Ordering::SeqCst) {
            // Refresh process list
            system.refresh_processes_specifics(ProcessRefreshKind::new());

            // Load current whitelist (allows hot-reloading)
            let whitelist = load_game_whitelist();
            let enabled_games: Vec<_> = whitelist
                .games
                .iter()
                .filter(|g| g.enabled)
                .collect();

            // Check for game processes
            let mut current_games: HashSet<String> = HashSet::new();

            for process in system.processes().values() {
                let process_name = process.name().to_string();

                // Check if this process matches any game in the whitelist
                // Note: sysinfo 0.30+ returns process names WITHOUT .exe on Windows
                // so we strip .exe from whitelist entries for comparison
                if let Some(game) = enabled_games.iter().find(|g| {
                    let whitelist_name = g.process_name
                        .trim_end_matches(".exe")
                        .trim_end_matches(".EXE")
                        .to_lowercase();
                    let running_name = process_name
                        .trim_end_matches(".exe")
                        .trim_end_matches(".EXE")
                        .to_lowercase();
                    whitelist_name == running_name
                }) {
                    current_games.insert(process_name.clone());

                    // New game detected
                    if !detected_games.contains(&process_name) {
                        println!("Game detected: {} ({})", game.name, process_name);

                        match session_manager.start_session(&game.name, &process_name) {
                            Ok(session) => {
                                if let Err(e) = app.emit("gaming:session_started", json!({ "session": session })) {
                                    eprintln!("Failed to emit session_started event: {}", e);
                                }
                            }
                            Err(e) => {
                                eprintln!("Failed to start session for {}: {}", game.name, e);
                            }
                        }
                    }
                }
            }

            // Check for games that stopped
            for process_name in detected_games.difference(&current_games) {
                println!("Game stopped: {}", process_name);

                match session_manager.end_session_by_process(process_name) {
                    Ok(session) => {
                        if let Err(e) = app.emit("gaming:session_ended", json!({ "session": session })) {
                            eprintln!("Failed to emit session_ended event: {}", e);
                        }
                    }
                    Err(e) => {
                        eprintln!("Failed to end session for {}: {}", process_name, e);
                    }
                }
            }

            detected_games = current_games;

            // Check every 5 seconds
            thread::sleep(Duration::from_secs(5));
        }

        println!("Game detection stopped");
    });
}

/// Stop game detection
pub fn stop_game_detection(detection_state: Arc<GameDetectionState>) {
    println!("Stopping game detection...");
    detection_state.is_running.store(false, Ordering::SeqCst);
}

/// Check if game detection is currently running
pub fn is_detection_running(detection_state: Arc<GameDetectionState>) -> bool {
    detection_state.is_running.load(Ordering::SeqCst)
}

/// Get currently detected game (if any)
/// This is a one-time check, not continuous monitoring
pub fn get_detected_game() -> Option<(String, String)> {
    let mut system = System::new();
    system.refresh_processes_specifics(ProcessRefreshKind::new());

    let whitelist = load_game_whitelist();
    let enabled_games: Vec<_> = whitelist
        .games
        .iter()
        .filter(|g| g.enabled)
        .collect();

    for process in system.processes().values() {
        let process_name = process.name().to_string();

        // Note: sysinfo 0.30+ returns process names WITHOUT .exe on Windows
        if let Some(game) = enabled_games.iter().find(|g| {
            let whitelist_name = g.process_name
                .trim_end_matches(".exe")
                .trim_end_matches(".EXE")
                .to_lowercase();
            let running_name = process_name
                .trim_end_matches(".exe")
                .trim_end_matches(".EXE")
                .to_lowercase();
            whitelist_name == running_name
        }) {
            return Some((game.name.clone(), process_name));
        }
    }

    None
}
