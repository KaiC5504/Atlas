// Performance data collector
use crate::models::performance::{CpuMetrics, GpuMetrics, RamMetrics, SystemMetrics};
use super::gpu::NvidiaGpu;
use log::{debug, info, warn};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, RwLock};
use std::thread;
use std::time::Duration;
use sysinfo::{CpuRefreshKind, MemoryRefreshKind, RefreshKind, System};
use tauri::{AppHandle, Emitter};

/// State for tracking if monitoring is active
pub struct MonitoringState {
    pub is_running: Arc<AtomicBool>,
}

impl Default for MonitoringState {
    fn default() -> Self {
        Self {
            is_running: Arc::new(AtomicBool::new(false)),
        }
    }
}

/// Shared metrics state - allows other components to read the latest metrics
/// without creating their own collectors (avoids duplicate NVML queries)
pub struct SharedMetrics {
    pub latest: RwLock<Option<SystemMetrics>>,
}

impl SharedMetrics {
    pub fn new() -> Self {
        Self {
            latest: RwLock::new(None),
        }
    }

    /// Get the latest metrics (returns None if no metrics collected yet)
    pub fn get(&self) -> Option<SystemMetrics> {
        self.latest.read().ok().and_then(|guard| guard.clone())
    }

    /// Update the latest metrics (called by the performance collector)
    pub fn set(&self, metrics: SystemMetrics) {
        if let Ok(mut guard) = self.latest.write() {
            *guard = Some(metrics);
        }
    }
}

impl Default for SharedMetrics {
    fn default() -> Self {
        Self::new()
    }
}

/// Performance data collector
/// Caches immutable values (CPU name, core count) to avoid redundant allocations
pub struct PerformanceCollector {
    system: System,
    nvidia_gpu: Option<NvidiaGpu>,
    cached_cpu_name: String,
    cached_core_count: usize,
}

impl PerformanceCollector {
    /// Create a new performance collector
    /// Caches CPU name and core count at initialization (these never change)
    pub fn new() -> Self {
        // Initialize system with CPU usage and memory refresh capabilities
        // Only request cpu_usage - frequency polling adds overhead for data we don't need per-second
        let system = System::new_with_specifics(
            RefreshKind::new()
                .with_cpu(CpuRefreshKind::new().with_cpu_usage())
                .with_memory(MemoryRefreshKind::everything()),
        );

        // Cache immutable CPU values at initialization
        let cached_cpu_name = system.cpus()
            .first()
            .map(|cpu| cpu.brand().to_string())
            .unwrap_or_else(|| "Unknown CPU".to_string());
        let cached_core_count = system.cpus().len();

        // Try to initialize NVIDIA GPU (will be None if not available)
        let nvidia_gpu = NvidiaGpu::new().ok();
        if nvidia_gpu.is_some() {
            debug!("NVIDIA GPU detected and initialized");
        } else {
            debug!("No NVIDIA GPU detected or NVML not available");
        }

        Self {
            system,
            nvidia_gpu,
            cached_cpu_name,
            cached_core_count,
        }
    }

    /// Collect all system metrics
    pub fn collect(&mut self) -> SystemMetrics {
        // Refresh CPU and memory data
        self.system.refresh_cpu();
        self.system.refresh_memory();

        SystemMetrics {
            cpu: self.collect_cpu(),
            gpu: self.collect_gpu(),
            ram: self.collect_ram(),
            timestamp: chrono::Utc::now().timestamp_millis(),
        }
    }

