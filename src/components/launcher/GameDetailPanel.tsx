import { useState, useEffect } from 'react';
import { X, Play, Clock, Calendar, FolderOpen, Trash2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { LibraryGame, formatPlaytime, getSourceDisplayName } from '../../types';

interface GameDetailPanelProps {
  game: LibraryGame;
  onClose: () => void;
  onLaunch: (gameId: string) => void;
  onRemove: (gameId: string) => void;
}

export function GameDetailPanel({ game, onClose, onLaunch, onRemove }: GameDetailPanelProps) {
  const [iconSrc, setIconSrc] = useState<string | null>(null);

  useEffect(() => {
    if (game.icon_path) {
      invoke<string>('get_icon_base64', { iconPath: game.icon_path })
        .then(setIconSrc)
        .catch(() => setIconSrc(null));
    }
  }, [game.icon_path]);

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="glass rounded-2xl w-full max-w-lg border border-white/20 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-white/10">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center overflow-hidden">
              {iconSrc ? (
                <img
                  src={iconSrc}
                  alt={game.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-2xl font-bold text-white/30">
                  {game.name.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div>
              <h2 className="text-xl font-bold text-primary">{game.name}</h2>
              <span className="px-2 py-0.5 rounded bg-white/10 text-xs text-muted">
                {getSourceDisplayName(game.source)}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 text-muted hover:text-primary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stats */}
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="glass-subtle rounded-lg p-4">
              <div className="flex items-center gap-2 text-muted mb-1">
                <Clock className="w-4 h-4" />
                <span className="text-sm">Total Playtime</span>
              </div>
              <p className="text-xl font-semibold text-primary">
                {formatPlaytime(game.total_playtime_seconds)}
              </p>
            </div>
            <div className="glass-subtle rounded-lg p-4">
              <div className="flex items-center gap-2 text-muted mb-1">
                <Calendar className="w-4 h-4" />
                <span className="text-sm">Last Played</span>
              </div>
              <p className="text-sm font-medium text-primary">
                {formatDate(game.last_played)}
              </p>
            </div>
          </div>

          {/* Paths */}
          <div className="space-y-2">
            <div className="glass-subtle rounded-lg p-3">
              <div className="flex items-center gap-2 text-muted mb-1">
                <FolderOpen className="w-4 h-4" />
                <span className="text-xs">Install Location</span>
              </div>
              <p className="text-xs text-secondary truncate" title={game.install_path}>
                {game.install_path}
              </p>
            </div>
          </div>

          {/* Added Date */}
          <p className="text-xs text-muted">
            Added to library: {formatDate(game.added_at)}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 p-6 border-t border-white/10">
          <button
            onClick={() => onLaunch(game.id)}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-white font-medium transition-colors"
          >
            <Play className="w-5 h-5" />
            Launch Game
          </button>
          <button
            onClick={() => onRemove(game.id)}
            className="p-3 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors"
            title="Remove from Library"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default GameDetailPanel;
