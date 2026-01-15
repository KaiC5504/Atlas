// Gaming session manager
// Handles session lifecycle and metrics recording

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

use crate::file_manager::{read_json_file, write_json_file};
use crate::models::gaming::*;
use crate::performance::SharedMetrics;
use crate::utils::{get_gaming_sessions_json_path, get_session_data_path};
use super::bottleneck::BottleneckAnalyzer;

/// Active session data (internal use)
struct ActiveSessionData {
    session: GamingSession,
    snapshots: Vec<MetricsSnapshot>,
    bottleneck_events: Vec<BottleneckEvent>,
    current_bottleneck: Option<BottleneckType>,
    is_recording: Arc<AtomicBool>,
}

/// Gaming session manager
pub struct GamingSessionManager {
    app: AppHandle,
    active_session: Arc<Mutex<Option<ActiveSessionData>>>,
    bottleneck_analyzer: Arc<BottleneckAnalyzer>,
    shared_metrics: Arc<SharedMetrics>,
}

impl GamingSessionManager {
    pub fn new(app: AppHandle, bottleneck_analyzer: Arc<BottleneckAnalyzer>, shared_metrics: Arc<SharedMetrics>) -> Self {
        Self {
            app,
            active_session: Arc::new(Mutex::new(None)),
            bottleneck_analyzer,
            shared_metrics,
        }
    }

    /// Start a new gaming session
    pub fn start_session(&self, game_name: &str, process_name: &str) -> Result<GamingSession, String> {
        // Check if there's already an active session
        {
            let guard = self.active_session.lock().map_err(|e| e.to_string())?;
            if guard.is_some() {
                return Err("A session is already active".to_string());
            }
        }

        let session_id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();

        let session = GamingSession {
            id: session_id.clone(),
            game_name: game_name.to_string(),
            process_name: process_name.to_string(),
            start_time: now,
            end_time: None,
            status: SessionStatus::Active,
            summary: None,
        };

        // Add to sessions list JSON
        self.add_session_to_list(&session)?;

        // Start metrics recording
        self.start_recording(session.clone());

        println!("Started gaming session: {} ({})", game_name, session_id);
        Ok(session)
    }

    /// Start recording metrics for active session
    /// Uses shared metrics from the main performance collector instead of creating
    /// a duplicate collector (avoids duplicate NVML queries that hurt game FPS)
    fn start_recording(&self, session: GamingSession) {
        let active_session = self.active_session.clone();
        let app = self.app.clone();
        let analyzer = self.bottleneck_analyzer.clone();
        let shared_metrics = self.shared_metrics.clone();
        let is_recording = Arc::new(AtomicBool::new(true));
        let is_recording_clone = is_recording.clone();
        let session_id = session.id.clone();

        // Store active session data first
        {
            if let Ok(mut guard) = self.active_session.lock() {
                *guard = Some(ActiveSessionData {
                    session,
                    snapshots: Vec::new(),
                    bottleneck_events: Vec::new(),
                    current_bottleneck: None,
                    is_recording: is_recording.clone(),
                });
            }
        }

        // Start recording thread - reads from shared metrics instead of collecting directly
        thread::spawn(move || {
            // Give the performance collector time to get accurate readings
            // CPU usage calculation requires multiple samples, first readings are often 100% or 0%
            thread::sleep(Duration::from_millis(500));

            // Warmup: skip first few readings to avoid inaccurate initial CPU values
            // that would falsely trigger CPU bottleneck detection
            const WARMUP_SAMPLES: u32 = 3;
            let mut warmup_count: u32 = 0;

            while is_recording_clone.load(Ordering::SeqCst) {
                // Read metrics from shared state (populated by the main performance collector)
                // This avoids creating duplicate NVML queries that hurt game FPS
                if let Some(system_metrics) = shared_metrics.get() {
                    let snapshot = convert_to_snapshot(&system_metrics);

                    // Skip warmup samples - CPU readings are inaccurate initially
                    if warmup_count < WARMUP_SAMPLES {
                        warmup_count += 1;
                        thread::sleep(Duration::from_secs(1));
                        continue;
                    }

                    // Analyze for bottleneck
                    let status = analyzer.analyze(&snapshot);

                    // Update active session data
                    if let Ok(mut guard) = active_session.lock() {
                        if let Some(ref mut data) = *guard {
                            // Add snapshot
                            data.snapshots.push(snapshot.clone());

                            // Check for bottleneck state change
                            let new_bottleneck = status.bottleneck_type.clone();
                            if Some(new_bottleneck.clone()) != data.current_bottleneck {
                                // End previous bottleneck event (calculate duration)
                                if let Some(last_event) = data.bottleneck_events.last_mut() {
                                    if last_event.duration_seconds.is_none() {
                                        let duration = (snapshot.timestamp - last_event.timestamp) as f32 / 1000.0;
                                        last_event.duration_seconds = Some(duration);
                                    }
                                }

                                // Start new bottleneck event (if not balanced)
                                if new_bottleneck != BottleneckType::Balanced {
                                    data.bottleneck_events.push(BottleneckEvent {
                                        timestamp: snapshot.timestamp,
                                        bottleneck_type: new_bottleneck.clone(),
                                        severity: status.severity,
                                        duration_seconds: None,
                                        metrics: snapshot.clone(),
                                    });
                                }

                                data.current_bottleneck = Some(new_bottleneck);
                            }
                        }
                    }

                    // Emit metrics event
                    let _ = app.emit("gaming:metrics", GamingMetricsEvent {
                        session_id: session_id.clone(),
                        snapshot: snapshot.clone(),
                    });

                    // Emit bottleneck event
                    let _ = app.emit("gaming:bottleneck", GamingBottleneckEvent {
                        session_id: session_id.clone(),
                        status,
                    });
                }

                // Wait 1 second before next read
                thread::sleep(Duration::from_secs(1));
            }

            println!("Session recording stopped");
        });
    }

