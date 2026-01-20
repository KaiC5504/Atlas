import { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, Volume2 } from 'lucide-react';

interface AudioClipPlayerProps {
  audioBase64: string;
  duration: number;
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
  autoPlay?: boolean;
}

export function AudioClipPlayer({
  audioBase64,
  duration,
  onPlay,
  onPause,
  onEnded,
  autoPlay = false,
}: AudioClipPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      onEnded?.();
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
    };
  }, [onEnded]);

  useEffect(() => {
    if (autoPlay && audioRef.current) {
      audioRef.current.play().catch(() => {
        // Autoplay may fail due to browser restrictions
      });
    }
  }, [autoPlay, audioBase64]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      onPause?.();
    } else {
      audio.play();
      onPlay?.();
    }
  }, [isPlaying, onPlay, onPause]);

  // Handle keyboard shortcut for space to play/pause
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === ' ') {
        e.preventDefault();
        togglePlay();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const newTime = (clickX / rect.width) * duration;
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg glass-subtle">
      <audio ref={audioRef} src={`data:audio/wav;base64,${audioBase64}`} />

      <button
        onClick={togglePlay}
        className="p-2 rounded-full bg-purple-500/20 hover:bg-purple-500/30 transition-colors"
        title={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? (
          <Pause size={20} className="text-purple-400" />
        ) : (
          <Play size={20} className="text-purple-400" />
        )}
      </button>

      <div
        className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden cursor-pointer"
        onClick={handleProgressClick}
      >
        <div
          className="h-full bg-purple-500 transition-all duration-100"
          style={{ width: `${progress}%` }}
        />
      </div>

      <span className="text-xs text-text-muted font-mono min-w-[80px] text-right">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>

      <Volume2 size={16} className="text-text-muted" />
    </div>
  );
}
