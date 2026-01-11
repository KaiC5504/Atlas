// Gaming Performance Analyzer data structures
use serde::{Deserialize, Serialize};

/// Game whitelist configuration
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GameWhitelist {
    pub games: Vec<GameEntry>,
}

/// Individual game entry in the whitelist
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameEntry {
    pub name: String,           // Display name for the game
    pub process_name: String,   // Process name to watch (e.g., "VALORANT-Win64-Shipping.exe")
    pub icon: Option<String>,   // Optional icon identifier
    pub enabled: bool,          // Whether this entry is enabled for detection
}

/// Gaming session data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GamingSession {
    pub id: String,                     // Unique session identifier (UUID)
    pub game_name: String,              // Game display name
    pub process_name: String,           // Process name that was detected
    pub start_time: String,             // Session start time (ISO 8601)
    pub end_time: Option<String>,       // Session end time - None if still active
    pub status: SessionStatus,          // Session status
    pub summary: Option<SessionSummary>, // Summary generated on session end
}

/// Session status enum
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SessionStatus {
    Active,
    Completed,
    Cancelled,
}

/// Metrics snapshot during gaming session
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricsSnapshot {
    pub timestamp: i64,                 // Unix timestamp in milliseconds
    pub cpu_percent: f32,               // CPU usage (0-100)
    pub gpu_percent: Option<f32>,       // GPU usage (0-100) - None if no GPU
    pub ram_percent: f32,               // RAM usage (0-100)
    pub vram_percent: Option<f32>,      // VRAM usage (0-100) - None if no GPU
    pub cpu_temp: Option<f32>,          // CPU temp in Celsius
    pub gpu_temp: Option<f32>,          // GPU temp in Celsius
}

/// Bottleneck event during session
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BottleneckEvent {
    pub timestamp: i64,                 // Unix timestamp in milliseconds
    pub bottleneck_type: BottleneckType,
    pub severity: u8,                   // Severity level (1-3, where 3 is most severe)
    pub duration_seconds: Option<f32>,  // Duration this bottleneck lasted
    pub metrics: MetricsSnapshot,       // Metrics at time of detection
}

/// Bottleneck type classification
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum BottleneckType {
    CpuBound,       // CPU at high usage, GPU underutilized
    GpuBound,       // GPU at high usage, CPU underutilized
    RamLimited,     // High RAM usage or low available memory
    VramLimited,    // GPU memory near capacity
    CpuThermal,     // CPU thermal throttling
    GpuThermal,     // GPU thermal throttling
    Balanced,       // No bottleneck - system is balanced
}

/// Session summary with aggregated statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionSummary {
    pub duration_seconds: f64,          // Total session duration
    pub cpu: MetricStats,               // CPU statistics
    pub gpu: Option<MetricStats>,       // GPU statistics
    pub ram: MetricStats,               // RAM statistics
    pub vram: Option<MetricStats>,      // VRAM statistics
    pub cpu_temp: Option<MetricStats>,  // CPU temperature statistics
    pub gpu_temp: Option<MetricStats>,  // GPU temperature statistics
    pub total_bottleneck_seconds: f64,  // Time spent in bottleneck state
    pub dominant_bottleneck: BottleneckType, // Most frequent bottleneck
    pub bottleneck_breakdown: Vec<BottleneckBreakdown>,
    pub total_bottleneck_events: usize,
}

/// Statistics for a single metric
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricStats {
    pub avg: f32,
    pub min: f32,
    pub max: f32,
    pub p95: f32,  // 95th percentile
}

/// Breakdown of time in each bottleneck type
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BottleneckBreakdown {
    pub bottleneck_type: BottleneckType,
    pub duration_seconds: f64,
    pub percentage: f32,
    pub event_count: usize,
}

/// Full session data including all snapshots (stored in separate file)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GamingSessionData {
    pub session: GamingSession,
    pub snapshots: Vec<MetricsSnapshot>,
    pub bottleneck_events: Vec<BottleneckEvent>,
}

