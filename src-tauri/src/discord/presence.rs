use crate::models::gaming::BottleneckType;
use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::time::{SystemTime, UNIX_EPOCH};

const DISCORD_CLIENT_ID: &str = "1461387162720272445";

/// Thread-safe Discord Rich Presence manager
pub struct DiscordPresenceManager {
    client: Arc<Mutex<Option<DiscordIpcClient>>>,
    is_enabled: Arc<AtomicBool>,
    is_connected: Arc<AtomicBool>,
}

impl Default for DiscordPresenceManager {
    fn default() -> Self {
        Self::new()
    }
}

impl DiscordPresenceManager {
    pub fn new() -> Self {
        Self {
            client: Arc::new(Mutex::new(None)),
            is_enabled: Arc::new(AtomicBool::new(false)),
            is_connected: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Connect to Discord
    pub fn connect(&self) -> Result<(), String> {
        let mut client = DiscordIpcClient::new(DISCORD_CLIENT_ID);

        client
            .connect()
            .map_err(|e| format!("Failed to connect to Discord: {}", e))?;

        if let Ok(mut c) = self.client.lock() {
            *c = Some(client);
        }

        self.is_connected.store(true, Ordering::SeqCst);
        self.is_enabled.store(true, Ordering::SeqCst);

        self.set_idle_presence()?;

        Ok(())
    }

    /// Disconnect from Discord
    pub fn disconnect(&self) -> Result<(), String> {
        self.is_enabled.store(false, Ordering::SeqCst);

        if let Ok(mut client_guard) = self.client.lock() {
            if let Some(ref mut client) = *client_guard {
                let _ = client.close();
            }
            *client_guard = None;
        }

        self.is_connected.store(false, Ordering::SeqCst);
        Ok(())
    }

    /// Check if Rich Presence is enabled
    pub fn is_enabled(&self) -> bool {
        self.is_enabled.load(Ordering::SeqCst)
    }

    /// Check if connected to Discord
    pub fn is_connected(&self) -> bool {
        self.is_connected.load(Ordering::SeqCst)
    }

    /// Set idle presence
    pub fn set_idle_presence(&self) -> Result<(), String> {
        if !self.is_enabled() {
            return Ok(());
        }

        self.set_presence("💤 - Idle", "Atlas", None)
    }

    /// Update presence for gaming session with bottleneck status
    pub fn update_gaming_presence(
        &self,
        game_name: &str,
        bottleneck_type: &BottleneckType,
    ) -> Result<(), String> {
        if !self.is_enabled() {
            return Ok(());
        }

        let details = format!("Playing {}", game_name);
        let state = bottleneck_to_status(bottleneck_type);

        self.set_presence(&state, &details, Some(get_current_timestamp()))
    }

    fn set_presence(
        &self,
        state: &str,
        details: &str,
        start_timestamp: Option<i64>,
    ) -> Result<(), String> {
        let mut client_guard = self
            .client
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;

        if let Some(ref mut client) = *client_guard {
            let mut activity_builder = activity::Activity::new().state(state).details(details);

            if let Some(ts) = start_timestamp {
                activity_builder =
                    activity_builder.timestamps(activity::Timestamps::new().start(ts));
            }

            activity_builder = activity_builder.assets(
                activity::Assets::new()
                    .large_image("atlas_logo")
                    .large_text("Atlas"),
            );

            client
                .set_activity(activity_builder)
                .map_err(|e| format!("Failed to set activity: {}", e))?;
        }

        Ok(())
    }

    #[allow(dead_code)] 
    pub fn try_reconnect(&self) -> Result<(), String> {
        if self.is_connected() {
            return Ok(());
        }

        self.connect()
    }
}

impl Drop for DiscordPresenceManager {
    fn drop(&mut self) {
        let _ = self.disconnect();
    }
}

/// Convert bottleneck type to emoji + word status
fn bottleneck_to_status(bottleneck_type: &BottleneckType) -> String {
    match bottleneck_type {
        BottleneckType::Balanced => "✨ - Smooth".to_string(),
        BottleneckType::CpuBound => "💪 - Pushing".to_string(),
        BottleneckType::GpuBound => "🔥 - Maxed".to_string(),
        BottleneckType::CpuThermal | BottleneckType::GpuThermal => "🌡️ - Toasty".to_string(),
        BottleneckType::RamLimited => "📦 - Packed".to_string(),
        BottleneckType::VramLimited => "🎨 - Full".to_string(),
    }
}

fn get_current_timestamp() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}
