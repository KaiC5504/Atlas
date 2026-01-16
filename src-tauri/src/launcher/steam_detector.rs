use crate::models::{DetectedGame, GameSource};
use crate::launcher::icon_extractor::{extract_icon_from_exe, get_icon_cache_dir, download_steam_icon};
use std::fs;
use std::path::{Path, PathBuf};

#[cfg(windows)]
use winreg::enums::*;
#[cfg(windows)]
use winreg::RegKey;

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

/// Find the main executable 
fn find_game_executable(install_path: &Path) -> Option<PathBuf> {
    if !install_path.exists() {
        return None;
    }

    let common_names = ["game.exe", "launcher.exe", "start.exe"];

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

    if exe_files.len() == 1 {
        return Some(exe_files[0].clone());
    }

    for name in &common_names {
        if let Some(exe) = exe_files.iter().find(|p| {
            p.file_name()
                .map(|n| n.to_string_lossy().to_lowercase() == *name)
                .unwrap_or(false)
        }) {
            return Some(exe.clone());
        }
    }

    exe_files.into_iter().max_by_key(|p| {
        fs::metadata(p).map(|m| m.len()).unwrap_or(0)
    })
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

                    if let Some(exe_path) = find_game_executable(&install_path) {
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
