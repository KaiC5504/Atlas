import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTauriEvent } from '../hooks';
import type { Download, DownloadProgressEvent, DownloadStatusEvent } from '../types';
import {
  Download as DownloadIcon,
  Plus,
  RefreshCw,
  X,
  Trash2,
  CheckCircle,
  AlertCircle,
  Clock,
  Loader2,
  Link,
  FolderOpen,
} from 'lucide-react';
import { CustomSelect } from '../components/ui/CustomSelect';

const QUALITY_OPTIONS = [
  { value: 'best', label: 'Best Quality' },
  { value: '1080p', label: '1080p' },
  { value: '720p', label: '720p' },
  { value: '480p', label: '480p' },
  { value: 'audio_only', label: 'Audio Only' },
];

// Progress bar component
function ProgressBar({
  percent,
  speed,
  eta,
}: {
  percent: number;
  speed?: string | null;
  eta?: string | null;
}) {
  const clampedPercent = Math.min(100, Math.max(0, percent));

  return (
    <div className="mt-3">
      <div className="progress-bar">
        <div
          className="progress-bar-fill"
          style={{ width: `${clampedPercent}%` }}
        />
      </div>
      <div className="flex justify-between items-center mt-2 text-xs text-text-muted">
        <span className="font-medium">{clampedPercent}%</span>
        <div className="flex gap-4">
          {speed && <span>{speed}</span>}
          {eta && <span>ETA: {eta}</span>}
        </div>
      </div>
    </div>
  );
}

