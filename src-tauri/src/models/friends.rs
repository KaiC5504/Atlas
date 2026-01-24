// Friends feature models
use serde::{Deserialize, Serialize};

/// Relationship type between users
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RelationshipType {
    Partner,
    Friend,
}

/// User presence status
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PresenceStatus {
    Online,
    Away,
    InGame,
    Offline,
}

impl Default for PresenceStatus {
    fn default() -> Self {
        Self::Offline
    }
}

/// Memory type for shared memories
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MemoryType {
    Photo,
    Video,
    Voice,
    Note,
    Countdown,
    Milestone,
}

/// User profile
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub friend_code: String,
    pub username: String,
    pub avatar_url: Option<String>,
    pub partner_id: Option<String>,
    pub created_at: u64,
}

impl User {
    pub fn new(id: String, username: String, friend_code: String) -> Self {
        Self {
            id,
            friend_code,
            username,
            avatar_url: None,
            partner_id: None,
            created_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64,
        }
    }
}

/// Local user data (stored on client)
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct LocalUserData {
    pub id: Option<String>,
    pub friend_code: Option<String>,
    pub username: Option<String>,
    pub server_url: String,
    pub auth_token: Option<String>,
    pub partner_id: Option<String>,
    pub last_sync: u64,
}

/// Connection state for server sync
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionState {
    Disconnected,
    Connecting,
    Connected,
    Error,
}

impl Default for ConnectionState {
    fn default() -> Self {
        Self::Disconnected
    }
}

/// Server sync result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FriendsSyncResult {
    pub success: bool,
    pub timestamp: u64,
    pub has_new_data: bool,
    pub new_messages_count: usize,
    pub new_pokes_count: usize,
    pub error: Option<String>,
}

/// Offline action to be synced when connection is restored
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OfflineAction {
    pub id: String,
    pub action_type: OfflineActionType,
    pub payload: serde_json::Value,
    pub created_at: u64,
}

/// Types of actions that can be queued offline
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OfflineActionType {
    SendMessage,
    SendPoke,
    CreateMemory,
    CreateCalendarEvent,
    UpdateCalendarEvent,
    DeleteCalendarEvent,
    DeleteMemory,
    UpdatePresence,
}

/// Friend relationship
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Friend {
    pub id: String,
    pub user_id: String,
    pub friend_user_id: String,
    pub relationship_type: RelationshipType,
    pub nickname: Option<String>,
    pub created_at: u64,
}

/// Friend with user details (for display)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FriendWithDetails {
    pub friend: Friend,
    pub user: User,
    pub presence: Option<Presence>,
}

/// User presence (real-time status)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Presence {
    pub user_id: String,
    pub status: PresenceStatus,
    pub current_game: Option<String>,
    pub game_start_time: Option<u64>,
    pub mood_message: Option<String>,
    pub performance_stats: Option<PerformanceSnapshot>,
    pub last_updated: u64,
    pub last_seen: u64,
}

impl Presence {
    pub fn new(user_id: String) -> Self {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;
        Self {
            user_id,
            status: PresenceStatus::Offline,
            current_game: None,
            game_start_time: None,
            mood_message: None,
            performance_stats: None,
            last_updated: now,
            last_seen: now,
        }
    }
}

/// Performance snapshot for sharing
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceSnapshot {
    pub cpu_usage: f32,
    pub gpu_usage: f32,
    pub fps: Option<f32>,
    pub memory_usage: f32,
}

/// Shared memory (photos, videos, notes)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Memory {
    pub id: String,
    pub user_id: String,
    pub partner_id: String,
    pub memory_type: MemoryType,
    pub content_url: Option<String>,
    pub content_text: Option<String>,
    pub caption: Option<String>,
    pub target_date: Option<u64>,
    pub created_at: u64,
}

impl Memory {
    pub fn new(
        user_id: String,
        partner_id: String,
        memory_type: MemoryType,
    ) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            user_id,
            partner_id,
            memory_type,
            content_url: None,
            content_text: None,
            caption: None,
            target_date: None,
            created_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64,
        }
    }
}

/// Simple message between partners
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub id: String,
    pub sender_id: String,
    pub receiver_id: String,
    pub content: String,
    pub created_at: u64,
    pub read_at: Option<u64>,
}

impl Message {
    pub fn new(sender_id: String, receiver_id: String, content: String) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            sender_id,
            receiver_id,
            content,
            created_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64,
            read_at: None,
        }
    }
}

/// Calendar event
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalendarEvent {
    pub id: String,
    pub user_id: String,
    pub partner_id: String,
    pub title: String,
    pub description: Option<String>,
    pub datetime: u64,
    pub timezone: String,
    pub reminder_minutes: Option<u32>,
    pub is_recurring: bool,
    pub recurrence_pattern: Option<String>,
    pub created_at: u64,
}

impl CalendarEvent {
    pub fn new(
        user_id: String,
        partner_id: String,
        title: String,
        datetime: u64,
        timezone: String,
    ) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            user_id,
            partner_id,
            title,
            description: None,
            datetime,
            timezone,
            reminder_minutes: Some(30),
            is_recurring: false,
            recurrence_pattern: None,
            created_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64,
        }
    }
}

