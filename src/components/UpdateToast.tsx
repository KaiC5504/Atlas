import { RefreshCw, Download, RotateCcw, X, CheckCircle, AlertCircle } from 'lucide-react';
import type { UpdateState } from '../types/updater';

interface UpdateToastProps {
  state: UpdateState;
  onDownload: () => void;
  onRestart: () => void;
  onDismiss: () => void;
  onRetry: () => void;
}

export function UpdateToast({
  state,
  onDownload,
  onRestart,
  onDismiss,
  onRetry,
}: UpdateToastProps) {
  if (state.status === 'idle') {
    return null;
  }

  if (state.status === 'checking') {
    return (
      <div className="fixed bottom-4 right-4 z-50 animate-slide-up">
        <div className="glass-elevated rounded-xl p-4 flex items-center gap-3 shadow-lg min-w-[300px]">
          <RefreshCw size={20} className="text-accent-primary animate-spin" />
          <span className="text-text-secondary text-sm">Checking for updates...</span>
        </div>
      </div>
    );
  }

  if (state.status === 'available' && state.info) {
    return (
      <div className="fixed bottom-4 right-4 z-50 animate-slide-up">
        <div className="glass-elevated rounded-xl p-4 shadow-lg min-w-[320px] max-w-[400px]">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <Download size={20} className="text-accent-primary" />
              <span className="text-text-primary font-medium">Update Available</span>
            </div>
            <button
              onClick={onDismiss}
              className="text-text-muted hover:text-text-secondary transition-colors"
            >
              <X size={18} />
            </button>
          </div>
          <p className="text-text-secondary text-sm mb-2">
            Version {state.info.version} is ready to download.
          </p>
          {state.info.body && (
            <p className="text-text-muted text-xs mb-3 line-clamp-2">
              {state.info.body}
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={onDownload}
              className="btn btn-primary btn-sm flex-1"
            >
              <Download size={14} />
              Download Now
            </button>
            <button
              onClick={onDismiss}
              className="btn btn-secondary btn-sm"
            >
              Later
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (state.status === 'downloading' && state.progress) {
    const percent = Math.round(state.progress.percent);
    return (
      <div className="fixed bottom-4 right-4 z-50 animate-slide-up">
        <div className="glass-elevated rounded-xl p-4 shadow-lg min-w-[320px]">
          <div className="flex items-center gap-3 mb-3">
            <RefreshCw size={20} className="text-accent-primary animate-spin" />
            <div className="flex-1">
              <span className="text-text-primary font-medium">
                Downloading Update...
              </span>
              <span className="text-text-muted text-sm ml-2">{percent}%</span>
            </div>
          </div>
          {/* Progress bar */}
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-accent-primary to-accent-secondary transition-all duration-300 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>
          {state.progress.total > 0 && (
            <p className="text-text-muted text-xs mt-2">
              {formatBytes(state.progress.downloaded)} / {formatBytes(state.progress.total)}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (state.status === 'downloaded') {
    return (
      <div className="fixed bottom-4 right-4 z-50 animate-slide-up">
        <div className="glass-elevated rounded-xl p-4 shadow-lg min-w-[320px] border border-status-success/30">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <CheckCircle size={20} className="text-status-success" />
              <span className="text-text-primary font-medium">Update Ready!</span>
            </div>
            <button
              onClick={onDismiss}
              className="text-text-muted hover:text-text-secondary transition-colors"
            >
              <X size={18} />
            </button>
          </div>
          <p className="text-text-secondary text-sm mb-3">
            The update has been downloaded. Restart to apply changes.
          </p>
          <div className="flex gap-2">
            <button
              onClick={onRestart}
              className="btn btn-primary btn-sm flex-1"
            >
              <RotateCcw size={14} />
              Restart Now
            </button>
            <button
              onClick={onDismiss}
              className="btn btn-secondary btn-sm"
            >
              Later
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="fixed bottom-4 right-4 z-50 animate-slide-up">
        <div className="glass-elevated rounded-xl p-4 shadow-lg min-w-[320px] border border-status-error/30">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <AlertCircle size={20} className="text-status-error" />
              <span className="text-text-primary font-medium">Update Failed</span>
            </div>
            <button
              onClick={onDismiss}
              className="text-text-muted hover:text-text-secondary transition-colors"
            >
              <X size={18} />
            </button>
          </div>
          <p className="text-text-secondary text-sm mb-3">
            {state.error || 'An error occurred while updating.'}
          </p>
          <div className="flex gap-2">
            <button
              onClick={onRetry}
              className="btn btn-primary btn-sm flex-1"
            >
              <RefreshCw size={14} />
              Retry
            </button>
            <button
              onClick={onDismiss}
              className="btn btn-secondary btn-sm"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

// Helper
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const BYTES_PER_UNIT = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const unitIndex = Math.floor(Math.log(bytes) / Math.log(BYTES_PER_UNIT));
  return parseFloat((bytes / Math.pow(BYTES_PER_UNIT, unitIndex)).toFixed(1)) + ' ' + sizes[unitIndex];
}
