use crate::file_manager::{read_json_file, write_json_file};
use crate::models::{MLJob, MLJobStatus, Model, OutputFile};
use crate::process_manager::{spawn_python_worker_async, WorkerMessage};
use crate::utils::{get_ml_jobs_json_path, get_models_dir, get_separated_audio_dir};
use log::debug;
use std::fs;
use std::path::Path;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;

const PROGRESS_WRITE_DEBOUNCE_MS: u64 = 500;

#[tauri::command]
pub fn list_ml_jobs() -> Result<Vec<MLJob>, String> {
    let path = get_ml_jobs_json_path();

    if !path.exists() {
        return Ok(vec![]);
    }

    read_json_file(&path)
}

#[tauri::command]
pub fn submit_ml_job(
    input_file: String,
    model: String,
    output_dir: Option<String>,
) -> Result<serde_json::Value, String> {
    // Validate input file exists
    if !Path::new(&input_file).exists() {
        return Err(format!("Input file not found: {}", input_file));
    }

    let path = get_ml_jobs_json_path();

    // Generate unique ID
    let job_id = uuid::Uuid::new_v4().to_string();

    // Create new job entry
    let job = MLJob::new(
        job_id.clone(),
        input_file.clone(),
        model.clone(),
        output_dir.clone(),
    );

    // Read existing jobs
    let mut jobs: Vec<MLJob> = if path.exists() {
        read_json_file(&path)?
    } else {
        vec![]
    };

    // Add new job
    jobs.push(job);

    // Write back to file
    write_json_file(&path, &jobs)?;

    debug!(
        "Submitted ML job: {} with model: {}, output_dir: {:?}",
        input_file, model, output_dir
    );

    Ok(serde_json::json!({ "job_id": job_id }))
}

