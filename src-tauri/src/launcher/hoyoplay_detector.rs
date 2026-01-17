use crate::models::{DetectedGame, GameSource, HoyoPlayGameConfig};
use crate::launcher::icon_extractor::{extract_icon_from_exe, get_icon_cache_dir, download_hoyoplay_icon};
use std::path::{Path, PathBuf};

#[cfg(windows)]
use winreg::enums::*;
#[cfg(windows)]
use winreg::RegKey;
#[cfg(windows)]
use std::ffi::OsStr;
#[cfg(windows)]
use std::os::windows::ffi::OsStrExt;

// ============================================================================
// HoYoPlay Config File Detection (Priority 1 - Most Reliable)
// SAFETY: READ-ONLY - only uses fs::read_to_string and path checks
// ============================================================================

/// Find HoYoPlay installation from its AppData config files
/// SAFETY: READ-ONLY - only uses fs::read_to_string and path checks
fn find_hoyoplay_from_config() -> Vec<PathBuf> {
    let mut paths = Vec::new();

    // Check %AppData%\Cognosphere\HYP\ for config
    if let Some(app_data) = dirs::config_dir() {
        let hyp_config = app_data.join("Cognosphere").join("HYP");
        if hyp_config.exists() {
            // Scan for launcher installation info
            if let Some(launcher_path) = scan_hyp_config_for_launcher(&hyp_config) {
                if !paths.contains(&launcher_path) {
                    paths.push(launcher_path);
                }
            }
        }
    }

    // Check %LocalAppData%\HoYoPlay\
    if let Some(local_data) = dirs::data_local_dir() {
        let hoyoplay_local = local_data.join("HoYoPlay");
        if hoyoplay_local.exists() {
            // Check for config files here
            if let Some(launcher_path) = scan_config_dir_for_launcher(&hoyoplay_local) {
                if !paths.contains(&launcher_path) {
                    paths.push(launcher_path);
                }
            }
        }
    }

    paths
}

/// Scan HYP config directory for launcher installation path
/// SAFETY: READ-ONLY - only reads files, no writes
fn scan_hyp_config_for_launcher(hyp_dir: &Path) -> Option<PathBuf> {
    // Look for JSON config files that might contain launcher path
    if let Ok(entries) = std::fs::read_dir(hyp_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map(|e| e == "json").unwrap_or(false) {
                if let Ok(content) = std::fs::read_to_string(&path) {
                    if let Some(launcher_path) = extract_launcher_path_from_json(&content) {
                        return Some(launcher_path);
                    }
                }
            }
            // Also check subdirectories (HYP stores configs in nested folders)
            if path.is_dir() {
                if let Some(launcher_path) = scan_hyp_config_for_launcher(&path) {
                    return Some(launcher_path);
                }
            }
        }
    }
    None
}

/// Scan a config directory for launcher path
/// SAFETY: READ-ONLY - only reads files
fn scan_config_dir_for_launcher(dir: &Path) -> Option<PathBuf> {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map(|e| e == "json").unwrap_or(false) {
                if let Ok(content) = std::fs::read_to_string(&path) {
                    if let Some(launcher_path) = extract_launcher_path_from_json(&content) {
                        return Some(launcher_path);
                    }
                }
            }
        }
    }
    None
}

