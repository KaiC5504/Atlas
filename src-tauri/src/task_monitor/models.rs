use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
    pub display_name: String,
    pub exe_path: Option<String>,
    pub cpu_usage: f32,
    pub memory_mb: f64,
    pub gpu_usage: Option<f32>,
    pub category: ProcessCategory,
    pub description: Option<String>,
    pub can_kill: bool,
    pub parent_pid: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum ProcessCategory {
    AntiCheatProtected,
    SystemCritical,
    SystemService,
    MicrosoftBloat,
    SecuritySoftware,
    UserApplication,
    BackgroundService,
    DriverHardware,
    Unknown,
}

impl ProcessCategory {
    #[allow(dead_code)]
    pub fn display_name(&self) -> &'static str {
        match self {
            ProcessCategory::AntiCheatProtected => "Protected",
            ProcessCategory::SystemCritical => "System",
            ProcessCategory::SystemService => "Service",
            ProcessCategory::MicrosoftBloat => "Bloat",
            ProcessCategory::SecuritySoftware => "Security",
            ProcessCategory::UserApplication => "App",
            ProcessCategory::BackgroundService => "Background",
            ProcessCategory::DriverHardware => "Driver",
            ProcessCategory::Unknown => "Unknown",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GamingProfile {
    pub id: String,
    pub name: String,
    pub processes_to_kill: Vec<String>,
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GamingProfileList {
    pub profiles: Vec<GamingProfile>,
}

#[derive(Debug, Clone, Serialize)]
pub struct KillResult {
    pub killed: usize,
    pub failed: usize,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SystemSummary {
    pub total_processes: usize,
    pub total_ram_gb: f64,
    pub used_ram_gb: f64,
    pub cpu_usage_percent: f32,
    pub cpu_count: usize,
}
