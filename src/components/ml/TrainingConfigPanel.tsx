import { Sliders, FolderPlus, X, FileAudio, Zap, Lock } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import type { UITrainingConfig } from '../../types/audioDetection';

interface TrainingConfigPanelProps {
  config: UITrainingConfig;
  onChange: (config: UITrainingConfig) => void;
  disabled?: boolean;
}

export function TrainingConfigPanel({ config, onChange, disabled }: TrainingConfigPanelProps) {
  const bulkPositiveFiles = config.bulk_positive_files || [];
  const bulkNegativeFiles = config.bulk_negative_files || [];
  const fineTune = config.fine_tune ?? true;
  const freezeLayers = config.freeze_layers ?? true;
  const unfreezeAfter = config.unfreeze_after ?? 5;

  async function handleAddBulkPositiveFiles() {
    const selected = await open({
      multiple: true,
      filters: [
        { name: 'Audio', extensions: ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac'] },
      ],
    });
    if (selected) {
      const files = Array.isArray(selected) ? selected : [selected];
      const newFiles = [...bulkPositiveFiles, ...files.filter(f => !bulkPositiveFiles.includes(f))];
      onChange({ ...config, bulk_positive_files: newFiles });
    }
  }

  function handleRemoveBulkPositiveFile(file: string) {
    onChange({ ...config, bulk_positive_files: bulkPositiveFiles.filter(f => f !== file) });
  }

  async function handleAddBulkNegativeFiles() {
    const selected = await open({
      multiple: true,
      filters: [
        { name: 'Audio', extensions: ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac'] },
      ],
    });
    if (selected) {
      const files = Array.isArray(selected) ? selected : [selected];
      const newFiles = [...bulkNegativeFiles, ...files.filter(f => !bulkNegativeFiles.includes(f))];
      onChange({ ...config, bulk_negative_files: newFiles });
    }
  }

  function handleRemoveBulkNegativeFile(file: string) {
    onChange({ ...config, bulk_negative_files: bulkNegativeFiles.filter(f => f !== file) });
  }

  function getFileName(path: string) {
    return path.split(/[/\\]/).pop() || path;
  }

  function handleFineTuneToggle(enabled: boolean) {
    // When toggling fine-tune, adjust defaults accordingly
    if (enabled) {
      onChange({
        ...config,
        fine_tune: true,
        epochs: 15,
        learning_rate: 0.0001,
        freeze_layers: true,
        unfreeze_after: 5,
      });
    } else {
      onChange({
        ...config,
        fine_tune: false,
        epochs: 30,
        learning_rate: 0.001,
        freeze_layers: false,
        unfreeze_after: 5,
      });
    }
  }

  return (
    <div className="p-4 rounded-lg glass-subtle space-y-4">
      <h4 className="font-medium mb-3 flex items-center gap-2">
        <Sliders size={16} />
        Training Configuration
      </h4>

      {/* Fine-tune Toggle */}
      <div className="p-3 rounded-lg bg-surface-secondary/50 border border-border">
        <label className="flex items-center justify-between cursor-pointer">
          <div className="flex items-center gap-2">
            <Zap size={16} className={fineTune ? 'text-purple-400' : 'text-text-muted'} />
            <div>
              <span className="font-medium">Fine-tune existing model</span>
              <p className="text-xs text-text-muted">
                {fineTune
                  ? 'Faster training, preserves learned features (recommended)'
                  : 'Train from scratch - slower but starts fresh'}
              </p>
            </div>
          </div>
          <div className="relative">
            <input
              type="checkbox"
              checked={fineTune}
              onChange={(e) => handleFineTuneToggle(e.target.checked)}
              disabled={disabled}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-surface-tertiary rounded-full peer peer-checked:bg-purple-500 transition-colors"></div>
            <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-5"></div>
          </div>
        </label>

        {/* Fine-tune options - only shown when fine-tune is enabled */}
        {fineTune && (
          <div className="mt-3 pt-3 border-t border-border/50 space-y-3">
            {/* Freeze Layers Toggle */}
            <label className="flex items-center justify-between cursor-pointer">
              <div className="flex items-center gap-2">
                <Lock size={14} className={freezeLayers ? 'text-blue-400' : 'text-text-muted'} />
                <div>
                  <span className="text-sm">Freeze early layers</span>
                  <p className="text-xs text-text-muted">Prevents forgetting basic audio patterns</p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={freezeLayers}
                onChange={(e) => onChange({ ...config, freeze_layers: e.target.checked })}
                disabled={disabled}
                className="w-4 h-4 rounded border-white/20 bg-white/10 text-purple-500 focus:ring-purple-500"
              />
            </label>

            {/* Unfreeze After - only shown when freeze layers is enabled */}
            {freezeLayers && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-[14px]"></div>
                  <div>
                    <span className="text-sm">Unfreeze after epoch</span>
                    <p className="text-xs text-text-muted">Gradually allow all layers to adapt</p>
                  </div>
                </div>
                <input
                  type="number"
                  min={1}
                  max={config.epochs - 1}
                  value={unfreezeAfter}
                  onChange={(e) => onChange({ ...config, unfreeze_after: parseInt(e.target.value) || 5 })}
                  disabled={disabled}
                  className="input text-sm w-20 text-center"
                />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-text-muted mb-1">Epochs</label>
          <input
            type="number"
            min={5}
            max={100}
            step={5}
            value={config.epochs}
            onChange={(e) => onChange({ ...config, epochs: parseInt(e.target.value) || (fineTune ? 15 : 30) })}
            disabled={disabled}
            className="input text-sm"
          />
          <p className="text-xs text-text-muted mt-1">
            {fineTune ? 'Fine-tuning needs fewer epochs (10-20)' : 'Training from scratch needs more epochs (30-100)'}
          </p>
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Learning Rate</label>
          <input
            type="number"
            min={0.0001}
            max={0.01}
            step={0.0001}
            value={config.learning_rate}
            onChange={(e) => onChange({ ...config, learning_rate: parseFloat(e.target.value) || (fineTune ? 0.0001 : 0.001) })}
            disabled={disabled}
            className="input text-sm"
          />
          <p className="text-xs text-text-muted mt-1">
            {fineTune ? 'Lower rate for fine-tuning (0.0001)' : 'Higher rate for training from scratch (0.001)'}
          </p>
        </div>
      </div>

      {/* Bulk Positive Files Section */}
      <div className="border-t border-border pt-4">
        <div className="flex items-center justify-between mb-2">
          <label className="block text-xs text-text-muted">
            Bulk Positive Audio Files
            <span className="text-text-muted/60 ml-1">(optional)</span>
          </label>
          <button
            onClick={handleAddBulkPositiveFiles}
            disabled={disabled}
            className="btn btn-sm btn-ghost flex items-center gap-1"
          >
            <FolderPlus size={14} />
            Add Files
          </button>
        </div>
        <p className="text-xs text-text-muted mb-2">
          Add full audio files that contain only target audio. They'll be automatically sliced into 1-second training samples.
        </p>

        {bulkPositiveFiles.length > 0 ? (
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {bulkPositiveFiles.map((file) => (
              <div
                key={file}
                className="flex items-center justify-between p-2 rounded bg-surface-secondary text-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileAudio size={14} className="text-green-400 shrink-0" />
                  <span className="truncate">{getFileName(file)}</span>
                </div>
                <button
                  onClick={() => handleRemoveBulkPositiveFile(file)}
                  disabled={disabled}
                  className="btn btn-ghost btn-xs p-1 text-text-muted hover:text-error"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-text-muted/60 italic">
            No bulk positive files added
          </div>
        )}
      </div>

      {/* Bulk Negative Files Section */}
      <div className="border-t border-border pt-4">
        <div className="flex items-center justify-between mb-2">
          <label className="block text-xs text-text-muted">
            Bulk Negative Audio Files
            <span className="text-text-muted/60 ml-1">(optional)</span>
          </label>
          <button
            onClick={handleAddBulkNegativeFiles}
            disabled={disabled}
            className="btn btn-sm btn-ghost flex items-center gap-1"
          >
            <FolderPlus size={14} />
            Add Files
          </button>
        </div>
        <p className="text-xs text-text-muted mb-2">
          Add full audio files that contain NO target audio (background noise, other sounds). They'll be automatically sliced into 1-second training samples.
        </p>

        {bulkNegativeFiles.length > 0 ? (
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {bulkNegativeFiles.map((file) => (
              <div
                key={file}
                className="flex items-center justify-between p-2 rounded bg-surface-secondary text-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileAudio size={14} className="text-red-400 shrink-0" />
                  <span className="truncate">{getFileName(file)}</span>
                </div>
                <button
                  onClick={() => handleRemoveBulkNegativeFile(file)}
                  disabled={disabled}
                  className="btn btn-ghost btn-xs p-1 text-text-muted hover:text-error"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-text-muted/60 italic">
            No bulk negative files added
          </div>
        )}
      </div>
    </div>
  );
}
