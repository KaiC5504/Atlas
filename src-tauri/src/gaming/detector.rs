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

/// Represents the result of attempting to wait for a process
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum WaitResult {
    /// Process has exited
    ProcessExited,
    /// Still waiting (timeout)
    Timeout,
    /// Handle became invalid, need fallback
    InvalidHandle,
}

/// Represents the detection strategy to use
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum DetectionStrategy {
    /// Use Windows handle wait (instant detection)
    HandleWait,
    /// Use polling fallback
    Polling,
}

/// Action to take based on wait result
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum WaitResultAction {
    EndSession,
    ContinueWaiting,
    FallbackToPolling,
}

/// Determines which detection strategy to use based on handle acquisition result
/// This is the core logic that can be tested on any platform
pub fn determine_detection_strategy(handle_acquired: bool, is_windows: bool) -> DetectionStrategy {
    if is_windows && handle_acquired {
        DetectionStrategy::HandleWait
    } else {
        DetectionStrategy::Polling
    }
}

/// Determines the action to take based on wait result
/// This is the core logic that can be tested on any platform
pub fn handle_wait_result(result: WaitResult) -> WaitResultAction {
    match result {
        WaitResult::ProcessExited => WaitResultAction::EndSession,
        WaitResult::Timeout => WaitResultAction::ContinueWaiting,
        WaitResult::InvalidHandle => WaitResultAction::FallbackToPolling,
    }
}

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

struct NormalizedGame {
    name: String,
    process_name: String,
    normalized_process: String, 
    enabled: bool,
}