    /// Collect CPU metrics (uses cached name and core count)
    fn collect_cpu(&self) -> CpuMetrics {
        let cpus = self.system.cpus();

        // Get per-core usage
        let per_core_usage: Vec<f32> = cpus.iter().map(|cpu| cpu.cpu_usage()).collect();

        // Calculate overall usage (average of all cores)
        let usage_percent = if per_core_usage.is_empty() {
            0.0
        } else {
            per_core_usage.iter().sum::<f32>() / per_core_usage.len() as f32
        };

        // Get frequency from first core (in MHz) - only if needed for display
        let frequency_mhz = cpus.first().map(|cpu| cpu.frequency());

        CpuMetrics {
            usage_percent,
            per_core_usage,
            temperature_celsius: None, // sysinfo doesn't provide CPU temp on Windows directly
            frequency_mhz,
            core_count: self.cached_core_count,
            name: self.cached_cpu_name.clone(),
        }
    }

    /// Collect GPU metrics
    fn collect_gpu(&self) -> Option<GpuMetrics> {
        self.nvidia_gpu.as_ref().and_then(|gpu| gpu.collect().ok())
    }

    /// Collect RAM metrics
    fn collect_ram(&self) -> RamMetrics {
        let total = self.system.total_memory();
        let used = self.system.used_memory();
        let available = self.system.available_memory();

        let usage_percent = if total > 0 {
            (used as f64 / total as f64 * 100.0) as f32
        } else {
            0.0
        };

        RamMetrics {
            total_bytes: total,
            used_bytes: used,
            available_bytes: available,
            usage_percent,
        }
    }
}

/// Start performance monitoring in a background thread
/// The shared_metrics parameter allows other components (like gaming session recording)
/// to read the latest metrics without creating duplicate collectors
/// On Windows, the monitoring thread runs at BELOW_NORMAL priority to avoid
/// competing with game threads (matches MSI Afterburner behavior)
pub fn start_monitoring(app: AppHandle, state: Arc<MonitoringState>, shared_metrics: Arc<SharedMetrics>) {
    // Check if already running
    if state.is_running.load(Ordering::SeqCst) {
        debug!("Performance monitoring is already running");
        return;
    }

    // Set running flag
    state.is_running.store(true, Ordering::SeqCst);
    info!("Starting performance monitoring...");

    let is_running = state.is_running.clone();

    // Spawn monitoring thread
    thread::spawn(move || {
        // Set thread priority to BELOW_NORMAL on Windows to avoid competing with game threads
        // This matches the behavior of industry tools like MSI Afterburner
        #[cfg(windows)]
        {
            use windows_sys::Win32::System::Threading::{
                GetCurrentThread, SetThreadPriority, THREAD_PRIORITY_BELOW_NORMAL,
            };
            unsafe {
                let result = SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_BELOW_NORMAL);
                if result == 0 {
                    warn!("Failed to set monitoring thread to below-normal priority");
                } else {
                    debug!("Monitoring thread priority set to BELOW_NORMAL");
                }
            }
        }

        let mut collector = PerformanceCollector::new();

        // Give sysinfo a moment to initialize before first collection
        // Note: Don't call refresh_cpu() here - let collect() do it on first iteration
        // Otherwise there's nearly zero time between refreshes, causing incorrect readings
        thread::sleep(Duration::from_millis(500));

        while is_running.load(Ordering::SeqCst) {
            let metrics = collector.collect();

            // Update shared metrics so other components can read them
            shared_metrics.set(metrics.clone());

            // Emit event to frontend
            if let Err(e) = app.emit("performance:update", &metrics) {
                warn!("Failed to emit performance update: {}", e);
            }

            // Wait 1 second before next collection
            thread::sleep(Duration::from_secs(1));
        }

        debug!("Performance monitoring stopped");
    });
}

/// Stop performance monitoring
pub fn stop_monitoring(state: Arc<MonitoringState>) {
    debug!("Stopping performance monitoring...");
    state.is_running.store(false, Ordering::SeqCst);
}

/// Get a single performance snapshot (for one-time queries)
pub fn get_snapshot() -> SystemMetrics {
    let mut collector = PerformanceCollector::new();

    // Need to wait a bit for CPU usage to be accurate
    thread::sleep(Duration::from_millis(200));
    collector.system.refresh_cpu();
    thread::sleep(Duration::from_millis(200));

    collector.collect()
}
