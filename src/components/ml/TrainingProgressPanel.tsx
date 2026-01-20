import { Loader2, XCircle, CheckCircle } from 'lucide-react';
import type { TrainingProgress } from '../../types/audioDetection';

interface TrainingProgressPanelProps {
  progress: TrainingProgress | null;
  isTraining: boolean;
  onCancel?: () => void;
}

export function TrainingProgressPanel({ progress, isTraining, onCancel }: TrainingProgressPanelProps) {
  if (!isTraining && !progress) return null;

  return (
    <div className="card border-purple-500/30">
      <h3 className="card-title mb-4 flex items-center gap-2">
        {isTraining ? (
          <Loader2 size={18} className="animate-spin text-purple-400" />
        ) : (
          <CheckCircle size={18} className="text-green-400" />
        )}
        {isTraining ? 'Training in Progress' : 'Training Complete'}
      </h3>

      {progress && (
        <div className="space-y-4">
          {/* Progress bar */}
          <div>
            <div className="h-3 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-purple-400 transition-all duration-300"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <div className="flex justify-between mt-2 text-sm">
              <span className="text-text-muted">{progress.stage}</span>
              <span className="font-medium">{progress.percent}%</span>
            </div>
          </div>

          {/* Metrics grid */}
          {progress.metrics && (
            <div className="grid grid-cols-4 gap-3 p-3 rounded-lg glass-subtle">
              <div className="text-center">
                <div className="text-xs text-text-muted">F1 Score</div>
                <div className="text-lg font-semibold text-green-400">
                  {(progress.metrics.val_f1 * 100).toFixed(1)}%
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-text-muted">Accuracy</div>
                <div className="text-lg font-semibold text-blue-400">
                  {(progress.metrics.val_accuracy * 100).toFixed(1)}%
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-text-muted">Train Loss</div>
                <div className="text-lg font-semibold text-white">{progress.metrics.train_loss.toFixed(4)}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-text-muted">Val Loss</div>
                <div className="text-lg font-semibold text-white">{progress.metrics.val_loss.toFixed(4)}</div>
              </div>
            </div>
          )}

          {/* Cancel button */}
          {isTraining && onCancel && (
            <button onClick={onCancel} className="btn btn-secondary w-full text-red-400 hover:text-red-300">
              <XCircle size={16} />
              Cancel Training
            </button>
          )}
        </div>
      )}
    </div>
  );
}
