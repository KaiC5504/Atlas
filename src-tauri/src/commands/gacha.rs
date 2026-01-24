// Gacha history commands for HoYoverse games

use crate::file_manager::{read_json_file, write_json_file};
use crate::launcher::detect_hoyoplay_games;
use crate::models::{
    DetectedGachaGame, GachaAccount, GachaGame, GachaHistory, GachaStats, GachaWorkerResult,
    RefreshGachaRequest, UigfExport, UigfGameData, UigfInfo, UigfRecord,
};
use crate::process_manager::spawn_python_worker_async;
use crate::utils::{get_gacha_dir, get_gacha_games_cache_path, get_gacha_history_path, get_icons_dir};
use log::{error, info};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

/// Cache structure for detected gacha games
#[derive(Debug, Serialize, Deserialize)]
struct GachaGamesCache {
    #[serde(default)]
    version: u32,
    games: Vec<DetectedGachaGame>,
    timestamp: u64,
}

const CACHE_VERSION: u32 = 2; // Bump when cache structure changes (v2: added icon_path)
const CACHE_VALIDITY_HOURS: u64 = 24;

/// Get all gacha accounts with saved history
#[tauri::command]
pub fn get_gacha_accounts() -> Result<Vec<GachaAccount>, String> {
    let gacha_dir = get_gacha_dir();

    if !gacha_dir.exists() {
        return Ok(Vec::new());
    }

    let mut accounts = Vec::new();

    let entries = fs::read_dir(&gacha_dir).map_err(|e| format!("Failed to read gacha directory: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().map(|e| e == "json").unwrap_or(false) {
            if let Ok(history) = read_json_file::<GachaHistory>(&path) {
                accounts.push(GachaAccount {
                    game: history.game,
                    uid: history.uid.clone(),
                    last_sync: history.last_sync,
                    total_records: history.records.len(),
                    region: history.region.clone(),
                });
            }
        }
    }

    // Sort by last sync (most recent first)
    accounts.sort_by(|a, b| b.last_sync.cmp(&a.last_sync));

    Ok(accounts)
}

/// Get gacha history for a specific account
#[tauri::command]
pub fn get_gacha_history(game: GachaGame, uid: String) -> Result<GachaHistory, String> {
    let path = get_gacha_history_path(game.short_name(), &uid);

    if !path.exists() {
        return Err(format!("No history found for {} UID {}", game.display_name(), uid));
    }

    read_json_file(&path).map_err(|e| format!("Failed to read gacha history: {}", e))
}

/// Get gacha statistics for an account
#[tauri::command]
pub fn get_gacha_stats(game: GachaGame, uid: String) -> Result<GachaStats, String> {
    let history = get_gacha_history(game, uid)?;
    Ok(history.calculate_stats())
}

/// Detect which gacha-supported games are installed (with caching)
#[tauri::command]
pub fn get_gacha_supported_games() -> Result<Vec<DetectedGachaGame>, String> {
    let cache_path = get_gacha_games_cache_path();

    // Check if valid cache exists
    if let Ok(cache) = read_json_file::<GachaGamesCache>(&cache_path) {
        // Check version matches
        if cache.version == CACHE_VERSION {
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs();

            let cache_age_hours = (now - cache.timestamp) / 3600;

            if cache_age_hours < CACHE_VALIDITY_HOURS {
                info!("Using cached gacha games ({}h old)", cache_age_hours);
                return Ok(cache.games);
            }
        } else {
            info!("Cache version mismatch (got {}, expected {}), refreshing", cache.version, CACHE_VERSION);
        }
    }

    // No valid cache, detect games
    info!("Detecting gacha games (cache miss or expired)");
    let games = detect_gacha_games_internal()?;

    // Save to cache
    let cache = GachaGamesCache {
        version: CACHE_VERSION,
        games: games.clone(),
        timestamp: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs(),
    };

    if let Err(e) = write_json_file(&cache_path, &cache) {
        error!("Failed to write gacha games cache: {}", e);
    }

    Ok(games)
}

/// Force refresh the gacha games cache
#[tauri::command]
pub fn refresh_gacha_games_cache() -> Result<Vec<DetectedGachaGame>, String> {
    info!("Force refreshing gacha games cache");

    let games = detect_gacha_games_internal()?;

    // Save to cache
    let cache_path = get_gacha_games_cache_path();
    let cache = GachaGamesCache {
        version: CACHE_VERSION,
        games: games.clone(),
        timestamp: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs(),
    };

    if let Err(e) = write_json_file(&cache_path, &cache) {
        error!("Failed to write gacha games cache: {}", e);
    }

    Ok(games)
}

