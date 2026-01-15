// Discord Rich Presence command handlers
use crate::discord::DiscordPresenceManager;
use std::sync::Arc;
use tauri::State;

/// Connect to Discord Rich Presence
#[tauri::command]
pub fn connect_discord(
    discord: State<'_, Arc<DiscordPresenceManager>>,
) -> Result<(), String> {
    discord.connect()
}

/// Disconnect from Discord
#[tauri::command]
pub fn disconnect_discord(
    discord: State<'_, Arc<DiscordPresenceManager>>,
) -> Result<(), String> {
    discord.disconnect()
}

/// Check if Discord Rich Presence is connected
#[tauri::command]
pub fn is_discord_connected(
    discord: State<'_, Arc<DiscordPresenceManager>>,
) -> bool {
    discord.is_connected()
}