    /// End session by process name
    pub fn end_session_by_process(&self, process_name: &str) -> Result<GamingSession, String> {
        let mut guard = self.active_session.lock().map_err(|e| e.to_string())?;

        if let Some(ref data) = *guard {
            if data.session.process_name == process_name {
                return self.end_session_internal(&mut guard);
            }
        }

        Err("No active session for this process".to_string())
    }

    /// End current active session
    pub fn end_session(&self) -> Result<GamingSession, String> {
        let mut guard = self.active_session.lock().map_err(|e| e.to_string())?;
        self.end_session_internal(&mut guard)
    }

    /// Get the current active session (if any)
    pub fn get_active_session(&self) -> Option<GamingSession> {
        let guard = self.active_session.lock().ok()?;
        guard.as_ref().map(|data| data.session.clone())
    }

    fn end_session_internal(
        &self,
        guard: &mut Option<ActiveSessionData>,
    ) -> Result<GamingSession, String> {
        if let Some(mut data) = guard.take() {
            // Stop recording
            data.is_recording.store(false, Ordering::SeqCst);

            // Give recording thread time to stop
            thread::sleep(Duration::from_millis(100));

            // Close last bottleneck event if still open
            if let Some(last_event) = data.bottleneck_events.last_mut() {
                if last_event.duration_seconds.is_none() {
                    if let Some(last_snapshot) = data.snapshots.last() {
                        let duration = (last_snapshot.timestamp - last_event.timestamp) as f32 / 1000.0;
                        last_event.duration_seconds = Some(duration);
                    }
                }
            }

            // Generate summary
            let summary = self.generate_summary(&data.snapshots, &data.bottleneck_events);

            // Update session
            let mut session = data.session.clone();
            session.end_time = Some(chrono::Utc::now().to_rfc3339());
            session.status = SessionStatus::Completed;
            session.summary = Some(summary);

            // Save full session data to individual file
            let session_data = GamingSessionData {
                session: session.clone(),
                snapshots: data.snapshots,
                bottleneck_events: data.bottleneck_events,
            };
            self.save_session_data(&session_data)?;

            // Update session in list
            self.update_session_in_list(&session)?;

            println!("Ended gaming session: {} ({})", session.game_name, session.id);
            return Ok(session);
        }

        Err("No active session".to_string())
    }

