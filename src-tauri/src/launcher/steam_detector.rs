use crate::models::{DetectedGame, GameSource};
use crate::launcher::icon_extractor::{extract_icon_from_exe, get_icon_cache_dir, download_steam_icon};
use std::fs;
use std::path::{Path, PathBuf};

#[cfg(windows)]
use winreg::enums::*;
#[cfg(windows)]
use winreg::RegKey;

/// Executables to NEVER select as the main game
const BLACKLISTED_EXES: &[&str] = &[
    // Launchers/updaters
    "launcher.exe", "updater.exe", "update.exe", "patcher.exe",
    "setup.exe", "install.exe", "installer.exe",
    "uninstall.exe", "unins000.exe", "unins001.exe",
    // Crash handlers
    "crashhandler.exe", "crash_handler.exe", "crashreporter.exe",
    "crashpad_handler.exe", "unitycrashandler64.exe", "unitycrashandler32.exe",
    // Redistributables
    "vcredist.exe", "dxsetup.exe", "dotnetfx.exe",
    // Anti-cheat setup (not the game)
    "easyanticheat_setup.exe", "battleye_launcher.exe",
    // Misc utilities
    "config.exe", "settings.exe", "options.exe", "benchmark.exe",
];

/// Preferred game executable names
const WHITELISTED_EXES: &[&str] = &[
    "game.exe", "play.exe", "client.exe", "start.exe",
];

fn is_blacklisted(exe_name: &str) -> bool {
    let lower = exe_name.to_lowercase();
    BLACKLISTED_EXES.iter().any(|&b| lower == b)
        || (lower.starts_with("crash") && lower.ends_with(".exe"))
}

fn is_whitelisted(exe_name: &str) -> bool {
    let lower = exe_name.to_lowercase();
    WHITELISTED_EXES.iter().any(|&w| lower == w)
}

fn matches_game_name(exe_name: &str, game_name: &str) -> bool {
    let exe_lower = exe_name.to_lowercase().replace(".exe", "");
    let game_lower: String = game_name.to_lowercase()
        .chars()
        .filter(|c| c.is_alphanumeric())
        .collect();
    let exe_normalized: String = exe_lower
        .chars()
        .filter(|c| c.is_alphanumeric())
        .collect();

    exe_normalized.contains(&game_lower) || game_lower.contains(&exe_normalized)
}

/// Find Steam installation path from Windows registry
#[cfg(windows)]
pub fn find_steam_path() -> Option<PathBuf> {
    if let Ok(hklm) = RegKey::predef(HKEY_LOCAL_MACHINE).open_subkey("SOFTWARE\\Wow6432Node\\Valve\\Steam") {
        if let Ok(path) = hklm.get_value::<String, _>("InstallPath") {
            let steam_path = PathBuf::from(&path);
            if steam_path.exists() {
                return Some(steam_path);
            }
        }
    }

    if let Ok(hklm) = RegKey::predef(HKEY_LOCAL_MACHINE).open_subkey("SOFTWARE\\Valve\\Steam") {
        if let Ok(path) = hklm.get_value::<String, _>("InstallPath") {
            let steam_path = PathBuf::from(&path);
            if steam_path.exists() {
                return Some(steam_path);
            }
        }
    }

    if let Ok(hkcu) = RegKey::predef(HKEY_CURRENT_USER).open_subkey("SOFTWARE\\Valve\\Steam") {
        if let Ok(path) = hkcu.get_value::<String, _>("SteamPath") {
            let steam_path = PathBuf::from(&path);
            if steam_path.exists() {
                return Some(steam_path);
            }
        }
    }

    None
}

#[cfg(not(windows))]
pub fn find_steam_path() -> Option<PathBuf> {
    None
}

/// Parse libraryfolders.vdf 
pub fn get_library_folders(steam_path: &Path) -> Vec<PathBuf> {
    let mut libraries = vec![steam_path.to_path_buf()];

    let vdf_path = steam_path.join("steamapps").join("libraryfolders.vdf");
    if !vdf_path.exists() {
        return libraries;
    }

    let content = match fs::read_to_string(&vdf_path) {
        Ok(c) => c,
        Err(_) => return libraries,
    };

    // Parse VDF format
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("\"path\"") {
            if let Some(path_str) = extract_vdf_value(trimmed) {
                let path = PathBuf::from(path_str.replace("\\\\", "\\"));
                if path.exists() && !libraries.iter().any(|p| p == &path) {
                    libraries.push(path);
                }
            }
        }
    }

    libraries
}

