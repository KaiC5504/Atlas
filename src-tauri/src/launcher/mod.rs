pub mod steam_detector;
pub mod hoyoplay_detector;
pub mod riot_detector;  // NEW: Riot Games detector
pub mod playtime_tracker;
pub mod icon_extractor;

pub use steam_detector::*;
pub use hoyoplay_detector::*;
pub use riot_detector::*;  // NEW: Export Riot detector
pub use playtime_tracker::*;
