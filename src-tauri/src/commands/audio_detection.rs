// Audio Event Detection command handlers
// Integrates the audio_event_detector.py Python worker

use crate::file_manager::{read_json_file, write_json_file};
use crate::models::{AudioDetectionJob, AudioDetectionResult, AudioDetectionStatus, ModelConfig};
use crate::process_manager::{spawn_python_worker_async, WorkerMessage};
use crate::utils::{get_audio_detection_jobs_json_path, get_models_dir};
use std::path::Path;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;

/// List all audio detection jobs from the JSON file
#[tauri::command]
pub fn list_audio_detection_jobs() -> Result<Vec<AudioDetectionJob>, String> {
    let path = get_audio_detection_jobs_json_path();

    if !path.exists() {
        return Ok(vec![]);
    }

    read_json_file(&path)
}

/// Submit a new audio detection job
#[tauri::command]
pub fn submit_audio_detection_job(
    input_file: String,
    config: Option<ModelConfig>,
) -> Result<serde_json::Value, String> {
    // Validate input file exists
    if !Path::new(&input_file).exists() {
        return Err(format!("Input file not found: {}", input_file));
    }

    let path = get_audio_detection_jobs_json_path();

    // Generate unique ID
    let job_id = uuid::Uuid::new_v4().to_string();

    // Create new job entry
    let job = AudioDetectionJob::new(job_id.clone(), input_file.clone());

    // Read existing jobs
    let mut jobs: Vec<AudioDetectionJob> = if path.exists() {
        read_json_file(&path)?
    } else {
        vec![]
    };

    // Add new job
    jobs.push(job);

    // Write back to file
    write_json_file(&path, &jobs)?;

    println!(
        "Submitted audio detection job: {} with config: {:?}",
        input_file, config
    );

    Ok(serde_json::json!({ "job_id": job_id }))
}

/// Start a pending audio detection job (executes the Python worker)
#[tauri::command]
pub async fn start_audio_detection_job(
    app: AppHandle,
    job_id: String,
    config: Option<ModelConfig>,
) -> Result<serde_json::Value, String> {
    let path = get_audio_detection_jobs_json_path();

    if !path.exists() {
        return Err("No audio detection jobs file found".to_string());
    }

    let mut jobs: Vec<AudioDetectionJob> = read_json_file(&path)?;

    // Find the job and extract needed values
    let input_file = {
        let job = jobs
            .iter_mut()
            .find(|j| j.id == job_id)
            .ok_or_else(|| format!("Audio detection job not found: {}", job_id))?;

        if job.status != AudioDetectionStatus::Pending {
            return Err(format!(
                "Cannot start job with status {:?}",
                job.status
            ));
        }

        // Update status to processing
        job.status = AudioDetectionStatus::Processing;
        job.input_file.clone()
    };

    // Write the status update
    write_json_file(&path, &jobs)?;

    // Get model path
    let model_path = get_audio_event_model_path()?;

    // Use provided config or default
    let config = config.unwrap_or_default();

    // Prepare worker input
    let worker_input = serde_json::json!({
        "input_file": input_file,
        "model_path": model_path,
        "config": {
            "window_size_ms": config.window_size_ms,
            "hop_size_ms": config.hop_size_ms,
            "confidence_threshold": config.confidence_threshold,
            "min_segment_duration_ms": config.min_segment_duration_ms,
            "merge_gap_ms": config.merge_gap_ms
        }
    });

    // Create channel for progress updates
    let (tx, mut rx) = mpsc::channel::<WorkerMessage>(100);

    // Clone job_id and app for the progress task
    let progress_job_id = job_id.clone();
    let progress_app = app.clone();
    let progress_path = path.clone();

    // Spawn task to handle progress updates
    tokio::spawn(async move {
        while let Some(message) = rx.recv().await {
            if let WorkerMessage::Progress { percent, stage } = message {
                // Update job in file
                if let Ok(mut jobs) = read_json_file::<Vec<AudioDetectionJob>>(&progress_path) {
                    if let Some(job) = jobs.iter_mut().find(|j| j.id == progress_job_id) {
                        job.progress = percent;
                        job.stage = Some(stage.clone());
                        let _ = write_json_file(&progress_path, &jobs);
                    }
                }

                // Emit event to frontend
                let _ = progress_app.emit(
                    "audio-detection-progress",
                    serde_json::json!({
                        "job_id": progress_job_id,
                        "progress": percent,
                        "stage": stage
                    }),
                );
            }
        }
    });

    // Spawn the Python worker asynchronously
    let result = spawn_python_worker_async("audio_event_detector.py", worker_input, Some(tx)).await;

    // Re-read jobs to update with result
    let mut jobs: Vec<AudioDetectionJob> = read_json_file(&path)?;
    let job = jobs
        .iter_mut()
        .find(|j| j.id == job_id)
        .ok_or_else(|| format!("Audio detection job not found after worker: {}", job_id))?;

    match result {
        Ok(data) => {
            // Parse the result
            let detection_result: Option<AudioDetectionResult> = serde_json::from_value(data.clone()).ok();

            // Update job with success info
            job.status = AudioDetectionStatus::Completed;
            job.progress = 100;
            job.stage = None;
            job.completed_at = Some(chrono::Utc::now().to_rfc3339());
            job.result = detection_result.clone();

            write_json_file(&path, &jobs)?;

            // Emit completion event
            let _ = app.emit(
                "audio-detection-complete",
                serde_json::json!({
                    "job_id": job_id,
                    "status": "completed",
                    "result": detection_result
                }),
            );

            Ok(serde_json::json!({
                "status": "completed",
                "result": detection_result
            }))
        }
        Err(error) => {
            // Update job with failure info
            job.status = AudioDetectionStatus::Failed;
            job.error = Some(error.clone());

            write_json_file(&path, &jobs)?;

            // Emit error event
            let _ = app.emit(
                "audio-detection-error",
                serde_json::json!({
                    "job_id": job_id,
                    "error": error
                }),
            );

            Err(error)
        }
    }
}

