import { useState } from 'react';
import { Plus, Clock, Check, X } from 'lucide-react';
import type { ManualSegment } from '../../types/audioDetection';

interface ManualSegmentMarkerProps {
  totalDuration: number;
  onAddSegment: (segment: Omit<ManualSegment, 'id' | 'created_at'>) => void;
}

export function ManualSegmentMarker({ totalDuration, onAddSegment }: ManualSegmentMarkerProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [error, setError] = useState<string | null>(null);

  const parseTime = (timeStr: string): number | null => {
    // Accept formats: "1:30", "1:30.5", "90", "90.5"
    const colonMatch = timeStr.match(/^(\d+):(\d+)(?:\.(\d+))?$/);
    if (colonMatch) {
      const mins = parseInt(colonMatch[1]);
      const secs = parseInt(colonMatch[2]);
      const ms = colonMatch[3] ? parseInt(colonMatch[3].padEnd(2, '0')) / 100 : 0;
      return mins * 60 + secs + ms;
    }

    const numMatch = timeStr.match(/^(\d+(?:\.\d+)?)$/);
    if (numMatch) {
      return parseFloat(numMatch[1]);
    }

    return null;
  };

  const handleSubmit = () => {
    const start = parseTime(startTime);
    const end = parseTime(endTime);

    if (start === null || end === null) {
      setError('Invalid time format. Use "1:30" or "90" (seconds)');
      return;
    }

    if (start >= end) {
      setError('Start time must be before end time');
      return;
    }

    if (start < 0) {
      setError('Start time cannot be negative');
      return;
    }

    if (end > totalDuration) {
      setError(`End time exceeds audio duration (${totalDuration.toFixed(1)}s)`);
      return;
    }

    onAddSegment({ start_seconds: start, end_seconds: end });
    setIsAdding(false);
    setStartTime('');
    setEndTime('');
    setError(null);
  };

  const handleCancel = () => {
    setIsAdding(false);
    setStartTime('');
    setEndTime('');
    setError(null);
  };

  if (!isAdding) {
    return (
      <button
        onClick={() => setIsAdding(true)}
        className="w-full p-4 border-2 border-dashed border-white/20 rounded-lg hover:border-purple-500/50 hover:bg-purple-500/5 transition-colors flex items-center justify-center gap-2 text-text-muted hover:text-white"
      >
        <Plus size={20} />
        <span>Add Missed Detection (False Negative)</span>
      </button>
    );
  }

  return (
    <div className="card border-purple-500/30">
      <h4 className="font-medium mb-3 flex items-center gap-2">
        <Clock size={16} />
        Mark Missed Detection
      </h4>
      <p className="text-sm text-text-muted mb-4">
        Enter the timestamp range for a sound the model should have detected but missed.
      </p>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs text-text-muted mb-1">Start Time</label>
          <input
            type="text"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            placeholder="e.g. 1:30 or 90"
            className="input text-sm"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">End Time</label>
          <input
            type="text"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            placeholder="e.g. 1:35 or 95"
            className="input text-sm"
          />
        </div>
      </div>

      {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

      <div className="flex gap-2">
        <button onClick={handleSubmit} className="btn btn-primary flex-1">
          <Check size={16} />
          Add Segment
        </button>
        <button onClick={handleCancel} className="btn btn-secondary">
          <X size={16} />
          Cancel
        </button>
      </div>
    </div>
  );
}
