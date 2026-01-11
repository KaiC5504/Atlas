// Riot authentication models
use serde::{Deserialize, Serialize};

/// Riot authentication cookies captured from WebView
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RiotAuthCookies {
    /// Device ID cookie
    pub tdid: Option<String>,
    /// Client ID cookie
    pub clid: Option<String>,
    /// Client Session ID
    pub csid: Option<String>,
    /// Session ID (most important for reauth)
    pub ssid: Option<String>,
    /// Subject/User ID (PUUID)
    pub sub: Option<String>,
    /// ISO timestamp when cookies were captured
    pub captured_at: Option<String>,
}

impl RiotAuthCookies {
    /// Check if we have minimum required cookies for reauth (ssid is required)
    pub fn is_complete(&self) -> bool {
        self.ssid.is_some()
    }

    /// Check if we have all cookies for maximum reauth duration (~3 weeks)
    pub fn has_full_auth(&self) -> bool {
        self.tdid.is_some()
            && self.clid.is_some()
            && self.csid.is_some()
            && self.ssid.is_some()
            && self.sub.is_some()
    }
}

/// Authentication status for the frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthStatus {
    pub is_authenticated: bool,
    pub has_full_cookies: bool,
    pub username: Option<String>,
    pub region: String,
    pub puuid: Option<String>,
    /// Hint about cookie validity ("3 weeks" or "1 week")
    pub expires_hint: Option<String>,
}
