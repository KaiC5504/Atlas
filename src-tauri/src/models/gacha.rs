// Gacha history models for HoYoverse games (Genshin Impact, Honkai Star Rail, ZZZ)

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Supported HoYoverse games for gacha history
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GachaGame {
    Genshin,
    StarRail,
    Zzz,
}

impl GachaGame {
    pub fn display_name(&self) -> &'static str {
        match self {
            GachaGame::Genshin => "Genshin Impact",
            GachaGame::StarRail => "Honkai: Star Rail",
            GachaGame::Zzz => "Zenless Zone Zero",
        }
    }

    pub fn short_name(&self) -> &'static str {
        match self {
            GachaGame::Genshin => "genshin",
            GachaGame::StarRail => "starrail",
            GachaGame::Zzz => "zzz",
        }
    }

    /// UIGF v4 key for this game
    pub fn uigf_key(&self) -> &'static str {
        match self {
            GachaGame::Genshin => "hk4e",
            GachaGame::StarRail => "hkrpg",
            GachaGame::Zzz => "nap",
        }
    }

    /// Get web cache path relative to game install directory
    pub fn cache_path(&self) -> &'static str {
        match self {
            GachaGame::Genshin => "GenshinImpact_Data/webCaches/Cache/Cache_Data/data_2",
            GachaGame::StarRail => "StarRail_Data/webCaches/Cache/Cache_Data/data_2",
            GachaGame::Zzz => "ZenlessZoneZero_Data/webCaches/Cache/Cache_Data/data_2",
        }
    }

    /// API endpoint for gacha history (Global version)
    pub fn api_endpoint(&self) -> &'static str {
        match self {
            GachaGame::Genshin => "https://public-operation-hk4e-sg.hoyoverse.com/gacha_info/api/getGachaLog",
            GachaGame::StarRail => "https://public-operation-hkrpg-sg.hoyoverse.com/common/gacha_record/api/getGachaLog",
            GachaGame::Zzz => "https://public-operation-nap-sg.hoyoverse.com/common/gacha_record/api/getGachaLog",
        }
    }

    /// Get gacha/banner types for this game
    pub fn gacha_types(&self) -> Vec<GachaType> {
        match self {
            GachaGame::Genshin => vec![
                GachaType { id: "301".to_string(), name: "Character Event".to_string() },
                GachaType { id: "302".to_string(), name: "Weapon Event".to_string() },
                GachaType { id: "200".to_string(), name: "Standard".to_string() },
                GachaType { id: "100".to_string(), name: "Beginner".to_string() },
                GachaType { id: "500".to_string(), name: "Chronicled Wish".to_string() },
            ],
            GachaGame::StarRail => vec![
                GachaType { id: "11".to_string(), name: "Character Event".to_string() },
                GachaType { id: "12".to_string(), name: "Light Cone Event".to_string() },
                GachaType { id: "1".to_string(), name: "Standard".to_string() },
                GachaType { id: "2".to_string(), name: "Departure".to_string() },
            ],
            GachaGame::Zzz => vec![
                GachaType { id: "2001".to_string(), name: "Exclusive Channel".to_string() },
                GachaType { id: "3001".to_string(), name: "W-Engine Channel".to_string() },
                GachaType { id: "1001".to_string(), name: "Standard Channel".to_string() },
                GachaType { id: "5001".to_string(), name: "Bangboo Channel".to_string() },
            ],
        }
    }
}

/// Banner/gacha type information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GachaType {
    pub id: String,
    pub name: String,
}

/// A single gacha/wish record
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GachaRecord {
    /// Unique ID from the API
    pub id: String,
    /// User ID
    pub uid: String,
    /// Banner/gacha type ID
    pub gacha_type: String,
    /// Item ID (if available)
    pub item_id: Option<String>,
    /// Item name
    pub name: String,
    /// Item type (Character/Weapon/Light Cone/W-Engine/Bangboo)
    pub item_type: String,
    /// Rarity (3, 4, or 5)
    pub rank_type: String,
    /// Pull timestamp (ISO 8601 format)
    pub time: String,
}

impl GachaRecord {
    /// Get rarity as a number
    pub fn rarity(&self) -> u8 {
        self.rank_type.parse().unwrap_or(3)
    }
}

/// Gacha history for a specific account
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GachaHistory {
    /// Game this history belongs to
    pub game: GachaGame,
    /// User ID
    pub uid: String,
    /// All gacha records, sorted by ID (newest first)
    pub records: Vec<GachaRecord>,
    /// Last sync timestamp (Unix ms)
    pub last_sync: u64,
    /// Region/server (e.g., "os_asia", "os_euro", "os_usa")
    pub region: Option<String>,
}

impl GachaHistory {
    pub fn new(game: GachaGame, uid: String) -> Self {
        Self {
            game,
            uid,
            records: Vec::new(),
            last_sync: 0,
            region: None,
        }
    }

    /// Merge new records into existing history (incremental sync)
    /// Returns the number of new records added
    pub fn merge(&mut self, new_records: Vec<GachaRecord>) -> usize {
        let existing_ids: std::collections::HashSet<String> =
            self.records.iter().map(|r| r.id.clone()).collect();

        let mut added = 0;
        for record in new_records {
            if !existing_ids.contains(&record.id) {
                self.records.push(record);
                added += 1;
            }
        }

        // Sort by ID descending (newest first)
        self.records.sort_by(|a, b| b.id.cmp(&a.id));
        self.last_sync = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        added
    }