#[tauri::command]
pub async fn start_ml_job(app: AppHandle, job_id: String) -> Result<serde_json::Value, String> {
    let path = get_ml_jobs_json_path();

    if !path.exists() {
        return Err("No ML jobs file found".to_string());
    }

    let mut jobs: Vec<MLJob> = read_json_file(&path)?;

    // Find the job and extract needed values
    let (input_file, model, output_dir) = {
        let job = jobs
            .iter_mut()
            .find(|j| j.id == job_id)
            .ok_or_else(|| format!("ML job not found: {}", job_id))?;

        if job.status != MLJobStatus::Pending {
            return Err(format!(
                "Cannot start job with status {:?}",
                job.status
            ));
        }

        // Update status to processing
        job.status = MLJobStatus::Processing;

        // Clone values we need for worker input
        let output_dir = job
            .output_dir
            .clone()
            .unwrap_or_else(|| get_separated_audio_dir().to_string_lossy().to_string());

        (job.input_file.clone(), job.model.clone(), output_dir)
    };

    // Now we can write without holding the mutable borrow
    write_json_file(&path, &jobs)?;

    // Prepare worker input
    let worker_input = serde_json::json!({
        "input_file": input_file,
        "model": model,
        "output_dir": output_dir,
        "job_id": job_id.clone()
    });

    // Create channel for progress updates
    let (tx, mut rx) = mpsc::channel::<WorkerMessage>(100);

    // Clone job_id and app for the progress task
    let progress_job_id = job_id.clone();
    let progress_app = app.clone();
    let progress_path = path.clone();

    tokio::spawn(async move {
        let mut last_write = Instant::now() - Duration::from_millis(PROGRESS_WRITE_DEBOUNCE_MS);
        let debounce_duration = Duration::from_millis(PROGRESS_WRITE_DEBOUNCE_MS);

        while let Some(message) = rx.recv().await {
            if let WorkerMessage::Progress { percent, stage } = message {
                // Debounce file writes - only write if 500ms elapsed OR job complete (100%)
                let should_write = percent == 100 || last_write.elapsed() >= debounce_duration;

                if should_write {
                    // Update job in file
                    if let Ok(mut jobs) = read_json_file::<Vec<MLJob>>(&progress_path) {
                        if let Some(job) = jobs.iter_mut().find(|j| j.id == progress_job_id) {
                            job.progress = percent;
                            job.stage = Some(stage.clone());
                            let _ = write_json_file(&progress_path, &jobs);
                        }
                    }
                    last_write = Instant::now();
                }

                let _ = progress_app.emit(
                    "ml-job-progress",
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
    let result = spawn_python_worker_async("audio_separator.py", worker_input, Some(tx)).await;

    // Re-read jobs to update with result
    let mut jobs: Vec<MLJob> = read_json_file(&path)?;
    let job = jobs
        .iter_mut()
        .find(|j| j.id == job_id)
        .ok_or_else(|| format!("ML job not found after worker: {}", job_id))?;

    match result {
        Ok(data) => {
            // Parse output files first
            let output_files: Option<Vec<OutputFile>> =
                data.get("output_files").and_then(|v| v.as_array()).map(|arr| {
                    arr.iter()
                        .filter_map(|f| {
                            Some(OutputFile {
                                stem: f.get("stem")?.as_str()?.to_string(),
                                path: f.get("path")?.as_str()?.to_string(),
                            })
                        })
                        .collect()
                });

            // Update job with success info
            job.status = MLJobStatus::Completed;
            job.progress = 100;
            job.stage = None;
            job.completed_at = Some(chrono::Utc::now().to_rfc3339());
            job.output_files = output_files.clone();

            write_json_file(&path, &jobs)?;

            // Emit completion event
            let _ = app.emit(
                "ml-job-complete",
                serde_json::json!({
                    "job_id": job_id,
                    "status": "completed",
                    "output_files": output_files
                }),
            );

            Ok(serde_json::json!({
                "status": "completed",
                "output_files": output_files
            }))
        }
        Err(error) => {
            // Update job with failure info
            job.status = MLJobStatus::Failed;
            job.error = Some(error.clone());

            write_json_file(&path, &jobs)?;

            // Emit error event
            let _ = app.emit(
                "ml-job-error",
                serde_json::json!({
                    "job_id": job_id,
                    "error": error
                }),
            );

            Err(error)
        }
    }
}

/// Cancel a pending or in-progress ML job
#[tauri::command]
pub fn cancel_ml_job(job_id: String) -> Result<(), String> {
    let path = get_ml_jobs_json_path();

    if !path.exists() {
        return Err("No ML jobs file found".to_string());
    }

    let mut jobs: Vec<MLJob> = read_json_file(&path)?;

    // Find and update the job
    let mut found = false;
    for job in &mut jobs {
        if job.id == job_id {
            if job.status == MLJobStatus::Pending || job.status == MLJobStatus::Processing {
                job.status = MLJobStatus::Cancelled;
                found = true;
            } else {
                return Err(format!("Cannot cancel job with status {:?}", job.status));
            }
            break;
        }
    }

    if !found {
        return Err(format!("ML job not found: {}", job_id));
    }

    write_json_file(&path, &jobs)?;

    debug!("Cancelled ML job: {}", job_id);
    Ok(())
}

#[tauri::command]
pub fn get_available_models() -> Result<Vec<Model>, String> {
    let models_dir = get_models_dir();
    let demucs_dir = models_dir.join("demucs");

    // Define available models
    let mut models = vec![
        Model {
            id: "htdemucs_ft".to_string(),
            name: "Demucs Fine-Tuned".to_string(),
            description: "Best quality audio separation model (4 stems: vocals, drums, bass, other)"
                .to_string(),
            is_downloaded: false,
        },
        Model {
            id: "htdemucs".to_string(),
            name: "Demucs".to_string(),
            description: "Standard audio separation model (4 stems)".to_string(),
            is_downloaded: false,
        },
        Model {
            id: "htdemucs_6s".to_string(),
            name: "Demucs 6-Stem".to_string(),
            description: "6-stem separation (includes guitar and piano)".to_string(),
            is_downloaded: false,
        },
    ];

    // Check which models are downloaded
    if demucs_dir.exists() {
        for model in &mut models {
            let model_path = demucs_dir.join(&model.id);
            model.is_downloaded = model_path.exists();
        }
    }

    Ok(models)
}

/// Delete an ML job from the list
#[tauri::command]
pub fn delete_ml_job(job_id: String, delete_output: bool) -> Result<(), String> {
    let path = get_ml_jobs_json_path();

    if !path.exists() {
        return Err("No ML jobs file found".to_string());
    }

    let mut jobs: Vec<MLJob> = read_json_file(&path)?;

    // Find the job to delete
    let job_index = jobs.iter().position(|j| j.id == job_id);

    match job_index {
        Some(index) => {
            let job = &jobs[index];

            // Delete output files if requested
            if delete_output {
                if let Some(output_files) = &job.output_files {
                    for file in output_files {
                        if Path::new(&file.path).exists() {
                            if let Err(e) = fs::remove_file(&file.path) {
                                debug!("Warning: Failed to delete file {}: {}", file.path, e);
                            } else {
                                debug!("Deleted output file: {}", file.path);
                            }
                        }
                    }
                }
            }

            // Remove from list
            jobs.remove(index);
            write_json_file(&path, &jobs)?;

            debug!("Deleted ML job: {}", job_id);
            Ok(())
        }
        None => Err(format!("ML job not found: {}", job_id)),
    }
}