/// Extract launcher installation path from JSON config content
/// SAFETY: Pure string parsing, no I/O
fn extract_launcher_path_from_json(content: &str) -> Option<PathBuf> {
    // Try parsing as JSON and look for path-related fields
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(content) {
        let path_keys = ["install_path", "InstallPath", "launcher_path", "LauncherPath",
                         "game_install_path", "path", "Path", "installPath"];

        for key in path_keys {
            if let Some(value) = json.get(key).and_then(|v| v.as_str()) {
                let path = PathBuf::from(value);
                // SAFETY CHECK: Only return if path exists (read-only check)
                if path.exists() && path.is_dir() {
                    // Check if this looks like a HoYoPlay installation
                    if path.join("launcher.exe").exists() || path.join("games").exists() {
                        return Some(path);
                    }
                    // Or if it contains HoYoPlay in the path
                    let path_str = path.to_string_lossy().to_lowercase();
                    if path_str.contains("hoyoplay") || path_str.contains("mihoyo") {
                        return Some(path);
                    }
                }
            }
        }

        // Also recursively check nested objects
        if let Some(obj) = json.as_object() {
            for (_, v) in obj {
                if let Some(nested_str) = v.as_str() {
                    let path = PathBuf::from(nested_str);
                    if path.exists() && path.is_dir() {
                        let path_str = path.to_string_lossy().to_lowercase();
                        if path_str.contains("hoyoplay") {
                            if path.join("launcher.exe").exists() || path.join("games").exists() {
                                return Some(path);
                            }
                        }
                    }
                }
            }
        }
    }
    None
}

// ============================================================================
// HoYoPlay Registry Detection (Priority 2)
// SAFETY: READ-ONLY - only uses open_subkey and get_value, never writes
// ============================================================================

