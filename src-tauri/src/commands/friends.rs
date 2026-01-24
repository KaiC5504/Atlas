// Friends feature commands
use crate::file_manager::{read_json_file, write_json_file};
use crate::models::{
    CalendarEvent, ConnectionState, CreateCalendarEventRequest, CreateMemoryRequest, Friend,
    FriendRequest, FriendRequestStatus, FriendWithDetails, LinkPartnerResponse, LocalUserData,
    Memory, MemoryType, Message, OfflineAction, OfflineActionType, PartnerGachaStats,
    PartnerGachaStatsResponse, PerformanceSnapshot, Poke, Presence, PresenceStatus,
    RegisterResponse, RelationshipType, ServerPoke, ServerPresenceResponse, SharedGachaStats,
    SharedGachaStatsPayload, SyncPollResponse, FriendsSyncResult, SyncStateResponse,
    UpdatePresenceRequest, User, ValidateResponse, WishlistItem,
};
use crate::utils::{
    get_friends_cache_json_path, get_friends_data_json_path, get_memories_dir,
    get_messages_cache_json_path,
};
use log::{error, info, warn};
use parking_lot::Mutex;
use rand::Rng;
use std::fs;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use tauri::Emitter;

// Default server URL
const DEFAULT_SERVER_URL: &str = "https://atlas-api.kaic5504.com";

// Global connection state
lazy_static::lazy_static! {
    static ref CONNECTION_STATE: Mutex<ConnectionState> = Mutex::new(ConnectionState::Disconnected);
    static ref POLLING_ACTIVE: AtomicBool = AtomicBool::new(false);
    static ref LAST_SYNC_TIMESTAMP: AtomicU64 = AtomicU64::new(0);
    static ref OFFLINE_QUEUE: Mutex<Vec<OfflineAction>> = Mutex::new(Vec::new());
}

// ============= HTTP Client Helpers =============

fn get_server_url() -> String {
    let user = get_local_user().unwrap_or_default();
    if user.server_url.is_empty() {
        DEFAULT_SERVER_URL.to_string()
    } else {
        user.server_url
    }
}

fn get_auth_token() -> Option<String> {
    get_local_user().ok()?.auth_token
}

fn make_request(method: &str, endpoint: &str) -> Result<ureq::Request, String> {
    let url = format!("{}{}", get_server_url(), endpoint);
    let req = match method {
        "GET" => ureq::get(&url),
        "POST" => ureq::post(&url),
        "PUT" => ureq::put(&url),
        "DELETE" => ureq::delete(&url),
        _ => return Err(format!("Unsupported method: {}", method)),
    };

    // Add auth token if available
    if let Some(token) = get_auth_token() {
        Ok(req.set("Authorization", &format!("Bearer {}", token)))
    } else {
        Ok(req)
    }
}

fn handle_response<T: serde::de::DeserializeOwned>(response: ureq::Response) -> Result<T, String> {
    let status = response.status();
    if status >= 200 && status < 300 {
        response
            .into_json::<T>()
            .map_err(|e| format!("Failed to parse response: {}", e))
    } else {
        let error_text = response.into_string().unwrap_or_else(|_| "Unknown error".to_string());
        Err(format!("Server error {}: {}", status, error_text))
    }
}

fn get_offline_queue_path() -> std::path::PathBuf {
    get_memories_dir().join("offline_queue.json")
}

fn load_offline_queue() -> Vec<OfflineAction> {
    let path = get_offline_queue_path();
    if path.exists() {
        read_json_file(&path).unwrap_or_default()
    } else {
        Vec::new()
    }
}

fn save_offline_queue(queue: &Vec<OfflineAction>) -> Result<(), String> {
    let path = get_offline_queue_path();
    write_json_file(&path, queue)
}

fn queue_offline_action(action_type: OfflineActionType, payload: serde_json::Value) {
    let action = OfflineAction {
        id: uuid::Uuid::new_v4().to_string(),
        action_type,
        payload,
        created_at: get_current_timestamp(),
    };

    let mut queue = OFFLINE_QUEUE.lock();
    queue.push(action.clone());

    // Also persist to file
    if let Err(e) = save_offline_queue(&queue) {
        error!("Failed to save offline queue: {}", e);
    }
}

// Helper function to generate friend code
fn generate_code() -> String {
    let chars: Vec<char> = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".chars().collect();
    let mut rng = rand::thread_rng();
    let code: String = (0..6).map(|_| chars[rng.gen_range(0..chars.len())]).collect();
    format!("ATLAS-{}", code)
}

fn get_current_timestamp() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}

// ============= User & Authentication Commands =============

/// Get local user data
#[tauri::command]
pub fn get_local_user() -> Result<LocalUserData, String> {
    let path = get_friends_data_json_path();
    if path.exists() {
        read_json_file(&path)
    } else {
        Ok(LocalUserData::default())
    }
}

/// Save local user data
#[tauri::command]
pub fn save_local_user(user: LocalUserData) -> Result<(), String> {
    let path = get_friends_data_json_path();
    write_json_file(&path, &user)
}

/// Set the friend code for the local user (and register with server)
#[tauri::command]
pub async fn set_friend_code(code: String) -> Result<(), String> {
    let trimmed = code.trim();
    if trimmed.is_empty() {
        return Err("Friend code cannot be empty".to_string());
    }
    if trimmed.len() > 32 {
        return Err("Friend code must be 32 characters or less".to_string());
    }

    let mut user = get_local_user().unwrap_or_default();
    let username = user.username.clone().unwrap_or_else(|| "User".to_string());

    // Try to register with server
    let server_url = if user.server_url.is_empty() {
        DEFAULT_SERVER_URL.to_string()
    } else {
        user.server_url.clone()
    };

    let register_result: Result<RegisterResponse, String> = (|| {
        let url = format!("{}/auth/register", server_url);
        let response = ureq::post(&url)
            .set("Content-Type", "application/json")
            .send_json(serde_json::json!({
                "friend_code": trimmed,
                "username": username
            }))
            .map_err(|e| format!("Failed to connect to server: {}", e))?;

        handle_response(response)
    })();

    match register_result {
        Ok(reg) => {
            user.id = Some(reg.id);
            user.friend_code = Some(reg.friend_code);
            user.auth_token = Some(reg.auth_token);
            user.partner_id = reg.partner_id;
            info!("Registered with server, friend code: {}", trimmed);
        }
        Err(e) => {
            warn!("Server registration failed (offline mode): {}", e);
            // Still set locally for offline mode
            user.friend_code = Some(trimmed.to_string());
            if user.id.is_none() {
                user.id = Some(uuid::Uuid::new_v4().to_string());
            }
        }
    }

    save_local_user(user)?;
    info!("Set friend code: {}", trimmed);
    Ok(())
}