/// Internal function to detect gacha games
fn detect_gacha_games_internal() -> Result<Vec<DetectedGachaGame>, String> {
    let detected_games = detect_hoyoplay_games();
    let mut result = Vec::new();

    // Map detected games to gacha games
    for game in detected_games {
        let gacha_game = match game.name.as_str() {
            "Genshin Impact" => Some(GachaGame::Genshin),
            "Star Rail" => Some(GachaGame::StarRail),
            "Zenless Zone Zero" => Some(GachaGame::Zzz),
            _ => None,
        };

        if let Some(gacha_game) = gacha_game {
            // Check if cache file exists
            let cache_path = Path::new(&game.install_path).join(gacha_game.cache_path());
            let cache_exists = cache_path.exists() || find_cache_path(&game.install_path, &gacha_game).is_some();

            result.push(DetectedGachaGame {
                game: gacha_game,
                install_path: game.install_path,
                cache_exists,
                icon_path: game.icon_path,
            });
        }
    }

    // Deduplicate by game type (keep first found)
    result.sort_by_key(|g| g.game as u8);
    result.dedup_by(|a, b| a.game == b.game);

    Ok(result)
}

/// Get the icon path for a gacha game
#[tauri::command]
pub fn get_gacha_game_icon_path(game: GachaGame) -> Result<String, String> {
    let icons_dir = get_icons_dir();

    let filename = match game {
        GachaGame::Genshin => "GenshinImpact.png",
        GachaGame::StarRail => "StarRail.png",
        GachaGame::Zzz => "ZenlessZoneZero.png",
    };

    let icon_path = icons_dir.join(filename);
    Ok(icon_path.to_string_lossy().to_string())
}

/// Find the actual cache path, handling version directories
fn find_cache_path(install_path: &str, game: &GachaGame) -> Option<String> {
    let base_cache_path = game.cache_path();

    // Direct path first
    let direct_path = Path::new(install_path).join(base_cache_path);
    if direct_path.exists() {
        return Some(direct_path.to_string_lossy().to_string());
    }

    // Search for versioned web cache directories
    let data_folder = match game {
        GachaGame::Genshin => "GenshinImpact_Data",
        GachaGame::StarRail => "StarRail_Data",
        GachaGame::Zzz => "ZenlessZoneZero_Data",
    };

    let web_caches_dir = Path::new(install_path).join(data_folder).join("webCaches");
    if !web_caches_dir.exists() {
        return None;
    }

    // Look for version directories - sort by version number descending to get newest first
    if let Ok(entries) = fs::read_dir(&web_caches_dir) {
        let mut version_dirs: Vec<_> = entries
            .flatten()
            .filter(|e| e.path().is_dir())
            .collect();

        // Sort by version number descending (e.g., "2.44.0.0" > "2.40.0.0")
        version_dirs.sort_by(|a, b| {
            let parse_version = |name: &str| -> Vec<u32> {
                name.split('.')
                    .filter_map(|s| s.parse().ok())
                    .collect()
            };
            let va = parse_version(&a.file_name().to_string_lossy());
            let vb = parse_version(&b.file_name().to_string_lossy());
            vb.cmp(&va) // Reverse order for descending
        });

        for entry in version_dirs {
            let cache_data = entry.path().join("Cache").join("Cache_Data").join("data_2");
            if cache_data.exists() {
                return Some(cache_data.to_string_lossy().to_string());
            }
        }
    }

    None
}

/// Refresh gacha history from game cache
#[tauri::command]
pub async fn refresh_gacha_history(
    app: AppHandle,
    request: RefreshGachaRequest,
) -> Result<GachaHistory, String> {
    info!(
        "Refreshing gacha history for {} at {}",
        request.game.display_name(),
        request.game_path
    );

    // Emit progress event
    let _ = app.emit(
        "gacha:progress",
        serde_json::json!({
            "game": request.game,
            "stage": "starting",
            "percent": 0
        }),
    );

    // Load existing history to get last_id for incremental sync
    let existing_history = {
        let gacha_dir = get_gacha_dir();
        if gacha_dir.exists() {
            // We don't know the UID yet, so we'll check after the worker returns
            None
        } else {
            None
        }
    };

    // Prepare input for Python worker
    let worker_input = serde_json::json!({
        "game": request.game.short_name(),
        "game_path": request.game_path,
        "last_id": existing_history.as_ref().and_then(|h: &GachaHistory| h.latest_id()),
    });

    // Spawn Python worker
    let result = spawn_python_worker_async("gacha_history_worker.py", worker_input, None)
        .await
        .map_err(|e| {
            error!("Gacha worker failed: {}", e);
            e
        })?;

    // Parse worker result
    let worker_result: GachaWorkerResult = serde_json::from_value(result)
        .map_err(|e| format!("Failed to parse worker result: {}", e))?;

    info!(
        "Fetched {} records for UID {}",
        worker_result.records.len(),
        worker_result.uid
    );

    // Load or create history
    let history_path = get_gacha_history_path(request.game.short_name(), &worker_result.uid);
    let mut history = if history_path.exists() {
        read_json_file::<GachaHistory>(&history_path).unwrap_or_else(|_| {
            GachaHistory::new(request.game, worker_result.uid.clone())
        })
    } else {
        GachaHistory::new(request.game, worker_result.uid.clone())
    };

    // Merge new records
    let new_count = history.merge(worker_result.records);

    if let Some(region) = worker_result.region {
        history.region = Some(region);
    }

    // Save updated history
    let gacha_dir = get_gacha_dir();
    if !gacha_dir.exists() {
        fs::create_dir_all(&gacha_dir).map_err(|e| format!("Failed to create gacha directory: {}", e))?;
    }

    write_json_file(&history_path, &history)
        .map_err(|e| format!("Failed to save gacha history: {}", e))?;

    info!(
        "Saved gacha history: {} total records, {} new",
        history.records.len(),
        new_count
    );

    // Emit completion event
    let _ = app.emit(
        "gacha:progress",
        serde_json::json!({
            "game": request.game,
            "stage": "complete",
            "percent": 100,
            "new_records": new_count
        }),
    );

    Ok(history)
}

