use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackMetadata {
    pub title: String,                 
    pub artist: String,                
    pub title_pinyin: String,          
    pub artist_pinyin: String,         
    pub search_terms: Vec<String>,     
    pub duration: u32,                 
    pub thumbnail: String,           
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Playlist {
    pub name: String,
    pub tracks: Vec<String>,          
}

pub type MusicIndex = HashMap<String, TrackMetadata>;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SyncStatus {
    Idle,
    Syncing,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum PlaylistDownloadStatus {
    Idle,
    FetchingMetadata,
    Downloading,
    BuildingIndex,
    Uploading,
    UpdatingPlaylistJs,
    RestartingBot,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaylistUploaderProgress {
    pub stage: String,
    pub current: u32,
    pub total: u32,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadResult {
    pub success: bool,
    pub downloaded: u32,
    pub cached: u32,
    pub failed: u32,
    pub total: u32,
    pub index_entries: u32,
    pub playlist_tracks: u32,
    pub playlist_name: Option<String>,
    pub new_track_ids: Vec<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    pub success: bool,
    pub index_entries: u32,
    pub playlists_count: u32,
    pub playlist_names: Vec<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadResult {
    pub success: bool,
    pub uploaded_tracks: u32,
    pub skipped_tracks: u32,
    pub playlist_uploaded: bool,
    pub playlist_js_updated: bool,
    pub bot_restarted: bool,
    pub error: Option<String>,
}