/// Set the username for local user (and update server if registered)
#[tauri::command]
pub async fn set_username(username: String) -> Result<(), String> {
    if username.is_empty() || username.len() > 32 {
        return Err("Username must be between 1 and 32 characters".to_string());
    }

    let mut user = get_local_user().unwrap_or_default();
    user.username = Some(username.clone());

    // Generate user ID if not exists
    if user.id.is_none() {
        user.id = Some(uuid::Uuid::new_v4().to_string());
    }

    // If we have a friend code and auth token, re-register to update username on server
    if let (Some(code), Some(_)) = (user.friend_code.clone(), user.auth_token.clone()) {
        let server_url = if user.server_url.is_empty() {
            DEFAULT_SERVER_URL.to_string()
        } else {
            user.server_url.clone()
        };

        let _ = (|| -> Result<(), String> {
            let url = format!("{}/auth/register", server_url);
            let response = ureq::post(&url)
                .set("Content-Type", "application/json")
                .send_json(serde_json::json!({
                    "friend_code": code,
                    "username": username
                }))
                .map_err(|e| format!("Failed to update username on server: {}", e))?;

            let _: RegisterResponse = handle_response(response)?;
            info!("Updated username on server: {}", username);
            Ok(())
        })();
    }

    save_local_user(user)?;
    info!("Set username: {}", username);
    Ok(())
}

/// Set the server URL for the friends feature
#[tauri::command]
pub fn set_friends_server_url(url: String) -> Result<(), String> {
    let mut user = get_local_user().unwrap_or_default();
    user.server_url = url.clone();
    save_local_user(user)?;
    info!("Set friends server URL: {}", url);
    Ok(())
}

// ============= Friend Management Commands =============

/// Get cached friends list
#[tauri::command]
pub fn get_friends_list() -> Result<Vec<FriendWithDetails>, String> {
    let path = get_friends_cache_json_path();
    if path.exists() {
        read_json_file(&path)
    } else {
        Ok(Vec::new())
    }
}

/// Save friends list to cache
#[tauri::command]
pub fn save_friends_cache(friends: Vec<FriendWithDetails>) -> Result<(), String> {
    let path = get_friends_cache_json_path();
    write_json_file(&path, &friends)
}

/// Get partner (if any)
#[tauri::command]
pub fn get_partner() -> Result<Option<FriendWithDetails>, String> {
    let friends = get_friends_list()?;
    Ok(friends
        .into_iter()
        .find(|f| f.friend.relationship_type == RelationshipType::Partner))
}

/// Validate a friend code against the server
#[tauri::command]
pub fn validate_friend_code(code: String) -> Result<ValidateResponse, String> {
    let server_url = get_server_url();
    let url = format!("{}/auth/validate/{}", server_url, code);

    match ureq::get(&url).call() {
        Ok(response) => handle_response(response),
        Err(ureq::Error::Status(404, _)) => Ok(ValidateResponse {
            valid: false,
            user: None,
        }),
        Err(e) => Err(format!("Failed to validate code: {}", e)),
    }
}

/// Add a friend/partner by friend code (validates with server first)
#[tauri::command]
pub async fn add_friend_by_code(
    friend_code: String,
    relationship_type: RelationshipType,
) -> Result<FriendWithDetails, String> {
    let local_user = get_local_user()?;
    let local_user_id = local_user.id.ok_or("Local user not set up")?;

    // Check if trying to add partner when one exists
    if relationship_type == RelationshipType::Partner {
        let existing_partner = get_partner()?;
        if existing_partner.is_some() {
            return Err("You already have a partner. Remove them first to add a new one.".to_string());
        }
    }

    // Try to validate with server first
    let validation = validate_friend_code(friend_code.clone());
    let (friend_user_id, friend_username) = match validation {
        Ok(v) if v.valid && v.user.is_some() => {
            let user = v.user.unwrap();
            (user.id, user.username)
        }
        Ok(_) => {
            return Err("Friend code not found. Make sure your partner has registered first.".to_string());
        }
        Err(e) => {
            warn!("Server validation failed: {}", e);
            return Err(format!("Could not validate friend code: {}", e));
        }
    };

    // Link as partner on server if this is a partner relationship
    if relationship_type == RelationshipType::Partner {
        if let Some(token) = local_user.auth_token.clone() {
            let server_url = get_server_url();
            let url = format!("{}/auth/link-partner", server_url);

            let result: Result<LinkPartnerResponse, String> = (|| {
                let response = ureq::post(&url)
                    .set("Authorization", &format!("Bearer {}", token))
                    .set("Content-Type", "application/json")
                    .send_json(serde_json::json!({
                        "partner_code": friend_code
                    }))
                    .map_err(|e| format!("Failed to link partner: {}", e))?;

                handle_response(response)
            })();

            if let Err(e) = result {
                warn!("Failed to link partner on server: {}", e);
            } else {
                // Update local user with partner_id
                let mut user = get_local_user()?;
                user.partner_id = Some(friend_user_id.clone());
                save_local_user(user)?;
            }
        }
    }

    let now = get_current_timestamp();

    let friend = Friend {
        id: uuid::Uuid::new_v4().to_string(),
        user_id: local_user_id,
        friend_user_id: friend_user_id.clone(),
        relationship_type,
        nickname: None,
        created_at: now,
    };

    let user = User {
        id: friend_user_id,
        friend_code,
        username: friend_username.clone(),
        avatar_url: None,
        partner_id: None,
        created_at: now,
    };

    let presence = Presence::new(user.id.clone());

    let friend_with_details = FriendWithDetails {
        friend,
        user,
        presence: Some(presence),
    };

    // Add to cache
    let mut friends = get_friends_list().unwrap_or_default();
    friends.push(friend_with_details.clone());
    save_friends_cache(friends)?;

    info!("Added friend by code: {}", friend_with_details.user.username);
    Ok(friend_with_details)
}