/// Find HoYoPlay installation from Windows registry
/// SAFETY: READ-ONLY - only uses open_subkey and get_value, never writes
#[cfg(windows)]
fn find_hoyoplay_from_registry() -> Vec<PathBuf> {
    let mut paths = Vec::new();

    // HoYoPlay registers under HYP_1_0_global
    // SAFETY: All registry access is READ-ONLY
    let registry_keys = [
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\HYP_1_0_global"),
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\HYP_1_0_global"),
        (HKEY_CURRENT_USER, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\HYP_1_0_global"),
    ];

    for (root, path) in registry_keys {
        // SAFETY: open_subkey is READ-ONLY, it does NOT create keys
        if let Ok(key) = RegKey::predef(root).open_subkey(path) {
            // SAFETY: get_value is READ-ONLY
            if let Ok(install_path) = key.get_value::<String, _>("InstallLocation") {
                let p = PathBuf::from(&install_path);
                if p.exists() && !paths.contains(&p) {
                    paths.push(p);
                }
            }
        }
    }

    // Also search all uninstall entries for "HoYoPlay" or "HYP"
    let uninstall_roots = [
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
        (HKEY_CURRENT_USER, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
    ];

    for (root, uninstall_path) in uninstall_roots {
        // SAFETY: open_subkey is READ-ONLY
        if let Ok(uninstall_key) = RegKey::predef(root).open_subkey(uninstall_path) {
            // SAFETY: enum_keys is READ-ONLY
            for key_name in uninstall_key.enum_keys().filter_map(|k| k.ok()) {
                let key_lower = key_name.to_lowercase();
                if key_lower.contains("hoyoplay") || key_lower.contains("hyp_") {
                    // SAFETY: open_subkey is READ-ONLY
                    if let Ok(subkey) = uninstall_key.open_subkey(&key_name) {
                        // SAFETY: get_value is READ-ONLY
                        if let Ok(install_path) = subkey.get_value::<String, _>("InstallLocation") {
                            let p = PathBuf::from(&install_path);
                            if p.exists() && !paths.contains(&p) {
                                paths.push(p);
                            }
                        }
                    }
                }
            }
        }
    }

    paths
}

#[cfg(not(windows))]
fn find_hoyoplay_from_registry() -> Vec<PathBuf> {
    Vec::new()
}

// ============================================================================
// Shortcut/Start Menu Detection (Priority 3)
// SAFETY: READ-ONLY - only reads shortcut targets, no file modifications
// ============================================================================

/// Find HoYoPlay games from Windows shortcuts in Start Menu/Desktop
/// SAFETY: READ-ONLY - only reads shortcut targets, no file modifications
#[cfg(windows)]
fn find_games_from_shortcuts() -> Vec<PathBuf> {
    let mut paths = Vec::new();

    // Get shortcut directories
    let shortcut_dirs: Vec<PathBuf> = [
        dirs::config_dir().map(|p| p.join("Microsoft").join("Windows").join("Start Menu").join("Programs")),
        std::env::var_os("PROGRAMDATA").map(|p| PathBuf::from(p).join("Microsoft").join("Windows").join("Start Menu").join("Programs")),
        dirs::desktop_dir(),
    ].into_iter().flatten().collect();

    for dir in shortcut_dirs {
        if !dir.exists() { continue; }
        scan_dir_for_hoyoplay_shortcuts(&dir, &mut paths, 2); // Max depth 2
    }

    paths
}

#[cfg(not(windows))]
fn find_games_from_shortcuts() -> Vec<PathBuf> {
    Vec::new()
}

/// Recursively scan directory for HoYoPlay-related shortcuts
/// SAFETY: READ-ONLY - only reads directory entries and shortcut targets
#[cfg(windows)]
fn scan_dir_for_hoyoplay_shortcuts(dir: &Path, paths: &mut Vec<PathBuf>, depth: u32) {
    if depth == 0 { return; }

    // SAFETY: read_dir is READ-ONLY
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let name = path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_lowercase();

        if path.is_dir() {
            // Check if folder name is HoYoPlay-related
            if name.contains("hoyoplay") || name.contains("mihoyo")
               || name.contains("genshin") || name.contains("star rail")
               || name.contains("zenless") || name.contains("honkai") {
                scan_dir_for_hoyoplay_shortcuts(&path, paths, depth - 1);
            }
        } else if path.extension().map(|e| e == "lnk").unwrap_or(false) {
            // Check if shortcut name is HoYoPlay-related
            if name.contains("hoyoplay") || name.contains("genshin")
               || name.contains("star rail") || name.contains("zenless")
               || name.contains("honkai") {
                // SAFETY: resolve_shortcut only READS the shortcut target
                if let Some(target) = resolve_shortcut(&path) {
                    if let Some(hoyoplay_root) = find_hoyoplay_root_from_target(&target) {
                        if !paths.contains(&hoyoplay_root) {
                            paths.push(hoyoplay_root);
                        }
                    }
                }
            }
        }
    }
}

/// Resolve a .lnk shortcut to its target using PowerShell (safe, read-only)
/// SAFETY: PowerShell COM call only READS shortcut target, does not modify anything
#[cfg(windows)]
fn resolve_shortcut(lnk_path: &Path) -> Option<PathBuf> {
    // SAFETY: This PowerShell command only READS the shortcut's TargetPath property
    // It does NOT modify the shortcut or create any files
    let ps_script = format!(
        r#"(New-Object -ComObject WScript.Shell).CreateShortcut('{}').TargetPath"#,
        lnk_path.to_string_lossy().replace("'", "''")
    );

    std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &ps_script])
        .output()
        .ok()
        .and_then(|o| {
            if o.status.success() {
                let target = String::from_utf8_lossy(&o.stdout).trim().to_string();
                if !target.is_empty() { Some(PathBuf::from(target)) } else { None }
            } else { None }
        })
}

/// From a target path, find the HoYoPlay root directory
/// SAFETY: Pure path manipulation + exists() checks only
fn find_hoyoplay_root_from_target(target: &Path) -> Option<PathBuf> {
    let mut current = target.parent()?;

    for _ in 0..5 {
        let name = current.file_name()?.to_string_lossy().to_lowercase();

        if name == "hoyoplay" || name == "mihoyo launcher" {
            return Some(current.to_path_buf());
        }

        // SAFETY: exists() and join() are READ-ONLY operations
        if current.join("launcher.exe").exists() && current.join("games").exists() {
            return Some(current.to_path_buf());
        }

        current = current.parent()?;
    }

    None
}


