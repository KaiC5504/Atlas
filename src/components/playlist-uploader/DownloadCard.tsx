import { useState } from 'react';
import { Download, Link, Loader2, CheckCircle, XCircle, Music } from 'lucide-react';
import { CustomSelect } from '../ui';
import type { PlaylistDownloadStatus, DownloadResult, PlaylistUploaderProgress } from '../../types';

interface DownloadCardProps {
  status: PlaylistDownloadStatus;
  progress: PlaylistUploaderProgress | null;
  error: string | null;
  disabled?: boolean;
  playlistName: string;
  onPlaylistNameChange: (name: string) => void;
  onDownload: (url: string, playlistName?: string, parallel?: number) => Promise<DownloadResult>;
}

const statusLabels: Record<PlaylistDownloadStatus, string> = {
  idle: 'Ready',
  fetching_metadata: 'Fetching metadata...',
  downloading: 'Downloading tracks...',
  building_index: 'Building index...',
  uploading: 'Uploading...',
  updating_playlist_js: 'Updating playlist.js...',
  restarting_bot: 'Restarting bot...',
  completed: 'Download complete',
  failed: 'Download failed',
};

export function DownloadCard({
  status,
  progress,
  error,
  disabled = false,
  playlistName,
  onPlaylistNameChange,
  onDownload,
}: DownloadCardProps) {
  const [url, setUrl] = useState('');
  const [parallel, setParallel] = useState(4);
  const [lastResult, setLastResult] = useState<DownloadResult | null>(null);

  const isProcessing = status !== 'idle' && status !== 'completed' && status !== 'failed';
  const isCompleted = status === 'completed';
  const isFailed = status === 'failed';

  const handleDownload = async () => {
    if (!url.trim()) return;
    setLastResult(null);

    const customName = playlistName.trim();

    const result = await onDownload(
      url.trim(),
      customName || undefined,
      parallel
    );
    setLastResult(result);
    if (result.success) {
      setUrl('');
    }
  };

  const getStatusIcon = () => {
    if (isProcessing) {
      return <Loader2 className="w-5 h-5 animate-spin text-purple-400" />;
    }
    if (isCompleted) {
      return <CheckCircle className="w-5 h-5 text-green-400" />;
    }
    if (isFailed) {
      return <XCircle className="w-5 h-5 text-red-400" />;
    }
    return <Download className="w-5 h-5 text-purple-400" />;
  };

  return (
    <div className="glass-subtle rounded-xl p-6 border border-white/10">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-purple-500/20 border border-white/10">
          {getStatusIcon()}
        </div>
        <div>
          <h3 className="text-lg font-semibold text-primary">Download Playlist/Song</h3>
          <p className="text-sm text-muted">{statusLabels[status]}</p>
        </div>
      </div>

      {/* URL Input */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-secondary mb-2">YouTube URL</label>
          <div className="relative">
            <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://youtube.com/playlist?list=..."
              disabled={disabled || isProcessing}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-primary placeholder:text-muted focus:outline-none focus:border-purple-500/50 disabled:opacity-50"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-secondary mb-2">
              Name
              <span className="text-muted ml-1">(playlist or song title)</span>
            </label>
            <div className="relative">
              <Music className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <input
                type="text"
                value={playlistName}
                onChange={(e) => onPlaylistNameChange(e.target.value)}
                placeholder="Auto-detect from URL"
                disabled={disabled || isProcessing}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-primary placeholder:text-muted focus:outline-none focus:border-purple-500/50 disabled:opacity-50"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-secondary mb-2">
              Parallel Downloads
            </label>
            <CustomSelect
              value={parallel}
              onChange={setParallel}
              disabled={disabled || isProcessing}
              options={[
                { value: 1, label: '1 (Slowest)' },
                { value: 2, label: '2' },
                { value: 4, label: '4 (Default)' },
                { value: 8, label: '8 (Fast)' },
              ]}
            />
          </div>
        </div>

        <button
          onClick={handleDownload}
          disabled={disabled || isProcessing || !url.trim()}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 border border-purple-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className={`w-5 h-5 ${isProcessing ? 'animate-bounce' : ''}`} />
          {isProcessing ? 'Downloading...' : 'Download'}
        </button>
      </div>

      {/* Progress indicator */}
      {isProcessing && progress && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-secondary">{progress.message}</span>
            <span className="text-muted">
              {progress.current}/{progress.total}
            </span>
          </div>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-purple-500 transition-all duration-300"
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Download result */}
      {isCompleted && lastResult && lastResult.success && (
        <div className="mt-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
          <p className="text-sm text-green-400 mb-2">Download complete!</p>
          <div className="flex flex-wrap gap-2">
            <span className="px-2 py-1 rounded bg-white/5 text-xs text-secondary">
              Downloaded: {lastResult.downloaded}
            </span>
            <span className="px-2 py-1 rounded bg-white/5 text-xs text-secondary">
              Cached: {lastResult.cached}
            </span>
            {lastResult.failed > 0 && (
              <span className="px-2 py-1 rounded bg-red-500/10 text-xs text-red-400">
                Failed: {lastResult.failed}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Error message */}
      {isFailed && error && (
        <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Disabled state message */}
      {disabled && status === 'idle' && (
        <p className="mt-4 text-sm text-yellow-400/80">
          Sync from server first to enable downloads.
        </p>
      )}
    </div>
  );
}

export default DownloadCard;
