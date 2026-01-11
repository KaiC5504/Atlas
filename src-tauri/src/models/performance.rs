// Performance monitoring data structures
use serde::{Deserialize, Serialize};

/// Container for all system performance metrics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemMetrics {
    pub cpu: CpuMetrics,
    pub gpu: Option<GpuMetrics>,
    pub ram: RamMetrics,
    pub timestamp: i64, // Unix timestamp in milliseconds
}

/// CPU performance metrics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CpuMetrics {
    /// Overall CPU usage percentage (0-100)
    pub usage_percent: f32,
    /// Per-core usage percentages (0-100 each)
    pub per_core_usage: Vec<f32>,
    /// CPU temperature in Celsius (if available)
    pub temperature_celsius: Option<f32>,
    /// Current CPU frequency in MHz (if available)
    pub frequency_mhz: Option<u64>,
    /// Number of CPU cores
    pub core_count: usize,
    /// CPU model name
    pub name: String,
}

/// GPU performance metrics (NVIDIA only for now)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GpuMetrics {
    /// GPU model name
    pub name: String,
    /// GPU utilization percentage (0-100)
    pub usage_percent: f32,
    /// VRAM used in megabytes
    pub memory_used_mb: u64,
    /// Total VRAM in megabytes
    pub memory_total_mb: u64,
    /// GPU temperature in Celsius (if available)
    pub temperature_celsius: Option<f32>,
}

/// RAM/Memory performance metrics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RamMetrics {
    /// Total system memory in bytes
    pub total_bytes: u64,
    /// Used memory in bytes
    pub used_bytes: u64,
    /// Available memory in bytes
    pub available_bytes: u64,
    /// Memory usage percentage (0-100)
    pub usage_percent: f32,
}

impl Default for CpuMetrics {
    fn default() -> Self {
        Self {
            usage_percent: 0.0,
            per_core_usage: Vec::new(),
            temperature_celsius: None,
            frequency_mhz: None,
            core_count: 0,
            name: String::new(),
        }
    }
}

impl Default for RamMetrics {
    fn default() -> Self {
        Self {
            total_bytes: 0,
            used_bytes: 0,
            available_bytes: 0,
            usage_percent: 0.0,
        }
    }
}

impl Default for SystemMetrics {
    fn default() -> Self {
        Self {
            cpu: CpuMetrics::default(),
            gpu: None,
            ram: RamMetrics::default(),
            timestamp: 0,
        }
    }
}
