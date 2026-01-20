import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import type {
  AudioDetectionJob,
  ModelConfig,
} from '../types/audioDetection';
import {
  BrainCircuit,
  FileAudio,
  RefreshCw,
  Upload,
  Play,
  X,
  Trash2,
  CheckCircle,
  AlertCircle,
  Clock,
  Loader2,
  Sliders,
  Timer,
  Target,
  Sparkles,
} from 'lucide-react';
import { EnhanceModelPanel } from '../components/ml';

// Status badge component
function StatusBadge({ status }: { status: string }) {
  const getStatusClass = () => {
    switch (status) {
      case 'processing':
        return 'badge-info';
      case 'completed':
        return 'badge-success';
      case 'failed':
        return 'badge-error';
      case 'cancelled':
        return 'badge-warning';
      case 'pending':
      default:
        return 'badge-pending';
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'processing':
        return <Loader2 size={12} className="animate-spin" />;
      case 'completed':
        return <CheckCircle size={12} />;
      case 'failed':
        return <AlertCircle size={12} />;
      case 'pending':
        return <Clock size={12} />;
      default:
        return null;
    }
  };

  return (
    <span className={`badge ${getStatusClass()} flex items-center gap-1.5`}>
      {getStatusIcon()}
      {status}
    </span>
  );
}