#[cfg(windows)]
fn is_scannable_drive(drive_letter: char) -> bool {
    use windows_sys::Win32::Storage::FileSystem::GetDriveTypeW;
    const DRIVE_FIXED: u32 = 3;

    let drive_path = format!("{}:\\", drive_letter);
    let wide: Vec<u16> = OsStr::new(&drive_path)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    let drive_type = unsafe { GetDriveTypeW(wide.as_ptr()) };
    drive_type == DRIVE_FIXED
}

#[cfg(not(windows))]
fn is_scannable_drive(_drive_letter: char) -> bool {
    true
}


/// Find all HoYoPlay installation paths using multiple detection methods
/// SAFETY: ALL methods are READ-ONLY - no registry writes, no file modifications
pub fn find_hoyoplay_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();

    // Priority 1: Config file detection (most reliable)
    // SAFETY: READ-ONLY - only reads AppData config files
    paths.extend(find_hoyoplay_from_config());

    // Priority 2: Registry detection
    // SAFETY: READ-ONLY - only reads registry keys, never writes
    paths.extend(find_hoyoplay_from_registry());

    // Priority 3: Shortcut detection
    // SAFETY: READ-ONLY - only reads shortcut targets via PowerShell COM
    paths.extend(find_games_from_shortcuts());

    // Priority 4: Enhanced folder scanning (existing + expanded)
    // SAFETY: READ-ONLY - only checks path existence
    #[cfg(windows)]
    {
        for letter in b'C'..=b'Z' {
            let drive_letter = letter as char;

            if !is_scannable_drive(drive_letter) {
                continue;
            }

            let drive = format!("{}:\\", drive_letter);
            let drive_path = PathBuf::from(&drive);

            if !drive_path.exists() {
                continue;
            }

            // SAFETY: All operations here are path.join() and path.exists()
            let possible_paths = [
                // Original paths
                drive_path.join("HoYoPlay"),
                drive_path.join("Program Files").join("HoYoPlay"),
                drive_path.join("Program Files (x86)").join("HoYoPlay"),
                drive_path.join("Games").join("HoYoPlay"),

                // NEW: Additional common patterns
                drive_path.join("Entertainment").join("HoYoPlay"),    // User's case
                drive_path.join("Gaming").join("HoYoPlay"),
                drive_path.join("Gacha").join("HoYoPlay"),
                drive_path.join("miHoYo").join("HoYoPlay"),
                drive_path.join("HoYoverse").join("HoYoPlay"),

                // Legacy miHoYo launcher locations
                drive_path.join("Program Files").join("miHoYo Launcher"),
                drive_path.join("Program Files (x86)").join("miHoYo Launcher"),
                drive_path.join("miHoYo Launcher"),
            ];

            for path in possible_paths {
                if path.exists() && path.is_dir() && !paths.contains(&path) {
                    paths.push(path);
                }
            }
        }
    }

    // Deduplicate (case-insensitive on Windows)
    paths.sort_by(|a, b| a.to_string_lossy().to_lowercase().cmp(&b.to_string_lossy().to_lowercase()));
    paths.dedup_by(|a, b| a.to_string_lossy().to_lowercase() == b.to_string_lossy().to_lowercase());

    paths
}

fn detect_games_in_hoyoplay(hoyoplay_path: &Path) -> Vec<DetectedGame> {
    let mut games = Vec::new();

    let launcher_exe = hoyoplay_path.join("launcher.exe");
    if launcher_exe.exists() {
        let icon_path = get_icon_cache_dir()
            .and_then(|cache_dir| extract_icon_from_exe(&launcher_exe, &cache_dir));

        games.push(DetectedGame {
            name: "HoYoPlay".to_string(),
            executable_path: launcher_exe.to_string_lossy().to_string(),
            install_path: hoyoplay_path.to_string_lossy().to_string(),
            source: GameSource::HoyoPlay,
            app_id: Some("HoYoPlay".to_string()),
            icon_path,
            launch_args: None,
        });
    }

    let games_folder = hoyoplay_path.join("games");
    if !games_folder.exists() {
        return games;
    }

    for config in HoyoPlayGameConfig::all() {
        let game_folder = games_folder.join(config.folder_name);
        if !game_folder.exists() {
            continue;
        }

        let exe_path = game_folder.join(config.executable_name);
        if exe_path.exists() {
            // Try downloading HD icon first, then fall back to exe extraction
            let icon_path = get_icon_cache_dir().and_then(|cache_dir| {
                // Try 1: Download HD icon from HoYoverse CDN
                download_hoyoplay_icon(config.name, &cache_dir)
                    // Try 2: Extract from game executable
                    .or_else(|| extract_icon_from_exe(&exe_path, &cache_dir))
            });

            games.push(DetectedGame {
                name: config.name.to_string(),
                executable_path: exe_path.to_string_lossy().to_string(),
                install_path: game_folder.to_string_lossy().to_string(),
                source: GameSource::HoyoPlay,
                app_id: Some(config.folder_name.to_string()),
                icon_path,
                launch_args: None,
            });
        }
    }

    games
}

