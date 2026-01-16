import React, { useState, useEffect, memo } from 'react';
import { Play, Clock } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { LibraryGame, formatPlaytime, getSourceDisplayName } from '../../types';

interface GameCardProps {
  game: LibraryGame;
  onLaunch: (gameId: string) => void;
  onClick: (game: LibraryGame) => void;
}

export const GameCard = memo(function GameCard({ game, onLaunch, onClick }: GameCardProps) {
  const [iconSrc, setIconSrc] = useState<string | null>(null);

  useEffect(() => {
    if (game.icon_path) {
      invoke<string>('get_icon_base64', { iconPath: game.icon_path })
        .then(setIconSrc)
        .catch(() => setIconSrc(null));
    }
  }, [game.icon_path]);

  const handleLaunch = (e: React.MouseEvent) => {
    e.stopPropagation();
    onLaunch(game.id);
  };

  return (
    <div
      className="group relative glass-subtle rounded-xl p-4 cursor-pointer hover:bg-white/10 transition-all duration-200 border border-white/10 hover:border-white/20"
      onClick={() => onClick(game)}
    >

      <div className="aspect-square rounded-lg bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center mb-3 overflow-hidden">
        {iconSrc ? (
          <img
            src={iconSrc}
            alt={game.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-4xl font-bold text-white/30">
            {game.name.charAt(0).toUpperCase()}
          </span>
        )}
      </div>

      <div className="space-y-1">
        <h3 className="font-semibold text-primary truncate" title={game.name}>
          {game.name}
        </h3>
        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="px-1.5 py-0.5 rounded bg-white/10">
            {getSourceDisplayName(game.source)}
          </span>
          {game.total_playtime_seconds > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatPlaytime(game.total_playtime_seconds)}
            </span>
          )}
        </div>
      </div>

      <div className="absolute inset-0 rounded-xl bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
        <button
          onClick={handleLaunch}
          className="p-3 rounded-full bg-cyan-500 hover:bg-cyan-400 text-white transition-colors"
          title="Launch Game"
        >
          <Play className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
});

export default GameCard;
