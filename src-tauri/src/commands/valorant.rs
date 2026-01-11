// Valorant command handlers - real implementation with file storage
use crate::file_manager::{read_json_file, write_json_file};
use crate::models::{RiotAuthCookies, ValorantItem, ValorantStore};
use crate::process_manager::spawn_python_worker;
use crate::utils::{get_auth_json_path, get_valorant_store_json_path};
use chrono::{FixedOffset, TimeZone, Timelike, Utc};

/// Get the start time of the current store rotation (8AM GMT+8)
/// Store resets at 8AM GMT+8 daily, so each rotation is 8AM to next 8AM
fn get_current_rotation_start() -> chrono::DateTime<Utc> {
    let gmt8 = FixedOffset::east_opt(8 * 3600).unwrap();
    let now_gmt8 = Utc::now().with_timezone(&gmt8);

    // If current hour >= 8, rotation started at 8AM today
    // If current hour < 8, rotation started at 8AM yesterday
    let rotation_date = if now_gmt8.hour() >= 8 {
        now_gmt8.date_naive()
    } else {
        now_gmt8.date_naive() - chrono::Duration::days(1)
    };

    // Create 8AM GMT+8 on the rotation date
    let rotation_start_gmt8 = gmt8
        .from_local_datetime(&rotation_date.and_hms_opt(8, 0, 0).unwrap())
        .unwrap();

    // Convert to UTC
    rotation_start_gmt8.with_timezone(&Utc)
}

/// Check if auto-refresh should happen
/// Returns true if no store data exists or last check was before current rotation
#[tauri::command]
pub fn should_auto_refresh_store() -> Result<bool, String> {
    let path = get_valorant_store_json_path();

    // If no store file exists, need to refresh
    if !path.exists() {
        return Ok(true);
    }

    let stores: Vec<ValorantStore> = read_json_file(&path)?;

    // If no stores, need to refresh
    let last_store = match stores.last() {
        Some(s) => s,
        None => return Ok(true),
    };

    // Parse the last check time
    let last_checked = match chrono::DateTime::parse_from_rfc3339(&last_store.checked_at) {
        Ok(dt) => dt.with_timezone(&Utc),
        Err(_) => return Ok(true), // Can't parse, refresh to be safe
    };

    // Get the current rotation start time
    let rotation_start = get_current_rotation_start();

    // If last check was before the current rotation started, need to refresh
    let should_refresh = last_checked < rotation_start;

    println!(
        "Auto-refresh check: last_checked={}, rotation_start={}, should_refresh={}",
        last_checked, rotation_start, should_refresh
    );

    Ok(should_refresh)
}

/// Get the most recent Valorant store data from the JSON file
#[tauri::command]
pub fn get_valorant_store() -> Result<Option<ValorantStore>, String> {
    let path = get_valorant_store_json_path();

    if !path.exists() {
        return Ok(None);
    }

    let stores: Vec<ValorantStore> = read_json_file(&path)?;

    // Return the most recent store (last item)
    Ok(stores.last().cloned())
}

/// Check the Valorant store (fetches fresh data)
#[tauri::command]
pub fn check_valorant_store(region: Option<String>) -> Result<ValorantStore, String> {
    let region = region.unwrap_or_else(|| "na".to_string());

    println!("Checking Valorant store for region: {}", region);

    // Get stored auth cookies
    let auth_path = get_auth_json_path();
    let auth_cookies: Option<RiotAuthCookies> = if auth_path.exists() {
        read_json_file(&auth_path).ok()
    } else {
        None
    };

    // Prepare worker input with cookies
    let worker_input = serde_json::json!({
        "region": region,
        "cookies": auth_cookies
    });

    // Spawn the Python worker
    let result = spawn_python_worker("valorant_checker.py", worker_input)?;

    // Parse the result
    let date = result
        .get("date")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let checked_at = result
        .get("checked_at")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let items: Vec<ValorantItem> = result
        .get("items")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|item| {
                    Some(ValorantItem {
                        name: item.get("name")?.as_str()?.to_string(),
                        price: item.get("price")?.as_u64()? as u32,
                        image_url: item
                            .get("image_url")
                            .and_then(|v| v.as_str())
                            .map(String::from),
                        item_type: item
                            .get("item_type")
                            .and_then(|v| v.as_str())
                            .unwrap_or("skin")
                            .to_string(),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    let is_real_data = result
        .get("is_real_data")
        .and_then(|v| v.as_bool());

    let store = ValorantStore {
        date,
        items,
        checked_at,
        is_real_data,
    };

    // Save to history
    let path = get_valorant_store_json_path();
    let mut stores: Vec<ValorantStore> = if path.exists() {
        read_json_file(&path)?
    } else {
        vec![]
    };

    // Check if we already have an entry for today
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let existing_index = stores.iter().position(|s| s.date == today);

    match existing_index {
        Some(idx) => {
            // Update existing entry for today
            stores[idx] = store.clone();
        }
        None => {
            // Add new entry
            stores.push(store.clone());
        }
    }

    write_json_file(&path, &stores)?;

    println!("Valorant store checked and saved");

    Ok(store)
}

/// Get store history
#[tauri::command]
pub fn get_store_history(limit: Option<u32>) -> Result<Vec<ValorantStore>, String> {
    let path = get_valorant_store_json_path();

    if !path.exists() {
        return Ok(vec![]);
    }

    let mut stores: Vec<ValorantStore> = read_json_file(&path)?;

    // Sort by date descending (most recent first)
    stores.sort_by(|a, b| b.date.cmp(&a.date));

    // Apply limit if specified
    let limit = limit.unwrap_or(30) as usize;
    if stores.len() > limit {
        stores.truncate(limit);
    }

    Ok(stores)
}
