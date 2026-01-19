use std::sync::RwLock;
use std::time::{Duration, Instant};
use sysinfo::{ProcessRefreshKind, RefreshKind, System};

use super::categorizer::{can_kill_process, categorize_process};
use super::descriptions::{get_friendly_name, get_process_description};
use super::gpu_tracker::GPU_TRACKER;
use super::models::{ProcessInfo, SystemSummary};

pub struct SystemTracker {
    system: RwLock<System>,
    last_refresh: RwLock<Instant>,
}

impl SystemTracker {
    pub fn new() -> Self {
        let system = System::new_with_specifics(
            RefreshKind::new()
                .with_processes(ProcessRefreshKind::new().with_memory().with_cpu())
                .with_memory(sysinfo::MemoryRefreshKind::everything())
                .with_cpu(sysinfo::CpuRefreshKind::new().with_cpu_usage()),
        );

        Self {
            system: RwLock::new(system),
            last_refresh: RwLock::new(Instant::now() - Duration::from_secs(10)),
        }
    }

    fn refresh_if_needed(&self) {
        let should_refresh = {
            if let Ok(last) = self.last_refresh.read() {
                last.elapsed() > Duration::from_millis(1000)
            } else {
                true
            }
        };

        if should_refresh {
            if let Ok(mut system) = self.system.write() {
                system.refresh_all();

                if let Ok(mut last) = self.last_refresh.write() {
                    *last = Instant::now();
                }
            }
        }
    }

    pub fn get_all_processes(&self) -> Vec<ProcessInfo> {
        self.refresh_if_needed();

        let system = match self.system.read() {
            Ok(s) => s,
            Err(_) => return Vec::new(),
        };

        let gpu_usage_map = GPU_TRACKER.get_all_gpu_usage();
        let cpu_count = system.cpus().len() as f32;

        system
            .processes()
            .iter()
            .map(|(pid, process)| {
                let pid_u32 = pid.as_u32();
                let name = process.name().to_string();
                let exe_path = process.exe().map(|p| p.to_string_lossy().to_string());
                let category = categorize_process(&name, exe_path.as_deref());

                let raw_cpu = process.cpu_usage();
                let normalized_cpu = if cpu_count > 0.0 {
                    raw_cpu / cpu_count
                } else {
                    raw_cpu
                };

                ProcessInfo {
                    pid: pid_u32,
                    name: name.clone(),
                    display_name: get_friendly_name(&name),
                    exe_path,
                    cpu_usage: normalized_cpu,
                    memory_mb: process.memory() as f64 / 1_048_576.0,
                    gpu_usage: gpu_usage_map.get(&pid_u32).copied(),
                    category: category.clone(),
                    description: get_process_description(&name),
                    can_kill: can_kill_process(&category),
                    parent_pid: process.parent().map(|p| p.as_u32()),
                }
            })
            .collect()
    }

    pub fn get_system_summary(&self) -> SystemSummary {
        self.refresh_if_needed();

        let system = match self.system.read() {
            Ok(s) => s,
            Err(_) => {
                return SystemSummary {
                    total_processes: 0,
                    total_ram_gb: 0.0,
                    used_ram_gb: 0.0,
                    cpu_usage_percent: 0.0,
                    cpu_count: 1,
                }
            }
        };

        let cpu_count = system.cpus().len();
        let total_cpu: f32 = system.cpus().iter().map(|c| c.cpu_usage()).sum::<f32>()
            / cpu_count as f32;

        SystemSummary {
            total_processes: system.processes().len(),
            total_ram_gb: system.total_memory() as f64 / 1_073_741_824.0,
            used_ram_gb: system.used_memory() as f64 / 1_073_741_824.0,
            cpu_usage_percent: total_cpu,
            cpu_count,
        }
    }
}

impl Default for SystemTracker {
    fn default() -> Self {
        Self::new()
    }
}

lazy_static::lazy_static! {
    pub static ref SYSTEM_TRACKER: SystemTracker = SystemTracker::new();
}
