// NVIDIA GPU metrics collection using NVML
use crate::models::performance::GpuMetrics;
use nvml_wrapper::Nvml;
use nvml_wrapper::error::NvmlError;
use nvml_wrapper::Device;

/// NVIDIA GPU wrapper for collecting GPU metrics
/// Caches the device handle and GPU name to avoid redundant NVML calls
pub struct NvidiaGpu {
    nvml: Nvml,
    device_index: u32,
    cached_name: String,
}

impl NvidiaGpu {
    /// Initialize NVML and create a new NvidiaGpu instance
    /// Caches the GPU name at initialization (never changes at runtime)
    /// Returns Err if NVIDIA drivers are not installed or NVML fails to initialize
    pub fn new() -> Result<Self, NvmlError> {
        let nvml = Nvml::init()?;
        let device = nvml.device_by_index(0)?;
        let cached_name = device.name()?;

        Ok(Self {
            nvml,
            device_index: 0,
            cached_name,
        })
    }

    /// Get the device handle (internal helper)
    fn get_device(&self) -> Result<Device<'_>, String> {
        self.nvml.device_by_index(self.device_index)
            .map_err(|e| format!("Failed to get GPU device: {}", e))
    }

    /// Collect GPU metrics from the first NVIDIA GPU
    /// Uses cached name to avoid redundant NVML calls
    pub fn collect(&self) -> Result<GpuMetrics, String> {
        let device = self.get_device()?;

        // Get GPU utilization
        let utilization = device.utilization_rates()
            .map_err(|e| format!("Failed to get GPU utilization: {}", e))?;

        // Get memory info
        let memory_info = device.memory_info()
            .map_err(|e| format!("Failed to get GPU memory info: {}", e))?;

        // Get temperature (optional - may not be available on all GPUs)
        let temperature = device.temperature(nvml_wrapper::enum_wrappers::device::TemperatureSensor::Gpu)
            .ok();

        Ok(GpuMetrics {
            name: self.cached_name.clone(),
            usage_percent: utilization.gpu as f32,
            memory_used_mb: memory_info.used / (1024 * 1024),
            memory_total_mb: memory_info.total / (1024 * 1024),
            temperature_celsius: temperature.map(|t| t as f32),
        })
    }
}

impl Drop for NvidiaGpu {
    fn drop(&mut self) {
        // NVML shutdown is handled automatically by the Nvml struct's Drop implementation
    }
}

/// Check if an NVIDIA GPU is available
pub fn is_nvidia_available() -> bool {
    Nvml::init().is_ok()
}
