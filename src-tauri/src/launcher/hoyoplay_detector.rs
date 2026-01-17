use crate::models::{DetectedGame, GameSource, HoyoPlayGameConfig};
use crate::launcher::icon_extractor::{extract_icon_from_exe, get_icon_cache_dir};
use std::path::{Path, PathBuf};

#[cfg(windows)]
use winreg::enums::*;
#[cfg(windows)]
use winreg::RegKey;
#[cfg(windows)]
use std::ffi::OsStr;
#[cfg(windows)]
use std::os::windows::ffi::OsStrExt;


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


pub fn find_hoyoplay_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();

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

            let possible_paths = [
                drive_path.join("HoYoPlay"),
                drive_path.join("Program Files").join("HoYoPlay"),
                drive_path.join("Program Files (x86)").join("HoYoPlay"),
                drive_path.join("Games").join("HoYoPlay"),
            ];

            for path in possible_paths {
                if path.exists() && path.is_dir() {
                    if !paths.contains(&path) {
                        paths.push(path);
                    }
                }
            }
        }
    }

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
            let icon_path = get_icon_cache_dir()
                .and_then(|cache_dir| extract_icon_from_exe(&exe_path, &cache_dir));

            games.push(DetectedGame {
                name: config.name.to_string(),
                executable_path: exe_path.to_string_lossy().to_string(),
                install_path: game_folder.to_string_lossy().to_string(),
                source: GameSource::HoyoPlay,
                app_id: Some(config.folder_name.to_string()),
                icon_path,
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
        let icon_path = get_icon_cache_dir()
            .and_then(|cache_dir| extract_icon_from_exe(&exe_path, &cache_dir));

        return Some(DetectedGame {
            name: config.name.to_string(),
            executable_path: exe_path.to_string_lossy().to_string(),
            install_path: install_dir.to_string_lossy().to_string(),
            source: GameSource::HoyoPlay,
            app_id: Some(format!("{}_standalone", config.folder_name)),
            icon_path,
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
                    let icon_path = get_icon_cache_dir()
                        .and_then(|cache_dir| extract_icon_from_exe(&exe_path, &cache_dir));

                    return Some(DetectedGame {
                        name: config.name.to_string(),
                        executable_path: exe_path.to_string_lossy().to_string(),
                        install_path: install_dir.to_string_lossy().to_string(),
                        source: GameSource::HoyoPlay,
                        app_id: Some(format!("{}_standalone", config.folder_name)),
                        icon_path,
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
                        let icon_path = get_icon_cache_dir()
                            .and_then(|cache_dir| extract_icon_from_exe(&exe_path, &cache_dir));

                        games.push(DetectedGame {
                            name: config.name.to_string(),
                            executable_path: exe_path.to_string_lossy().to_string(),
                            install_path: game_folder.to_string_lossy().to_string(),
                            source: GameSource::HoyoPlay,
                            app_id: Some(format!("{}_standalone", config.folder_name)),
                            icon_path,
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
        assert_eq!(configs[1].name, "Honkai Star Rail");
    }
}