    fn generate_summary(
        &self,
        snapshots: &[MetricsSnapshot],
        events: &[BottleneckEvent],
    ) -> SessionSummary {
        // Calculate duration
        let duration = if snapshots.len() >= 2 {
            let first = snapshots.first().unwrap().timestamp;
            let last = snapshots.last().unwrap().timestamp;
            (last - first) as f64 / 1000.0
        } else {
            0.0
        };

        // Calculate metric statistics
        let cpu_values: Vec<f32> = snapshots.iter().map(|s| s.cpu_percent).collect();
        let ram_values: Vec<f32> = snapshots.iter().map(|s| s.ram_percent).collect();
        let gpu_values: Vec<f32> = snapshots.iter().filter_map(|s| s.gpu_percent).collect();
        let vram_values: Vec<f32> = snapshots.iter().filter_map(|s| s.vram_percent).collect();
        let cpu_temp_values: Vec<f32> = snapshots.iter().filter_map(|s| s.cpu_temp).collect();
        let gpu_temp_values: Vec<f32> = snapshots.iter().filter_map(|s| s.gpu_temp).collect();

        // Calculate top core statistics
        let top_core_1_values: Vec<f32> = snapshots.iter()
            .filter_map(|s| s.top_core_1.as_ref().map(|c| c.usage_percent))
            .collect();
        let top_core_2_values: Vec<f32> = snapshots.iter()
            .filter_map(|s| s.top_core_2.as_ref().map(|c| c.usage_percent))
            .collect();

        let cpu = calculate_stats(&cpu_values);
        let ram = calculate_stats(&ram_values);
        let gpu = if gpu_values.is_empty() { None } else { Some(calculate_stats(&gpu_values)) };
        let vram = if vram_values.is_empty() { None } else { Some(calculate_stats(&vram_values)) };
        let cpu_temp = if cpu_temp_values.is_empty() { None } else { Some(calculate_stats(&cpu_temp_values)) };
        let gpu_temp = if gpu_temp_values.is_empty() { None } else { Some(calculate_stats(&gpu_temp_values)) };
        let top_core_1 = if top_core_1_values.is_empty() { None } else { Some(calculate_stats(&top_core_1_values)) };
        let top_core_2 = if top_core_2_values.is_empty() { None } else { Some(calculate_stats(&top_core_2_values)) };

        // Calculate bottleneck breakdown
        let bottleneck_breakdown = self.calculate_bottleneck_breakdown(events, duration);
        let total_bottleneck_seconds: f64 = bottleneck_breakdown
            .iter()
            .filter(|b| b.bottleneck_type != BottleneckType::Balanced)
            .map(|b| b.duration_seconds)
            .sum();

        let dominant_bottleneck = bottleneck_breakdown
            .iter()
            .filter(|b| b.bottleneck_type != BottleneckType::Balanced)
            .max_by(|a, b| a.duration_seconds.partial_cmp(&b.duration_seconds).unwrap_or(std::cmp::Ordering::Equal))
            .map(|b| b.bottleneck_type.clone())
            .unwrap_or(BottleneckType::Balanced);

        SessionSummary {
            duration_seconds: duration,
            cpu,
            top_core_1,
            top_core_2,
            gpu,
            ram,
            vram,
            cpu_temp,
            gpu_temp,
            total_bottleneck_seconds,
            dominant_bottleneck,
            bottleneck_breakdown,
            total_bottleneck_events: events.len(),
        }
    }

    fn calculate_bottleneck_breakdown(&self, events: &[BottleneckEvent], total_duration: f64) -> Vec<BottleneckBreakdown> {
        use std::collections::HashMap;

        let mut breakdown_map: HashMap<BottleneckType, (f64, usize)> = HashMap::new();

        for event in events {
            let duration = event.duration_seconds.unwrap_or(0.0) as f64;
            let entry = breakdown_map
                .entry(event.bottleneck_type.clone())
                .or_insert((0.0, 0));
            entry.0 += duration;
            entry.1 += 1;
        }

        breakdown_map
            .into_iter()
            .map(|(bottleneck_type, (duration_seconds, event_count))| {
                let percentage = if total_duration > 0.0 {
                    (duration_seconds / total_duration * 100.0) as f32
                } else {
                    0.0
                };
                BottleneckBreakdown {
                    bottleneck_type,
                    duration_seconds,
                    percentage,
                    event_count,
                }
            })
            .collect()
    }

