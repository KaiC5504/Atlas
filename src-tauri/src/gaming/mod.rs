// Gaming Performance Analyzer module
pub mod detector;
pub mod session;
pub mod bottleneck;

pub use detector::{start_game_detection, stop_game_detection, is_detection_running, GameDetectionState};
pub use session::GamingSessionManager;
pub use bottleneck::BottleneckAnalyzer;
