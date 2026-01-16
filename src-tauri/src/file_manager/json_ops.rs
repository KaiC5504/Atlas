use parking_lot::RwLock;
use serde::{de::DeserializeOwned, Serialize};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{BufReader, Write};
use std::path::{Path, PathBuf};
use std::sync::Arc;

lazy_static::lazy_static! {
    static ref FILE_LOCKS: RwLock<HashMap<PathBuf, Arc<RwLock<()>>>> = RwLock::new(HashMap::new());
}

fn get_file_lock(path: &Path) -> Arc<RwLock<()>> {
    let canonical = path.to_path_buf();

    {
        let locks = FILE_LOCKS.read();
        if let Some(lock) = locks.get(&canonical) {
            return lock.clone();
        }
    }

    let mut locks = FILE_LOCKS.write();
    locks.entry(canonical).or_insert_with(|| Arc::new(RwLock::new(()))).clone()
}

pub fn read_json_file<T: DeserializeOwned>(path: &Path) -> Result<T, String> {
    let lock = get_file_lock(path);
    let _guard = lock.read();

    if !path.exists() {
        return Err(format!("File not found: {:?}", path));
    }

    let file = File::open(path).map_err(|e| format!("Failed to open {:?}: {}", path, e))?;
    let reader = BufReader::new(file);

    serde_json::from_reader(reader)
        .map_err(|e| format!("Failed to parse JSON from {:?}: {}", path, e))
}

/// Writes JSON atomically
pub fn write_json_file<T: Serialize>(path: &Path, data: &T) -> Result<(), String> {
    let lock = get_file_lock(path);
    let _guard = lock.write();

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory {:?}: {}", parent, e))?;
    }

    let json_string = serde_json::to_string_pretty(data)
        .map_err(|e| format!("Failed to serialize data: {}", e))?;

    let temp_path = path.with_extension("tmp");

    let mut temp_file = File::create(&temp_path)
        .map_err(|e| format!("Failed to create temp file {:?}: {}", temp_path, e))?;

    temp_file
        .write_all(json_string.as_bytes())
        .map_err(|e| format!("Failed to write to temp file: {}", e))?;

    temp_file
        .sync_all()
        .map_err(|e| format!("Failed to sync temp file: {}", e))?;

    fs::rename(&temp_path, path)
        .map_err(|e| format!("Failed to rename temp file to {:?}: {}", path, e))?;

    Ok(())
}

pub fn initialize_json_file<T: Serialize>(path: &Path, default: &T) -> Result<(), String> {
    if !path.exists() {
        println!("Initializing JSON file: {:?}", path);
        write_json_file(path, default)?;
    }
    Ok(())
}