/// Extract value from VDF 
fn extract_vdf_value(line: &str) -> Option<String> {
    let parts: Vec<&str> = line.split('"').collect();
    if parts.len() >= 4 {
        Some(parts[3].to_string())
    } else {
        None
    }
}

/// Parse an ACF
fn parse_acf_file(acf_path: &Path) -> Option<AcfData> {
    let content = fs::read_to_string(acf_path).ok()?;

    let mut data = AcfData::default();

    for line in content.lines() {
        let trimmed = line.trim();

        if trimmed.starts_with("\"appid\"") {
            data.app_id = extract_vdf_value(trimmed);
        } else if trimmed.starts_with("\"name\"") {
            data.name = extract_vdf_value(trimmed);
        } else if trimmed.starts_with("\"installdir\"") {
            data.install_dir = extract_vdf_value(trimmed);
        }
    }

    if data.app_id.is_some() && data.name.is_some() && data.install_dir.is_some() {
        Some(data)
    } else {
        None
    }
}

#[derive(Default)]
struct AcfData {
    app_id: Option<String>,
    name: Option<String>,
    install_dir: Option<String>,
}

fn find_game_executable(install_path: &Path, game_name: Option<&str>) -> Option<PathBuf> {
    if !install_path.exists() {
        return None;
    }

    let mut exe_files: Vec<PathBuf> = Vec::new();

    if let Ok(entries) = fs::read_dir(install_path) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension() {
                    if ext.to_string_lossy().to_lowercase() == "exe" {
                        exe_files.push(path);
                    }
                }
            }
        }
    }

    if exe_files.is_empty() {
        return None;
    }

    for exe in &exe_files {
        if let Some(name) = exe.file_name().and_then(|n| n.to_str()) {
            if is_whitelisted(name) && !is_blacklisted(name) {
                return Some(exe.clone());
            }
        }
    }

    if let Some(game) = game_name {
        for exe in &exe_files {
            if let Some(name) = exe.file_name().and_then(|n| n.to_str()) {
                if matches_game_name(name, game) && !is_blacklisted(name) {
                    return Some(exe.clone());
                }
            }
        }
    }

    let non_blacklisted: Vec<_> = exe_files
        .iter()
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .map(|n| !is_blacklisted(n))
                .unwrap_or(false)
        })
        .collect();

    if non_blacklisted.len() == 1 {
        return Some(non_blacklisted[0].clone());
    }

    non_blacklisted
        .into_iter()
        .max_by_key(|p| fs::metadata(p).map(|m| m.len()).unwrap_or(0))
        .cloned()
}

pub fn detect_steam_games() -> Vec<DetectedGame> {
    let mut games = Vec::new();

    let steam_path = match find_steam_path() {
        Some(p) => p,
        None => return games,
    };

    let libraries = get_library_folders(&steam_path);

    for library in libraries {
        let steamapps = library.join("steamapps");
        if !steamapps.exists() {
            continue;
        }

        let entries = match fs::read_dir(&steamapps) {
            Ok(e) => e,
            Err(_) => continue,
        };

        for entry in entries.flatten() {
            let path = entry.path();
            let filename = match path.file_name() {
                Some(n) => n.to_string_lossy().to_string(),
                None => continue,
            };

            if filename.starts_with("appmanifest_") && filename.ends_with(".acf") {
                if let Some(acf_data) = parse_acf_file(&path) {
                    let install_dir = acf_data.install_dir.unwrap();
                    let install_path = steamapps.join("common").join(&install_dir);

                    if let Some(exe_path) = find_game_executable(&install_path, acf_data.name.as_deref()) {
                        let icon_path = get_icon_cache_dir().and_then(|cache_dir| {
                            acf_data.app_id.as_ref()
                                .and_then(|app_id| download_steam_icon(app_id, &cache_dir))
                                .or_else(|| extract_icon_from_exe(&exe_path, &cache_dir))
                        });

                        games.push(DetectedGame {
                            name: acf_data.name.unwrap(),
                            executable_path: exe_path.to_string_lossy().to_string(),
                            install_path: install_path.to_string_lossy().to_string(),
                            source: GameSource::Steam,
                            app_id: acf_data.app_id,
                            icon_path,
                        });
                    }
                }
            }
        }
    }

    games
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_vdf_value() {
        assert_eq!(
            extract_vdf_value("\"path\"		\"D:\\\\SteamLibrary\""),
            Some("D:\\\\SteamLibrary".to_string())
        );
        assert_eq!(
            extract_vdf_value("\"name\"		\"Counter-Strike 2\""),
            Some("Counter-Strike 2".to_string())
        );
    }
}
