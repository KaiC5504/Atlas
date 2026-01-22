import { useState, useEffect } from 'react';
import { Check, X, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import { AudioClipPlayer } from './AudioClipPlayer';
import { invoke } from '@tauri-apps/api/core';
import type { TimestampSegment } from '../../types/audioDetection';

interface FeedbackSegmentCardProps {
  segment: TimestampSegment;
  sourceFile: string;
  index: number;
  total: number;
  existingLabel?: 'correct' | 'wrong';
  onLabel: (label: 'correct' | 'wrong') => void;
  onUndo: () => void;
  isActive: boolean;
  onActivate: () => void;
  onAdvanceNext: () => void;
}

export function FeedbackSegmentCard({
  segment,
  sourceFile,
  index,
  total,
  existingLabel,
  onLabel,
  onUndo,
  isActive,
  onActivate,
  onAdvanceNext,
}: FeedbackSegmentCardProps) {
  const [audioBase64, setAudioBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load audio when card becomes active
  useEffect(() => {
    if (isActive && !audioBase64 && !loading) {
      loadAudio();
    }
  }, [isActive, audioBase64, loading]);

  // Keyboard shortcuts when active
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'c' || e.key === 'C') {
        handleLabel('correct');
      } else if (e.key === 'w' || e.key === 'W') {
        handleLabel('wrong');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive]);

  const loadAudio = async () => {
    setLoading(true);
    setError(null);
    try {
      const base64 = await invoke<string>('extract_audio_segment', {
        sourceFile,
        startSeconds: segment.start_seconds,
        endSeconds: segment.end_seconds,
      });
      setAudioBase64(base64);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleLabel = (label: 'correct' | 'wrong') => {
    onLabel(label);
    // Auto-advance to next segment after labeling
    setTimeout(() => {
      onAdvanceNext();
    }, 150); // Small delay for visual feedback
  };

  const duration = segment.end_seconds - segment.start_seconds;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const cs = Math.floor((seconds % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
  };

  return (
    <div
      className={`card transition-all cursor-pointer ${
        isActive ? 'border-purple-500/50 ring-1 ring-purple-500/20' : ''
      } ${existingLabel ? 'opacity-75' : ''}`}
      onClick={() => !isActive && onActivate()}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-muted">
            Segment {index + 1} of {total}
          </span>
          {existingLabel && (
            <>
              <span
                className={`px-2 py-0.5 rounded text-xs font-medium ${
                  existingLabel === 'correct'
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-red-500/20 text-red-400'
                }`}
              >
                {existingLabel === 'correct' ? 'Correct' : 'Wrong'}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onUndo();
                }}
                className="p-1 rounded hover:bg-white/10 text-text-muted hover:text-white"
                title="Undo label"
              >
                <RotateCcw size={14} />
              </button>
            </>
          )}
        </div>
        {isActive ? (
          <ChevronUp size={16} className="text-text-muted" />
        ) : (
          <ChevronDown size={16} className="text-text-muted" />
        )}
      </div>

      {isActive && (
        <div className="space-y-3 animate-fade-in">
          {loading && (
            <div className="h-12 flex items-center justify-center">
              <span className="text-text-muted">Loading audio...</span>
            </div>
          )}

          {error && (
            <div className="p-2 rounded bg-red-500/10 text-red-400 text-sm">
              {error}
              <button onClick={loadAudio} className="ml-2 underline">
                Retry
              </button>
            </div>
          )}

          {audioBase64 && <AudioClipPlayer audioBase64={audioBase64} duration={duration} autoPlay={true} />}

          <div className="flex items-center justify-between text-sm">
            <span className="font-mono text-green-400">
              {formatTime(segment.start_seconds)} - {formatTime(segment.end_seconds)}
            </span>
            <span className="text-text-muted">{(segment.confidence * 100).toFixed(1)}% confidence</span>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => handleLabel('correct')}
              className={`btn flex-1 ${
                existingLabel === 'correct'
                  ? 'bg-green-500/30 border-green-500/50 text-green-400'
                  : 'btn-secondary'
              }`}
            >
              <Check size={16} />
              Correct [C]
            </button>
            <button
              onClick={() => handleLabel('wrong')}
              className={`btn flex-1 ${
                existingLabel === 'wrong'
                  ? 'bg-red-500/30 border-red-500/50 text-red-400'
                  : 'btn-secondary'
              }`}
            >
              <X size={16} />
              Wrong [W]
            </button>
          </div>

          <p className="text-xs text-text-muted text-center">
            [Space] Play/Pause | [C] Correct | [W] Wrong | Auto-advances after labeling
          </p>
        </div>
      )}
    </div>
  );
}