#[cfg(windows)]
fn detect_standalone_from_registry() -> Vec<DetectedGame> {
    let mut games = Vec::new();

    let registry_checks: Vec<(&str, &HoyoPlayGameConfig)> = vec![
        // Genshin Impact registry locations
        ("SOFTWARE\\miHoYo\\Genshin Impact", &HoyoPlayGameConfig::GENSHIN_IMPACT),
        ("SOFTWARE\\miHoYo\\原神", &HoyoPlayGameConfig::GENSHIN_IMPACT),
        // Honkai Star Rail registry locations
        ("SOFTWARE\\Cognosphere\\Star Rail", &HoyoPlayGameConfig::HONKAI_STAR_RAIL),
        ("SOFTWARE\\miHoYo\\崩坏：星穹铁道", &HoyoPlayGameConfig::HONKAI_STAR_RAIL),
        // Zenless Zone Zero
        ("SOFTWARE\\miHoYo\\ZenlessZoneZero", &HoyoPlayGameConfig::ZENLESS_ZONE_ZERO),
        ("SOFTWARE\\miHoYo\\绝区零", &HoyoPlayGameConfig::ZENLESS_ZONE_ZERO),
        // Honkai Impact 3rd
        ("SOFTWARE\\miHoYo\\Honkai Impact 3rd", &HoyoPlayGameConfig::HONKAI_IMPACT_3RD),
        ("SOFTWARE\\miHoYo\\Honkai Impact 3", &HoyoPlayGameConfig::HONKAI_IMPACT_3RD),
        ("SOFTWARE\\miHoYo\\崩坏3rd", &HoyoPlayGameConfig::HONKAI_IMPACT_3RD),
    ];

    // Check HKEY_LOCAL_MACHINE
    if let Ok(hklm) = RegKey::predef(HKEY_LOCAL_MACHINE).open_subkey("SOFTWARE") {
        for (subkey_path, config) in &registry_checks {
            if let Some(game) = check_registry_for_game(&hklm, subkey_path, config) {
                games.push(game);
            }
        }
    }

    // Check HKEY_CURRENT_USER
    if let Ok(hkcu) = RegKey::predef(HKEY_CURRENT_USER).open_subkey("SOFTWARE") {
        for (subkey_path, config) in &registry_checks {
            // Strip SOFTWARE\ prefix since we already opened that key
            let subkey = subkey_path.strip_prefix("SOFTWARE\\").unwrap_or(subkey_path);
            if let Some(game) = check_registry_for_game(&hkcu, subkey, config) {
                games.push(game);
            }
        }
    }

    // Also check Uninstall registry for install locations
    let uninstall_paths = [
        "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
        "SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
    ];

    for uninstall_path in uninstall_paths {
        if let Ok(uninstall_key) = RegKey::predef(HKEY_LOCAL_MACHINE).open_subkey(uninstall_path) {
            for config in HoyoPlayGameConfig::all() {
                if let Some(game) = find_game_in_uninstall_registry(&uninstall_key, &config) {
                    games.push(game);
                }
            }
        }
    }

    games
}

