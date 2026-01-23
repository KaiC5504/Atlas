// Server monitoring command handlers
use crate::file_manager::{read_json_file, write_json_file};
use crate::models::{
    CommandResult, CommandStatus, QuickAction, QuickActionsConfig, SSHCredentials, ServerConfig,
    SystemStatus,
};
use crate::process_manager::{spawn_python_worker_async, WorkerMessage};
use crate::utils::{
    get_quick_actions_json_path, get_server_config_json_path, get_ssh_credentials_json_path,
};
use chrono::Utc;
use log::debug;
use serde::Deserialize;
use serde_json::json;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;
use uuid::Uuid;

#[derive(Debug, Deserialize)]
pub struct UpdateServerConfigParams {
    pub host: Option<String>,
    pub port: Option<u16>,
    pub username: Option<String>,
    pub domain: Option<String>,
}

/// Get current server configuration
#[tauri::command]
pub fn get_server_config() -> Result<ServerConfig, String> {
    let path = get_server_config_json_path();

    if !path.exists() {
        return Ok(ServerConfig::default());
    }

    read_json_file(&path)
}

/// Update server configuration
#[tauri::command]
pub fn update_server_config(config: UpdateServerConfigParams) -> Result<ServerConfig, String> {
    let path = get_server_config_json_path();

    let mut current_config: ServerConfig = if path.exists() {
        read_json_file(&path)?
    } else {
        ServerConfig::default()
    };

    if let Some(host) = config.host {
        current_config.host = host;
    }
    if let Some(port) = config.port {
        current_config.port = port;
    }
    if let Some(username) = config.username {
        current_config.username = username;
    }
    if let Some(domain) = config.domain {
        current_config.domain = Some(domain);
    }

    write_json_file(&path, &current_config)?;
    debug!("Updated server config: {:?}", current_config);

    Ok(current_config)
}

/// Save SSH credentials (password)
#[tauri::command]
pub fn save_ssh_credentials(password: String) -> Result<(), String> {
    let path = get_ssh_credentials_json_path();

    let credentials = SSHCredentials {
        password,
        saved_at: Utc::now().to_rfc3339(),
    };

    write_json_file(&path, &credentials)?;
    debug!("SSH credentials saved");

    Ok(())
}

/// Get saved SSH credentials
#[tauri::command]
pub fn get_ssh_credentials() -> Result<Option<SSHCredentials>, String> {
    let path = get_ssh_credentials_json_path();

    if !path.exists() {
        return Ok(None);
    }

    let credentials: SSHCredentials = read_json_file(&path)?;
    Ok(Some(credentials))
}

/// Check if SSH credentials are saved
#[tauri::command]
pub fn has_ssh_credentials() -> Result<bool, String> {
    let path = get_ssh_credentials_json_path();
    Ok(path.exists())
}

/// Clear saved SSH credentials
#[tauri::command]
pub fn clear_ssh_credentials() -> Result<(), String> {
    let path = get_ssh_credentials_json_path();

    if path.exists() {
        std::fs::remove_file(&path)
            .map_err(|e| format!("Failed to delete credentials file: {}", e))?;
        debug!("SSH credentials cleared");
    }

    Ok(())
}

/// Get quick actions configuration
#[tauri::command]
pub fn get_quick_actions() -> Result<Vec<QuickAction>, String> {
    let path = get_quick_actions_json_path();

    if !path.exists() {
        let default_config = QuickActionsConfig::default();
        return Ok(default_config.quick_actions);
    }

    let config: QuickActionsConfig = read_json_file(&path)?;
    Ok(config.quick_actions)
}

