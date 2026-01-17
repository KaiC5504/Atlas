mod commands;
mod discord;
mod file_manager;
mod gaming;
mod launcher;
mod models;
mod performance;
mod process_manager;
mod utils;

use commands::{
    audio_detection::{
        cancel_audio_detection_job, delete_audio_detection_job, get_audio_detection_job,
        get_model_path, has_trained_model, list_audio_detection_jobs, start_audio_detection_job,
        submit_audio_detection_job,
    },
    auth::{capture_auth_cookies, close_auth_window, get_auth_status, get_stored_credentials, logout, open_auth_window},
    autostart::{disable_autostart, enable_autostart, is_autostart_enabled},
    discord::{connect_discord, disconnect_discord, is_discord_connected},
    downloads::{add_download, cancel_download, delete_download, list_downloads, start_download, validate_download_path},
    gaming::{
        add_game_to_whitelist, delete_gaming_session, end_gaming_session,
        get_active_gaming_session, get_active_session_state, get_bottleneck_thresholds,
        get_game_whitelist, get_gaming_sessions, get_session_details,
        is_gaming_detection_running, remove_game_from_whitelist, start_gaming_detection,
        stop_gaming_detection, toggle_game_enabled, update_bottleneck_thresholds,
        update_game_whitelist,
    },
    launcher::{
        add_detected_games, add_manual_game, clear_game_scan_cache, get_game_library, get_icon_base64,
        launch_game, remove_game_from_library, scan_for_games,
    },
    ml_jobs::{cancel_ml_job, delete_ml_job, get_available_models, list_ml_jobs, start_ml_job, submit_ml_job},
    performance::{
        get_performance_snapshot, has_nvidia_gpu, is_performance_monitoring,
        start_performance_monitoring, stop_performance_monitoring,
    },
    playlist_uploader::{
        download_playlist, get_local_music_index, get_local_playlists, get_music_directory,
        restart_discord_bot, sync_from_server, upload_to_server,
    },
    server::{
        check_local_file_exists, clear_ssh_credentials, execute_ssh_command, get_quick_actions,
        get_server_config, get_ssh_credentials, get_system_status, has_ssh_credentials,
        read_local_file, save_ssh_credentials, test_ssh_connection, update_server_config,
        upload_file_to_server,
    },
    settings::{get_settings, update_settings},
    updater::{check_for_update, download_update, get_current_version, install_update, DownloadedUpdateBytes},
    valorant::{check_valorant_store, get_store_history, get_valorant_store, should_auto_refresh_store},
};
use discord::DiscordPresenceManager;
use file_manager::initialize_json_file;
use gaming::{BottleneckAnalyzer, GameDetectionState, GamingSessionManager};
use launcher::PlaytimeTrackerState;
use models::{BottleneckThresholds, GameLibrary, GameWhitelist, GamingSession, QuickActionsConfig, ServerConfig, Settings};
use performance::{MonitoringState, SharedMetrics};
use std::fs;
use std::sync::Arc;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};
use utils::{
    get_audio_detection_jobs_json_path, get_bottleneck_thresholds_json_path, get_downloads_json_path,
    get_game_library_json_path, get_game_whitelist_json_path, get_gaming_sessions_json_path,
    get_last_run_version_path, get_ml_jobs_json_path, get_quick_actions_json_path, get_server_config_json_path,
    get_settings_json_path, get_valorant_store_json_path, initialize_data_directories,
};

