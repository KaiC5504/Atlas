use crate::file_manager::read_json_file;
use crate::models::gaming::*;
use crate::utils::get_bottleneck_thresholds_json_path;

pub struct BottleneckAnalyzer {
    thresholds: BottleneckThresholds,
}

impl BottleneckAnalyzer {
    pub fn new() -> Self {
        let thresholds = load_thresholds().unwrap_or_default();
        Self { thresholds }
    }

    #[allow(dead_code)] 
    pub fn with_thresholds(thresholds: BottleneckThresholds) -> Self {
        Self { thresholds }
    }

    #[allow(dead_code)] 
    pub fn get_thresholds(&self) -> &BottleneckThresholds {
        &self.thresholds
    }

    #[allow(dead_code)] 
    pub fn set_thresholds(&mut self, thresholds: BottleneckThresholds) {
        self.thresholds = thresholds;
    }

    pub fn analyze(&self, metrics: &MetricsSnapshot) -> CurrentBottleneckStatus {
        let (bottleneck_type, severity) = self.detect_bottleneck(metrics);

        CurrentBottleneckStatus {
            bottleneck_type,
            severity,
            active_duration_seconds: 0.0,
            metrics: metrics.clone(),
        }
    }

    fn detect_bottleneck(&self, metrics: &MetricsSnapshot) -> (BottleneckType, u8) {
        if let Some(temp) = metrics.cpu_temp {
            if temp >= self.thresholds.cpu_thermal_limit {
                let over = temp - self.thresholds.cpu_thermal_limit;
                let severity = calculate_thermal_severity(over);
                return (BottleneckType::CpuThermal, severity);
            }
        }

        if let Some(temp) = metrics.gpu_temp {
            if temp >= self.thresholds.gpu_thermal_limit {
                let over = temp - self.thresholds.gpu_thermal_limit;
                let severity = calculate_thermal_severity(over);
                return (BottleneckType::GpuThermal, severity);
            }
        }

        if let Some(vram) = metrics.vram_percent {
            if vram >= self.thresholds.vram_high {
                let over = vram - self.thresholds.vram_high;
                let severity = calculate_usage_severity(over);
                return (BottleneckType::VramLimited, severity);
            }
        }

        if metrics.ram_percent >= self.thresholds.ram_high {
            let over = metrics.ram_percent - self.thresholds.ram_high;
            let severity = calculate_usage_severity(over);
            return (BottleneckType::RamLimited, severity);
        }

        if let Some(gpu) = metrics.gpu_percent {
            if metrics.cpu_percent >= self.thresholds.cpu_high && gpu < self.thresholds.gpu_low {
                let delta = metrics.cpu_percent - gpu;
                let severity = calculate_bound_severity(delta);
                return (BottleneckType::CpuBound, severity);
            }

            if gpu >= self.thresholds.gpu_high && metrics.cpu_percent < self.thresholds.cpu_low {
                let delta = gpu - metrics.cpu_percent;
                let severity = calculate_bound_severity(delta);
                return (BottleneckType::GpuBound, severity);
            }
        }

        (BottleneckType::Balanced, 0)
    }

    #[allow(dead_code)] 
    pub fn is_bottleneck_active(&self, metrics: &MetricsSnapshot, check_type: &BottleneckType) -> bool {
        let (detected, _) = self.detect_bottleneck(metrics);
        &detected == check_type
    }

    #[allow(dead_code)] 
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

    #[allow(dead_code)] 
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

fn load_thresholds() -> Result<BottleneckThresholds, String> {
    read_json_file(&get_bottleneck_thresholds_json_path())
}

fn calculate_thermal_severity(degrees_over: f32) -> u8 {
    if degrees_over >= 10.0 {
        3
    } else if degrees_over >= 5.0 {
        2
    } else {
        1
    }
}

fn calculate_usage_severity(percent_over: f32) -> u8 {
    if percent_over >= 8.0 {
        3
    } else if percent_over >= 4.0 {
        2
    } else {
        1
    }
}

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
            top_core_1: None,
            top_core_2: None,
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
