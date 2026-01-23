// Riot authentication command handlers
use crate::file_manager::{read_json_file, write_json_file};
use crate::models::{AuthStatus, RiotAuthCookies, Settings, ValorantCredentials};
use crate::utils::{get_auth_json_path, get_settings_json_path};
use log::{debug, info, warn};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use url::Url;

const RIOT_AUTH_URL: &str = "https://playvalorant.com/opt_in";
const RIOT_AUTH_DOMAIN: &str = "auth.riotgames.com";

/// Open the Riot authentication window
#[tauri::command]
pub async fn open_auth_window(app: AppHandle) -> Result<(), String> {
    // Check if auth window already exists
    if app.get_webview_window("riot-auth").is_some() {
        return Err("Auth window already open".to_string());
    }

    let auth_url = Url::parse(RIOT_AUTH_URL)
        .map_err(|e| format!("Invalid auth URL: {}", e))?;

    let _auth_window = WebviewWindowBuilder::new(
        &app,
        "riot-auth",
        WebviewUrl::External(auth_url),
    )
    .title("Login to Riot Games")
    .inner_size(500.0, 700.0)
    .resizable(true)
    .center()
    .build()
    .map_err(|e| format!("Failed to create auth window: {}", e))?;

    debug!("Auth window opened");

    Ok(())
}

/// Capture cookies from the auth window and save them
/// This should be called by the frontend after detecting successful login
#[tauri::command]
pub async fn capture_auth_cookies(app: AppHandle) -> Result<bool, String> {
    let auth_window = app
        .get_webview_window("riot-auth")
        .ok_or_else(|| "Auth window not found".to_string())?;

    // Get cookies for the Riot auth domain
    let riot_url = Url::parse(&format!("https://{}", RIOT_AUTH_DOMAIN))
        .map_err(|e| format!("Invalid URL: {}", e))?;

    let cookies = auth_window
        .cookies_for_url(riot_url)
        .map_err(|e| format!("Failed to get cookies: {}", e))?;

    let mut auth_cookies = RiotAuthCookies::default();

    for cookie in cookies {
        let name = cookie.name();
        let value = cookie.value().to_string();

        debug!("Found cookie: {} = {}...", name, &value[..std::cmp::min(10, value.len())]);

        match name {
            "tdid" => auth_cookies.tdid = Some(value),
            "clid" => auth_cookies.clid = Some(value),
            "csid" => auth_cookies.csid = Some(value),
            "ssid" => auth_cookies.ssid = Some(value),
            "sub" => auth_cookies.sub = Some(value),
            _ => {}
        }
    }

    // Check if we have minimum required cookies
    if !auth_cookies.is_complete() {
        debug!("Not all required cookies captured yet");
        return Ok(false);
    }

    auth_cookies.captured_at = Some(chrono::Utc::now().to_rfc3339());

    // Save cookies to auth.json
    let auth_path = get_auth_json_path();
    write_json_file(&auth_path, &auth_cookies)?;

    // Update settings with PUUID if available
    if let Some(ref puuid) = auth_cookies.sub {
        update_settings_puuid(puuid)?;
    }

    info!(
        "Auth cookies saved. Full auth: {}",
        auth_cookies.has_full_auth()
    );

    // Close auth window
    if let Err(e) = auth_window.close() {
        warn!("Failed to close auth window: {}", e);
    }

    // Emit success event
    let _ = app.emit("riot-auth-success", ());

    Ok(true)
}

/// Close the auth window without saving
#[tauri::command]
pub async fn close_auth_window(app: AppHandle) -> Result<(), String> {
    if let Some(auth_window) = app.get_webview_window("riot-auth") {
        auth_window
            .close()
            .map_err(|e| format!("Failed to close auth window: {}", e))?;
    }
    Ok(())
}

/// Update settings with PUUID
fn update_settings_puuid(puuid: &str) -> Result<(), String> {
    let settings_path = get_settings_json_path();
    let mut settings: Settings = if settings_path.exists() {
        read_json_file(&settings_path)?
    } else {
        Settings::default()
    };

    if let Some(ref mut creds) = settings.valorant_credentials {
        creds.puuid = Some(puuid.to_string());
    } else {
        settings.valorant_credentials = Some(ValorantCredentials {
            username: None,
            region: "ap".to_string(),
            puuid: Some(puuid.to_string()),
        });
    }

    write_json_file(&settings_path, &settings)?;
    Ok(())
}

/// Get current authentication status
#[tauri::command]
pub fn get_auth_status() -> Result<AuthStatus, String> {
    let auth_path = get_auth_json_path();
    let settings_path = get_settings_json_path();

    let auth_cookies: Option<RiotAuthCookies> = if auth_path.exists() {
        read_json_file(&auth_path).ok()
    } else {
        None
    };

    let settings: Settings = if settings_path.exists() {
        read_json_file(&settings_path)?
    } else {
        Settings::default()
    };

    let is_authenticated = auth_cookies
        .as_ref()
        .map(|c| c.is_complete())
        .unwrap_or(false);
    let has_full_cookies = auth_cookies
        .as_ref()
        .map(|c| c.has_full_auth())
        .unwrap_or(false);

    Ok(AuthStatus {
        is_authenticated,
        has_full_cookies,
        username: settings
            .valorant_credentials
            .as_ref()
            .and_then(|c| c.username.clone()),
        region: settings
            .valorant_credentials
            .as_ref()
            .map(|c| c.region.clone())
            .unwrap_or_else(|| "ap".to_string()),
        puuid: auth_cookies.as_ref().and_then(|c| c.sub.clone()),
        expires_hint: if has_full_cookies {
            Some("3 weeks".to_string())
        } else if is_authenticated {
            Some("1 week".to_string())
        } else {
            None
        },
    })
}

/// Get stored credentials (cookies) for the Python worker
#[tauri::command]
pub fn get_stored_credentials() -> Result<Option<RiotAuthCookies>, String> {
    let auth_path = get_auth_json_path();

    if !auth_path.exists() {
        return Ok(None);
    }

    let cookies: RiotAuthCookies = read_json_file(&auth_path)?;

    if cookies.is_complete() {
        Ok(Some(cookies))
    } else {
        Ok(None)
    }
}

/// Clear stored authentication
#[tauri::command]
pub fn logout() -> Result<(), String> {
    let auth_path = get_auth_json_path();

    if auth_path.exists() {
        std::fs::remove_file(&auth_path)
            .map_err(|e| format!("Failed to remove auth file: {}", e))?;
    }

    Ok(())
}