// Status badge component
function StatusBadge({ status }: { status: string }) {
  const getStatusClass = () => {
    switch (status) {
      case 'downloading':
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
      case 'downloading':
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

export function DownloadQueue() {
  const [downloads, setDownloads] = useState<Download[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [url, setUrl] = useState('');
  const [quality, setQuality] = useState('best');
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Fetch downloads on mount
  useEffect(() => {
    fetchDownloads();
  }, []);

  async function fetchDownloads() {
    try {
      setLoading(true);
      setError(null);
      const result = await invoke<Download[]>('list_downloads');
      setDownloads(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  // Handle progress updates from Rust
  const handleProgress = useCallback((event: DownloadProgressEvent) => {
    setDownloads((prev) =>
      prev.map((d) =>
        d.id === event.job_id
          ? {
              ...d,
              progress: event.percent,
              speed: event.speed,
              eta: event.eta,
              status: 'downloading' as const,
            }
          : d
      )
    );
  }, []);

  // Handle download started
  const handleStarted = useCallback((event: DownloadStatusEvent) => {
    setDownloads((prev) =>
      prev.map((d) =>
        d.id === event.job_id
          ? { ...d, status: 'downloading' as const }
          : d
      )
    );
  }, []);

  // Handle download completed
  const handleCompleted = useCallback((event: DownloadStatusEvent) => {
    setDownloads((prev) =>
      prev.map((d) =>
        d.id === event.job_id
          ? {
              ...d,
              status: 'completed' as const,
              progress: 100,
              title: event.title || d.title,
              file_path: event.file_path,
              speed: null,
              eta: null,
            }
          : d
      )
    );
  }, []);

  // Handle download failed
  const handleFailed = useCallback((event: DownloadStatusEvent) => {
    setDownloads((prev) =>
      prev.map((d) =>
        d.id === event.job_id
          ? {
              ...d,
              status: 'failed' as const,
              error: event.error,
              speed: null,
              eta: null,
            }
          : d
      )
    );
  }, []);

  // Listen for Tauri events
  useTauriEvent<DownloadProgressEvent>('download:progress', handleProgress);
  useTauriEvent<DownloadStatusEvent>('download:started', handleStarted);
  useTauriEvent<DownloadStatusEvent>('download:completed', handleCompleted);
  useTauriEvent<DownloadStatusEvent>('download:failed', handleFailed);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    try {
      setSubmitting(true);
      setSubmitMessage(null);
      const result = await invoke<{ job_id: string }>('add_download', { url: url.trim(), quality });
      setSubmitMessage({ type: 'success', text: 'Download started!' });
      setUrl('');
      await fetchDownloads();

      invoke('start_download', { jobId: result.job_id }).catch((err) => {
        console.error('Download error:', err);
      });
    } catch (err) {
      setSubmitMessage({ type: 'error', text: String(err) });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(jobId: string) {
    try {
      await invoke('cancel_download', { jobId });
      fetchDownloads();
    } catch (err) {
      alert(`Failed to cancel: ${String(err)}`);
    }
  }

  async function handleDelete(jobId: string, deleteFile: boolean) {
    try {
      await invoke('delete_download', { jobId, deleteFile });
      fetchDownloads();
    } catch (err) {
      alert(`Failed to delete: ${String(err)}`);
    }
  }

  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-accent-primary/20">
            <DownloadIcon className="w-6 h-6 text-accent-primary" />
          </div>
          <div>
            <h1 className="section-title mb-0">Downloads</h1>
            <p className="text-sm text-text-muted">Download videos and audio from YouTube</p>
          </div>
        </div>
        <button
          onClick={fetchDownloads}
          disabled={loading}
          className="btn btn-secondary btn-sm"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Add Download Form */}
      <div className="card mb-6">
        <h2 className="card-title mb-4 flex items-center gap-2">
          <Plus size={18} />
          Add Download
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              <Link size={14} className="inline mr-2" />
              Video URL
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://youtube.com/watch?v=..."
              disabled={submitting}
              className="input"
            />
          </div>
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Quality
              </label>
              <CustomSelect
                value={quality}
                onChange={setQuality}
                disabled={submitting}
                options={QUALITY_OPTIONS}
              />
            </div>
            <button
              type="submit"
              disabled={submitting || !url.trim()}
              className="btn btn-primary"
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Plus size={16} />
                  Add Download
                </>
              )}
            </button>
          </div>
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

      {/* Download List */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">Download Queue</h2>

        {loading && (
          <div className="card flex items-center justify-center py-12">
            <Loader2 size={32} className="animate-spin text-accent-primary" />
          </div>
        )}

        {error && (
          <div className="card bg-red-500/10 border-red-500/20 text-red-400 flex items-center gap-3">
            <AlertCircle size={20} />
            <span>Error: {error}</span>
          </div>
        )}

        {!loading && !error && downloads.length === 0 && (
          <div className="card empty-state">
            <DownloadIcon className="empty-state-icon" />
            <h3 className="empty-state-title">No downloads yet</h3>
            <p className="empty-state-description">
              Add a YouTube URL above to start downloading videos
            </p>
          </div>
        )}

        {!loading && !error && downloads.length > 0 && (
          <div className="space-y-3">
            {downloads.map((download) => (
              <div key={download.id} className="card animate-slide-up">
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <StatusBadge status={download.status} />
                    </div>
                    <h3 className="font-medium text-white truncate mb-1">
                      {download.title || 'Fetching title...'}
                    </h3>
                    <p className="text-sm text-text-muted truncate flex items-center gap-1.5">
                      <Link size={12} />
                      {download.url.length > 50 ? download.url.substring(0, 50) + '...' : download.url}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {(download.status === 'pending' || download.status === 'downloading') && (
                      <button
                        onClick={() => handleCancel(download.id)}
                        className="btn btn-danger btn-sm"
                        title="Cancel download"
                      >
                        <X size={14} />
                        Cancel
                      </button>
                    )}
                    {(download.status === 'completed' || download.status === 'failed' || download.status === 'cancelled') && (
                      <button
                        onClick={() => handleDelete(download.id, false)}
                        className="btn btn-ghost btn-sm"
                        title="Remove from list"
                      >
                        <Trash2 size={14} />
                        Remove
                      </button>
                    )}
                  </div>
                </div>

                {/* Progress Bar */}
                {(download.status === 'downloading' || download.status === 'pending') && (
                  <ProgressBar
                    percent={download.progress}
                    speed={download.speed}
                    eta={download.eta}
                  />
                )}

                {/* Completed progress bar */}
                {download.status === 'completed' && <ProgressBar percent={100} />}

                {/* File path for completed downloads */}
                {download.file_path && (
                  <div className="mt-3 p-2 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center gap-2 text-sm text-green-400">
                    <FolderOpen size={14} />
                    <span className="truncate">{download.file_path}</span>
                  </div>
                )}

                {/* Error message for failed downloads */}
                {download.error && (
                  <div className="mt-3 p-2 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-2 text-sm text-red-400">
                    <AlertCircle size={14} />
                    <span>{download.error}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
