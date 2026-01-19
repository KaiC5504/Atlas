use nvml_wrapper::Nvml;
use std::collections::HashMap;
use std::sync::RwLock;
use std::time::{Duration, Instant};

/// Cached GPU process data to avoid excessive NVML queries
pub struct GpuProcessTracker {
    nvml: Option<Nvml>,
    cache: RwLock<ProcessGpuCache>,
}

struct ProcessGpuCache {
    data: HashMap<u32, f32>,
    last_update: Instant,
}

impl Default for ProcessGpuCache {
    fn default() -> Self {
        Self {
            data: HashMap::new(),
            last_update: Instant::now() - Duration::from_secs(10), 
        }
    }
}

impl GpuProcessTracker {
    pub fn new() -> Self {
        let nvml = Nvml::init().ok();
        if nvml.is_some() {
            println!("GpuProcessTracker: NVML initialized successfully");
        } else {
            println!("GpuProcessTracker: NVML not available, GPU tracking disabled");
        }

        Self {
            nvml,
            cache: RwLock::new(ProcessGpuCache::default()),
        }
    }

    pub fn is_available(&self) -> bool {
        self.nvml.is_some()
    }

    fn refresh_cache(&self) {
        let nvml = match &self.nvml {
            Some(n) => n,
            None => return,
        };

        let device = match nvml.device_by_index(0) {
            Ok(d) => d,
            Err(e) => {
                eprintln!("GpuProcessTracker: Failed to get GPU device: {}", e);
                return;
            }
        };

        let mut new_data = HashMap::new();

        if let Ok(graphics_procs) = device.running_graphics_processes() {
            for proc in graphics_procs {
                new_data.insert(proc.pid, 0.0);
            }
        }

        if let Ok(compute_procs) = device.running_compute_processes() {
            for proc in compute_procs {
                new_data.insert(proc.pid, 0.0);
            }
        }

        if let Ok(samples) = device.process_utilization_stats(None) {
            for sample in samples {
                let usage = sample.sm_util as f32;
                new_data.insert(sample.pid, usage);
            }
        } else {
            if !new_data.is_empty() {
                if let Ok(utilization) = device.utilization_rates() {
                    let total_usage = utilization.gpu as f32;
                    let proc_count = new_data.len() as f32;
                    let per_proc = total_usage / proc_count;
                    for value in new_data.values_mut() {
                        *value = per_proc;
                    }
                }
            }
        }

        // Update cache
        if let Ok(mut cache) = self.cache.write() {
            cache.data = new_data;
            cache.last_update = Instant::now();
        }
    }

    pub fn get_process_gpu_usage(&self, pid: u32) -> Option<f32> {
        {
            let cache = self.cache.read().ok()?;
            if cache.last_update.elapsed() > Duration::from_secs(2) {
                drop(cache); 
                self.refresh_cache();
            }
        }

        let cache = self.cache.read().ok()?;
        cache.data.get(&pid).copied()
    }

    pub fn get_all_gpu_usage(&self) -> HashMap<u32, f32> {
        {
            if let Ok(cache) = self.cache.read() {
                if cache.last_update.elapsed() > Duration::from_secs(2) {
                    drop(cache);
                    self.refresh_cache();
                }
            }
        }

        if let Ok(cache) = self.cache.read() {
            cache.data.clone()
        } else {
            HashMap::new()
        }
    }
}

impl Default for GpuProcessTracker {
    fn default() -> Self {
        Self::new()
    }
}

lazy_static::lazy_static! {
    pub static ref GPU_TRACKER: GpuProcessTracker = GpuProcessTracker::new();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_gpu_tracker_creation() {
        let tracker = GpuProcessTracker::new();
        let _ = tracker.is_available();
    }
}