#[cfg(windows)]
fn check_registry_for_game(parent_key: &RegKey, subkey_path: &str, config: &HoyoPlayGameConfig) -> Option<DetectedGame> {
    let key = parent_key.open_subkey(subkey_path).ok()?;

    // Try common value names for install path
    let install_path: String = key.get_value("InstallPath")
        .or_else(|_| key.get_value("InstallLocation"))
        .or_else(|_| key.get_value("Path"))
        .or_else(|_| key.get_value("GameInstallPath"))
        .ok()?;

    let install_dir = PathBuf::from(&install_path);
    let exe_path = install_dir.join(config.executable_name);

    if exe_path.exists() {
        // Try downloading HD icon first, then fall back to exe extraction
        let icon_path = get_icon_cache_dir().and_then(|cache_dir| {
            download_hoyoplay_icon(config.name, &cache_dir)
                .or_else(|| extract_icon_from_exe(&exe_path, &cache_dir))
        });

        return Some(DetectedGame {
            name: config.name.to_string(),
            executable_path: exe_path.to_string_lossy().to_string(),
            install_path: install_dir.to_string_lossy().to_string(),
            source: GameSource::HoyoPlay,
            app_id: Some(format!("{}_standalone", config.folder_name)),
            icon_path,
            launch_args: None,
        });
    }

    None
}

#[cfg(windows)]
fn find_game_in_uninstall_registry(uninstall_key: &RegKey, config: &HoyoPlayGameConfig) -> Option<DetectedGame> {
    // Search patterns to match game entries
    let search_patterns: Vec<&str> = match config.name {
        "Genshin Impact" => vec!["Genshin Impact", "原神"],
        "Star Rail" => vec!["Honkai: Star Rail", "Star Rail", "崩坏：星穹铁道"],
        "Zenless Zone Zero" => vec!["Zenless Zone Zero", "绝区零"],
        "Honkai Impact 3rd" => vec!["Honkai Impact 3rd", "Honkai Impact 3", "崩坏3rd", "崩坏3"],
        _ => vec![config.name],
    };

    for key_name in uninstall_key.enum_keys().filter_map(|k| k.ok()) {
        // Check if key name matches any pattern
        let matches = search_patterns.iter().any(|pattern|
            key_name.to_lowercase().contains(&pattern.to_lowercase())
        );

        if !matches {
            continue;
        }

        if let Ok(subkey) = uninstall_key.open_subkey(&key_name) {
            // Try to get install location
            if let Ok(install_path) = subkey.get_value::<String, _>("InstallLocation") {
                let install_dir = PathBuf::from(&install_path);
                let exe_path = install_dir.join(config.executable_name);

                if exe_path.exists() {
                    // Try downloading HD icon first, then fall back to exe extraction
                    let icon_path = get_icon_cache_dir().and_then(|cache_dir| {
                        download_hoyoplay_icon(config.name, &cache_dir)
                            .or_else(|| extract_icon_from_exe(&exe_path, &cache_dir))
                    });

                    return Some(DetectedGame {
                        name: config.name.to_string(),
                        executable_path: exe_path.to_string_lossy().to_string(),
                        install_path: install_dir.to_string_lossy().to_string(),
                        source: GameSource::HoyoPlay,
                        app_id: Some(format!("{}_standalone", config.folder_name)),
                        icon_path,
                        launch_args: None,
                    });
                }
            }
        }
    }

    None
}