/// Add a friend locally (for offline/demo mode - kept for backwards compatibility)
#[tauri::command]
pub fn add_friend_locally(
    user_id: String,
    username: String,
    relationship_type: RelationshipType,
) -> Result<FriendWithDetails, String> {
    let local_user = get_local_user()?;
    let local_user_id = local_user.id.ok_or("Local user not set up")?;

    // Check if trying to add partner when one exists
    if relationship_type == RelationshipType::Partner {
        let existing_partner = get_partner()?;
        if existing_partner.is_some() {
            return Err("You already have a partner. Remove them first to add a new one.".to_string());
        }
    }

    let now = get_current_timestamp();

    let friend = Friend {
        id: uuid::Uuid::new_v4().to_string(),
        user_id: local_user_id,
        friend_user_id: user_id.clone(),
        relationship_type,
        nickname: None,
        created_at: now,
    };

    let user = User {
        id: user_id,
        friend_code: generate_code(),
        username,
        avatar_url: None,
        partner_id: None,
        created_at: now,
    };

    let presence = Presence::new(user.id.clone());

    let friend_with_details = FriendWithDetails {
        friend,
        user,
        presence: Some(presence),
    };

    // Add to cache
    let mut friends = get_friends_list().unwrap_or_default();
    friends.push(friend_with_details.clone());
    save_friends_cache(friends)?;

    info!("Added friend locally: {}", friend_with_details.user.username);
    Ok(friend_with_details)
}

/// Remove a friend
#[tauri::command]
pub fn remove_friend(friend_id: String) -> Result<(), String> {
    let mut friends = get_friends_list()?;
    friends.retain(|f| f.friend.id != friend_id);
    save_friends_cache(friends)?;
    info!("Removed friend: {}", friend_id);
    Ok(())
}

/// Update friend nickname
#[tauri::command]
pub fn update_friend_nickname(friend_id: String, nickname: Option<String>) -> Result<(), String> {
    let mut friends = get_friends_list()?;
    if let Some(friend) = friends.iter_mut().find(|f| f.friend.id == friend_id) {
        friend.friend.nickname = nickname.clone();
        save_friends_cache(friends)?;
        info!("Updated friend nickname for {}: {:?}", friend_id, nickname);
        Ok(())
    } else {
        Err("Friend not found".to_string())
    }
}

// ============= Presence Commands =============

/// Get local presence
#[tauri::command]
pub fn get_local_presence() -> Result<Presence, String> {
    let user = get_local_user()?;
    let user_id = user.id.ok_or("User not set up")?;
    Ok(Presence::new(user_id))
}

/// Update local presence (syncs to server when connected)
#[tauri::command]
pub fn update_presence(app: tauri::AppHandle, request: UpdatePresenceRequest) -> Result<(), String> {
    let local_user = get_local_user()?;
    let user_id = local_user.id.ok_or("User not set up")?;

    let mut presence = Presence::new(user_id.clone());

    if let Some(status) = request.status.clone() {
        presence.status = status;
    }
    presence.current_game = request.current_game.clone();
    presence.mood_message = request.mood_message.clone();
    presence.performance_stats = request.performance_stats.clone();
    presence.last_updated = get_current_timestamp();

    // Emit presence update event for local UI
    let _ = app.emit("friends:presence_updated", &presence);

    // Sync to server if authenticated
    if let Some(token) = local_user.auth_token {
        let server_url = get_server_url();
        let url = format!("{}/presence", server_url);

        let perf = request.performance_stats.as_ref();
        let result: Result<(), String> = (|| {
            let response = ureq::post(&url)
                .set("Authorization", &format!("Bearer {}", token))
                .set("Content-Type", "application/json")
                .send_json(serde_json::json!({
                    "status": request.status.map(|s| format!("{:?}", s).to_lowercase()),
                    "current_game": request.current_game,
                    "mood_message": request.mood_message,
                    "performance_cpu": perf.map(|p| p.cpu_usage),
                    "performance_gpu": perf.map(|p| p.gpu_usage),
                    "performance_fps": perf.and_then(|p| p.fps),
                    "performance_memory": perf.map(|p| p.memory_usage)
                }))
                .map_err(|e| format!("Failed to update presence: {}", e))?;

            if response.status() >= 200 && response.status() < 300 {
                Ok(())
            } else {
                Err("Server returned error".to_string())
            }
        })();

        if let Err(e) = result {
            warn!("Failed to sync presence to server: {}", e);
        }
    }

    info!("Updated presence: {:?}", presence.status);
    Ok(())
}

/// Set mood message
#[tauri::command]
pub fn set_mood_message(message: Option<String>) -> Result<(), String> {
    let local_user = get_local_user()?;
    let _user_id = local_user.id.ok_or("User not set up")?;

    // In a real implementation, this would sync to the server
    info!("Set mood message: {:?}", message);
    Ok(())
}

/// Get partner's presence (from cache or server)
#[tauri::command]
pub fn get_partner_presence() -> Result<Option<Presence>, String> {
    if let Some(partner) = get_partner()? {
        Ok(partner.presence)
    } else {
        Ok(None)
    }
}

// ============= Memory Commands =============

/// Get all memories with partner
#[tauri::command]
pub fn get_memories() -> Result<Vec<Memory>, String> {
    let memories_dir = get_memories_dir();
    let memories_file = memories_dir.join("memories.json");

    if memories_file.exists() {
        read_json_file(&memories_file)
    } else {
        Ok(Vec::new())
    }
}

/// Create a new memory
#[tauri::command]
pub fn create_memory(request: CreateMemoryRequest) -> Result<Memory, String> {
    let local_user = get_local_user()?;
    let user_id = local_user.id.ok_or("User not set up")?;

    let partner = get_partner()?.ok_or("No partner set")?;
    let partner_id = partner.user.id;

    let mut memory = Memory::new(user_id, partner_id, request.memory_type);
    memory.content_text = request.content_text;
    memory.caption = request.caption;
    memory.target_date = request.target_date;

    // Save to local storage
    let mut memories = get_memories().unwrap_or_default();
    memories.push(memory.clone());

    let memories_dir = get_memories_dir();
    let memories_file = memories_dir.join("memories.json");
    write_json_file(&memories_file, &memories)?;

    info!("Created memory: {} ({:?})", memory.id, memory.memory_type);
    Ok(memory)
}