fn initialize_app_data() -> Result<(), String> {
    // Create directory structure
    initialize_data_directories()?;

    // Initialize JSON files with defaults
    let empty_vec: Vec<serde_json::Value> = vec![];

    initialize_json_file(&get_downloads_json_path(), &empty_vec)?;
    initialize_json_file(&get_ml_jobs_json_path(), &empty_vec)?;
    initialize_json_file(&get_valorant_store_json_path(), &empty_vec)?;
    initialize_json_file(&get_audio_detection_jobs_json_path(), &empty_vec)?;
    initialize_json_file(&get_settings_json_path(), &Settings::default())?;

    // Server monitoring config files
    initialize_json_file(&get_server_config_json_path(), &ServerConfig::default())?;
    initialize_json_file(&get_quick_actions_json_path(), &QuickActionsConfig::default())?;

    // Gaming performance analyzer files
    initialize_json_file(&get_game_whitelist_json_path(), &GameWhitelist::default_whitelist())?;
    initialize_json_file(&get_gaming_sessions_json_path(), &Vec::<GamingSession>::new())?;
    initialize_json_file(&get_bottleneck_thresholds_json_path(), &BottleneckThresholds::default())?;

    // Game launcher files
    initialize_json_file(&get_game_library_json_path(), &GameLibrary::new())?;

    println!("App data initialized successfully");
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if let Err(e) = initialize_app_data() {
        eprintln!("Failed to initialize app data: {}", e);
    }

    let detection_state = Arc::new(GameDetectionState::default());
    let bottleneck_analyzer = Arc::new(BottleneckAnalyzer::new());
    let shared_metrics = Arc::new(SharedMetrics::new());
    let playtime_tracker_state = Arc::new(PlaytimeTrackerState::new());
    let discord_manager = Arc::new(DiscordPresenceManager::new());

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            // Another instance tried to launch - show and focus the existing window
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    let settings = get_settings().unwrap_or_default();
                    if settings.close_to_tray {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                }
            }
        })
        .manage(Arc::new(MonitoringState::default()))
        .manage(detection_state.clone())
        .manage(bottleneck_analyzer.clone())
        .manage(shared_metrics.clone())
        .manage(playtime_tracker_state.clone())
        .manage(discord_manager.clone())
        .manage(DownloadedUpdateBytes(std::sync::Mutex::new(None)))
        .setup(move |app| {
            let current_version = app.package_info().version.to_string();
            let version_file = get_last_run_version_path();
            let last_version = fs::read_to_string(&version_file).unwrap_or_default();

            let just_updated = !last_version.is_empty() && last_version.trim() != current_version;

            let _ = fs::write(&version_file, &current_version);

            if just_updated {
                println!("App updated from {} to {} - bringing window to foreground", last_version.trim(), current_version);
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }

            let settings = get_settings().unwrap_or_default();
            if settings.discord_rich_presence_enabled {
                if let Err(e) = discord_manager.connect() {
                    eprintln!("Failed to connect to Discord: {}", e);
                } else {
                    println!("Discord Rich Presence connected");
                }
            }

            // Create tray menu
            let show_item = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit Atlas", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            // Build tray icon
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            // Check if launched via autostart (--autostart flag)
            let args: Vec<String> = std::env::args().collect();
            let is_autostart_launch = args.iter().any(|arg| arg == "--autostart");

            if is_autostart_launch && settings.run_on_startup {
                // Don't show window on autostart - tray only
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }

            let session_manager = Arc::new(GamingSessionManager::new(
                app.handle().clone(),
                bottleneck_analyzer.clone(),
                shared_metrics.clone(),
                discord_manager.clone(),
            ));
            app.manage(session_manager);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Auth commands
            open_auth_window,
            capture_auth_cookies,
            close_auth_window,
            get_auth_status,
            get_stored_credentials,
            logout,
            // Download commands
            list_downloads,
            add_download,
            start_download,
            cancel_download,
            delete_download,
            validate_download_path,
            // ML Job commands
            list_ml_jobs,
            submit_ml_job,
            start_ml_job,
            cancel_ml_job,
            delete_ml_job,
            get_available_models,
            // Audio Detection commands
            list_audio_detection_jobs,
            submit_audio_detection_job,
            start_audio_detection_job,
            cancel_audio_detection_job,
            delete_audio_detection_job,
            get_audio_detection_job,
            has_trained_model,
            get_model_path,
            // Valorant commands
            get_valorant_store,
            check_valorant_store,
            get_store_history,
            should_auto_refresh_store,
            get_settings,
            update_settings,
            // Discord Rich Presence
            connect_discord,
            disconnect_discord,
            is_discord_connected,
            // Autostart commands
            enable_autostart,
            disable_autostart,
            is_autostart_enabled,
            // Server monitoring
            get_server_config,
            update_server_config,
            save_ssh_credentials,
            get_ssh_credentials,
            has_ssh_credentials,
            clear_ssh_credentials,
            get_quick_actions,
            execute_ssh_command,
            get_system_status,
            test_ssh_connection,
            upload_file_to_server,
            read_local_file,
            check_local_file_exists,
            // Performance monitoring commands
            start_performance_monitoring,
            stop_performance_monitoring,
            get_performance_snapshot,
            is_performance_monitoring,
            has_nvidia_gpu,
            // Gaming performance commands
            get_game_whitelist,
            update_game_whitelist,
            add_game_to_whitelist,
            remove_game_from_whitelist,
            toggle_game_enabled,
            start_gaming_detection,
            stop_gaming_detection,
            is_gaming_detection_running,
            get_active_gaming_session,
            get_active_session_state,
            get_gaming_sessions,
            get_session_details,
            delete_gaming_session,
            end_gaming_session,
            get_bottleneck_thresholds,
            update_bottleneck_thresholds,
            // Updater commands
            check_for_update,
            download_update,
            install_update,
            get_current_version,
            // Game launcher commands
            get_game_library,
            scan_for_games,
            clear_game_scan_cache,
            add_detected_games,
            add_manual_game,
            remove_game_from_library,
            launch_game,
            get_icon_base64,
            // Playlist uploader commands
            get_music_directory,
            get_local_music_index,
            get_local_playlists,
            sync_from_server,
            download_playlist,
            upload_to_server,
            restart_discord_bot,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
