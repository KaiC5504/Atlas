// HoyoPlay game detector
// Detects installed HoyoPlay games by scanning drives for the HoyoPlay folder

use crate::models::{DetectedGame, GameSource, HoyoPlayGameConfig};
use crate::launcher::icon_extractor::{extract_icon_from_exe, get_icon_cache_dir};
use std::path::{Path, PathBuf};

/// Find HoyoPlay installation paths by scanning all drives
pub fn find_hoyoplay_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();

    #[cfg(windows)]
    {
        // Scan common drive letters
        for letter in b'C'..=b'Z' {
            let drive = format!("{}:\\", letter as char);
            let drive_path = PathBuf::from(&drive);

            if !drive_path.exists() {
                continue;
            }

            // Check common HoyoPlay installation locations
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

/// Detect HoyoPlay games in a given HoyoPlay installation
fn detect_games_in_hoyoplay(hoyoplay_path: &Path) -> Vec<DetectedGame> {
    let mut games = Vec::new();

    // HoyoPlay stores games in a "games" subfolder
    let games_folder = hoyoplay_path.join("games");
    if !games_folder.exists() {
        return games;
    }

    // Check for each known HoyoPlay game
    for config in HoyoPlayGameConfig::all() {
        let game_folder = games_folder.join(config.folder_name);
        if !game_folder.exists() {
            continue;
        }

        let exe_path = game_folder.join(config.executable_name);
        if exe_path.exists() {
            // Extract icon from executable
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

/// Detect all installed HoyoPlay games
pub fn detect_hoyoplay_games() -> Vec<DetectedGame> {
    let mut all_games = Vec::new();

    let hoyoplay_paths = find_hoyoplay_paths();

    for path in hoyoplay_paths {
        let games = detect_games_in_hoyoplay(&path);
        all_games.extend(games);
    }

    // Deduplicate by executable path
    all_games.sort_by(|a, b| a.executable_path.cmp(&b.executable_path));
    all_games.dedup_by(|a, b| a.executable_path == b.executable_path);

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
