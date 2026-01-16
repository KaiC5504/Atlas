use serde::{Deserialize, Serialize};

/// Source of a detected game
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum GameSource {
    Steam,
    HoyoPlay,
    Manual,
}

/// Request to add a manual game
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddGameRequest {
    pub name: String,
    pub executable_path: String,
    pub icon_path: Option<String>,
}

/// A game detected by scanners but not yet added to library
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedGame {
    pub name: String,
    pub executable_path: String,
    pub install_path: String,
    pub source: GameSource,
    pub app_id: Option<String>,  
    pub icon_path: Option<String>,
}

/// Game in the user's library
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryGame {
    pub id: String,              
    pub name: String,
    pub executable_path: String,
    pub install_path: String,
    pub source: GameSource,
    pub app_id: Option<String>,
    pub icon_path: Option<String>,
    pub process_name: String,    
    pub added_at: String,        
    pub last_played: Option<String>,  
    pub total_playtime_seconds: u64,  
}

/// The complete game library
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GameLibrary {
    pub games: Vec<LibraryGame>,
}

impl GameLibrary {
    pub fn new() -> Self {
        Self { games: vec![] }
    }

    pub fn find_by_id(&self, id: &str) -> Option<&LibraryGame> {
        self.games.iter().find(|g| g.id == id)
    }

    pub fn find_by_id_mut(&mut self, id: &str) -> Option<&mut LibraryGame> {
        self.games.iter_mut().find(|g| g.id == id)
    }

    #[allow(dead_code)]
    pub fn find_by_process_name(&self, process_name: &str) -> Option<&LibraryGame> {
        self.games.iter().find(|g|
            g.process_name.to_lowercase() == process_name.to_lowercase()
        )
    }

    pub fn has_game_with_path(&self, executable_path: &str) -> bool {
        self.games.iter().any(|g|
            g.executable_path.to_lowercase() == executable_path.to_lowercase()
        )
    }

    pub fn add_game(&mut self, game: LibraryGame) {
        self.games.push(game);
    }

    pub fn remove_game(&mut self, id: &str) -> bool {
        let initial_len = self.games.len();
        self.games.retain(|g| g.id != id);
        self.games.len() < initial_len
    }
}

#[derive(Debug, Clone)]
pub struct HoyoPlayGameConfig {
    pub name: &'static str,
    pub folder_name: &'static str,
    pub executable_name: &'static str,
    #[allow(dead_code)] 
    pub process_name: &'static str,
}

impl HoyoPlayGameConfig {
    pub const GENSHIN_IMPACT: HoyoPlayGameConfig = HoyoPlayGameConfig {
        name: "Genshin Impact",
        folder_name: "Genshin Impact Game",
        executable_name: "GenshinImpact.exe",
        process_name: "GenshinImpact.exe",
    };

    pub const HONKAI_STAR_RAIL: HoyoPlayGameConfig = HoyoPlayGameConfig {
        name: "Star Rail",
        folder_name: "Star Rail Games",
        executable_name: "StarRail.exe",
        process_name: "StarRail.exe",
    };

    pub const ZENLESS_ZONE_ZERO: HoyoPlayGameConfig = HoyoPlayGameConfig {
        name: "Zenless Zone Zero",
        folder_name: "ZenlessZoneZero Game",
        executable_name: "ZenlessZoneZero.exe",
        process_name: "ZenlessZoneZero.exe",
    };

    pub const HONKAI_IMPACT_3RD: HoyoPlayGameConfig = HoyoPlayGameConfig {
        name: "Honkai Impact 3rd",
        folder_name: "Honkai Impact 3rd",
        executable_name: "BH3.exe",
        process_name: "BH3.exe",
    };

    pub fn all() -> Vec<HoyoPlayGameConfig> {
        vec![
            Self::GENSHIN_IMPACT,
            Self::HONKAI_STAR_RAIL,
            Self::ZENLESS_ZONE_ZERO,
            Self::HONKAI_IMPACT_3RD,
        ]
    }
}
