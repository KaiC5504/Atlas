import { RefreshCw, CheckCircle, XCircle, Loader2, CloudDownload } from 'lucide-react';
import type { SyncStatus, SyncResult, PlaylistUploaderProgress } from '../../types';

interface SyncStatusCardProps {
  status: SyncStatus;
  lastResult: SyncResult | null;
  progress: PlaylistUploaderProgress | null;
  error: string | null;
  onSync: () => void;
  disabled?: boolean;
}

export function SyncStatusCard({
  status,
  lastResult,
  progress,
  error,
  onSync,
  disabled = false,
}: SyncStatusCardProps) {
  const isSyncing = status === 'syncing';
  const isSynced = status === 'completed';
  const isFailed = status === 'failed';

  const getStatusIcon = () => {
    if (isSyncing) {
      return <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />;
    }
    if (isSynced) {
      return <CheckCircle className="w-5 h-5 text-green-400" />;
    }
    if (isFailed) {
      return <XCircle className="w-5 h-5 text-red-400" />;
    }
    return <CloudDownload className="w-5 h-5 text-muted" />;
  };

  const getStatusText = () => {
    if (isSyncing) return 'Syncing from server...';
    if (isSynced) return 'Synced with server';
    if (isFailed) return 'Sync failed';
    return 'Not synced';
  };

  const getStatusColor = () => {
    if (isSyncing) return 'text-cyan-400';
    if (isSynced) return 'text-green-400';
    if (isFailed) return 'text-red-400';
    return 'text-muted';
  };

  return (
    <div className="glass-subtle rounded-xl p-6 border border-white/10">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-cyan-500/20 border border-white/10">
            {getStatusIcon()}
          </div>
          <div>
            <h3 className="text-lg font-semibold text-primary">Server Sync</h3>
            <p className={`text-sm ${getStatusColor()}`}>{getStatusText()}</p>
          </div>
        </div>

        <button
          onClick={onSync}
          disabled={disabled || isSyncing}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? 'Syncing...' : 'Sync Now'}
        </button>
      </div>

      {/* Progress indicator */}
      {isSyncing && progress && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-secondary">{progress.message}</span>
            <span className="text-muted">
              {progress.current}/{progress.total}
            </span>
          </div>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-cyan-500 transition-all duration-300"
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Sync result */}
      {isSynced && lastResult && (
        <div className="mt-4 flex flex-wrap gap-2">
          <div className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
            <span className="text-sm text-muted">Index Entries: </span>
            <span className="text-sm text-primary font-medium">{lastResult.indexEntries}</span>
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
            <span className="text-sm text-muted">Playlists: </span>
            <span className="text-sm text-primary font-medium">{lastResult.playlistsCount}</span>
          </div>
        </div>
      )}

      {/* Error message */}
      {isFailed && error && (
        <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Help text when not synced */}
      {status === 'idle' && (
        <p className="mt-4 text-sm text-muted">
          Sync from server to enable downloads. This pulls the latest index and playlists.
        </p>
      )}
    </div>
  );
}

export default SyncStatusCard;