fn load_game_whitelist_normalized() -> Vec<NormalizedGame> {
    let whitelist = read_json_file::<GameWhitelist>(&get_game_whitelist_json_path())
        .unwrap_or_else(|_| GameWhitelist::default_whitelist());

    whitelist.games.into_iter().map(|g| NormalizedGame {
        name: g.name,
        process_name: g.process_name.clone(),
        normalized_process: g.process_name
            .trim_end_matches(".exe")
            .trim_end_matches(".EXE")
            .to_lowercase(),
        enabled: g.enabled,
    }).collect()
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
        let whitelist = load_game_whitelist_normalized(); // Load once with pre-normalized names

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

            for game in whitelist.iter().filter(|g| g.enabled) {
                if running_processes.contains(&game.normalized_process) {
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

        // Helper closure to end the session and cleanup
        let end_session_and_cleanup = |session_manager: &Arc<GamingSessionManager>,
                                       app: &AppHandle,
                                       process_name: &str,
                                       monitoring_state: Arc<MonitoringState>| {
            println!("Game process exited: {}", process_name);

            // End the gaming session
            match session_manager.end_session_by_process(process_name) {
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

            use crate::commands::settings::get_settings;
            use crate::task_monitor::restore;

            let settings = get_settings().unwrap_or_default();
            if settings.auto_restore_enabled {
                println!("Auto-restore enabled, waiting 3 seconds before restoring processes...");

                std::thread::sleep(std::time::Duration::from_secs(3));

                if let Ok(restore_list) = restore::load_restore_list() {
                    if !restore_list.processes.is_empty() {
                        println!("Restoring {} killed processes...", restore_list.processes.len());
                        let result = restore::restore_all_processes(&restore_list);
                        println!("Restore complete: {} restored, {} skipped, {} failed",
                                 result.restored, result.skipped_self_restoring, result.failed);

                        if let Err(e) = app.emit("task_monitor:restore_completed", &result) {
                            eprintln!("Failed to emit restore_completed event: {}", e);
                        }

                        if let Err(e) = restore::clear_restore_list() {
                            eprintln!("Failed to clear restore list: {}", e);
                        }
                    }
                }
            }
        };

        #[cfg(windows)]
        {
            use windows_sys::Win32::Foundation::{CloseHandle, WAIT_OBJECT_0, WAIT_TIMEOUT};
            use windows_sys::Win32::System::Threading::{OpenProcess, WaitForSingleObject, PROCESS_SYNCHRONIZE};

            system.refresh_processes_specifics(ProcessRefreshKind::new());
            let game_pid = system.processes().iter()
                .find(|(_, p)| {
                    p.name().to_string()
                        .trim_end_matches(".exe")
                        .trim_end_matches(".EXE")
                        .to_lowercase() == process_name_lower
                })
                .map(|(pid, _)| pid.as_u32());

            if let Some(pid) = game_pid {
                let handle = unsafe { OpenProcess(PROCESS_SYNCHRONIZE, 0, pid) };

                let strategy = determine_detection_strategy(!handle.is_null(), true);

                if strategy == DetectionStrategy::HandleWait {
                    println!("Phase 2: Using process handle wait for instant exit detection (PID: {})", pid);

                        let result = unsafe { WaitForSingleObject(handle, 100) };

                        let wait_result = match result {
                            x if x == WAIT_OBJECT_0 => WaitResult::ProcessExited,
                            x if x == WAIT_TIMEOUT => WaitResult::Timeout,
                            _ => WaitResult::InvalidHandle,
                        };

                        match handle_wait_result(wait_result) {
                            WaitResultAction::EndSession => {
                                println!("Game process exited (detected via handle wait)");
                                unsafe { CloseHandle(handle) };
                                end_session_and_cleanup(&session_manager, &app, &process_name, monitoring_state);
                                break;
                            }
                            WaitResultAction::ContinueWaiting => {
                                continue;
                            }
                            WaitResultAction::FallbackToPolling => {
                                println!("Process handle invalid, falling back to polling");
                                unsafe { CloseHandle(handle) };
                                break;
                            }
                        }
                    }

                    println!("Game session monitoring thread exiting");
                    return;
                } else {
                    println!("Phase 2: Handle acquisition failed, using polling fallback");
                }
            } else {
                println!("Phase 2: Could not find process PID, using polling fallback");
            }
        }

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
                end_session_and_cleanup(&session_manager, &app, &process_name, monitoring_state);
                break;
            }

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detection_strategy_windows_handle_acquired() {
        let strategy = determine_detection_strategy(true, true);
        assert_eq!(strategy, DetectionStrategy::HandleWait);
    }

    #[test]
    fn test_detection_strategy_windows_handle_failed() {
        let strategy = determine_detection_strategy(false, true);
        assert_eq!(strategy, DetectionStrategy::Polling);
    }

    #[test]
    fn test_detection_strategy_is_windows_false() {
        let strategy = determine_detection_strategy(true, false);
        assert_eq!(strategy, DetectionStrategy::Polling);

        let strategy = determine_detection_strategy(false, false);
        assert_eq!(strategy, DetectionStrategy::Polling);
    }

    #[test]
    fn test_wait_result_process_exited() {
        let action = handle_wait_result(WaitResult::ProcessExited);
        assert_eq!(action, WaitResultAction::EndSession);
    }

    #[test]
    fn test_wait_result_timeout() {
        let action = handle_wait_result(WaitResult::Timeout);
        assert_eq!(action, WaitResultAction::ContinueWaiting);
    }

    #[test]
    fn test_wait_result_invalid_handle() {
        let action = handle_wait_result(WaitResult::InvalidHandle);
        assert_eq!(action, WaitResultAction::FallbackToPolling);
    }

    #[test]
    fn test_full_flow_handle_wait_success() {
        let strategy = determine_detection_strategy(true, true);
        assert_eq!(strategy, DetectionStrategy::HandleWait);

        let mut iterations = 0;
        let wait_results = vec![
            WaitResult::Timeout,      
            WaitResult::Timeout,      
            WaitResult::ProcessExited, 
        ];

        for result in wait_results {
            iterations += 1;
            let action = handle_wait_result(result);
            if action == WaitResultAction::EndSession {
                break;
            }
        }

        assert_eq!(iterations, 3, "Should process all results until exit");
    }

    #[test]
    fn test_full_flow_fallback_to_polling() {
        let strategy = determine_detection_strategy(false, true);
        assert_eq!(strategy, DetectionStrategy::Polling);

    }

    #[test]
    fn test_full_flow_handle_invalid_mid_wait() {
        let wait_results = vec![
            WaitResult::Timeout,      
            WaitResult::Timeout,      
            WaitResult::InvalidHandle, 
        ];

        let mut fell_back_to_polling = false;
        for result in wait_results {
            let action = handle_wait_result(result);
            if action == WaitResultAction::FallbackToPolling {
                fell_back_to_polling = true;
                break;
            }
        }

        assert!(fell_back_to_polling, "Should fallback to polling when handle becomes invalid");
    }

    #[test]
    fn test_current_platform_detection() {
        let is_windows = cfg!(windows);
        let is_linux = cfg!(target_os = "linux");
        let is_macos = cfg!(target_os = "macos");

        assert!(
            is_windows || is_linux || is_macos,
            "Should detect a known platform"
        );

        if is_linux {
            let strategy = determine_detection_strategy(true, false);
            assert_eq!(strategy, DetectionStrategy::Polling);
        }
    }
}