    /// Get the latest record ID for incremental sync
    pub fn latest_id(&self) -> Option<&str> {
        self.records.first().map(|r| r.id.as_str())
    }

    /// Calculate statistics for this history
    pub fn calculate_stats(&self) -> GachaStats {
        let mut stats = GachaStats::default();
        let mut banner_records: HashMap<String, Vec<&GachaRecord>> = HashMap::new();

        for record in &self.records {
            banner_records
                .entry(record.gacha_type.clone())
                .or_default()
                .push(record);
        }

        stats.total_pulls = self.records.len();
        stats.five_star_count = self.records.iter().filter(|r| r.rarity() == 5).count();
        stats.four_star_count = self.records.iter().filter(|r| r.rarity() == 4).count();
        stats.three_star_count = self.records.iter().filter(|r| r.rarity() == 3).count();

        // Calculate per-banner stats
        for (gacha_type, records) in banner_records {
            let banner_stats = Self::calculate_banner_stats(&records);
            stats.banner_stats.insert(gacha_type, banner_stats);
        }

        stats
    }

    fn calculate_banner_stats(records: &[&GachaRecord]) -> BannerStats {
        let mut stats = BannerStats::default();
        stats.total_pulls = records.len();

        // Records are sorted newest first, so we need to reverse for pity calculation
        let mut pity_counter = 0;
        let mut pity_history: Vec<u32> = Vec::new();

        for record in records.iter().rev() {
            pity_counter += 1;
            if record.rarity() == 5 {
                pity_history.push(pity_counter);
                stats.five_star_pulls.push(FiveStarPull {
                    name: record.name.clone(),
                    pity: pity_counter,
                    time: record.time.clone(),
                });
                pity_counter = 0;
            }
        }

        stats.current_pity = pity_counter;
        stats.five_star_count = pity_history.len();
        stats.four_star_count = records.iter().filter(|r| r.rarity() == 4).count();

        if !pity_history.is_empty() {
            stats.average_pity = pity_history.iter().sum::<u32>() as f64 / pity_history.len() as f64;
        }

        stats
    }
}

/// Aggregated gacha statistics
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct GachaStats {
    pub total_pulls: usize,
    pub five_star_count: usize,
    pub four_star_count: usize,
    pub three_star_count: usize,
    /// Stats per banner type
    pub banner_stats: HashMap<String, BannerStats>,
}

impl GachaStats {
    pub fn five_star_rate(&self) -> f64 {
        if self.total_pulls == 0 {
            return 0.0;
        }
        (self.five_star_count as f64 / self.total_pulls as f64) * 100.0
    }

    pub fn four_star_rate(&self) -> f64 {
        if self.total_pulls == 0 {
            return 0.0;
        }
        (self.four_star_count as f64 / self.total_pulls as f64) * 100.0
    }
}

/// Statistics for a specific banner
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct BannerStats {
    pub total_pulls: usize,
    pub five_star_count: usize,
    pub four_star_count: usize,
    pub current_pity: u32,
    pub average_pity: f64,
    /// List of 5-star pulls with pity info
    pub five_star_pulls: Vec<FiveStarPull>,
}

/// Information about a 5-star pull
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FiveStarPull {
    pub name: String,
    pub pity: u32,
    pub time: String,
}

/// Account info for gacha history
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GachaAccount {
    pub game: GachaGame,
    pub uid: String,
    pub last_sync: u64,
    pub total_records: usize,
    pub region: Option<String>,
}

/// Request to refresh gacha history
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RefreshGachaRequest {
    pub game: GachaGame,
    pub game_path: String,
}

/// Result from Python worker
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GachaWorkerResult {
    pub uid: String,
    pub records: Vec<GachaRecord>,
    pub region: Option<String>,
}

/// UIGF v4 export format
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UigfExport {
    pub info: UigfInfo,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hk4e: Option<Vec<UigfGameData>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hkrpg: Option<Vec<UigfGameData>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub nap: Option<Vec<UigfGameData>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UigfInfo {
    pub export_timestamp: u64,
    pub export_app: String,
    pub export_app_version: String,
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UigfGameData {
    pub uid: String,
    pub list: Vec<UigfRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UigfRecord {
    pub id: String,
    pub gacha_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub item_id: Option<String>,
    pub name: String,
    pub item_type: String,
    pub rank_type: String,
    pub time: String,
}

impl From<&GachaRecord> for UigfRecord {
    fn from(record: &GachaRecord) -> Self {
        Self {
            id: record.id.clone(),
            gacha_type: record.gacha_type.clone(),
            item_id: record.item_id.clone(),
            name: record.name.clone(),
            item_type: record.item_type.clone(),
            rank_type: record.rank_type.clone(),
            time: record.time.clone(),
        }
    }
}

/// Detected game installation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedGachaGame {
    pub game: GachaGame,
    pub install_path: String,
    pub cache_exists: bool,
    pub icon_path: Option<String>,
}
