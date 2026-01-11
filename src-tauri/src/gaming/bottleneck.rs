// Bottleneck detection and analysis module
// Analyzes metrics to determine system bottlenecks

use crate::file_manager::read_json_file;
use crate::models::gaming::*;
use crate::utils::get_bottleneck_thresholds_json_path;

/// Bottleneck analyzer with configurable thresholds
pub struct BottleneckAnalyzer {
    thresholds: BottleneckThresholds,
}

impl BottleneckAnalyzer {
    /// Create a new bottleneck analyzer with loaded or default thresholds
    pub fn new() -> Self {
        let thresholds = load_thresholds().unwrap_or_default();
        Self { thresholds }
    }

    /// Create with specific thresholds
    pub fn with_thresholds(thresholds: BottleneckThresholds) -> Self {
        Self { thresholds }
    }

    /// Get current thresholds
    pub fn get_thresholds(&self) -> &BottleneckThresholds {
        &self.thresholds
    }

    /// Update thresholds
    pub fn set_thresholds(&mut self, thresholds: BottleneckThresholds) {
        self.thresholds = thresholds;
    }

    /// Analyze a metrics snapshot and determine bottleneck status
    pub fn analyze(&self, metrics: &MetricsSnapshot) -> CurrentBottleneckStatus {
        let (bottleneck_type, severity) = self.detect_bottleneck(metrics);

        CurrentBottleneckStatus {
            bottleneck_type,
            severity,
            active_duration_seconds: 0.0, // Duration is calculated by session manager
            metrics: metrics.clone(),
        }
    }

    /// Detect the current bottleneck type and severity
    /// Priority order: CPU Thermal > GPU Thermal > VRAM > RAM > CPU-Bound > GPU-Bound > Balanced
    fn detect_bottleneck(&self, metrics: &MetricsSnapshot) -> (BottleneckType, u8) {
        // Priority 1: CPU Thermal
        if let Some(temp) = metrics.cpu_temp {
            if temp >= self.thresholds.cpu_thermal_limit {
                let over = temp - self.thresholds.cpu_thermal_limit;
                let severity = calculate_thermal_severity(over);
                return (BottleneckType::CpuThermal, severity);
            }
        }

        // Priority 2: GPU Thermal
        if let Some(temp) = metrics.gpu_temp {
            if temp >= self.thresholds.gpu_thermal_limit {
                let over = temp - self.thresholds.gpu_thermal_limit;
                let severity = calculate_thermal_severity(over);
                return (BottleneckType::GpuThermal, severity);
            }
        }

        // Priority 3: VRAM Limited
        if let Some(vram) = metrics.vram_percent {
            if vram >= self.thresholds.vram_high {
                let over = vram - self.thresholds.vram_high;
                let severity = calculate_usage_severity(over);
                return (BottleneckType::VramLimited, severity);
            }
        }

        // Priority 4: RAM Limited
        if metrics.ram_percent >= self.thresholds.ram_high {
            let over = metrics.ram_percent - self.thresholds.ram_high;
            let severity = calculate_usage_severity(over);
            return (BottleneckType::RamLimited, severity);
        }

        // Priority 5: CPU-Bound (CPU high, GPU underutilized)
        if let Some(gpu) = metrics.gpu_percent {
            if metrics.cpu_percent >= self.thresholds.cpu_high && gpu < self.thresholds.gpu_low {
                let delta = metrics.cpu_percent - gpu;
                let severity = calculate_bound_severity(delta);
                return (BottleneckType::CpuBound, severity);
            }

            // Priority 6: GPU-Bound (GPU high, CPU underutilized)
            if gpu >= self.thresholds.gpu_high && metrics.cpu_percent < self.thresholds.cpu_low {
                let delta = gpu - metrics.cpu_percent;
                let severity = calculate_bound_severity(delta);
                return (BottleneckType::GpuBound, severity);
            }
        }

        // No bottleneck detected - system is balanced
        (BottleneckType::Balanced, 0)
    }

    /// Check if a specific bottleneck type is active
    pub fn is_bottleneck_active(&self, metrics: &MetricsSnapshot, check_type: &BottleneckType) -> bool {
        let (detected, _) = self.detect_bottleneck(metrics);
        &detected == check_type
    }

