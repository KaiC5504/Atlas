import { Music, Clock, User } from 'lucide-react';
import type { TrackMetadata } from '../../types';

interface TrackItemProps {
  trackId: string;
  track: TrackMetadata;
  selected: boolean;
  onToggle: (id: string) => void;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function TrackItem({ trackId, track, selected, onToggle }: TrackItemProps) {
  return (
    <div
      className={`flex items-center gap-4 p-3 rounded-lg border transition-all cursor-pointer ${
        selected
          ? 'bg-purple-500/10 border-purple-500/30'
          : 'bg-white/5 border-white/10 hover:bg-white/10'
      }`}
      onClick={() => onToggle(trackId)}
    >
      {/* Checkbox */}
      <div
        className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-colors ${
          selected
            ? 'bg-purple-500 border-purple-500'
            : 'border-white/30 hover:border-purple-400'
        }`}
      >
        {selected && (
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>

      {/* Thumbnail */}
      {track.thumbnail ? (
        <img
          src={track.thumbnail}
          alt={track.title}
          className="w-12 h-12 rounded object-cover"
        />
      ) : (
        <div className="w-12 h-12 rounded bg-white/10 flex items-center justify-center">
          <Music className="w-5 h-5 text-muted" />
        </div>
      )}

      {/* Track info */}
      <div className="flex-1 min-w-0">
        <h4 className="text-primary font-medium truncate" title={track.title}>
          {track.title}
        </h4>
        <div className="flex items-center gap-3 text-sm text-muted">
          <span className="flex items-center gap-1 truncate">
            <User className="w-3 h-3" />
            {track.artist || 'Unknown'}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDuration(track.duration)}
          </span>
        </div>
      </div>

      {/* ID badge */}
      <div className="hidden sm:block">
        <span className="px-2 py-1 rounded bg-white/5 text-xs text-muted font-mono">
          {trackId.slice(0, 8)}...
        </span>
      </div>
    </div>
  );
}

export default TrackItem;
