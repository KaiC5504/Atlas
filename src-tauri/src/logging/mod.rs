//! Logging utilities for Atlas
//! Handles log file cleanup for 7-day retention

use crate::utils::get_logs_dir;
use log::info;
use std::fs;
use std::time::{Duration, SystemTime};

const LOG_RETENTION_DAYS: u64 = 7;

pub fn cleanup_old_logs() {
    let logs_dir = get_logs_dir();
    if !logs_dir.exists() {
        return;
    }

    let retention = Duration::from_secs(LOG_RETENTION_DAYS * 24 * 60 * 60);
    let now = SystemTime::now();

    if let Ok(entries) = fs::read_dir(&logs_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "log") {
                if let Ok(meta) = fs::metadata(&path) {
                    if let Ok(modified) = meta.modified() {
                        if let Ok(age) = now.duration_since(modified) {
                            if age > retention {
                                if fs::remove_file(&path).is_ok() {
                                    info!("Cleaned up old log: {:?}", path.file_name());
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
