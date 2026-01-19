use crate::file_manager::{read_json_file, write_json_file};
use crate::utils::get_restore_list_json_path;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KilledProcessInfo {
    pub exe_path: String,
    pub name: String,
    pub killed_at: i64,
    pub is_self_restoring: bool,
    pub working_dir: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RestoreList {
    pub session_id: Option<String>,
    pub processes: Vec<KilledProcessInfo>,
    pub created_at: i64,
    pub detected_respawns: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RestoreError {
    pub exe_path: String,
    pub error: String,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct RestoreResult {
    pub restored: usize,
    pub skipped_self_restoring: usize,
    pub failed: usize,
    pub errors: Vec<RestoreError>,
}

pub fn load_restore_list() -> Result<RestoreList, String> {
    let path = get_restore_list_json_path();

    if !path.exists() {
        return Ok(RestoreList::default());
    }

    read_json_file(&path)
}

pub fn save_restore_list(list: &RestoreList) -> Result<(), String> {
    let path = get_restore_list_json_path();
    write_json_file(&path, list)
}

pub fn clear_restore_list() -> Result<(), String> {
    let path = get_restore_list_json_path();

    if path.exists() {
        std::fs::remove_file(&path)
            .map_err(|e| format!("Failed to delete restore list: {}", e))?;
    }

    Ok(())
}

pub fn add_to_restore_list(process: KilledProcessInfo) -> Result<(), String> {
    let mut list = load_restore_list()?;

    if list.processes.iter().any(|p| p.exe_path == process.exe_path) {
        return Ok(());
    }

    list.processes.push(process);
    save_restore_list(&list)
}

pub fn mark_as_self_restoring(exe_path: &str) -> Result<(), String> {
    let mut list = load_restore_list()?;

    for process in &mut list.processes {
        if process.exe_path == exe_path {
            process.is_self_restoring = true;
        }
    }

    if !list.detected_respawns.contains(&exe_path.to_string()) {
        list.detected_respawns.push(exe_path.to_string());
    }

    save_restore_list(&list)
}

#[cfg(windows)]
pub fn restore_process(process: &KilledProcessInfo) -> Result<(), String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::ptr::null;
    use windows_sys::Win32::UI::Shell::ShellExecuteW;
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    if process.is_self_restoring {
        return Err("Process is self-restoring, skipped".to_string());
    }

    if !std::path::Path::new(&process.exe_path).exists() {
        return Err(format!("Executable not found: {}", process.exe_path));
    }

    let operation: Vec<u16> = OsStr::new("open")
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let file: Vec<u16> = OsStr::new(&process.exe_path)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    let working_dir_wide: Option<Vec<u16>> = process.working_dir.as_ref().map(|dir| {
        OsStr::new(dir)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    });

    let working_dir_ptr = working_dir_wide
        .as_ref()
        .map(|v| v.as_ptr())
        .unwrap_or(null());

    unsafe {
        let result = ShellExecuteW(
            0 as _, 
            operation.as_ptr(),
            file.as_ptr(),
            null(), 
            working_dir_ptr,
            SW_SHOWNORMAL as i32,
        );

        if (result as usize) > 32 {
            Ok(())
        } else {
            Err(format!(
                "ShellExecuteW failed for {}: error code {}",
                process.name, result as usize
            ))
        }
    }
}

#[cfg(not(windows))]
pub fn restore_process(_process: &KilledProcessInfo) -> Result<(), String> {
    Err("Process restore is only supported on Windows".to_string())
}

pub fn restore_all_processes(restore_list: &RestoreList) -> RestoreResult {
    let mut result = RestoreResult::default();

    for process in &restore_list.processes {
        if process.is_self_restoring {
            result.skipped_self_restoring += 1;
            continue;
        }

        match restore_process(process) {
            Ok(()) => {
                result.restored += 1;
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
            Err(e) => {
                result.failed += 1;
                result.errors.push(RestoreError {
                    exe_path: process.exe_path.clone(),
                    error: e,
                });
            }
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_self_restoring_skipped() {
        let process = KilledProcessInfo {
            exe_path: "C:\\test\\test.exe".to_string(),
            name: "test.exe".to_string(),
            killed_at: 0,
            is_self_restoring: true,
            working_dir: None,
        };

        let result = restore_process(&process);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("self-restoring"));
    }

    #[test]
    fn test_restore_list_serialization() {
        let list = RestoreList {
            session_id: Some("test-session".to_string()),
            processes: vec![KilledProcessInfo {
                exe_path: "C:\\test\\app.exe".to_string(),
                name: "app.exe".to_string(),
                killed_at: 12345,
                is_self_restoring: false,
                working_dir: Some("C:\\test".to_string()),
            }],
            created_at: 12345,
            detected_respawns: vec![],
        };

        let json = serde_json::to_string(&list).unwrap();
        let deserialized: RestoreList = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.session_id, list.session_id);
        assert_eq!(deserialized.processes.len(), 1);
        assert_eq!(deserialized.processes[0].name, "app.exe");
    }
}