/// Poke/reaction notification
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Poke {
    pub id: String,
    pub sender_id: String,
    pub receiver_id: String,
    pub emoji: String,
    pub created_at: u64,
}

impl Poke {
    pub fn new(sender_id: String, receiver_id: String, emoji: String) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            sender_id,
            receiver_id,
            emoji,
            created_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64,
        }
    }
}

/// Gacha pull notification for sharing
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GachaPullNotification {
    pub user_id: String,
    pub game: String,
    pub item_name: String,
    pub rarity: u8,
    pub pity: u32,
    pub timestamp: u64,
}

/// Shared gacha stats for comparison
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SharedGachaStats {
    pub game: String,
    pub total_pulls: usize,
    pub five_star_count: usize,
    pub four_star_count: usize,
    pub average_pity: f64,
    pub current_pity: u32,
    pub luck_score: f64,
}

/// Wishlist item
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WishlistItem {
    pub id: String,
    pub user_id: String,
    pub game: String,
    pub item_name: String,
    pub item_type: String,
    pub priority: u8,
    pub created_at: u64,
}

/// Friend request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FriendRequest {
    pub id: String,
    pub from_user_id: String,
    pub to_user_id: String,
    pub relationship_type: RelationshipType,
    pub status: FriendRequestStatus,
    pub created_at: u64,
}

/// Friend request status
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FriendRequestStatus {
    Pending,
    Accepted,
    Rejected,
    Cancelled,
}

/// Update presence request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdatePresenceRequest {
    pub status: Option<PresenceStatus>,
    pub current_game: Option<String>,
    pub mood_message: Option<String>,
    pub performance_stats: Option<PerformanceSnapshot>,
}

/// Create memory request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateMemoryRequest {
    pub memory_type: MemoryType,
    pub content_text: Option<String>,
    pub caption: Option<String>,
    pub target_date: Option<u64>,
}

/// Create calendar event request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateCalendarEventRequest {
    pub title: String,
    pub description: Option<String>,
    pub datetime: u64,
    pub timezone: String,
    pub reminder_minutes: Option<u32>,
    pub is_recurring: bool,
    pub recurrence_pattern: Option<String>,
}

/// WebSocket message types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum WebSocketMessage {
    PresenceUpdate(Presence),
    Poke(Poke),
    NewMessage(Message),
    GachaPull(GachaPullNotification),
    FriendRequest(FriendRequest),
    FriendRequestAccepted(Friend),
    MemoryAdded(Memory),
    CalendarEventAdded(CalendarEvent),
    Heartbeat,
    Error { message: String },
}

/// Server response for partner presence
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerPresenceResponse {
    pub user_id: String,
    pub username: String,
    pub status: String,
    pub current_game: Option<String>,
    pub mood_message: Option<String>,
    pub performance_stats: Option<PerformanceSnapshot>,
    pub last_updated: u64,
}

/// Server sync poll response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncPollResponse {
    pub timestamp: u64,
    pub presence: Option<ServerPresenceResponse>,
    pub messages: Vec<Message>,
    pub pokes: Vec<ServerPoke>,
    pub memories: Vec<Memory>,
    pub calendar_events: Vec<CalendarEvent>,
    pub has_new_data: bool,
}

/// Server poke with sender username
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerPoke {
    pub id: String,
    pub sender_id: String,
    pub receiver_id: String,
    pub emoji: String,
    pub created_at: u64,
    pub sender_username: Option<String>,
}

/// Server registration response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisterResponse {
    pub id: String,
    pub friend_code: String,
    pub username: String,
    pub auth_token: String,
    pub partner_id: Option<String>,
}

/// Server validation response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidateResponse {
    pub valid: bool,
    pub user: Option<ValidatedUser>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidatedUser {
    pub id: String,
    pub friend_code: String,
    pub username: String,
}

/// Link partner response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinkPartnerResponse {
    pub success: bool,
    pub partner: Option<ValidatedUser>,
}

/// Sync state response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncStateResponse {
    pub timestamp: u64,
    pub has_partner: bool,
    pub partner: Option<ValidatedUser>,
    pub presence: Option<ServerPresenceResponse>,
    pub recent_messages: Vec<Message>,
    pub unread_count: usize,
    pub memories_count: usize,
    pub upcoming_events: Vec<CalendarEvent>,
}

/// Gacha stats for sharing with partner
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SharedGachaStatsPayload {
    pub game: String,
    pub total_pulls: usize,
    pub five_star_count: usize,
    pub four_star_count: usize,
    pub average_pity: f64,
    pub current_pity: u32,
}

/// Partner gacha stats response from server
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PartnerGachaStatsResponse {
    pub partner_id: String,
    pub partner_username: String,
    pub stats: Vec<PartnerGachaStats>,
}

/// Individual partner gacha stats
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PartnerGachaStats {
    pub user_id: String,
    pub username: String,
    pub game: String,
    pub total_pulls: usize,
    pub five_star_count: usize,
    pub four_star_count: usize,
    pub average_pity: f64,
    pub current_pity: u32,
    pub updated_at: u64,
}