/// Execute an SSH command on the server
#[tauri::command]
pub async fn execute_ssh_command(
    app: AppHandle,
    command: String,
    password: Option<String>,
) -> Result<CommandResult, String> {
    // Get server config
    let server_config = get_server_config()?;

    // Get password from parameter or saved credentials
    let ssh_password = if let Some(pwd) = password {
        pwd
    } else {
        let creds = get_ssh_credentials()?
            .ok_or_else(|| "No SSH credentials saved. Please provide a password.".to_string())?;
        creds.password
    };

    let session_id = Uuid::new_v4().to_string();
    let started_at = Utc::now().to_rfc3339();

    let final_command = if command.contains("pm2") {
        format!(
            "export PATH=\"/root/.nvm/versions/node/v24.13.0/bin:$PATH\" && {}",
            command
        )
    } else {
        command.clone()
    };

    // Prepare input for Python worker
    let worker_input = json!({
        "host": server_config.host,
        "port": server_config.port,
        "username": server_config.username,
        "password": ssh_password,
        "command": final_command,
        "session_id": session_id
    });

    debug!(
        "Executing SSH command on {}@{}: {}",
        server_config.username, server_config.host, command
    );

    // Spawn Python SSH worker
    let (progress_tx, mut progress_rx) = mpsc::channel::<WorkerMessage>(100);

    // Clone values for the async block
    let app_clone = app.clone();
    let session_id_clone = session_id.clone();

    // Spawn task to forward progress events
    tokio::spawn(async move {
        while let Some(msg) = progress_rx.recv().await {
            if let WorkerMessage::Log { level, message } = msg {
                let is_stderr = level == "stderr";

                let _ = app_clone.emit(
                    "ssh:output",
                    json!({
                        "session_id": session_id_clone,
                        "output": message,
                        "is_stderr": is_stderr
                    }),
                );
            }
        }
    });

    // Execute the Python worker
    let result = spawn_python_worker_async("ssh_worker.py", worker_input, Some(progress_tx)).await;

    match result {
        Ok(output) => {
            let exit_code = output
                .get("exit_code")
                .and_then(|v| v.as_i64())
                .map(|v| v as i32);
            let full_output = output
                .get("output")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let error = output
                .get("error")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let status = if exit_code == Some(0) {
                CommandStatus::Completed
            } else {
                CommandStatus::Failed
            };

            // Emit completion event
            let _ = app.emit(
                "ssh:complete",
                json!({
                    "session_id": session_id,
                    "exit_code": exit_code.unwrap_or(-1),
                    "error": error
                }),
            );

            Ok(CommandResult {
                command,
                status,
                exit_code,
                output: full_output,
                error,
                started_at,
                completed_at: Some(Utc::now().to_rfc3339()),
            })
        }
        Err(e) => {
            let _ = app.emit(
                "ssh:complete",
                json!({
                    "session_id": session_id,
                    "exit_code": -1,
                    "error": e
                }),
            );

            Ok(CommandResult {
                command,
                status: CommandStatus::Failed,
                exit_code: None,
                output: String::new(),
                error: Some(e),
                started_at,
                completed_at: Some(Utc::now().to_rfc3339()),
            })
        }
    }
}

/// Get system status from the server
#[tauri::command]
pub async fn get_system_status(
    _app: AppHandle,
    password: Option<String>,
) -> Result<SystemStatus, String> {
    // Get server config
    let server_config = get_server_config()?;

    // Get password from parameter or saved credentials
    let ssh_password = if let Some(pwd) = password {
        pwd
    } else {
        let creds = get_ssh_credentials()?
            .ok_or_else(|| "No SSH credentials saved. Please provide a password.".to_string())?;
        creds.password
    };

    // Prepare input for Python worker
    let worker_input = json!({
        "host": server_config.host,
        "port": server_config.port,
        "username": server_config.username,
        "password": ssh_password,
        "action": "system_status"
    });

    debug!(
        "Getting system status from {}@{}",
        server_config.username, server_config.host
    );

    // Execute the Python worker
    let result = spawn_python_worker_async("ssh_worker.py", worker_input, None).await;

    match result {
        Ok(output) => {
            // Parse system status from worker output
            let status = SystemStatus {
                uptime: output
                    .get("uptime")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Unknown")
                    .to_string(),
                load_average: output
                    .get("load_average")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Unknown")
                    .to_string(),
                memory_used: output
                    .get("memory_used")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Unknown")
                    .to_string(),
                memory_total: output
                    .get("memory_total")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Unknown")
                    .to_string(),
                disk_used: output
                    .get("disk_used")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Unknown")
                    .to_string(),
                disk_total: output
                    .get("disk_total")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Unknown")
                    .to_string(),
                cpu_usage: output
                    .get("cpu_usage")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Unknown")
                    .to_string(),
            };

            Ok(status)
        }
        Err(e) => Err(format!("Failed to get system status: {}", e)),
    }
}