/// Delete a memory
#[tauri::command]
pub fn delete_memory(memory_id: String) -> Result<(), String> {
    let mut memories = get_memories()?;
    memories.retain(|m| m.id != memory_id);

    let memories_dir = get_memories_dir();
    let memories_file = memories_dir.join("memories.json");
    write_json_file(&memories_file, &memories)?;

    info!("Deleted memory: {}", memory_id);
    Ok(())
}

/// Create a countdown memory
#[tauri::command]
pub fn create_countdown(title: String, target_date: u64) -> Result<Memory, String> {
    create_memory(CreateMemoryRequest {
        memory_type: MemoryType::Countdown,
        content_text: Some(title),
        caption: None,
        target_date: Some(target_date),
    })
}

/// Get all countdowns
#[tauri::command]
pub fn get_countdowns() -> Result<Vec<Memory>, String> {
    let memories = get_memories()?;
    Ok(memories
        .into_iter()
        .filter(|m| m.memory_type == MemoryType::Countdown)
        .collect())
}

// ============= Message Commands =============

/// Get messages with partner
#[tauri::command]
pub fn get_messages(limit: u32, offset: u32) -> Result<Vec<Message>, String> {
    let path = get_messages_cache_json_path();
    if path.exists() {
        let messages: Vec<Message> = read_json_file(&path)?;
        let start = offset as usize;
        let end = (offset + limit) as usize;
        Ok(messages
            .into_iter()
            .skip(start)
            .take(end - start)
            .collect())
    } else {
        Ok(Vec::new())
    }
}

/// Send a message to partner (syncs to server if connected)
#[tauri::command]
pub fn send_message(content: String) -> Result<Message, String> {
    let local_user = get_local_user()?;
    let sender_id = local_user.id.ok_or("User not set up")?;

    let partner = get_partner()?.ok_or("No partner set")?;
    let receiver_id = partner.user.id.clone();

    let message = Message::new(sender_id.clone(), receiver_id, content.clone());

    // Save to local cache first
    let mut messages = get_messages(1000, 0).unwrap_or_default();
    messages.push(message.clone());

    let path = get_messages_cache_json_path();
    write_json_file(&path, &messages)?;

    // Try to send to server
    if let Some(token) = local_user.auth_token {
        let server_url = get_server_url();
        let url = format!("{}/messages", server_url);

        let result: Result<Message, String> = (|| {
            let response = ureq::post(&url)
                .set("Authorization", &format!("Bearer {}", token))
                .set("Content-Type", "application/json")
                .send_json(serde_json::json!({
                    "content": content
                }))
                .map_err(|e| format!("Failed to send message: {}", e))?;

            handle_response(response)
        })();

        match result {
            Ok(server_msg) => {
                info!("Message sent to server: {}", server_msg.id);
            }
            Err(e) => {
                warn!("Failed to send message to server (queuing): {}", e);
                queue_offline_action(
                    OfflineActionType::SendMessage,
                    serde_json::json!({ "content": content }),
                );
            }
        }
    } else {
        queue_offline_action(
            OfflineActionType::SendMessage,
            serde_json::json!({ "content": content }),
        );
    }

    info!("Sent message: {}", message.id);
    Ok(message)
}

/// Mark messages as read
#[tauri::command]
pub fn mark_messages_read(message_ids: Vec<String>) -> Result<(), String> {
    let mut messages = get_messages(1000, 0).unwrap_or_default();
    let now = get_current_timestamp();

    for message in messages.iter_mut() {
        if message_ids.contains(&message.id) && message.read_at.is_none() {
            message.read_at = Some(now);
        }
    }

    let path = get_messages_cache_json_path();
    write_json_file(&path, &messages)?;

    info!("Marked {} messages as read", message_ids.len());
    Ok(())
}

/// Get unread message count
#[tauri::command]
pub fn get_unread_message_count() -> Result<usize, String> {
    let local_user = get_local_user()?;
    let user_id = local_user.id.ok_or("User not set up")?;

    let messages = get_messages(1000, 0).unwrap_or_default();
    let unread = messages
        .iter()
        .filter(|m| m.receiver_id == user_id && m.read_at.is_none())
        .count();
    Ok(unread)
}

// ============= Poke Commands =============

/// Send a poke to a friend (syncs to server if connected)
#[tauri::command]
pub fn send_poke(app: tauri::AppHandle, user_id: String, emoji: String) -> Result<Poke, String> {
    let local_user = get_local_user()?;
    let sender_id = local_user.id.ok_or("User not set up")?;

    let poke = Poke::new(sender_id, user_id.clone(), emoji.clone());

    // Emit poke event locally
    let _ = app.emit("friends:poke_sent", &poke);

    // Try to send to server
    if let Some(token) = local_user.auth_token {
        let server_url = get_server_url();
        let url = format!("{}/pokes", server_url);

        let result: Result<Poke, String> = (|| {
            let response = ureq::post(&url)
                .set("Authorization", &format!("Bearer {}", token))
                .set("Content-Type", "application/json")
                .send_json(serde_json::json!({
                    "emoji": emoji
                }))
                .map_err(|e| format!("Failed to send poke: {}", e))?;

            handle_response(response)
        })();

        match result {
            Ok(server_poke) => {
                info!("Poke sent to server: {}", server_poke.id);
            }
            Err(e) => {
                warn!("Failed to send poke to server (queuing): {}", e);
                queue_offline_action(
                    OfflineActionType::SendPoke,
                    serde_json::json!({ "emoji": emoji }),
                );
            }
        }
    } else {
        queue_offline_action(
            OfflineActionType::SendPoke,
            serde_json::json!({ "emoji": emoji }),
        );
    }

    info!("Sent poke {} to {}", emoji, user_id);
    Ok(poke)
}

// ============= Calendar Commands =============

/// Get calendar events file path
fn get_calendar_events_path() -> std::path::PathBuf {
    get_memories_dir().join("calendar_events.json")
}

/// Get all calendar events
#[tauri::command]
pub fn get_calendar_events() -> Result<Vec<CalendarEvent>, String> {
    let path = get_calendar_events_path();
    if path.exists() {
        read_json_file(&path)
    } else {
        Ok(Vec::new())
    }
}