    fn add_session_to_list(&self, session: &GamingSession) -> Result<(), String> {
        let path = get_gaming_sessions_json_path();
        let mut sessions: Vec<GamingSession> =
            read_json_file(&path).unwrap_or_else(|_| Vec::new());
        sessions.push(session.clone());
        write_json_file(&path, &sessions)
    }

    fn update_session_in_list(&self, session: &GamingSession) -> Result<(), String> {
        let path = get_gaming_sessions_json_path();
        let mut sessions: Vec<GamingSession> =
            read_json_file(&path).unwrap_or_else(|_| Vec::new());

        // Find and update the session
        if let Some(existing) = sessions.iter_mut().find(|s| s.id == session.id) {
            *existing = session.clone();
        }

        write_json_file(&path, &sessions)
    }

    fn save_session_data(&self, data: &GamingSessionData) -> Result<(), String> {
        let path = get_session_data_path(&data.session.id);
        write_json_file(&path, data)
    }
}

/// Convert SystemMetrics to gaming MetricsSnapshot
fn convert_to_snapshot(metrics: &crate::models::performance::SystemMetrics) -> MetricsSnapshot {
    let gpu_percent = metrics.gpu.as_ref().map(|g| g.usage_percent);
    let vram_percent = metrics.gpu.as_ref().map(|g| {
        if g.memory_total_mb > 0 {
            (g.memory_used_mb as f32 / g.memory_total_mb as f32) * 100.0
        } else {
            0.0
        }
    });
    let gpu_temp = metrics.gpu.as_ref().and_then(|g| g.temperature_celsius);

    // Calculate top 2 CPU cores
    let (top_core_1, top_core_2) = get_top_two_cores(&metrics.cpu.per_core_usage);

    MetricsSnapshot {
        timestamp: metrics.timestamp,
        cpu_percent: metrics.cpu.usage_percent,
        top_core_1,
        top_core_2,
        gpu_percent,
        ram_percent: metrics.ram.usage_percent,
        vram_percent,
        cpu_temp: metrics.cpu.temperature_celsius,
        gpu_temp,
    }
}

/// Get the top 2 highest CPU cores by usage
fn get_top_two_cores(per_core_usage: &[f32]) -> (Option<TopCoreInfo>, Option<TopCoreInfo>) {
    if per_core_usage.is_empty() {
        return (None, None);
    }

    // Create indexed pairs (index, usage)
    let mut indexed: Vec<(usize, f32)> = per_core_usage
        .iter()
        .enumerate()
        .map(|(i, &u)| (i, u))
        .collect();

    // Sort by usage descending
    indexed.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

    let top1 = indexed.first().map(|(idx, usage)| TopCoreInfo {
        core_index: *idx,
        usage_percent: *usage,
    });

    let top2 = indexed.get(1).map(|(idx, usage)| TopCoreInfo {
        core_index: *idx,
        usage_percent: *usage,
    });

    (top1, top2)
}

/// Calculate statistics for a list of values
fn calculate_stats(values: &[f32]) -> MetricStats {
    if values.is_empty() {
        return MetricStats {
            avg: 0.0,
            min: 0.0,
            max: 0.0,
            p95: 0.0,
        };
    }

    let sum: f32 = values.iter().sum();
    let avg = sum / values.len() as f32;
    let min = values.iter().cloned().fold(f32::INFINITY, f32::min);
    let max = values.iter().cloned().fold(f32::NEG_INFINITY, f32::max);

    // Calculate 95th percentile
    let mut sorted = values.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let p95_index = ((values.len() as f32 * 0.95) as usize).min(values.len() - 1);
    let p95 = sorted[p95_index];

    MetricStats { avg, min, max, p95 }
}

// Event payload structures for Tauri events
#[derive(Clone, serde::Serialize)]
pub struct GamingMetricsEvent {
    pub session_id: String,
    pub snapshot: MetricsSnapshot,
}

#[derive(Clone, serde::Serialize)]
pub struct GamingBottleneckEvent {
    pub session_id: String,
    pub status: CurrentBottleneckStatus,
}