/// Test SSH connection to the server
#[tauri::command]
pub async fn test_ssh_connection(password: String) -> Result<bool, String> {
    let server_config = get_server_config()?;

    let worker_input = json!({
        "host": server_config.host,
        "port": server_config.port,
        "username": server_config.username,
        "password": password,
        "command": "echo 'Connection successful'",
        "session_id": Uuid::new_v4().to_string()
    });

    let result = spawn_python_worker_async("ssh_worker.py", worker_input, None).await;

    match result {
        Ok(output) => {
            let exit_code = output.get("exit_code").and_then(|v| v.as_i64());
            Ok(exit_code == Some(0))
        }
        Err(_) => Ok(false),
    }
}

/// Upload a file to the server via SFTP
#[tauri::command]
pub async fn upload_file_to_server(
    app: AppHandle,
    local_path: String,
    remote_path: String,
    password: Option<String>,
) -> Result<serde_json::Value, String> {
    // Get server config
    let server_config = get_server_config()?;

    // Get password from parameter or saved credentials
    let ssh_password = if let Some(pwd) = password {
        pwd
    } else {
        let creds = get_ssh_credentials()?
            .ok_or_else(|| "No SSH credentials saved. Please provide a password.".to_string())?;
        creds.password
    };

    let session_id = Uuid::new_v4().to_string();

    // Prepare input for Python worker
    let worker_input = json!({
        "host": server_config.host,
        "port": server_config.port,
        "username": server_config.username,
        "password": ssh_password,
        "action": "upload_file",
        "local_path": local_path,
        "remote_path": remote_path,
        "session_id": session_id
    });

    debug!(
        "Uploading file via SFTP: {} -> {}@{}:{}",
        local_path, server_config.username, server_config.host, remote_path
    );

    // Spawn Python SSH worker
    let (progress_tx, mut progress_rx) = mpsc::channel::<WorkerMessage>(100);

    // Clone values for the async block
    let app_clone = app.clone();
    let session_id_clone = session_id.clone();

    // Spawn task to forward progress events
    tokio::spawn(async move {
        while let Some(msg) = progress_rx.recv().await {
            match msg {
                WorkerMessage::Log { level, message } => {
                    let is_stderr = level == "stderr";
                    let _ = app_clone.emit(
                        "ssh:output",
                        json!({
                            "session_id": session_id_clone,
                            "output": message,
                            "is_stderr": is_stderr
                        }),
                    );
                }
                WorkerMessage::Progress { percent, stage } => {
                    let _ = app_clone.emit(
                        "upload:progress",
                        json!({
                            "session_id": session_id_clone,
                            "percent": percent,
                            "stage": stage
                        }),
                    );
                }
                _ => {}
            }
        }
    });

    // Execute the Python worker
    let result = spawn_python_worker_async("ssh_worker.py", worker_input, Some(progress_tx)).await;

    match result {
        Ok(output) => {
            // Emit completion event
            let _ = app.emit(
                "upload:complete",
                json!({
                    "session_id": session_id,
                    "success": output.get("success").and_then(|v| v.as_bool()).unwrap_or(false)
                }),
            );

            Ok(output)
        }
        Err(e) => {
            let _ = app.emit(
                "upload:complete",
                json!({
                    "session_id": session_id,
                    "success": false,
                    "error": e
                }),
            );

            Err(format!("Failed to upload file: {}", e))
        }
    }
}

/// Read a local file's content (for reading .sig files)
#[tauri::command]
pub fn read_local_file(file_path: String) -> Result<String, String> {
    let path = std::path::Path::new(&file_path);

    if !path.exists() {
        return Err(format!("File not found: {}", file_path));
    }

    std::fs::read_to_string(path)
        .map_err(|e| format!("Failed to read file: {}", e))
}

/// Check if a local file exists
#[tauri::command]
pub fn check_local_file_exists(file_path: String) -> bool {
    std::path::Path::new(&file_path).exists()
}
