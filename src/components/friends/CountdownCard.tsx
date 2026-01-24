import { useState, useEffect } from 'react';
import { Clock, Trash2 } from 'lucide-react';
import type { Memory } from '../../types/friends';
import { formatCountdown } from '../../types/friends';

interface CountdownCardProps {
  memory: Memory;
  onDelete?: () => void;
  showDelete?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function CountdownCard({
  memory,
  onDelete,
  showDelete = true,
  size = 'md',
}: CountdownCardProps) {
  const [countdown, setCountdown] = useState(() =>
    memory.target_date ? formatCountdown(memory.target_date) : null
  );

  // Update countdown every minute
  useEffect(() => {
    if (!memory.target_date) return;

    const interval = setInterval(() => {
      setCountdown(formatCountdown(memory.target_date!));
    }, 60000);

    return () => clearInterval(interval);
  }, [memory.target_date]);

  if (!memory.target_date || !countdown) return null;

  const sizeClasses = {
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6',
  };

  const titleClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  const numberClasses = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-4xl',
  };

  return (
    <div
      className={`glass-elevated rounded-xl ${sizeClasses[size]} relative group transition-all hover:scale-[1.02]`}
    >
      {showDelete && onDelete && (
        <button
          onClick={onDelete}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-500/20 rounded"
        >
          <Trash2 className="w-4 h-4 text-red-400" />
        </button>
      )}

      <div className="flex items-center gap-2 mb-2">
        <Clock className={`${size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} text-indigo-400`} />
        <span className={`${titleClasses[size]} text-text-secondary font-medium`}>
          {memory.content_text}
        </span>
      </div>

      {countdown.isPast ? (
        <div className={`${numberClasses[size]} font-bold text-text-tertiary`}>
          Passed
        </div>
      ) : (
        <>
          <div className={`${numberClasses[size]} font-bold text-indigo-400`}>
            {countdown.days > 0
              ? `${countdown.days}d ${countdown.hours}h`
              : countdown.hours > 0
              ? `${countdown.hours}h ${countdown.minutes}m`
              : `${countdown.minutes}m`}
          </div>
          <div className="flex gap-4 mt-2 text-text-tertiary">
            <div className="text-center">
              <div className={`font-bold ${size === 'sm' ? 'text-sm' : 'text-lg'}`}>
                {countdown.days}
              </div>
              <div className="text-xs">days</div>
            </div>
            <div className="text-center">
              <div className={`font-bold ${size === 'sm' ? 'text-sm' : 'text-lg'}`}>
                {countdown.hours}
              </div>
              <div className="text-xs">hrs</div>
            </div>
            <div className="text-center">
              <div className={`font-bold ${size === 'sm' ? 'text-sm' : 'text-lg'}`}>
                {countdown.minutes}
              </div>
              <div className="text-xs">min</div>
            </div>
          </div>
        </>
      )}

      {memory.caption && (
        <div className="text-xs text-text-tertiary mt-2 italic">
          {memory.caption}
        </div>
      )}
    </div>
  );
}

interface MiniCountdownProps {
  targetDate: number;
  title?: string;
}

export function MiniCountdown({ targetDate, title }: MiniCountdownProps) {
  const [countdown, setCountdown] = useState(() => formatCountdown(targetDate));

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(formatCountdown(targetDate));
    }, 60000);

    return () => clearInterval(interval);
  }, [targetDate]);

  if (countdown.isPast) {
    return (
      <span className="text-text-tertiary">
        {title && `${title}: `}Passed
      </span>
    );
  }

  return (
    <span className="text-indigo-400">
      {title && <span className="text-text-secondary">{title}: </span>}
      {countdown.days}d {countdown.hours}h {countdown.minutes}m
    </span>
  );
}