/// Create a calendar event
#[tauri::command]
pub fn create_calendar_event(request: CreateCalendarEventRequest) -> Result<CalendarEvent, String> {
    let local_user = get_local_user()?;
    let user_id = local_user.id.ok_or("User not set up")?;

    let partner = get_partner()?.ok_or("No partner set")?;
    let partner_id = partner.user.id;

    let mut event = CalendarEvent::new(
        user_id,
        partner_id,
        request.title,
        request.datetime,
        request.timezone,
    );
    event.description = request.description;
    event.reminder_minutes = request.reminder_minutes;
    event.is_recurring = request.is_recurring;
    event.recurrence_pattern = request.recurrence_pattern;

    // Save to local storage
    let mut events = get_calendar_events().unwrap_or_default();
    events.push(event.clone());

    let path = get_calendar_events_path();
    write_json_file(&path, &events)?;

    info!("Created calendar event: {}", event.title);
    Ok(event)
}

/// Update a calendar event
#[tauri::command]
pub fn update_calendar_event(event: CalendarEvent) -> Result<(), String> {
    let mut events = get_calendar_events()?;
    if let Some(existing) = events.iter_mut().find(|e| e.id == event.id) {
        *existing = event.clone();
        let path = get_calendar_events_path();
        write_json_file(&path, &events)?;
        info!("Updated calendar event: {}", event.id);
        Ok(())
    } else {
        Err("Event not found".to_string())
    }
}

/// Delete a calendar event
#[tauri::command]
pub fn delete_calendar_event(event_id: String) -> Result<(), String> {
    let mut events = get_calendar_events()?;
    events.retain(|e| e.id != event_id);

    let path = get_calendar_events_path();
    write_json_file(&path, &events)?;

    info!("Deleted calendar event: {}", event_id);
    Ok(())
}

/// Get upcoming events (next 7 days)
#[tauri::command]
pub fn get_upcoming_events() -> Result<Vec<CalendarEvent>, String> {
    let now = get_current_timestamp();
    let week_ms = 7 * 24 * 60 * 60 * 1000;
    let week_later = now + week_ms;

    let events = get_calendar_events()?;
    let upcoming: Vec<CalendarEvent> = events
        .into_iter()
        .filter(|e| e.datetime >= now && e.datetime <= week_later)
        .collect();

    Ok(upcoming)
}

// ============= Gaming Stats Commands =============

/// Get shared gacha stats for a game
#[tauri::command]
pub fn get_shared_gacha_stats(_game: String) -> Result<SharedGachaStats, String> {
    // This would fetch from local gacha data
    // For now, return empty stats
    Ok(SharedGachaStats::default())
}

/// Get partner's gacha stats for comparison
#[tauri::command]
pub fn get_partner_gacha_stats(_game: String) -> Result<Option<SharedGachaStats>, String> {
    // This would fetch from server when connected
    Ok(None)
}

// ============= Wishlist Commands =============

/// Get wishlist file path
fn get_wishlist_path() -> std::path::PathBuf {
    get_memories_dir().join("wishlist.json")
}

/// Get wishlist items
#[tauri::command]
pub fn get_wishlist() -> Result<Vec<WishlistItem>, String> {
    let path = get_wishlist_path();
    if path.exists() {
        read_json_file(&path)
    } else {
        Ok(Vec::new())
    }
}

/// Add wishlist item
#[tauri::command]
pub fn add_wishlist_item(
    game: String,
    item_name: String,
    item_type: String,
    priority: u8,
) -> Result<WishlistItem, String> {
    let local_user = get_local_user()?;
    let user_id = local_user.id.ok_or("User not set up")?;

    let item = WishlistItem {
        id: uuid::Uuid::new_v4().to_string(),
        user_id,
        game,
        item_name: item_name.clone(),
        item_type,
        priority,
        created_at: get_current_timestamp(),
    };

    let mut wishlist = get_wishlist().unwrap_or_default();
    wishlist.push(item.clone());

    let path = get_wishlist_path();
    write_json_file(&path, &wishlist)?;

    info!("Added wishlist item: {}", item_name);
    Ok(item)
}

/// Remove wishlist item
#[tauri::command]
pub fn remove_wishlist_item(item_id: String) -> Result<(), String> {
    let mut wishlist = get_wishlist()?;
    wishlist.retain(|w| w.id != item_id);

    let path = get_wishlist_path();
    write_json_file(&path, &wishlist)?;

    info!("Removed wishlist item: {}", item_id);
    Ok(())
}

/// Get partner's wishlist
#[tauri::command]
pub fn get_partner_wishlist() -> Result<Vec<WishlistItem>, String> {
    // This would fetch from server when connected
    Ok(Vec::new())
}

// ============= Connection State Commands =============

/// Check if connected to friends server
#[tauri::command]
pub fn is_friends_connected() -> Result<bool, String> {
    let state = CONNECTION_STATE.lock();
    Ok(*state == ConnectionState::Connected)
}

/// Get connection status
#[tauri::command]
pub fn get_friends_connection_status() -> Result<String, String> {
    let state = CONNECTION_STATE.lock();
    Ok(match *state {
        ConnectionState::Connected => "connected",
        ConnectionState::Connecting => "connecting",
        ConnectionState::Disconnected => "disconnected",
        ConnectionState::Error => "error",
    }
    .to_string())
}

/// Connect to server and start polling
#[tauri::command]
pub async fn connect_to_server(app: tauri::AppHandle) -> Result<(), String> {
    let local_user = get_local_user()?;

    // Need auth token to connect
    let token = local_user.auth_token.ok_or("Not registered with server. Set your friend code first.")?;

    {
        let mut state = CONNECTION_STATE.lock();
        *state = ConnectionState::Connecting;
    }

    // Test connection with sync state endpoint
    let server_url = get_server_url();
    let url = format!("{}/sync/state", server_url);

    let result: Result<SyncStateResponse, String> = (|| {
        let response = ureq::get(&url)
            .set("Authorization", &format!("Bearer {}", token))
            .call()
            .map_err(|e| format!("Failed to connect: {}", e))?;

        handle_response(response)
    })();

    match result {
        Ok(state_response) => {
            {
                let mut state = CONNECTION_STATE.lock();
                *state = ConnectionState::Connected;
            }
            LAST_SYNC_TIMESTAMP.store(state_response.timestamp, Ordering::SeqCst);

            // Emit connection state
            let _ = app.emit("friends:connected", serde_json::json!({
                "has_partner": state_response.has_partner,
                "partner": state_response.partner
            }));

            // Update local cache with server data
            if let Some(presence) = state_response.presence {
                let _ = app.emit("friends:partner_presence", &presence);
            }

            // Process any pending offline actions
            process_offline_queue().await;

            info!("Connected to server successfully");
            Ok(())
        }
        Err(e) => {
            {
                let mut state = CONNECTION_STATE.lock();
                *state = ConnectionState::Error;
            }
            error!("Failed to connect to server: {}", e);
            Err(e)
        }
    }
}

