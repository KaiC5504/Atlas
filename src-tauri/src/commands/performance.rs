// Performance monitoring Tauri commands
use crate::gaming::GamingSessionManager;
use crate::models::performance::SystemMetrics;
use crate::performance::{get_snapshot, is_nvidia_available, start_monitoring, stop_monitoring, MonitoringState, SharedMetrics};
use std::sync::Arc;
use tauri::{AppHandle, State};

/// Start performance monitoring in the background
/// Emits "performance:update" events every 1 second
/// Also updates shared metrics so gaming session recording can read them
#[tauri::command]
pub fn start_performance_monitoring(
    app: AppHandle,
    state: State<'_, Arc<MonitoringState>>,
    shared_metrics: State<'_, Arc<SharedMetrics>>,
) -> Result<(), String> {
    start_monitoring(app, state.inner().clone(), shared_metrics.inner().clone());
    Ok(())
}

/// Stop performance monitoring
/// Note: Will not stop if there's an active gaming session to prevent data loss
#[tauri::command]
pub fn stop_performance_monitoring(
    state: State<'_, Arc<MonitoringState>>,
    session_manager: State<'_, Arc<GamingSessionManager>>,
) -> Result<(), String> {
    // Don't stop monitoring if there's an active gaming session
    // The gaming session needs continuous metrics for recording
    if session_manager.get_active_session().is_some() {
        return Ok(());
    }
    stop_monitoring(state.inner().clone());
    Ok(())
}

/// Get a single performance snapshot
#[tauri::command]
pub fn get_performance_snapshot() -> Result<SystemMetrics, String> {
    Ok(get_snapshot())
}

/// Check if performance monitoring is currently running
#[tauri::command]
pub fn is_performance_monitoring(state: State<'_, Arc<MonitoringState>>) -> bool {
    state.is_running.load(std::sync::atomic::Ordering::SeqCst)
}

/// Check if NVIDIA GPU is available
#[tauri::command]
pub fn has_nvidia_gpu() -> bool {
    is_nvidia_available()
}