/// Current bottleneck status for real-time display
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CurrentBottleneckStatus {
    pub bottleneck_type: BottleneckType,
    pub severity: u8,
    pub active_duration_seconds: f32,
    pub metrics: MetricsSnapshot,
}

/// Bottleneck detection thresholds (configurable)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BottleneckThresholds {
    pub cpu_high: f32,              // CPU considered bottleneck when above (default: 90)
    pub gpu_high: f32,              // GPU considered bottleneck when above (default: 90)
    pub cpu_low: f32,               // CPU considered underutilized when below (default: 70)
    pub gpu_low: f32,               // GPU considered underutilized when below (default: 70)
    pub ram_high: f32,              // RAM bottleneck threshold (default: 90)
    pub ram_available_min_mb: u64,  // Minimum available RAM in MB (default: 2048)
    pub vram_high: f32,             // VRAM bottleneck threshold (default: 90)
    pub cpu_thermal_limit: f32,     // CPU thermal throttle temp (default: 90C)
    pub gpu_thermal_limit: f32,     // GPU thermal throttle temp (default: 85C)
}

impl Default for BottleneckThresholds {
    fn default() -> Self {
        Self {
            cpu_high: 90.0,
            gpu_high: 90.0,
            cpu_low: 70.0,
            gpu_low: 70.0,
            ram_high: 90.0,
            ram_available_min_mb: 2048,
            vram_high: 90.0,
            cpu_thermal_limit: 90.0,
            gpu_thermal_limit: 85.0,
        }
    }
}

impl Default for MetricsSnapshot {
    fn default() -> Self {
        Self {
            timestamp: 0,
            cpu_percent: 0.0,
            gpu_percent: None,
            ram_percent: 0.0,
            vram_percent: None,
            cpu_temp: None,
            gpu_temp: None,
        }
    }
}

impl Default for MetricStats {
    fn default() -> Self {
        Self {
            avg: 0.0,
            min: 0.0,
            max: 0.0,
            p95: 0.0,
        }
    }
}

/// Default game whitelist with common games
impl GameWhitelist {
    pub fn default_whitelist() -> Self {
        Self {
            games: vec![
                GameEntry {
                    name: "Valorant".to_string(),
                    process_name: "VALORANT-Win64-Shipping.exe".to_string(),
                    icon: Some("valorant".to_string()),
                    enabled: true,
                },
                GameEntry {
                    name: "League of Legends".to_string(),
                    process_name: "League of Legends.exe".to_string(),
                    icon: Some("lol".to_string()),
                    enabled: true,
                },
                GameEntry {
                    name: "Counter-Strike 2".to_string(),
                    process_name: "cs2.exe".to_string(),
                    icon: Some("cs2".to_string()),
                    enabled: true,
                },
                GameEntry {
                    name: "Apex Legends".to_string(),
                    process_name: "r5apex.exe".to_string(),
                    icon: Some("apex".to_string()),
                    enabled: true,
                },
                GameEntry {
                    name: "Overwatch 2".to_string(),
                    process_name: "Overwatch.exe".to_string(),
                    icon: Some("overwatch".to_string()),
                    enabled: true,
                },
                GameEntry {
                    name: "Fortnite".to_string(),
                    process_name: "FortniteClient-Win64-Shipping.exe".to_string(),
                    icon: Some("fortnite".to_string()),
                    enabled: true,
                },
                GameEntry {
                    name: "Minecraft".to_string(),
                    process_name: "javaw.exe".to_string(),
                    icon: Some("minecraft".to_string()),
                    enabled: true,
                },
                GameEntry {
                    name: "Genshin Impact".to_string(),
                    process_name: "GenshinImpact.exe".to_string(),
                    icon: Some("genshin".to_string()),
                    enabled: true,
                },
                GameEntry {
                    name: "PUBG".to_string(),
                    process_name: "TslGame.exe".to_string(),
                    icon: Some("pubg".to_string()),
                    enabled: true,
                },
                GameEntry {
                    name: "Dota 2".to_string(),
                    process_name: "dota2.exe".to_string(),
                    icon: Some("dota2".to_string()),
                    enabled: true,
                },
            ],
        }
    }
}
