// Performance monitoring Tauri commands
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
#[tauri::command]
pub fn stop_performance_monitoring(
    state: State<'_, Arc<MonitoringState>>,
) -> Result<(), String> {
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