    /// Get a human-readable description of a bottleneck
    pub fn get_bottleneck_description(bottleneck_type: &BottleneckType) -> &'static str {
        match bottleneck_type {
            BottleneckType::CpuBound => "CPU is limiting performance - GPU is underutilized",
            BottleneckType::GpuBound => "GPU is limiting performance - CPU is underutilized",
            BottleneckType::RamLimited => "System memory is nearly full",
            BottleneckType::VramLimited => "GPU memory is nearly full",
            BottleneckType::CpuThermal => "CPU is thermal throttling",
            BottleneckType::GpuThermal => "GPU is thermal throttling",
            BottleneckType::Balanced => "System is balanced - no bottlenecks detected",
        }
    }

    /// Get a recommended action for a bottleneck
    pub fn get_bottleneck_recommendation(bottleneck_type: &BottleneckType) -> &'static str {
        match bottleneck_type {
            BottleneckType::CpuBound => "Consider lowering CPU-intensive settings or upgrading CPU",
            BottleneckType::GpuBound => "Consider lowering graphics settings or resolution",
            BottleneckType::RamLimited => "Close background applications or add more RAM",
            BottleneckType::VramLimited => "Lower texture quality or resolution",
            BottleneckType::CpuThermal => "Improve cooling or lower CPU-intensive settings",
            BottleneckType::GpuThermal => "Improve cooling, lower power limit, or reduce graphics settings",
            BottleneckType::Balanced => "System is performing optimally",
        }
    }
}

impl Default for BottleneckAnalyzer {
    fn default() -> Self {
        Self::new()
    }
}

/// Load bottleneck thresholds from JSON file
fn load_thresholds() -> Result<BottleneckThresholds, String> {
    read_json_file(&get_bottleneck_thresholds_json_path())
}

/// Calculate severity for thermal issues (degrees over limit)
/// - Severity 1: 0-5 degrees over limit
/// - Severity 2: 5-10 degrees over limit
/// - Severity 3: 10+ degrees over limit
fn calculate_thermal_severity(degrees_over: f32) -> u8 {
    if degrees_over >= 10.0 {
        3
    } else if degrees_over >= 5.0 {
        2
    } else {
        1
    }
}

/// Calculate severity for usage-based issues (percentage over threshold)
/// - Severity 1: 0-4% over threshold
/// - Severity 2: 4-8% over threshold
/// - Severity 3: 8%+ over threshold
fn calculate_usage_severity(percent_over: f32) -> u8 {
    if percent_over >= 8.0 {
        3
    } else if percent_over >= 4.0 {
        2
    } else {
        1
    }
}

/// Calculate severity for CPU/GPU bound issues (delta between high and low)
/// - Severity 1: 15-25% delta
/// - Severity 2: 25-40% delta
/// - Severity 3: 40%+ delta
fn calculate_bound_severity(delta: f32) -> u8 {
    if delta >= 40.0 {
        3
    } else if delta >= 25.0 {
        2
    } else {
        1
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_snapshot(cpu: f32, gpu: Option<f32>, ram: f32) -> MetricsSnapshot {
        MetricsSnapshot {
            timestamp: chrono::Utc::now().timestamp_millis(),
            cpu_percent: cpu,
            gpu_percent: gpu,
            ram_percent: ram,
            vram_percent: None,
            cpu_temp: None,
            gpu_temp: None,
        }
    }

    #[test]
    fn test_balanced_system() {
        let analyzer = BottleneckAnalyzer::new();
        let snapshot = create_test_snapshot(50.0, Some(50.0), 50.0);
        let status = analyzer.analyze(&snapshot);
        assert_eq!(status.bottleneck_type, BottleneckType::Balanced);
    }

    #[test]
    fn test_cpu_bound() {
        let analyzer = BottleneckAnalyzer::new();
        let snapshot = create_test_snapshot(95.0, Some(40.0), 50.0);
        let status = analyzer.analyze(&snapshot);
        assert_eq!(status.bottleneck_type, BottleneckType::CpuBound);
    }

    #[test]
    fn test_gpu_bound() {
        let analyzer = BottleneckAnalyzer::new();
        let snapshot = create_test_snapshot(40.0, Some(95.0), 50.0);
        let status = analyzer.analyze(&snapshot);
        assert_eq!(status.bottleneck_type, BottleneckType::GpuBound);
    }

    #[test]
    fn test_ram_limited() {
        let analyzer = BottleneckAnalyzer::new();
        let snapshot = create_test_snapshot(50.0, Some(50.0), 95.0);
        let status = analyzer.analyze(&snapshot);
        assert_eq!(status.bottleneck_type, BottleneckType::RamLimited);
    }
}