/// Disconnect from server
#[tauri::command]
pub fn disconnect_from_server() -> Result<(), String> {
    POLLING_ACTIVE.store(false, Ordering::SeqCst);
    {
        let mut state = CONNECTION_STATE.lock();
        *state = ConnectionState::Disconnected;
    }
    info!("Disconnected from server");
    Ok(())
}

/// Manual sync trigger
#[tauri::command]
pub async fn sync_now(app: tauri::AppHandle) -> Result<FriendsSyncResult, String> {
    let local_user = get_local_user()?;
    let token = local_user.auth_token.ok_or("Not registered with server")?;

    let last_sync = LAST_SYNC_TIMESTAMP.load(Ordering::SeqCst);
    let server_url = get_server_url();
    let url = format!("{}/sync/poll?since={}", server_url, last_sync);

    let result: Result<SyncPollResponse, String> = (|| {
        let response = ureq::get(&url)
            .set("Authorization", &format!("Bearer {}", token))
            .call()
            .map_err(|e| format!("Sync failed: {}", e))?;

        handle_response(response)
    })();

    match result {
        Ok(poll_response) => {
            let timestamp = poll_response.timestamp;
            LAST_SYNC_TIMESTAMP.store(timestamp, Ordering::SeqCst);

            // Update local user's last_sync
            let mut user = get_local_user()?;
            user.last_sync = timestamp;
            save_local_user(user)?;

            // Process new messages
            if !poll_response.messages.is_empty() {
                let mut cached_messages = get_messages(1000, 0).unwrap_or_default();
                for msg in &poll_response.messages {
                    if !cached_messages.iter().any(|m| m.id == msg.id) {
                        cached_messages.push(msg.clone());
                    }
                }
                let path = get_messages_cache_json_path();
                let _ = write_json_file(&path, &cached_messages);

                let _ = app.emit("friends:new_messages", &poll_response.messages);
            }

            // Process new pokes
            if !poll_response.pokes.is_empty() {
                for poke in &poll_response.pokes {
                    let _ = app.emit("friends:poke_received", poke);
                }
            }

            // Update partner presence
            if let Some(presence) = &poll_response.presence {
                let _ = app.emit("friends:partner_presence", presence);

                // Update cached friend presence
                if let Ok(mut friends) = get_friends_list() {
                    if let Some(partner) = friends.iter_mut().find(|f| f.user.id == presence.user_id) {
                        partner.presence = Some(Presence {
                            user_id: presence.user_id.clone(),
                            status: match presence.status.as_str() {
                                "online" => PresenceStatus::Online,
                                "away" => PresenceStatus::Away,
                                "in_game" => PresenceStatus::InGame,
                                _ => PresenceStatus::Offline,
                            },
                            current_game: presence.current_game.clone(),
                            game_start_time: None,
                            mood_message: presence.mood_message.clone(),
                            performance_stats: presence.performance_stats.clone(),
                            last_updated: presence.last_updated,
                            last_seen: presence.last_updated,
                        });
                        let _ = save_friends_cache(friends);
                    }
                }
            }

            // Process new memories
            if !poll_response.memories.is_empty() {
                let mut cached_memories = get_memories().unwrap_or_default();
                for mem in &poll_response.memories {
                    if !cached_memories.iter().any(|m| m.id == mem.id) {
                        cached_memories.push(mem.clone());
                    }
                }
                let memories_file = get_memories_dir().join("memories.json");
                let _ = write_json_file(&memories_file, &cached_memories);

                let _ = app.emit("friends:new_memories", &poll_response.memories);
            }

            // Process calendar events
            if !poll_response.calendar_events.is_empty() {
                let mut cached_events = get_calendar_events().unwrap_or_default();
                for evt in &poll_response.calendar_events {
                    if let Some(existing) = cached_events.iter_mut().find(|e| e.id == evt.id) {
                        *existing = evt.clone();
                    } else {
                        cached_events.push(evt.clone());
                    }
                }
                let events_path = get_calendar_events_path();
                let _ = write_json_file(&events_path, &cached_events);

                let _ = app.emit("friends:calendar_updated", &poll_response.calendar_events);
            }

            Ok(FriendsSyncResult {
                success: true,
                timestamp,
                has_new_data: poll_response.has_new_data,
                new_messages_count: poll_response.messages.len(),
                new_pokes_count: poll_response.pokes.len(),
                error: None,
            })
        }
        Err(e) => {
            error!("Sync failed: {}", e);
            Ok(FriendsSyncResult {
                success: false,
                timestamp: last_sync,
                has_new_data: false,
                new_messages_count: 0,
                new_pokes_count: 0,
                error: Some(e),
            })
        }
    }
}

