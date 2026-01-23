import { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  Sparkles,
  Save,
  Download,
  Loader2,
  CheckCircle,
  AlertCircle,
  FileAudio,
  Trash2,
  Play,
} from 'lucide-react';
import { FeedbackSegmentCard } from './FeedbackSegmentCard';
import { ManualSegmentMarker } from './ManualSegmentMarker';
import { TrainingConfigPanel } from './TrainingConfigPanel';
import { TrainingProgressPanel } from './TrainingProgressPanel';
import type {
  AudioDetectionJob,
  FeedbackSession,
  FeedbackSample,
  ManualSegment,
  UITrainingConfig,
  TrainingProgress,
} from '../../types/audioDetection';

interface EnhanceModelPanelProps {
  jobs: AudioDetectionJob[];
  onRefresh: () => void;
}

export function EnhanceModelPanel({ jobs, onRefresh }: EnhanceModelPanelProps) {
  // Session state
  const [feedbackSessions, setFeedbackSessions] = useState<FeedbackSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);

  // Feedback editing state
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(0);
  const [labeledSamples, setLabeledSamples] = useState<Map<number, 'correct' | 'wrong'>>(new Map());
  const [manualSegments, setManualSegments] = useState<Omit<ManualSegment, 'id' | 'created_at'>[]>([]);
  const [saving, setSaving] = useState(false);

  // Training state - defaults to fine-tuning mode
  const [trainingConfig, setTrainingConfig] = useState<UITrainingConfig>({
    epochs: 15,
    learning_rate: 0.0001,
    bulk_positive_files: [],
    bulk_negative_files: [],
    fine_tune: true,
    freeze_layers: true,
    unfreeze_after: 5,
  });
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());
  const [isTraining, setIsTraining] = useState(false);
  const [trainingProgress, setTrainingProgress] = useState<TrainingProgress | null>(null);
  const [trainingError, setTrainingError] = useState<string | null>(null);

  // Get completed jobs with results
  const completedJobs = useMemo(
    () => jobs.filter((job) => job.status === 'completed' && job.result && job.result.segments.length > 0),
    [jobs]
  );

  // Get selected job
  const selectedJob = useMemo(
    () => completedJobs.find((job) => job.id === selectedJobId),
    [completedJobs, selectedJobId]
  );

  // Load feedback sessions
  useEffect(() => {
    loadFeedbackSessions();
  }, []);

  // Listen for training events
  useEffect(() => {
    const unlistenProgress = listen<{ percent: number; stage: string }>(
      'model-training-progress',
      (event) => {
        setTrainingProgress((prev) => ({
          ...prev,
          percent: event.payload.percent,
          stage: event.payload.stage,
          epoch: 0,
          total_epochs: trainingConfig.epochs,
          metrics: prev?.metrics || null,
        }));
      }
    );

    const unlistenComplete = listen<{ success: boolean; data: unknown }>(
      'model-training-complete',
      () => {
        setIsTraining(false);
        loadFeedbackSessions();
        onRefresh();
      }
    );

    const unlistenError = listen<{ error: string }>('model-training-error', (event) => {
      setIsTraining(false);
      setTrainingError(event.payload.error);
    });

    return () => {
      unlistenProgress.then((fn) => fn());
      unlistenComplete.then((fn) => fn());
      unlistenError.then((fn) => fn());
    };
  }, [trainingConfig.epochs, onRefresh]);

  async function loadFeedbackSessions() {
    try {
      setLoadingSessions(true);
      const sessions = await invoke<FeedbackSession[]>('list_feedback_sessions');
      setFeedbackSessions(sessions);
      // Auto-select all sessions for training
      setSelectedSessionIds(new Set(sessions.map((s) => s.id)));
    } catch (err) {
      console.error('Failed to load feedback sessions:', err);
    } finally {
      setLoadingSessions(false);
    }
  }

  function handleSelectJob(jobId: string) {
    setSelectedJobId(jobId);
    setActiveSegmentIndex(0);
    setLabeledSamples(new Map());
    setManualSegments([]);
  }

  function handleLabel(segmentIndex: number, label: 'correct' | 'wrong') {
    setLabeledSamples((prev) => {
      const next = new Map(prev);
      next.set(segmentIndex, label);
      return next;
    });
  }

  function handleUndoLabel(segmentIndex: number) {
    setLabeledSamples((prev) => {
      const next = new Map(prev);
      next.delete(segmentIndex);
      return next;
    });
  }

  function handleAdvanceNext() {
    if (!selectedJob?.result) return;
    const nextIndex = activeSegmentIndex + 1;
    if (nextIndex < selectedJob.result.segments.length) {
      setActiveSegmentIndex(nextIndex);
    }
  }

  function handleAddManualSegment(segment: Omit<ManualSegment, 'id' | 'created_at'>) {
    setManualSegments((prev) => [...prev, segment]);
  }

  async function handleSaveFeedback() {
    if (!selectedJob?.result) return;

    try {
      setSaving(true);

      const samples: FeedbackSample[] = [];
      labeledSamples.forEach((label, index) => {
        const segment = selectedJob.result!.segments[index];
        samples.push({
          id: crypto.randomUUID(),
          source_file: selectedJob.input_file,
          start_seconds: segment.start_seconds,
          end_seconds: segment.end_seconds,
          original_confidence: segment.confidence,
          user_label: label,
          is_manual: false,
          created_at: new Date().toISOString(),
        });
      });

      const manualPositives: ManualSegment[] = manualSegments.map((seg) => ({
        id: crypto.randomUUID(),
        start_seconds: seg.start_seconds,
        end_seconds: seg.end_seconds,
        created_at: new Date().toISOString(),
      }));

      const session: FeedbackSession = {
        id: crypto.randomUUID(),
        source_file: selectedJob.input_file,
        job_id: selectedJob.id,
        model_version: selectedJob.result!.model_version,
        samples,
        manual_positives: manualPositives,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await invoke('save_feedback_session', { session });
      await loadFeedbackSessions();

      // Reset editing state
      setSelectedJobId(null);
      setLabeledSamples(new Map());
      setManualSegments([]);
      setActiveSegmentIndex(0);
    } catch (err) {
      alert(`Failed to save feedback: ${err}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteSession(sessionId: string) {
    try {
      await invoke('delete_feedback_session', { sessionId });
      await loadFeedbackSessions();
    } catch (err) {
      alert(`Failed to delete session: ${err}`);
    }
  }

  function toggleSessionSelection(sessionId: string) {
    setSelectedSessionIds((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  }

  async function handleStartTraining() {
    if (selectedSessionIds.size === 0) {
      alert('Please select at least one feedback session');
      return;
    }

    try {
      setIsTraining(true);
      setTrainingError(null);
      setTrainingProgress({
        percent: 0,
        epoch: 0,
        total_epochs: trainingConfig.epochs,
        stage: 'Initializing...',
        metrics: null,
      });

      await invoke('start_model_training', {
        sessionIds: Array.from(selectedSessionIds),
        config: trainingConfig,
      });
    } catch (err) {
      setIsTraining(false);
      setTrainingError(String(err));
    }
  }

  function exportFeedbackAsJson() {
    const selectedSessions = feedbackSessions.filter((s) => selectedSessionIds.has(s.id));
    const blob = new Blob([JSON.stringify(selectedSessions, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'feedback_sessions.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalSamples = useMemo(() => {
    return feedbackSessions
      .filter((s) => selectedSessionIds.has(s.id))
      .reduce((acc, s) => acc + s.samples.length + s.manual_positives.length, 0);
  }, [feedbackSessions, selectedSessionIds]);

  const getFileName = (path: string) => path.split(/[/\\]/).pop() || path;

  return (
    <div className="space-y-6">
      {/* Mode Header */}
      <div className="flex items-center gap-3 p-4 rounded-lg glass-subtle border border-purple-500/30">
        <Sparkles className="w-5 h-5 text-purple-400" />
        <div>
          <h3 className="font-medium text-white">Enhance Model Mode</h3>
          <p className="text-sm text-text-muted">
            Review detections, label feedback, and retrain the model
          </p>
        </div>
      </div>

      {/* Feedback Collection Section */}
      {!selectedJobId ? (
        <div className="card">
          <h3 className="card-title mb-4 flex items-center gap-2">
            <FileAudio size={18} />
            Select a Completed Job to Review
          </h3>

          {completedJobs.length === 0 ? (
            <div className="text-center py-8 text-text-muted">
              <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No completed detection jobs with results available.</p>
              <p className="text-sm">Run a detection job first to start collecting feedback.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {completedJobs.map((job) => (
                <button
                  key={job.id}
                  onClick={() => handleSelectJob(job.id)}
                  className="w-full p-3 rounded-lg glass-subtle hover:bg-white/5 transition-colors flex items-center justify-between text-left"
                >
                  <div className="flex items-center gap-3">
                    <FileAudio size={16} className="text-text-muted" />
                    <div>
                      <p className="font-medium text-white">{getFileName(job.input_file)}</p>
                      <p className="text-xs text-text-muted">
                        {job.result!.segments.length} segments detected
                      </p>
                    </div>
                  </div>
                  <Play size={16} className="text-purple-400" />
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="card-title flex items-center gap-2">
              <Sparkles size={18} className="text-purple-400" />
              Feedback Session: {selectedJob && getFileName(selectedJob.input_file)}
            </h3>
            <button onClick={() => setSelectedJobId(null)} className="btn btn-secondary btn-sm">
              Back to Jobs
            </button>
          </div>

          {/* Segment Cards */}
          {selectedJob?.result && (
            <div className="space-y-3 mb-4">
              {selectedJob.result.segments.map((segment, index) => (
                <FeedbackSegmentCard
                  key={index}
                  segment={segment}
                  sourceFile={selectedJob.input_file}
                  index={index}
                  total={selectedJob.result!.segments.length}
                  existingLabel={labeledSamples.get(index)}
                  onLabel={(label) => handleLabel(index, label)}
                  onUndo={() => handleUndoLabel(index)}
                  isActive={activeSegmentIndex === index}
                  onActivate={() => setActiveSegmentIndex(index)}
                  onAdvanceNext={handleAdvanceNext}
                />
              ))}

              {/* Manual Segment Marker */}
              <ManualSegmentMarker
                totalDuration={selectedJob.result.total_duration_seconds}
                onAddSegment={handleAddManualSegment}
              />

              {/* Show manual segments */}
              {manualSegments.length > 0 && (
                <div className="p-3 rounded-lg glass-subtle">
                  <h4 className="text-sm font-medium mb-2">Manual Segments Added:</h4>
                  {manualSegments.map((seg, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm text-green-400">
                      <span>+</span>
                      <span className="font-mono">
                        {seg.start_seconds.toFixed(2)}s - {seg.end_seconds.toFixed(2)}s
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Progress Summary */}
          <div className="flex items-center justify-between p-3 rounded-lg glass-subtle mb-4">
            <span className="text-sm text-text-muted">
              Session Progress: {labeledSamples.size}/{selectedJob?.result?.segments.length || 0} labeled
              {manualSegments.length > 0 && ` | ${manualSegments.length} manually added`}
            </span>
          </div>

          {/* Save Button */}
          <div className="flex gap-2">
            <button
              onClick={handleSaveFeedback}
              disabled={saving || (labeledSamples.size === 0 && manualSegments.length === 0)}
              className="btn btn-primary"
            >
              {saving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save size={16} />
                  Save Feedback
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Existing Feedback Sessions */}
      <div className="card">
        <h3 className="card-title mb-4 flex items-center gap-2">
          <CheckCircle size={18} />
          Saved Feedback Sessions
        </h3>

        {loadingSessions ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={24} className="animate-spin text-purple-400" />
          </div>
        ) : feedbackSessions.length === 0 ? (
          <p className="text-text-muted text-center py-8">No feedback sessions saved yet.</p>
        ) : (
          <div className="space-y-2">
            {feedbackSessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center gap-3 p-3 rounded-lg glass-subtle"
              >
                <input
                  type="checkbox"
                  checked={selectedSessionIds.has(session.id)}
                  onChange={() => toggleSessionSelection(session.id)}
                  className="w-4 h-4 rounded border-white/20 bg-white/10"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white truncate">{getFileName(session.source_file)}</p>
                  <p className="text-xs text-text-muted">
                    {session.samples.length} labeled + {session.manual_positives.length} manual
                  </p>
                </div>
                <button
                  onClick={() => handleDeleteSession(session.id)}
                  className="p-1 rounded hover:bg-white/10 text-text-muted hover:text-red-400"
                  title="Delete session"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {feedbackSessions.length > 0 && (
          <div className="mt-4 flex gap-2">
            <button onClick={exportFeedbackAsJson} className="btn btn-secondary btn-sm">
              <Download size={14} />
              Export as JSON
            </button>
          </div>
        )}
      </div>

      {/* Training Section */}
      <div className="card">
        <h3 className="card-title mb-4 flex items-center gap-2">
          <Sparkles size={18} className="text-purple-400" />
          Retrain Model
        </h3>

        {feedbackSessions.length === 0 ? (
          <p className="text-text-muted">Save feedback sessions first to enable retraining.</p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-text-muted">
              Selected: {selectedSessionIds.size} session(s) with {totalSamples} total samples
            </p>

            <TrainingConfigPanel
              config={trainingConfig}
              onChange={setTrainingConfig}
              disabled={isTraining}
            />

            {trainingError && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-2">
                <AlertCircle size={16} />
                {trainingError}
              </div>
            )}

            <TrainingProgressPanel
              progress={trainingProgress}
              isTraining={isTraining}
              onCancel={() => setIsTraining(false)}
            />

            {!isTraining && (
              <button
                onClick={handleStartTraining}
                disabled={selectedSessionIds.size === 0 || totalSamples < 2}
                className="btn btn-primary"
              >
                <Sparkles size={16} />
                Retrain Model with Selected Feedback
              </button>
            )}

            {totalSamples < 2 && totalSamples > 0 && (
              <p className="text-xs text-amber-400">Need at least 2 samples to train</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