export function MLProcessor() {
  const [jobs, setJobs] = useState<AudioDetectionJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasModel, setHasModel] = useState(false);

  // Mode state
  const [mode, setMode] = useState<'inference' | 'enhance'>('inference');

  // Form state
  const [inputFile, setInputFile] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Config state
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.7);
  const [minSegmentDuration, setMinSegmentDuration] = useState(500);
  const [mergeGap, setMergeGap] = useState(300);
  const [showAdvanced, setShowAdvanced] = useState(false);

  async function handleSelectFile() {
    const selected = await open({
      multiple: false,
      filters: [
        { name: 'Audio', extensions: ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac'] },
        { name: 'Video', extensions: ['mp4', 'avi', 'mov', 'mkv', 'webm', 'flv'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (selected) {
      setInputFile(selected);
    }
  }

  useEffect(() => {
    fetchJobs();
    checkModel();

    const unlistenProgress = listen<{ job_id: string; progress: number; stage: string }>(
      'audio-detection-progress',
      (event) => {
        const { job_id, progress, stage } = event.payload;
        setJobs((prevJobs) =>
          prevJobs.map((job) =>
            job.id === job_id ? { ...job, progress, stage } : job
          )
        );
      }
    );

    const unlistenComplete = listen<{ job_id: string; status: string; result: unknown }>(
      'audio-detection-complete',
      () => fetchJobs()
    );

    const unlistenError = listen<{ job_id: string; error: string }>(
      'audio-detection-error',
      () => fetchJobs()
    );

    return () => {
      unlistenProgress.then((fn) => fn());
      unlistenComplete.then((fn) => fn());
      unlistenError.then((fn) => fn());
    };
  }, []);

  async function fetchJobs() {
    try {
      setLoading(true);
      setError(null);
      const result = await invoke<AudioDetectionJob[]>('list_audio_detection_jobs');
      setJobs(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function checkModel() {
    try {
      const result = await invoke<boolean>('has_trained_model');
      setHasModel(result);
    } catch (err) {
      console.error('Failed to check model:', err);
      setHasModel(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!inputFile.trim()) return;

    try {
      setSubmitting(true);
      setSubmitMessage(null);

      const config: ModelConfig = {
        model_path: null,
        window_size_ms: 1000,
        hop_size_ms: 250,
        confidence_threshold: confidenceThreshold,
        min_segment_duration_ms: minSegmentDuration,
        merge_gap_ms: mergeGap,
      };

      const result = await invoke<{ job_id: string }>('submit_audio_detection_job', {
        inputFile: inputFile.trim(),
        config,
      });
      setInputFile('');
      fetchJobs();

      try {
        await invoke('start_audio_detection_job', { jobId: result.job_id, config });
        setSubmitMessage({ type: 'success', text: 'Detection job started!' });
        fetchJobs();
      } catch (startErr) {
        setSubmitMessage({ type: 'error', text: `Failed to start: ${String(startErr)}` });
        fetchJobs();
      }
    } catch (err) {
      setSubmitMessage({ type: 'error', text: String(err) });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(jobId: string) {
    try {
      await invoke('cancel_audio_detection_job', { jobId });
      fetchJobs();
    } catch (err) {
      alert(`Failed to cancel: ${String(err)}`);
    }
  }

  async function handleDelete(jobId: string) {
    try {
      await invoke('delete_audio_detection_job', { jobId });
      fetchJobs();
    } catch (err) {
      alert(`Failed to delete: ${String(err)}`);
    }
  }

  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const centiseconds = Math.floor((seconds % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
  }

  function getFileName(path: string): string {
    return path.split(/[/\\]/).pop() || path;
  }

  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-500/20">
            <BrainCircuit className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <h1 className="section-title mb-0">Audio Detection</h1>
            <p className="text-sm text-text-muted">ML-powered audio event detection</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Mode Toggle */}
          <button
            onClick={() => setMode(mode === 'inference' ? 'enhance' : 'inference')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
              mode === 'enhance'
                ? 'bg-purple-500/20 border border-purple-500/30 text-purple-400'
                : 'glass-subtle hover:bg-white/10'
            }`}
          >
            {mode === 'inference' ? (
              <>
                <BrainCircuit size={16} />
                <span className="text-sm">Inference</span>
              </>
            ) : (
              <>
                <Sparkles size={16} className="text-purple-400" />
                <span className="text-sm text-purple-400">Enhance</span>
              </>
            )}
          </button>
          <button
            onClick={fetchJobs}
            disabled={loading}
            className="btn btn-secondary btn-sm"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Enhance Mode Panel */}
      {mode === 'enhance' ? (
        <EnhanceModelPanel jobs={jobs} onRefresh={fetchJobs} />
      ) : (
        <>
          {/* Model Status */}
          <div className={`card mb-6 ${hasModel ? 'border-green-500/30' : 'border-amber-500/30'}`}>
            <div className="flex items-center gap-3">
              {hasModel ? (
                <>
                  <div className="p-2 rounded-lg bg-green-500/20">
                    <CheckCircle className="w-5 h-5 text-green-400" />
                  </div>
                  <div>
                    <h3 className="font-medium text-white">Model Ready</h3>
                    <p className="text-sm text-text-muted">Audio event detection model is available</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="p-2 rounded-lg bg-amber-500/20">
                    <AlertCircle className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <h3 className="font-medium text-white">No Model Found</h3>
                    <p className="text-sm text-text-muted">
                      Train or import a model to: %APPDATA%/Atlas/models/audio_event_detector.onnx
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>

      {/* Submit Job Form */}
      <div className="card mb-6">
        <h2 className="card-title mb-4 flex items-center gap-2">
          <Play size={18} />
          Submit Detection Job
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              <FileAudio size={14} className="inline mr-2" />
              Audio/Video File
            </label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleSelectFile}
                disabled={submitting}
                className="btn btn-secondary"
              >
                <Upload size={16} />
                Select File
              </button>
              <div className="flex-1 flex items-center px-3 rounded-lg glass-subtle text-text-muted truncate">
                {inputFile ? getFileName(inputFile) : 'No file selected'}
              </div>
            </div>
          </div>

          {/* Advanced Settings Toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-sm text-text-secondary hover:text-white flex items-center gap-2 transition-colors"
          >
            <Sliders size={14} />
            {showAdvanced ? 'Hide' : 'Show'} Advanced Settings
          </button>

          {/* Advanced Settings */}
          {showAdvanced && (
            <div className="grid grid-cols-3 gap-4 p-4 rounded-lg glass-subtle animate-fade-in">
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1 flex items-center gap-1">
                  <Target size={12} />
                  Confidence (0-1)
                </label>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.05"
                  value={confidenceThreshold}
                  onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value))}
                  disabled={submitting}
                  className="input text-sm py-1.5"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1 flex items-center gap-1">
                  <Timer size={12} />
                  Min Duration (ms)
                </label>
                <input
                  type="number"
                  min="100"
                  max="5000"
                  step="100"
                  value={minSegmentDuration}
                  onChange={(e) => setMinSegmentDuration(parseInt(e.target.value))}
                  disabled={submitting}
                  className="input text-sm py-1.5"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1 flex items-center gap-1">
                  Merge Gap (ms)
                </label>
                <input
                  type="number"
                  min="0"
                  max="2000"
                  step="50"
                  value={mergeGap}
                  onChange={(e) => setMergeGap(parseInt(e.target.value))}
                  disabled={submitting}
                  className="input text-sm py-1.5"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !inputFile.trim() || !hasModel}
            className="btn btn-primary"
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <BrainCircuit size={16} />
                Detect Audio Segments
              </>
            )}
          </button>
        </form>
        {submitMessage && (
          <div
            className={`mt-4 p-3 rounded-lg flex items-center gap-2 ${
              submitMessage.type === 'success'
                ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                : 'bg-red-500/10 text-red-400 border border-red-500/20'
            }`}
          >
            {submitMessage.type === 'success' ? (
              <CheckCircle size={16} />
            ) : (
              <AlertCircle size={16} />
            )}
            {submitMessage.text}
          </div>
        )}
      </div>

      {/* Job List */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">Detection Jobs</h2>

        {loading && (
          <div className="card flex items-center justify-center py-12">
            <Loader2 size={32} className="animate-spin text-purple-400" />
          </div>
        )}

        {error && (
          <div className="card bg-red-500/10 border-red-500/20 text-red-400 flex items-center gap-3">
            <AlertCircle size={20} />
            <span>Error: {error}</span>
          </div>
        )}

        {!loading && !error && jobs.length === 0 && (
          <div className="card empty-state">
            <BrainCircuit className="empty-state-icon" />
            <h3 className="empty-state-title">No detection jobs</h3>
            <p className="empty-state-description">
              Select an audio or video file above to start detecting target audio segments
            </p>
          </div>
        )}

        {!loading && !error && jobs.length > 0 && (
          <div className="space-y-3">
            {jobs.map((job) => (
              <div key={job.id} className="card animate-slide-up">
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <StatusBadge status={job.status} />
                    </div>
                    <h3 className="font-medium text-white truncate mb-1 flex items-center gap-2">
                      <FileAudio size={16} className="shrink-0 text-text-muted" />
                      {getFileName(job.input_file)}
                    </h3>
                    <p className="text-xs text-text-muted">
                      Created: {new Date(job.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {(job.status === 'pending' || job.status === 'processing') && (
                      <button
                        onClick={() => handleCancel(job.id)}
                        className="btn btn-danger btn-sm"
                        title="Cancel job"
                      >
                        <X size={14} />
                        Cancel
                      </button>
                    )}
                    {(job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') && (
                      <button
                        onClick={() => handleDelete(job.id)}
                        className="btn btn-ghost btn-sm"
                        title="Delete job"
                      >
                        <Trash2 size={14} />
                        Delete
                      </button>
                    )}
                  </div>
                </div>

                {/* Progress bar for processing/pending jobs */}
                {(job.status === 'processing' || job.status === 'pending') && (
                  <div className="mt-4">
                    <div className="progress-bar h-3">
                      {job.progress && job.progress > 0 ? (
                        <div
                          className="progress-bar-fill"
                          style={{ width: `${job.progress}%` }}
                        />
                      ) : (
                        <div className="h-full w-full bg-gradient-to-r from-transparent via-purple-400/30 to-transparent animate-shimmer" />
                      )}
                    </div>
                    <div className="flex justify-between items-center mt-2 text-xs text-text-muted">
                      <span className="italic">{job.stage || 'Initializing...'}</span>
                      <span className="font-medium">{job.progress || 0}%</span>
                    </div>
                  </div>
                )}

                {/* Results for completed jobs */}
                {job.status === 'completed' && job.result && (
                  <div className="mt-4 p-4 rounded-lg bg-green-500/5 border border-green-500/20">
                    <div className="flex items-center gap-6 mb-4 text-sm">
                      <div>
                        <span className="text-text-muted">Total Duration: </span>
                        <span className="text-white font-medium">{formatTime(job.result.total_duration_seconds)}</span>
                      </div>
                      <div>
                        <span className="text-text-muted">Detected: </span>
                        <span className="text-green-400 font-medium">{formatTime(job.result.detected_duration_seconds)}</span>
                      </div>
                      <div>
                        <span className="text-text-muted">Segments: </span>
                        <span className="text-white font-medium">{job.result.segments.length}</span>
                      </div>
                    </div>

                    {job.result.segments.length > 0 ? (
                      <div className="space-y-2">
                        {job.result.segments.map((segment, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-4 p-2 rounded bg-white/5 text-sm"
                          >
                            <span className="text-text-muted w-6">#{idx + 1}</span>
                            <span className="font-mono text-green-400">
                              {formatTime(segment.start_seconds)} - {formatTime(segment.end_seconds)}
                            </span>
                            <span className="text-text-muted">
                              ({(segment.confidence * 100).toFixed(1)}% confidence)
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-text-muted text-sm">No target audio segments detected.</p>
                    )}
                  </div>
                )}

                {/* Error message */}
                {job.error && (
                  <div className="mt-3 p-2 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-2 text-sm text-red-400">
                    <AlertCircle size={14} />
                    <span>{job.error}</span>
                  </div>
                )}

                {job.completed_at && (
                  <p className="mt-2 text-xs text-text-muted">
                    Completed: {new Date(job.completed_at).toLocaleString()}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
        </>
      )}
    </div>
  );
}