/// Process queued offline actions
async fn process_offline_queue() {
    let queue = {
        let mut q = OFFLINE_QUEUE.lock();
        std::mem::take(&mut *q)
    };

    if queue.is_empty() {
        return;
    }

    info!("Processing {} offline actions", queue.len());

    let local_user = match get_local_user() {
        Ok(u) => u,
        Err(_) => return,
    };

    let token = match local_user.auth_token {
        Some(t) => t,
        None => return,
    };

    let server_url = get_server_url();
    let mut failed_actions = Vec::new();

    for action in queue {
        let result = match action.action_type {
            OfflineActionType::SendMessage => {
                let content = action.payload.get("content").and_then(|v| v.as_str()).unwrap_or("");
                let url = format!("{}/messages", server_url);
                ureq::post(&url)
                    .set("Authorization", &format!("Bearer {}", token))
                    .set("Content-Type", "application/json")
                    .send_json(serde_json::json!({ "content": content }))
                    .map(|_| ())
                    .map_err(|e| e.to_string())
            }
            OfflineActionType::SendPoke => {
                let emoji = action.payload.get("emoji").and_then(|v| v.as_str()).unwrap_or("❤️");
                let url = format!("{}/pokes", server_url);
                ureq::post(&url)
                    .set("Authorization", &format!("Bearer {}", token))
                    .set("Content-Type", "application/json")
                    .send_json(serde_json::json!({ "emoji": emoji }))
                    .map(|_| ())
                    .map_err(|e| e.to_string())
            }
            _ => Ok(()), // Other types not yet implemented
        };

        if let Err(e) = result {
            warn!("Failed to process offline action: {}", e);
            failed_actions.push(action);
        }
    }

    // Re-queue failed actions
    if !failed_actions.is_empty() {
        let mut q = OFFLINE_QUEUE.lock();
        q.extend(failed_actions);
        let _ = save_offline_queue(&q);
    } else {
        // Clear the persisted queue
        let empty: Vec<OfflineAction> = Vec::new();
        let _ = save_offline_queue(&empty);
    }
}

/// Get pending offline actions count
#[tauri::command]
pub fn get_offline_queue_count() -> Result<usize, String> {
    let queue = OFFLINE_QUEUE.lock();
    Ok(queue.len())
}

// ============= Demo/Mock Commands =============

/// Create demo data for testing
#[tauri::command]
pub fn create_demo_friends_data() -> Result<(), String> {
    let local_user = get_local_user()?;
    let user_id = local_user.id.ok_or("Set up your profile first")?;

    let now = get_current_timestamp();

    // Create a demo partner
    let partner_user = User {
        id: "demo-partner-1".to_string(),
        friend_code: "ATLAS-DEMO01".to_string(),
        username: "MyLove".to_string(),
        avatar_url: None,
        partner_id: Some(user_id.clone()),
        created_at: now - 30 * 24 * 60 * 60 * 1000, // 30 days ago
    };

    let partner_friend = Friend {
        id: uuid::Uuid::new_v4().to_string(),
        user_id: user_id.clone(),
        friend_user_id: partner_user.id.clone(),
        relationship_type: RelationshipType::Partner,
        nickname: Some("Honey".to_string()),
        created_at: now - 30 * 24 * 60 * 60 * 1000,
    };

    let partner_presence = Presence {
        user_id: partner_user.id.clone(),
        status: PresenceStatus::InGame,
        current_game: Some("Genshin Impact".to_string()),
        game_start_time: Some(now - 45 * 60 * 1000), // 45 mins ago
        mood_message: Some("Farming artifacts again 😤".to_string()),
        performance_stats: Some(PerformanceSnapshot {
            cpu_usage: 35.0,
            gpu_usage: 78.0,
            fps: Some(60.0),
            memory_usage: 45.0,
        }),
        last_updated: now,
        last_seen: now,
    };

    // Create a demo friend
    let friend_user = User {
        id: "demo-friend-1".to_string(),
        friend_code: "ATLAS-DEMO02".to_string(),
        username: "GachaAddict".to_string(),
        avatar_url: None,
        partner_id: None,
        created_at: now - 7 * 24 * 60 * 60 * 1000,
    };

    let friend = Friend {
        id: uuid::Uuid::new_v4().to_string(),
        user_id: user_id.clone(),
        friend_user_id: friend_user.id.clone(),
        relationship_type: RelationshipType::Friend,
        nickname: None,
        created_at: now - 7 * 24 * 60 * 60 * 1000,
    };

    let friend_presence = Presence {
        user_id: friend_user.id.clone(),
        status: PresenceStatus::Online,
        current_game: None,
        game_start_time: None,
        mood_message: Some("Waiting for the next banner".to_string()),
        performance_stats: None,
        last_updated: now,
        last_seen: now,
    };

    // Save friends
    let friends = vec![
        FriendWithDetails {
            friend: partner_friend,
            user: partner_user,
            presence: Some(partner_presence),
        },
        FriendWithDetails {
            friend,
            user: friend_user,
            presence: Some(friend_presence),
        },
    ];
    save_friends_cache(friends)?;

    // Create demo memories
    let memories = vec![
        Memory {
            id: uuid::Uuid::new_v4().to_string(),
            user_id: user_id.clone(),
            partner_id: "demo-partner-1".to_string(),
            memory_type: MemoryType::Note,
            content_url: None,
            content_text: Some("First time we pulled a 5-star together! 🎉".to_string()),
            caption: Some("Lucky day!".to_string()),
            target_date: None,
            created_at: now - 14 * 24 * 60 * 60 * 1000,
        },
        Memory {
            id: uuid::Uuid::new_v4().to_string(),
            user_id: user_id.clone(),
            partner_id: "demo-partner-1".to_string(),
            memory_type: MemoryType::Countdown,
            content_url: None,
            content_text: Some("Next Visit ✈️".to_string()),
            caption: None,
            target_date: Some(now + 45 * 24 * 60 * 60 * 1000), // 45 days from now
            created_at: now - 3 * 24 * 60 * 60 * 1000,
        },
        Memory {
            id: uuid::Uuid::new_v4().to_string(),
            user_id: user_id.clone(),
            partner_id: "demo-partner-1".to_string(),
            memory_type: MemoryType::Milestone,
            content_url: None,
            content_text: Some("1 Year Together 💕".to_string()),
            caption: Some("Our anniversary!".to_string()),
            target_date: Some(now - 365 * 24 * 60 * 60 * 1000),
            created_at: now - 365 * 24 * 60 * 60 * 1000,
        },
    ];

    let memories_file = get_memories_dir().join("memories.json");
    write_json_file(&memories_file, &memories)?;

    // Create demo messages
    let messages = vec![
        Message {
            id: uuid::Uuid::new_v4().to_string(),
            sender_id: "demo-partner-1".to_string(),
            receiver_id: user_id.clone(),
            content: "Good morning! ☀️".to_string(),
            created_at: now - 2 * 60 * 60 * 1000,
            read_at: Some(now - 90 * 60 * 1000),
        },
        Message {
            id: uuid::Uuid::new_v4().to_string(),
            sender_id: user_id.clone(),
            receiver_id: "demo-partner-1".to_string(),
            content: "Morning love! Playing Genshin later?".to_string(),
            created_at: now - 90 * 60 * 1000,
            read_at: Some(now - 80 * 60 * 1000),
        },
        Message {
            id: uuid::Uuid::new_v4().to_string(),
            sender_id: "demo-partner-1".to_string(),
            receiver_id: user_id.clone(),
            content: "Yes! Let's do domains together 💪".to_string(),
            created_at: now - 80 * 60 * 1000,
            read_at: Some(now - 75 * 60 * 1000),
        },
    ];

    let messages_path = get_messages_cache_json_path();
    write_json_file(&messages_path, &messages)?;

    // Create demo calendar events
    let events = vec![
        CalendarEvent {
            id: uuid::Uuid::new_v4().to_string(),
            user_id: user_id.clone(),
            partner_id: "demo-partner-1".to_string(),
            title: "Co-op Domain Night".to_string(),
            description: Some("Weekly domain farming session!".to_string()),
            datetime: now + 2 * 24 * 60 * 60 * 1000, // 2 days from now
            timezone: "UTC".to_string(),
            reminder_minutes: Some(30),
            is_recurring: true,
            recurrence_pattern: Some("weekly".to_string()),
            created_at: now - 7 * 24 * 60 * 60 * 1000,
        },
        CalendarEvent {
            id: uuid::Uuid::new_v4().to_string(),
            user_id: user_id.clone(),
            partner_id: "demo-partner-1".to_string(),
            title: "Our Anniversary! 🎂".to_string(),
            description: Some("One year of gaming together!".to_string()),
            datetime: now + 30 * 24 * 60 * 60 * 1000, // 30 days from now
            timezone: "UTC".to_string(),
            reminder_minutes: Some(1440), // 1 day before
            is_recurring: true,
            recurrence_pattern: Some("yearly".to_string()),
            created_at: now - 335 * 24 * 60 * 60 * 1000,
        },
    ];

    let events_path = get_calendar_events_path();
    write_json_file(&events_path, &events)?;

    info!("Created demo friends data");
    Ok(())
}

