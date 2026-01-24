import { Gamepad2 } from 'lucide-react';
import type { PresenceStatus } from '../../types/friends';
import { getPresenceStatusColor, getPresenceStatusText } from '../../types/friends';

interface PresenceIndicatorProps {
  status: PresenceStatus;
  currentGame?: string | null;
  showText?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function PresenceIndicator({
  status,
  currentGame,
  showText = false,
  size = 'md',
}: PresenceIndicatorProps) {
  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
    lg: 'w-4 h-4',
  };

  const textSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  return (
    <div className="flex items-center gap-2">
      <div
        className={`${sizeClasses[size]} rounded-full ${getPresenceStatusColor(status)}`}
        title={getPresenceStatusText(status)}
      />
      {showText && (
        <span className={`${textSizeClasses[size]} text-text-secondary`}>
          {status === 'in_game' && currentGame ? (
            <span className="flex items-center gap-1 text-purple-400">
              <Gamepad2 className="w-3 h-3" />
              {currentGame}
            </span>
          ) : (
            getPresenceStatusText(status)
          )}
        </span>
      )}
    </div>
  );
}

interface PresenceBadgeProps {
  status: PresenceStatus;
  currentGame?: string | null;
}

export function PresenceBadge({ status, currentGame }: PresenceBadgeProps) {
  const getBadgeStyles = () => {
    switch (status) {
      case 'online':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'away':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'in_game':
        return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      case 'offline':
      default:
        return 'bg-white/10 text-text-muted border-white/10';
    }
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs border ${getBadgeStyles()}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${getPresenceStatusColor(status)}`} />
      {status === 'in_game' && currentGame ? currentGame : getPresenceStatusText(status)}
    </span>
  );
}
