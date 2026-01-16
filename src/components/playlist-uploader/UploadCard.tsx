import { Upload, Loader2, CheckCircle, XCircle, Server } from 'lucide-react';
import type { PlaylistDownloadStatus, UploadResult, PlaylistUploaderProgress } from '../../types';

interface UploadCardProps {
  status: PlaylistDownloadStatus;
  progress: PlaylistUploaderProgress | null;
  error: string | null;
  selectedTracks: string[];
  playlistName: string;
  disabled?: boolean;
  onUpload: (trackIds: string[], playlistName?: string) => Promise<UploadResult>;
  onRestartBot: () => Promise<boolean>;
}

export function UploadCard({
  status,
  progress,
  error,
  selectedTracks,
  playlistName,
  disabled = false,
  onUpload,
  onRestartBot,
}: UploadCardProps) {
  const isUploading = status === 'uploading' || status === 'updating_playlist_js' || status === 'restarting_bot';
  const isCompleted = status === 'completed';
  const isFailed = status === 'failed';

  const handleUpload = async () => {
    if (selectedTracks.length === 0) return;
    await onUpload(selectedTracks, playlistName || undefined);
  };

  const handleRestartBot = async () => {
    await onRestartBot();
  };

  const getStatusIcon = () => {
    if (isUploading) {
      return <Loader2 className="w-5 h-5 animate-spin text-green-400" />;
    }
    if (isCompleted) {
      return <CheckCircle className="w-5 h-5 text-green-400" />;
    }
    if (isFailed) {
      return <XCircle className="w-5 h-5 text-red-400" />;
    }
    return <Upload className="w-5 h-5 text-green-400" />;
  };

  const getStatusText = () => {
    if (status === 'uploading') return 'Uploading tracks...';
    if (status === 'updating_playlist_js') return 'Updating playlist.js...';
    if (status === 'restarting_bot') return 'Restarting bot...';
    if (isCompleted) return 'Upload complete';
    if (isFailed) return 'Upload failed';
    return 'Ready to upload';
  };

  return (
    <div className="glass-subtle rounded-xl p-6 border border-white/10">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-green-500/20 border border-white/10">
            {getStatusIcon()}
          </div>
          <div>
            <h3 className="text-lg font-semibold text-primary">Upload to Server</h3>
            <p className="text-sm text-muted">{getStatusText()}</p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleRestartBot}
            disabled={disabled || isUploading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-secondary border border-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Restart Discord bot"
          >
            <Server className="w-4 h-4" />
            Restart Bot
          </button>

          <button
            onClick={handleUpload}
            disabled={disabled || isUploading || selectedTracks.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Upload className={`w-4 h-4 ${isUploading ? 'animate-bounce' : ''}`} />
            Upload {selectedTracks.length > 0 ? `(${selectedTracks.length})` : ''}
          </button>
        </div>
      </div>

      {/* Progress indicator */}
      {isUploading && progress && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-secondary">{progress.message}</span>
            <span className="text-muted">
              {progress.current}/{progress.total}
            </span>
          </div>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 transition-all duration-300"
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Selection info */}
      {selectedTracks.length === 0 && !isUploading && !isCompleted && (
        <p className="mt-4 text-sm text-muted">
          Select tracks from the list below to upload to the server.
        </p>
      )}

      {/* Error message */}
      {isFailed && error && (
        <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Disabled state message */}
      {disabled && (
        <p className="mt-4 text-sm text-yellow-400/80">
          Sync from server first to enable uploads.
        </p>
      )}
    </div>
  );
}

export default UploadCard;
