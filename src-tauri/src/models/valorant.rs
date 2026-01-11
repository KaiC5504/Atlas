// Valorant data models
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValorantItem {
    pub name: String,
    pub price: u32,
    pub image_url: Option<String>,
    pub item_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValorantStore {
    pub date: String,
    pub items: Vec<ValorantItem>,
    pub checked_at: String,
    #[serde(default)]
    pub is_real_data: Option<bool>,
}

impl ValorantStore {
    pub fn new(items: Vec<ValorantItem>) -> Self {
        let now = chrono::Utc::now();
        Self {
            date: now.format("%Y-%m-%d").to_string(),
            items,
            checked_at: now.to_rfc3339(),
            is_real_data: None,
        }
    }
}