/// Clear all friends data
#[tauri::command]
pub fn clear_friends_data() -> Result<(), String> {
    let friends_dir = crate::utils::get_friends_dir();
    if friends_dir.exists() {
        fs::remove_dir_all(&friends_dir)
            .map_err(|e| format!("Failed to clear friends data: {}", e))?;
        fs::create_dir_all(&friends_dir)
            .map_err(|e| format!("Failed to recreate friends directory: {}", e))?;
        fs::create_dir_all(get_memories_dir())
            .map_err(|e| format!("Failed to recreate memories directory: {}", e))?;
    }
    info!("Cleared all friends data");
    Ok(())
}

// ============= Gacha Stats Sharing Commands =============

/// Upload gacha stats to server for partner to see
#[tauri::command]
pub fn upload_gacha_stats(stats: SharedGachaStatsPayload) -> Result<(), String> {
    let local_user = get_local_user()?;
    let token = local_user.auth_token.ok_or("Not registered with server")?;

    let server_url = get_server_url();
    let url = format!("{}/gacha-stats", server_url);

    let result: Result<serde_json::Value, String> = (|| {
        let response = ureq::post(&url)
            .set("Authorization", &format!("Bearer {}", token))
            .set("Content-Type", "application/json")
            .send_json(serde_json::json!({
                "game": stats.game,
                "total_pulls": stats.total_pulls,
                "five_star_count": stats.five_star_count,
                "four_star_count": stats.four_star_count,
                "average_pity": stats.average_pity,
                "current_pity": stats.current_pity
            }))
            .map_err(|e| format!("Failed to upload gacha stats: {}", e))?;

        handle_response(response)
    })();

    match result {
        Ok(_) => {
            info!("Uploaded gacha stats for game: {}", stats.game);
            Ok(())
        }
        Err(e) => {
            error!("Failed to upload gacha stats: {}", e);
            Err(e)
        }
    }
}

/// Get partner's gacha stats from server
#[tauri::command]
pub fn get_partner_gacha_stats_from_server() -> Result<Option<PartnerGachaStatsResponse>, String> {
    let local_user = get_local_user()?;
    let token = local_user.auth_token.ok_or("Not registered with server")?;

    let server_url = get_server_url();
    let url = format!("{}/gacha-stats/partner", server_url);

    let result: Result<PartnerGachaStatsResponse, String> = (|| {
        let response = ureq::get(&url)
            .set("Authorization", &format!("Bearer {}", token))
            .call()
            .map_err(|e| {
                if let ureq::Error::Status(404, _) = e {
                    return "No partner linked".to_string();
                }
                format!("Failed to get partner stats: {}", e)
            })?;

        handle_response(response)
    })();

    match result {
        Ok(stats) => {
            info!("Fetched partner gacha stats: {} games", stats.stats.len());
            Ok(Some(stats))
        }
        Err(e) => {
            if e.contains("No partner") || e.contains("404") {
                Ok(None)
            } else {
                warn!("Failed to get partner gacha stats: {}", e);
                Err(e)
            }
        }
    }
}

/// Get partner's gacha stats for a specific game
#[tauri::command]
pub fn get_partner_gacha_stats_for_game(game: String) -> Result<Option<PartnerGachaStats>, String> {
    let local_user = get_local_user()?;
    let token = local_user.auth_token.ok_or("Not registered with server")?;

    let server_url = get_server_url();
    let url = format!("{}/gacha-stats/partner/{}", server_url, game);

    let result: Result<PartnerGachaStats, String> = (|| {
        let response = ureq::get(&url)
            .set("Authorization", &format!("Bearer {}", token))
            .call()
            .map_err(|e| {
                if let ureq::Error::Status(404, _) = e {
                    return "No stats found".to_string();
                }
                format!("Failed to get partner stats: {}", e)
            })?;

        handle_response(response)
    })();

    match result {
        Ok(stats) => {
            info!("Fetched partner gacha stats for {}", game);
            Ok(Some(stats))
        }
        Err(e) => {
            if e.contains("No stats") || e.contains("404") || e.contains("No partner") {
                Ok(None)
            } else {
                warn!("Failed to get partner gacha stats for {}: {}", game, e);
                Err(e)
            }
        }
    }
}
