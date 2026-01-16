// Python worker process management
// Handles spawning and monitoring Python worker processes

use serde::{Deserialize, Serialize};
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::mpsc;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WorkerMessage {
    Progress {
        percent: u8,
        stage: String,
    },
    Result {
        data: serde_json::Value,
    },
    Error {
        message: String,
    },
    Log {
        level: String,
        message: String,
    },
}

pub fn get_python_path() -> String {
    #[cfg(target_os = "windows")]
    let paths = ["python", "python3", "py"];

    #[cfg(not(target_os = "windows"))]
    let paths = ["python3", "python"];

    for path in paths {
        let mut cmd = std::process::Command::new(path);
        cmd.arg("--version");

        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);

        if cmd.output().is_ok() {
            return path.to_string();
        }
    }

    "python".to_string()
}

/// Get the path to the python_workers directory
pub fn get_workers_dir() -> std::path::PathBuf {
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let workers_dir = exe_dir.join("python_workers");
            if workers_dir.exists() {
                return workers_dir;
            }

            let mut current = exe_dir;
            for _ in 0..3 {
                if let Some(parent) = current.parent() {
                    let dev_workers_dir = parent.join("python_workers");
                    if dev_workers_dir.exists() {
                        println!("Found python_workers at: {:?}", dev_workers_dir);
                        return dev_workers_dir;
                    }
                    current = parent;
                }
            }
        }
    }

    let cwd_workers = std::env::current_dir()
        .unwrap_or_default()
        .join("python_workers");

    println!("Fallback to current dir python_workers: {:?}", cwd_workers);
    cwd_workers
}

/// Spawn a Python worker asynchronously with optional progress callback
pub async fn spawn_python_worker_async(
    script: &str,
    input: serde_json::Value,
    progress_callback: Option<mpsc::Sender<WorkerMessage>>,
) -> Result<serde_json::Value, String> {
    let python_path = get_python_path();
    let workers_dir = get_workers_dir();
    let script_path = workers_dir.join(script);

    if !script_path.exists() {
        return Err(format!("Worker script not found: {:?}", script_path));
    }

    println!("Spawning Python worker: {:?}", script_path);

    // Spawn the Python process
    let mut cmd = Command::new(&python_path);
    cmd.arg(&script_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn Python process: {}", e))?;

    let input_json = serde_json::to_string(&input)
        .map_err(|e| format!("Failed to serialize input: {}", e))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(input_json.as_bytes())
            .await
            .map_err(|e| format!("Failed to write to stdin: {}", e))?;
        stdin
            .shutdown()
            .await
            .map_err(|e| format!("Failed to close stdin: {}", e))?;
    }

    let stdout = child
        .stdout
        .take()
        .ok_or("Failed to capture stdout")?;

    let mut reader = BufReader::new(stdout).lines();
    let mut last_result: Option<serde_json::Value> = None;
    let mut last_error: Option<String> = None;

    while let Ok(Some(line)) = reader.next_line().await {
        if let Ok(message) = serde_json::from_str::<WorkerMessage>(&line) {
            match &message {
                WorkerMessage::Progress { .. } => {
                    if let Some(ref tx) = progress_callback {
                        let _ = tx.send(message.clone()).await;
                    }
                }
                WorkerMessage::Result { data } => {
                    last_result = Some(data.clone());
                }
                WorkerMessage::Error { message } => {
                    last_error = Some(message.clone());
                }
                WorkerMessage::Log { level, message } => {
                    if level != "stdout" && level != "stderr" {
                        println!("[Python {}] {}", level, message);
                    }
                    if level == "stdout" || level == "stderr" {
                        if let Some(ref tx) = progress_callback {
                            let _ = tx.send(WorkerMessage::Log {
                                level: level.clone(),
                                message: message.clone(),
                            }).await;
                        }
                    }
                }
            }
        } else {
            println!("[Python] {}", line);
        }
    }

    let status = child
        .wait()
        .await
        .map_err(|e| format!("Failed to wait for process: {}", e))?;

    let exit_code = status.code().unwrap_or(-1);
    println!("Python worker exited with code: {}", exit_code);

    if let Some(error) = last_error {
        return Err(error);
    }

    if exit_code != 0 {
        return Err(format!("Python worker exited with code: {}", exit_code));
    }

    last_result.ok_or_else(|| "No result from Python worker".to_string())
}
