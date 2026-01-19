use crate::task_monitor::{
    self,
    models::{GamingProfile, KillResult, ProcessCategory, ProcessInfo, SystemSummary},
    profiles,
    restore::{self, RestoreList, RestoreResult},
};

#[tauri::command]
pub fn get_process_list() -> Result<Vec<ProcessInfo>, String> {
    Ok(task_monitor::get_all_processes())
}

#[tauri::command]
pub fn get_system_summary() -> Result<SystemSummary, String> {
    Ok(task_monitor::get_system_summary())
}

#[tauri::command]
pub fn kill_single_process(pid: u32) -> Result<(), String> {
    task_monitor::kill_process(pid)
}

#[tauri::command]
pub fn kill_multiple_processes(pids: Vec<u32>) -> Result<KillResult, String> {
    Ok(task_monitor::kill_multiple_processes(&pids))
}

#[tauri::command]
pub fn kill_by_category(category: String) -> Result<KillResult, String> {
    let cat = match category.as_str() {
        "MicrosoftBloat" => ProcessCategory::MicrosoftBloat,
        "UserApplication" => ProcessCategory::UserApplication,
        "BackgroundService" => ProcessCategory::BackgroundService,
        "Unknown" => ProcessCategory::Unknown,
        _ => return Err(format!("Cannot kill category: {}", category)),
    };
    Ok(task_monitor::kill_by_category(&cat))
}

#[tauri::command]
pub fn get_gaming_profiles() -> Result<Vec<GamingProfile>, String> {
    profiles::get_profiles()
}

#[tauri::command]
pub fn save_gaming_profile(profile: GamingProfile) -> Result<(), String> {
    profiles::save_profile(profile)
}

#[tauri::command]
pub fn delete_gaming_profile(id: String) -> Result<(), String> {
    profiles::delete_profile(&id)
}

#[tauri::command]
pub fn set_default_gaming_profile(id: String) -> Result<(), String> {
    profiles::set_default_profile(&id)
}

#[tauri::command]
pub fn execute_gaming_profile(id: String) -> Result<KillResult, String> {
    task_monitor::execute_profile(&id)
}

#[tauri::command]
pub fn get_kill_recommendations(min_memory_mb: f64) -> Result<Vec<ProcessInfo>, String> {
    Ok(task_monitor::get_kill_recommendations(min_memory_mb))
}

// Restore feature commands
#[tauri::command]
pub fn get_restore_list() -> Result<RestoreList, String> {
    restore::load_restore_list()
}

#[tauri::command]
pub fn clear_restore_list() -> Result<(), String> {
    restore::clear_restore_list()
}

#[tauri::command]
pub fn restore_processes_now() -> Result<RestoreResult, String> {
    let list = restore::load_restore_list()?;
    let result = restore::restore_all_processes(&list);
    // Clear the restore list after restoration
    let _ = restore::clear_restore_list();
    Ok(result)
}
