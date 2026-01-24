use log::{debug, error, info, warn};
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

/// Represents how a worker should be executed
#[derive(Debug)]
pub enum WorkerExecutable {
    /// Compiled .exe file (production) - direct execution
    Exe(std::path::PathBuf),
    /// Python script (development) - requires Python interpreter
    Script { python_path: String, script_path: std::path::PathBuf },
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

fn is_valid_workers_dir(dir: &std::path::Path) -> bool {
    let has_common = dir.join("common").exists() && dir.join("common").join("__init__.py").exists();

    let dist_dir = dir.join("dist");
    let has_dist = dist_dir.exists() && dist_dir.is_dir() &&
        std::fs::read_dir(&dist_dir)
            .map(|entries| entries.filter_map(|e| e.ok())
                .any(|e| e.path().is_dir()))
            .unwrap_or(false);

    debug!(target: "python_worker", "is_valid_workers_dir({:?}): has_common={}, has_dist={}, dist_exists={}",
        dir, has_common, has_dist, dist_dir.exists());

    has_common || has_dist
}

pub fn get_workers_dir() -> std::path::PathBuf {
    if let Ok(exe_path) = std::env::current_exe() {
        debug!(target: "python_worker", "Executable path: {:?}", exe_path);

        if let Some(exe_dir) = exe_path.parent() {
            // First, search up the directory tree for development builds
            // This finds the project root's python_workers with source .py files
            let mut current = exe_dir;
            for i in 0..5 {
                if let Some(parent) = current.parent() {
                    let dev_workers_dir = parent.join("python_workers");
                    debug!(target: "python_worker", "Checking for python_workers at: {:?} (level {})", dev_workers_dir, i);
                    // Check for common module (indicates dev environment with source files)
                    if dev_workers_dir.join("common").join("__init__.py").exists() {
                        debug!(target: "python_worker", "Found dev python_workers at: {:?}", dev_workers_dir);
                        return dev_workers_dir;
                    }
                    current = parent;
                } else {
                    break;
                }
            }

            // Then check next to exe (production/release builds)
            let workers_dir = exe_dir.join("python_workers");
            if workers_dir.exists() && is_valid_workers_dir(&workers_dir) {
                debug!(target: "python_worker", "Found python_workers next to exe: {:?}", workers_dir);
                return workers_dir;
            }
        }
    }

    let cwd_workers = std::env::current_dir()
        .unwrap_or_default()
        .join("python_workers");

    debug!(target: "python_worker", "Fallback to current dir python_workers: {:?}", cwd_workers);
    cwd_workers
}

const ML_WORKERS: &[&str] = &[
    "audio_separator",
    "audio_event_detector",
    "model_enhancer",
];

fn is_ml_worker(script: &str) -> bool {
    let base_name = script.trim_end_matches(".py");
    ML_WORKERS.iter().any(|&ml| base_name == ml)
}

pub fn find_worker_executable(script: &str) -> Result<WorkerExecutable, String> {
    let workers_dir = get_workers_dir();
    let base_name = script.trim_end_matches(".py");

    // In debug builds, prefer .py scripts for faster iteration (no need to compile)
    // In release builds, prefer compiled .exe for better performance and no Python dependency
    #[cfg(debug_assertions)]
    {
        debug!(target: "python_worker", "find_worker_executable (DEBUG): script={}, workers_dir={:?}", script, workers_dir);

        // First try .py script (preferred in debug mode)
        let script_path = workers_dir.join(script);
        debug!(target: "python_worker", "  Checking script: {:?} exists={}", script_path, script_path.exists());
        if script_path.exists() {
            let python_path = get_python_path();
            info!(target: "python_worker", "Using Python script (DEBUG mode): {:?} with {}", script_path, python_path);
            return Ok(WorkerExecutable::Script {
                python_path,
                script_path
            });
        }

        // Fall back to .exe if .py not found (--onedir structure: dist/{name}/{name}.exe)
        let exe_path = workers_dir.join("dist").join(base_name).join(format!("{}.exe", base_name));
        if exe_path.exists() {
            debug!(target: "python_worker", "Found compiled worker (fallback): {:?}", exe_path);
            return Ok(WorkerExecutable::Exe(exe_path));
        }

        let exe_path_direct = workers_dir.join(format!("{}.exe", base_name));
        if exe_path_direct.exists() {
            debug!(target: "python_worker", "Found compiled worker (fallback): {:?}", exe_path_direct);
            return Ok(WorkerExecutable::Exe(exe_path_direct));
        }
    }

    // In release builds, prefer compiled .exe
    #[cfg(not(debug_assertions))]
    {
        debug!(target: "python_worker", "find_worker_executable (RELEASE): script={}, workers_dir={:?}", script, workers_dir);

        // First try .exe in dist folder (--onedir structure: dist/{name}/{name}.exe)
        let exe_path = workers_dir.join("dist").join(base_name).join(format!("{}.exe", base_name));
        debug!(target: "python_worker", "  Checking exe: {:?} exists={}", exe_path, exe_path.exists());
        if exe_path.exists() {
            debug!(target: "python_worker", "Found compiled worker: {:?}", exe_path);
            return Ok(WorkerExecutable::Exe(exe_path));
        }

        // Then try .exe directly in workers dir
        let exe_path_direct = workers_dir.join(format!("{}.exe", base_name));
        debug!(target: "python_worker", "  Checking exe direct: {:?} exists={}", exe_path_direct, exe_path_direct.exists());
        if exe_path_direct.exists() {
            debug!(target: "python_worker", "Found compiled worker: {:?}", exe_path_direct);
            return Ok(WorkerExecutable::Exe(exe_path_direct));
        }

        // Fall back to .py script if no .exe found
        let script_path = workers_dir.join(script);
        debug!(target: "python_worker", "  Checking script: {:?} exists={}", script_path, script_path.exists());
        if script_path.exists() {
            let python_path = get_python_path();
            warn!(target: "python_worker", "Using Python script in RELEASE mode (no .exe found): {:?}", script_path);
            return Ok(WorkerExecutable::Script {
                python_path,
                script_path
            });
        }
    }

    // Worker not found
    if is_ml_worker(script) {
        return Err(format!(
            "This feature requires machine learning components that are not installed. \
            ML features (audio separation, audio detection) require additional setup. \
            Please contact the developer if you need this feature. \
            Debug: workers_dir={:?}, script={}", workers_dir, script
        ));
    }

    Err(format!(
        "Worker not found: {} (checked {:?}/dist/{}/{}.exe and {:?})",
        script,
        workers_dir,
        base_name,
        base_name,
        workers_dir.join(script)
    ))
}

pub async fn spawn_python_worker_async(
    script: &str,
    input: serde_json::Value,
    progress_callback: Option<mpsc::Sender<WorkerMessage>>,
) -> Result<serde_json::Value, String> {
    let worker_exec = find_worker_executable(script)?;

    info!(target: "python_worker", "Spawning worker: {:?}", worker_exec);

    let mut cmd = match &worker_exec {
        WorkerExecutable::Exe(exe_path) => {
            Command::new(exe_path)
        }
        WorkerExecutable::Script { python_path, script_path } => {
            let mut c = Command::new(python_path);
            c.arg(script_path);
            c
        }
    };

    cmd.stdin(Stdio::piped())
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

    // Capture stderr in a separate task
    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;
    let script_name = script.to_string();
    let stderr_handle = tokio::spawn(async move {
        let mut stderr_reader = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = stderr_reader.next_line().await {
            if !line.trim().is_empty() {
                warn!(target: "python_worker", "[{}] stderr: {}", script_name, line);
            }
        }
    });

    let mut reader = BufReader::new(stdout).lines();
    let mut last_result: Option<serde_json::Value> = None;
    let mut last_error: Option<String> = None;

    while let Ok(Some(line)) = reader.next_line().await {
        if line.len() > 10000 {
            debug!(target: "python_worker", "Received large line: {} bytes", line.len());
        }

        if let Ok(message) = serde_json::from_str::<WorkerMessage>(&line) {
            match &message {
                WorkerMessage::Progress { .. } => {
                    if let Some(ref tx) = progress_callback {
                        let _ = tx.send(message.clone()).await;
                    }
                }
                WorkerMessage::Result { data } => {
                    debug!(target: "python_worker", "Received result data");
                    last_result = Some(data.clone());
                }
                WorkerMessage::Error { message } => {
                    last_error = Some(message.clone());
                }
                WorkerMessage::Log { level, message } => {
                    // Forward Python log messages to the log file
                    match level.as_str() {
                        "error" => error!(target: "python_worker", "[{}] {}", script, message),
                        "warning" => warn!(target: "python_worker", "[{}] {}", script, message),
                        "debug" => debug!(target: "python_worker", "[{}] {}", script, message),
                        "stdout" | "stderr" => {
                            // Forward to UI callback but don't spam the log
                            if let Some(ref tx) = progress_callback {
                                let _ = tx.send(WorkerMessage::Log {
                                    level: level.clone(),
                                    message: message.clone(),
                                }).await;
                            }
                        }
                        _ => info!(target: "python_worker", "[{}] {}", script, message),
                    }
                }
            }
        } else {
            if !line.trim().is_empty() {
                debug!(target: "python_worker", "Raw output ({} bytes): {}",
                    line.len(),
                    if line.len() > 200 { &line[..200] } else { &line }
                );
            }
        }
    }

    // Wait for stderr task to complete
    let _ = stderr_handle.await;

    debug!(target: "python_worker", "Finished reading stdout, result present: {}", last_result.is_some());

    let status = child
        .wait()
        .await
        .map_err(|e| format!("Failed to wait for process: {}", e))?;

    let exit_code = status.code().unwrap_or(-1);
    info!(target: "python_worker", "Worker exited with code: {}", exit_code);

    if let Some(error) = last_error {
        return Err(error);
    }

    if exit_code != 0 {
        return Err(format!("Python worker exited with code: {}", exit_code));
    }

    last_result.ok_or_else(|| "No result from Python worker".to_string())
}
