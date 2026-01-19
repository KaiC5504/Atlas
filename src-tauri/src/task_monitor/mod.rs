pub mod categorizer;
pub mod descriptions;
pub mod gpu_tracker;
pub mod models;
pub mod profiles;
pub mod restore;
pub mod system_tracker;

use categorizer::can_kill_process;
use models::{KillResult, ProcessCategory, ProcessInfo, SystemSummary};
use restore::KilledProcessInfo;
use sysinfo::{ProcessRefreshKind, RefreshKind, System};
use system_tracker::SYSTEM_TRACKER;

use crate::commands::settings::get_settings;

pub fn get_all_processes() -> Vec<ProcessInfo> {
    SYSTEM_TRACKER.get_all_processes()
}

pub fn get_system_summary() -> SystemSummary {
    SYSTEM_TRACKER.get_system_summary()
}

#[cfg(windows)]
pub fn kill_process(pid: u32) -> Result<(), String> {
    kill_process_internal(pid, true)
}

#[cfg(windows)]
fn kill_process_internal(pid: u32, track_for_restore: bool) -> Result<(), String> {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{OpenProcess, TerminateProcess, PROCESS_TERMINATE};

    let processes = get_all_processes();
    let target = processes.iter().find(|p| p.pid == pid);

    let process_info = match target {
        None => return Err("Process not found".to_string()),
        Some(p) if !p.can_kill => {
            return Err(format!("Cannot kill protected process: {}", p.name));
        }
        Some(p) => p.clone(),
    };

    if track_for_restore {
        if let Some(ref exe_path) = process_info.exe_path {
            let settings = get_settings().unwrap_or_default();
            if settings.auto_restore_enabled {
                let killed_info = KilledProcessInfo {
                    exe_path: exe_path.clone(),
                    name: process_info.name.clone(),
                    killed_at: chrono::Utc::now().timestamp(),
                    is_self_restoring: false,
                    working_dir: std::path::Path::new(exe_path)
                        .parent()
                        .map(|p| p.to_string_lossy().to_string()),
                };
                let _ = restore::add_to_restore_list(killed_info);
            }
        }
    }

    unsafe {
        let handle = OpenProcess(PROCESS_TERMINATE, 0, pid);
        if handle.is_null() {
            return Err("Failed to open process (Access Denied or process no longer exists)".to_string());
        }

        let result = TerminateProcess(handle, 1);
        CloseHandle(handle);

        if result == 0 {
            return Err("Failed to terminate process".to_string());
        }
    }

    Ok(())
}

#[cfg(not(windows))]
pub fn kill_process(_pid: u32) -> Result<(), String> {
    Err("Process killing is only supported on Windows".to_string())
}

pub fn kill_multiple_processes(pids: &[u32]) -> KillResult {
    let mut killed = 0;
    let mut failed = 0;
    let mut errors = Vec::new();

    for pid in pids {
        match kill_process(*pid) {
            Ok(()) => killed += 1,
            Err(e) => {
                failed += 1;
                errors.push(format!("PID {}: {}", pid, e));
            }
        }
    }

    KillResult {
        killed,
        failed,
        errors,
    }
}

pub fn kill_by_category(category: &ProcessCategory) -> KillResult {
    if !can_kill_process(category) {
        return KillResult {
            killed: 0,
            failed: 0,
            errors: vec![format!(
                "Cannot kill processes in category: {:?}",
                category
            )],
        };
    }

    let processes = get_all_processes();
    let pids: Vec<u32> = processes
        .iter()
        .filter(|p| &p.category == category && p.can_kill)
        .map(|p| p.pid)
        .collect();

    kill_multiple_processes(&pids)
}

pub fn kill_by_names(names: &[String]) -> KillResult {
    let processes = get_all_processes();
    let names_lower: Vec<String> = names.iter().map(|n| n.to_lowercase()).collect();

    let pids: Vec<u32> = processes
        .iter()
        .filter(|p| {
            let proc_name_lower = p.name.to_lowercase();
            p.can_kill && names_lower.iter().any(|n| proc_name_lower.contains(n))
        })
        .map(|p| p.pid)
        .collect();

    kill_multiple_processes(&pids)
}

pub fn execute_profile(profile_id: &str) -> Result<KillResult, String> {
    let profiles = profiles::get_profiles()?;
    let profile = profiles
        .iter()
        .find(|p| p.id == profile_id)
        .ok_or_else(|| "Profile not found".to_string())?;

    Ok(kill_by_names(&profile.processes_to_kill))
}

pub fn get_kill_recommendations(min_memory_mb: f64) -> Vec<ProcessInfo> {
    let processes = get_all_processes();

    processes
        .into_iter()
        .filter(|p| {
            p.can_kill
                && p.memory_mb >= min_memory_mb
                && matches!(
                    p.category,
                    ProcessCategory::MicrosoftBloat | ProcessCategory::BackgroundService
                )
        })
        .collect()
}
