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
use crate::performance::{stop_monitoring, MonitoringState};
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
pub fn start_game_detection(
    app: AppHandle,
    detection_state: Arc<GameDetectionState>,
    session_manager: Arc<GamingSessionManager>,
    monitoring_state: Arc<MonitoringState>,
) {
    let is_running = detection_state.is_running.clone();

    // Only start if not already running
    if is_running.swap(true, Ordering::SeqCst) {
        println!("Game detection is already running");
        return;
    }

    println!("Starting game detection...");

    let monitoring_state = monitoring_state.clone();

    thread::spawn(move || {
        // Set thread priority to BELOW_NORMAL to minimize FPS impact during gaming
        #[cfg(windows)]
        {
            use windows_sys::Win32::System::Threading::{
                GetCurrentThread, SetThreadPriority, THREAD_PRIORITY_BELOW_NORMAL,
            };
            unsafe {
                SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_BELOW_NORMAL);
            }
        }

        let mut system = System::new();
        let whitelist = load_game_whitelist(); // Load once, not every iteration

        let detected_game = loop {
            if !is_running.load(Ordering::SeqCst) {
                println!("Game detection stopped before finding a game");
                return;
            }

            system.refresh_processes_specifics(ProcessRefreshKind::new());

            let running_processes: HashSet<String> = system
                .processes()
                .values()
                .map(|p| {
                    p.name()
                        .to_string()
                        .trim_end_matches(".exe")
                        .trim_end_matches(".EXE")
                        .to_lowercase()
                })
                .collect();

            let mut found_game: Option<(String, String)> = None;

            for game in whitelist.games.iter().filter(|g| g.enabled) {
                let whitelist_name = game.process_name
                    .trim_end_matches(".exe")
                    .trim_end_matches(".EXE")
                    .to_lowercase();

                if running_processes.contains(&whitelist_name) {
                    found_game = Some((game.name.clone(), game.process_name.clone()));
                    println!("Matched game: {} (process: {})", game.name, game.process_name);
                    break;
                }
            }

            if let Some(game) = found_game {
                break game;
            }

            thread::sleep(Duration::from_secs(3));
        };

        let (game_name, process_name) = detected_game;
        println!("Game detected: {} ({}) - stopping detection polling", game_name, process_name);

        match session_manager.start_session(&game_name, &process_name) {
            Ok(session) => {
                if let Err(e) = app.emit("gaming:session_started", json!({ "session": session })) {
                    eprintln!("Failed to emit session_started event: {}", e);
                }
            }
            Err(e) => {
                eprintln!("Failed to start session for {}: {}", game_name, e);
                is_running.store(false, Ordering::SeqCst);
                return;
            }
        }

        is_running.store(false, Ordering::SeqCst);
        if let Err(e) = app.emit("gaming:detection_stopped", json!({ "reason": "game_detected" })) {
            eprintln!("Failed to emit detection_stopped event: {}", e);
        }
        println!("Detection turned off after game detected");

        let process_name_lower = process_name
            .trim_end_matches(".exe")
            .trim_end_matches(".EXE")
            .to_lowercase();

        println!("Phase 2: Monitoring for process exit: {}", process_name_lower);

        let mut check_interval = 5u64;
        const MAX_INTERVAL: u64 = 30;

        loop {
            thread::sleep(Duration::from_secs(check_interval));

            system.refresh_processes_specifics(ProcessRefreshKind::new());

            let still_running = system.processes().values().any(|p| {
                let name = p.name()
                    .to_string()
                    .trim_end_matches(".exe")
                    .trim_end_matches(".EXE")
                    .to_lowercase();
                name == process_name_lower
            });

            if !still_running {
                println!("Game process exited: {}", process_name);

                // End the gaming session
                match session_manager.end_session_by_process(&process_name) {
                    Ok(session) => {
                        println!("Gaming session ended successfully");
                        if let Err(e) = app.emit("gaming:session_ended", json!({ "session": session })) {
                            eprintln!("Failed to emit session_ended event: {}", e);
                        }
                    }
                    Err(e) => {
                        eprintln!("Failed to end session for {}: {}", process_name, e);
                    }
                }

                println!("Stopping performance monitoring...");
                stop_monitoring(monitoring_state);
                println!("Performance monitoring stop signal sent");

                if let Err(e) = app.emit("performance:monitoring_stopped", json!({ "reason": "game_closed" })) {
                    eprintln!("Failed to emit monitoring_stopped event: {}", e);
                }

                break;
            }

            // Exponential backoff - reduces CPU usage for long gaming sessions
            check_interval = (check_interval * 2).min(MAX_INTERVAL);
        }

        println!("Game session monitoring thread exiting");
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