/// Delete gacha history for an account
#[tauri::command]
pub fn delete_gacha_history(game: GachaGame, uid: String) -> Result<(), String> {
    let path = get_gacha_history_path(game.short_name(), &uid);

    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("Failed to delete gacha history: {}", e))?;
        info!("Deleted gacha history for {} UID {}", game.display_name(), uid);
    }

    Ok(())
}

/// Export gacha history to UIGF format
#[tauri::command]
pub fn export_gacha_uigf(accounts: Vec<GachaAccount>, version: String) -> Result<UigfExport, String> {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();

    let mut export = UigfExport {
        info: UigfInfo {
            export_timestamp: timestamp,
            export_app: "Atlas".to_string(),
            export_app_version: version,
            version: "v4.0".to_string(),
        },
        hk4e: None,
        hkrpg: None,
        nap: None,
    };

    for account in accounts {
        let history = get_gacha_history(account.game, account.uid.clone())?;
        let records: Vec<UigfRecord> = history.records.iter().map(UigfRecord::from).collect();

        let game_data = UigfGameData {
            uid: account.uid,
            list: records,
        };

        match account.game {
            GachaGame::Genshin => {
                export.hk4e.get_or_insert_with(Vec::new).push(game_data);
            }
            GachaGame::StarRail => {
                export.hkrpg.get_or_insert_with(Vec::new).push(game_data);
            }
            GachaGame::Zzz => {
                export.nap.get_or_insert_with(Vec::new).push(game_data);
            }
        }
    }

    Ok(export)
}

/// Import gacha history from UIGF format
#[tauri::command]
pub fn import_gacha_uigf(data: UigfExport) -> Result<Vec<GachaAccount>, String> {
    let mut imported_accounts = Vec::new();
    let gacha_dir = get_gacha_dir();

    if !gacha_dir.exists() {
        fs::create_dir_all(&gacha_dir).map_err(|e| format!("Failed to create gacha directory: {}", e))?;
    }

    // Helper to import game data
    let import_game = |game: GachaGame, game_data: Option<Vec<UigfGameData>>| -> Result<Vec<GachaAccount>, String> {
        let mut accounts = Vec::new();

        if let Some(data_list) = game_data {
            for data in data_list {
                let history_path = get_gacha_history_path(game.short_name(), &data.uid);

                // Load existing or create new
                let mut history = if history_path.exists() {
                    read_json_file::<GachaHistory>(&history_path)
                        .unwrap_or_else(|_| GachaHistory::new(game, data.uid.clone()))
                } else {
                    GachaHistory::new(game, data.uid.clone())
                };

                // Convert UIGF records to GachaRecord
                let records: Vec<crate::models::GachaRecord> = data
                    .list
                    .into_iter()
                    .map(|r| crate::models::GachaRecord {
                        id: r.id,
                        uid: history.uid.clone(),
                        gacha_type: r.gacha_type,
                        item_id: r.item_id,
                        name: r.name,
                        item_type: r.item_type,
                        rank_type: r.rank_type,
                        time: r.time,
                    })
                    .collect();

                history.merge(records);

                // Save
                write_json_file(&history_path, &history)
                    .map_err(|e| format!("Failed to save imported history: {}", e))?;

                accounts.push(GachaAccount {
                    game,
                    uid: history.uid.clone(),
                    last_sync: history.last_sync,
                    total_records: history.records.len(),
                    region: history.region.clone(),
                });
            }
        }

        Ok(accounts)
    };

    imported_accounts.extend(import_game(GachaGame::Genshin, data.hk4e)?);
    imported_accounts.extend(import_game(GachaGame::StarRail, data.hkrpg)?);
    imported_accounts.extend(import_game(GachaGame::Zzz, data.nap)?);

    info!("Imported {} gacha accounts", imported_accounts.len());

    Ok(imported_accounts)
}
