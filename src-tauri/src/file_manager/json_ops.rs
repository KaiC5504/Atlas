// Atomic JSON file operations

use serde::{de::DeserializeOwned, Serialize};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::Path;
use std::sync::Mutex;

lazy_static::lazy_static! {
    static ref FILE_LOCK: Mutex<()> = Mutex::new(());
}

pub fn read_json_file<T: DeserializeOwned>(path: &Path) -> Result<T, String> {
    let _lock = FILE_LOCK.lock().map_err(|e| format!("Lock error: {}", e))?;

    if !path.exists() {
        return Err(format!("File not found: {:?}", path));
    }

    let mut file = File::open(path).map_err(|e| format!("Failed to open {:?}: {}", path, e))?;

    let mut contents = String::new();
    file.read_to_string(&mut contents)
        .map_err(|e| format!("Failed to read {:?}: {}", path, e))?;

    serde_json::from_str(&contents)
        .map_err(|e| format!("Failed to parse JSON from {:?}: {}", path, e))
}

/// Writes JSON atomically using write-to-temp-then-rename
pub fn write_json_file<T: Serialize>(path: &Path, data: &T) -> Result<(), String> {
    let _lock = FILE_LOCK.lock().map_err(|e| format!("Lock error: {}", e))?;

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

pub fn read_json_file_or_default<T: DeserializeOwned + Default>(path: &Path) -> Result<T, String> {
    if path.exists() {
        read_json_file(path)
    } else {
        Ok(T::default())
    }
}

pub fn update_json_file<T, F>(path: &Path, update_fn: F) -> Result<T, String>
where
    T: DeserializeOwned + Serialize + Clone,
    F: FnOnce(&mut T),
{
    let mut data: T = read_json_file(path)?;
    update_fn(&mut data);
    write_json_file(path, &data)?;
    Ok(data)
}