/// Detect standalone games by scanning common installation folders
fn detect_standalone_from_folders() -> Vec<DetectedGame> {
    let mut games = Vec::new();

    #[cfg(windows)]
    {
        // Scan all drives for common game installation patterns
        for letter in b'C'..=b'Z' {
            let drive_letter = letter as char;

            // Skip non-fixed drives (network, USB, CD-ROM)
            if !is_scannable_drive(drive_letter) {
                continue;
            }

            let drive = format!("{}:\\", drive_letter);
            let drive_path = PathBuf::from(&drive);

            if !drive_path.exists() {
                continue;
            }

            // Common standalone installation patterns
            for config in HoyoPlayGameConfig::all() {
                let possible_paths = get_standalone_search_paths(&drive_path, &config);

                for game_folder in possible_paths {
                    if !game_folder.exists() {
                        continue;
                    }

                    let exe_path = game_folder.join(config.executable_name);
                    if exe_path.exists() {
                        // Try downloading HD icon first, then fall back to exe extraction
                        let icon_path = get_icon_cache_dir().and_then(|cache_dir| {
                            download_hoyoplay_icon(config.name, &cache_dir)
                                .or_else(|| extract_icon_from_exe(&exe_path, &cache_dir))
                        });

                        games.push(DetectedGame {
                            name: config.name.to_string(),
                            executable_path: exe_path.to_string_lossy().to_string(),
                            install_path: game_folder.to_string_lossy().to_string(),
                            source: GameSource::HoyoPlay,
                            app_id: Some(format!("{}_standalone", config.folder_name)),
                            icon_path,
                            launch_args: None,
                        });
                    }
                }
            }
        }
    }

    games
}

/// Get potential standalone installation paths for a game
fn get_standalone_search_paths(drive: &Path, config: &HoyoPlayGameConfig) -> Vec<PathBuf> {
    let mut paths = Vec::new();

    // Game-specific folder names to search for
    let folder_names: Vec<&str> = match config.name {
        "Genshin Impact" => vec![
            "Genshin Impact",
            "Genshin Impact Game",
            "GenshinImpact",
            "原神",
        ],
        "Star Rail" => vec![
            "Honkai Star Rail",
            "Star Rail",
            "Star Rail Games",
            "StarRail",
            "崩坏：星穹铁道",
        ],
        "Zenless Zone Zero" => vec![
            "Zenless Zone Zero",
            "ZenlessZoneZero",
            "ZenlessZoneZero Game",
            "ZZZ",
            "绝区零",
        ],
        "Honkai Impact 3rd" => vec![
            "Honkai Impact 3rd",
            "Honkai Impact 3",
            "HonkaiImpact3rd",
            "BH3",
            "崩坏3rd",
            "崩坏3",
        ],
        _ => vec![config.folder_name],
    };

    // Common parent directories where games are installed
    let parent_dirs = [
        drive.to_path_buf(),
        drive.join("Games"),
        drive.join("Program Files"),
        drive.join("Program Files (x86)"),
        drive.join("Program Files").join("miHoYo"),
        drive.join("Program Files (x86)").join("miHoYo"),
        drive.join("miHoYo"),
    ];

    for parent in &parent_dirs {
        for folder_name in &folder_names {
            paths.push(parent.join(folder_name));
        }
    }

    paths
}

/// Detect all installed HoyoPlay games (including standalone installations)
pub fn detect_hoyoplay_games() -> Vec<DetectedGame> {
    let mut all_games = Vec::new();

    let hoyoplay_paths = find_hoyoplay_paths();
    for path in hoyoplay_paths {
        let games = detect_games_in_hoyoplay(&path);
        all_games.extend(games);
    }

    #[cfg(windows)]
    {
        let registry_games = detect_standalone_from_registry();
        all_games.extend(registry_games);
    }

    let folder_games = detect_standalone_from_folders();
    all_games.extend(folder_games);

    all_games.sort_by(|a, b| a.executable_path.to_lowercase().cmp(&b.executable_path.to_lowercase()));
    all_games.dedup_by(|a, b| a.executable_path.to_lowercase() == b.executable_path.to_lowercase());

    all_games
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hoyoplay_game_configs() {
        let configs = HoyoPlayGameConfig::all();
        assert_eq!(configs.len(), 4);
        assert_eq!(configs[0].name, "Genshin Impact");
        assert_eq!(configs[1].name, "Star Rail");
    }
}