/// Cancel a pending or in-progress audio detection job
#[tauri::command]
pub fn cancel_audio_detection_job(job_id: String) -> Result<(), String> {
    let path = get_audio_detection_jobs_json_path();

    if !path.exists() {
        return Err("No audio detection jobs file found".to_string());
    }

    let mut jobs: Vec<AudioDetectionJob> = read_json_file(&path)?;

    // Find and update the job
    let mut found = false;
    for job in &mut jobs {
        if job.id == job_id {
            if job.status == AudioDetectionStatus::Pending
                || job.status == AudioDetectionStatus::Processing
            {
                job.status = AudioDetectionStatus::Cancelled;
                found = true;
            } else {
                return Err(format!("Cannot cancel job with status {:?}", job.status));
            }
            break;
        }
    }

    if !found {
        return Err(format!("Audio detection job not found: {}", job_id));
    }

    write_json_file(&path, &jobs)?;

    println!("Cancelled audio detection job: {}", job_id);
    Ok(())
}

/// Delete an audio detection job from the list
#[tauri::command]
pub fn delete_audio_detection_job(job_id: String) -> Result<(), String> {
    let path = get_audio_detection_jobs_json_path();

    if !path.exists() {
        return Err("No audio detection jobs file found".to_string());
    }

    let mut jobs: Vec<AudioDetectionJob> = read_json_file(&path)?;

    // Find the job to delete
    let job_index = jobs.iter().position(|j| j.id == job_id);

    match job_index {
        Some(index) => {
            // Remove from list
            jobs.remove(index);
            write_json_file(&path, &jobs)?;

            println!("Deleted audio detection job: {}", job_id);
            Ok(())
        }
        None => Err(format!("Audio detection job not found: {}", job_id)),
    }
}

/// Check if a trained audio event detection model exists
#[tauri::command]
pub fn has_trained_model() -> bool {
    let model_path = get_models_dir().join("audio_event_detector.onnx");
    model_path.exists()
}

/// Get the path to the trained model
#[tauri::command]
pub fn get_model_path() -> Result<String, String> {
    get_audio_event_model_path()
}

/// Get a specific audio detection job by ID
#[tauri::command]
pub fn get_audio_detection_job(job_id: String) -> Result<AudioDetectionJob, String> {
    let path = get_audio_detection_jobs_json_path();

    if !path.exists() {
        return Err("No audio detection jobs file found".to_string());
    }

    let jobs: Vec<AudioDetectionJob> = read_json_file(&path)?;

    jobs.into_iter()
        .find(|j| j.id == job_id)
        .ok_or_else(|| format!("Audio detection job not found: {}", job_id))
}

// Internal helper function to get model path
fn get_audio_event_model_path() -> Result<String, String> {
    let model_path = get_models_dir().join("audio_event_detector.onnx");

    if model_path.exists() {
        Ok(model_path.to_string_lossy().to_string())
    } else {
        Err("Model not found. Please train or import a model first.".to_string())
    }
}
