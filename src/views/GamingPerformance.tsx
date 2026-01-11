// Gaming Performance View
// Main view for the Gaming Performance Analyzer

import { useState, useEffect } from 'react';
import {
  Gauge,
  Play,
  Square,
  Settings,
  Trash2,
  Eye,
  X,
  Clock,
  Gamepad2,
  RefreshCw,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { useGamingData } from '../hooks/useGamingData';
import { BottleneckIndicator } from '../components/gaming/BottleneckIndicator';
import { SessionTimelineChart } from '../components/gaming/SessionTimelineChart';
import {
  GamingSession,
  GamingSessionData,
  GameEntry,
  BottleneckType,
} from '../types';

export default function GamingPerformance() {
  const {
    whitelist,
    addGame,
    removeGame,
    toggleGame,
    isDetecting,
    startDetection,
    stopDetection,
    activeSession,
    currentBottleneck,
    realtimeMetrics,
    endSession,
    sessions,
    loadSessions,
    getSessionDetails,
    deleteSession,
    isLoading,
    error,
  } = useGamingData();

  // Modal state
  const [showWhitelistModal, setShowWhitelistModal] = useState(false);
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedSessionData, setSelectedSessionData] = useState<GamingSessionData | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);

  // Add game form state
  const [newGameName, setNewGameName] = useState('');
  const [newGameProcess, setNewGameProcess] = useState('');
  const [addingGame, setAddingGame] = useState(false);

  // Calculate session duration
  const sessionDuration = activeSession
    ? Math.floor((Date.now() - new Date(activeSession.start_time).getTime()) / 1000)
    : 0;

  // Load session details when selected
  useEffect(() => {
    if (selectedSessionId) {
      setSessionLoading(true);
      getSessionDetails(selectedSessionId)
        .then((data) => {
          setSelectedSessionData(data);
          setShowSessionModal(true);
        })
        .catch(() => {
          setSelectedSessionData(null);
        })
        .finally(() => {
          setSessionLoading(false);
        });
    }
  }, [selectedSessionId, getSessionDetails]);

  // Handle toggle detection
  const handleToggleDetection = async () => {
    try {
      if (isDetecting) {
        await stopDetection();
      } else {
        await startDetection();
      }
    } catch (e) {
      console.error('Failed to toggle detection:', e);
    }
  };

  // Handle add game
  const handleAddGame = async () => {
    if (!newGameName.trim() || !newGameProcess.trim()) return;
    setAddingGame(true);
    try {
      await addGame({
        name: newGameName.trim(),
        process_name: newGameProcess.trim(),
        enabled: true,
      });
      setNewGameName('');
      setNewGameProcess('');
    } catch (e) {
      console.error('Failed to add game:', e);
    } finally {
      setAddingGame(false);
    }
  };

  // Handle delete session
  const handleDeleteSession = async (sessionId: string) => {
    if (window.confirm('Delete this session? This cannot be undone.')) {
      await deleteSession(sessionId);
    }
  };

  // Get enabled games count
  const enabledGamesCount = whitelist?.games.filter((g) => g.enabled).length || 0;

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Gauge className="w-6 h-6 text-accent" />
          <h1 className="text-xl font-semibold text-primary">Gaming Performance</h1>
        </div>
        <div className="flex items-center gap-3">
          {/* Detection toggle */}
          <button
            onClick={handleToggleDetection}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
              isDetecting
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'bg-white/5 text-secondary border border-white/10 hover:bg-white/10'
            }`}
          >
            <div
              className={`w-2 h-2 rounded-full ${
                isDetecting ? 'bg-green-400 animate-pulse' : 'bg-gray-500'
              }`}
            />
            {isDetecting ? 'Detection Active' : 'Detection Off'}
          </button>

          {/* Settings button */}
          <button
            onClick={() => setShowWhitelistModal(true)}
            className="p-2 rounded-lg bg-white/5 text-secondary hover:bg-white/10 border border-white/10 transition-all"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="p-4 rounded-lg bg-red-500/20 border border-red-500/30 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <span className="text-red-400">{error}</span>
        </div>
      )}

      {/* Active Session Panel */}
      <div className="glass-elevated rounded-lg p-6">
        {activeSession ? (
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-green-500/20">
                  <Gamepad2 className="w-8 h-8 text-green-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-primary">{activeSession.game_name}</h2>
                  <div className="flex items-center gap-4 text-sm text-secondary">
                    <span className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      Recording {formatDuration(sessionDuration)}
                    </span>
                    <span>Started {formatTime(activeSession.start_time)}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={endSession}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 transition-all"
              >
                <Square className="w-4 h-4" />
                End Session
              </button>
            </div>

            {/* Bottleneck Indicator */}
            <BottleneckIndicator status={currentBottleneck} />

            {/* Real-time chart */}
            <div>
              <h3 className="text-sm font-medium text-secondary mb-2">
                Real-time Metrics (5 min window)
              </h3>
              <SessionTimelineChart
                snapshots={realtimeMetrics}
                height={200}
                startTime={realtimeMetrics[0]?.timestamp}
              />
            </div>
          </div>
        ) : isDetecting ? (
          <div className="text-center py-8">
            <Loader2 className="w-8 h-8 text-accent animate-spin mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-primary mb-2">Waiting for game...</h2>
            <p className="text-sm text-secondary mb-4">
              Watching for: {whitelist?.games.filter((g) => g.enabled).slice(0, 3).map((g) => g.name).join(', ')}
              {enabledGamesCount > 3 && ` +${enabledGamesCount - 3} more`}
            </p>
            <button
              onClick={() => setShowWhitelistModal(true)}
              className="text-sm text-accent hover:underline"
            >
              Configure Games
            </button>
          </div>
        ) : (
          <div className="text-center py-8">
            <Gauge className="w-8 h-8 text-muted mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-primary mb-2">Detection is off</h2>
            <p className="text-sm text-secondary mb-4">
              Enable detection to automatically track gaming sessions
            </p>
            <button
              onClick={startDetection}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent/20 text-accent hover:bg-accent/30 border border-accent/30 transition-all mx-auto"
            >
              <Play className="w-4 h-4" />
              Start Detection
            </button>
          </div>
        )}
      </div>

      {/* Session History */}
      <div className="glass-elevated rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-primary">Session History</h2>
          <button
            onClick={loadSessions}
            disabled={isLoading}
            className="p-2 rounded-lg bg-white/5 text-secondary hover:bg-white/10 border border-white/10 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {isLoading ? (
          <div className="text-center py-8">
            <Loader2 className="w-6 h-6 text-accent animate-spin mx-auto" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-8 text-muted">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No gaming sessions recorded yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sessions.slice(0, 10).map((session, idx) => (
              <SessionHistoryItem
                key={session.id}
                session={session}
                onView={() => setSelectedSessionId(session.id)}
                onDelete={() => handleDeleteSession(session.id)}
                delay={idx * 50}
              />
            ))}
          </div>
        )}
      </div>

      {/* Whitelist Modal */}
      {showWhitelistModal && (
        <Modal onClose={() => setShowWhitelistModal(false)} title="Game Whitelist">
          <div className="space-y-4">
            {/* Add game form */}
            <div className="glass-subtle rounded-lg p-4">
              <h3 className="text-sm font-medium text-primary mb-3">Add Game</h3>
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Game name"
                  value={newGameName}
                  onChange={(e) => setNewGameName(e.target.value)}
                  className="input w-full"
                />
                <input
                  type="text"
                  placeholder="Process name"
                  value={newGameProcess}
                  onChange={(e) => setNewGameProcess(e.target.value)}
                  className="input w-full"
                />
                <button
                  onClick={handleAddGame}
                  disabled={addingGame || !newGameName.trim() || !newGameProcess.trim()}
                  className="btn btn-primary w-full"
                >
                  {addingGame ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'Add Game'
                  )}
                </button>
              </div>
            </div>

            {/* Game list */}
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {whitelist?.games.map((game) => (
                <GameListItem
                  key={game.process_name}
                  game={game}
                  onToggle={(enabled) => toggleGame(game.process_name, enabled)}
                  onDelete={() => removeGame(game.process_name)}
                />
              ))}
            </div>
          </div>
        </Modal>
      )}

      {/* Session Details Modal */}
      {showSessionModal && selectedSessionData && (
        <Modal
          onClose={() => {
            setShowSessionModal(false);
            setSelectedSessionId(null);
            setSelectedSessionData(null);
          }}
          title="Session Details"
          wide
        >
          <SessionDetailsContent data={selectedSessionData} />
        </Modal>
      )}

      {sessionLoading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Loader2 className="w-8 h-8 text-accent animate-spin" />
        </div>
      )}
    </div>
  );
}

// Session History Item
function SessionHistoryItem({
  session,
  onView,
  onDelete,
  delay,
}: {
  session: GamingSession;
  onView: () => void;
  onDelete: () => void;
  delay: number;
}) {
  const duration = session.summary?.duration_seconds || 0;
  const dominantBottleneck = session.summary?.dominant_bottleneck || 'balanced';

  return (
    <div
      className="flex items-center justify-between p-3 rounded-lg glass-subtle hover:bg-white/5 transition-all animate-slide-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center gap-4">
        <Gamepad2 className="w-5 h-5 text-accent" />
        <div>
          <span className="font-medium text-primary">{session.game_name}</span>
          <div className="flex items-center gap-3 text-xs text-muted">
            <span>{formatRelativeDate(session.start_time)}</span>
            <span>{formatDuration(duration)}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <BottleneckBadge type={dominantBottleneck} />
        <button
          onClick={onView}
          className="p-2 rounded-lg bg-white/5 text-secondary hover:bg-white/10 transition-all"
        >
          <Eye className="w-4 h-4" />
        </button>
        <button
          onClick={onDelete}
          className="p-2 rounded-lg bg-white/5 text-secondary hover:bg-red-500/20 hover:text-red-400 transition-all"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// Bottleneck Badge
function BottleneckBadge({ type }: { type: BottleneckType }) {
  const config: Record<BottleneckType, { label: string; color: string }> = {
    balanced: { label: 'Balanced', color: 'bg-green-500/20 text-green-400' },
    cpu_bound: { label: 'CPU', color: 'bg-red-500/20 text-red-400' },
    gpu_bound: { label: 'GPU', color: 'bg-orange-500/20 text-orange-400' },
    ram_limited: { label: 'RAM', color: 'bg-yellow-500/20 text-yellow-400' },
    vram_limited: { label: 'VRAM', color: 'bg-yellow-500/20 text-yellow-400' },
    cpu_thermal: { label: 'CPU Thermal', color: 'bg-red-600/20 text-red-500' },
    gpu_thermal: { label: 'GPU Thermal', color: 'bg-red-600/20 text-red-500' },
  };

  const { label, color } = config[type];
  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${color}`}>{label}</span>
  );
}

// Game List Item
function GameListItem({
  game,
  onToggle,
  onDelete,
}: {
  game: GameEntry;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg glass-subtle">
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={game.enabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="w-4 h-4 rounded border-white/20 bg-white/5 text-accent focus:ring-accent"
        />
        <div>
          <span className="text-primary">{game.name}</span>
          <p className="text-xs text-muted">{game.process_name}</p>
        </div>
      </div>
      <button
        onClick={onDelete}
        className="p-2 rounded-lg text-muted hover:text-red-400 hover:bg-red-500/20 transition-all"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

// Session Details Content
function SessionDetailsContent({ data }: { data: GamingSessionData }) {
  const { session, snapshots } = data;
  const summary = session.summary;

  return (
    <div className="space-y-4">
      {/* Session Info */}
      <div className="flex items-center gap-4">
        <Gamepad2 className="w-8 h-8 text-accent" />
        <div>
          <h2 className="text-lg font-semibold text-primary">{session.game_name}</h2>
          <p className="text-sm text-secondary">
            {formatRelativeDate(session.start_time)} &bull; {formatDuration(summary?.duration_seconds || 0)}
          </p>
        </div>
      </div>

      {/* Dominant Bottleneck */}
      {summary && (
        <div className="grid grid-cols-2 gap-4">
          <div className="glass-subtle rounded-lg p-4">
            <p className="text-xs text-muted mb-1">Dominant Bottleneck</p>
            <BottleneckBadge type={summary.dominant_bottleneck} />
          </div>
          <div className="glass-subtle rounded-lg p-4">
            <p className="text-xs text-muted mb-1">Bottleneck Events</p>
            <p className="text-lg font-semibold text-primary">{summary.total_bottleneck_events}</p>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      {summary && (
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="CPU Avg" value={`${summary.cpu.avg.toFixed(0)}%`} max={`${summary.cpu.max.toFixed(0)}%`} />
          {summary.gpu && (
            <StatCard label="GPU Avg" value={`${summary.gpu.avg.toFixed(0)}%`} max={`${summary.gpu.max.toFixed(0)}%`} />
          )}
          <StatCard label="RAM Avg" value={`${summary.ram.avg.toFixed(0)}%`} max={`${summary.ram.max.toFixed(0)}%`} />
        </div>
      )}

      {/* Timeline Chart */}
      <div>
        <h3 className="text-sm font-medium text-secondary mb-2">Session Timeline</h3>
        <SessionTimelineChart snapshots={snapshots} height={250} />
      </div>
    </div>
  );
}

// Stat Card
function StatCard({ label, value, max }: { label: string; value: string; max: string }) {
  return (
    <div className="glass-subtle rounded-lg p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-lg font-semibold text-primary">{value}</p>
      <p className="text-xs text-muted">Max: {max}</p>
    </div>
  );
}

// Modal Component
function Modal({
  onClose,
  title,
  children,
  wide = false,
}: {
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        className={`glass-elevated rounded-xl p-6 ${wide ? 'w-full max-w-2xl' : 'w-full max-w-md'} max-h-[90vh] overflow-y-auto`}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-primary">{title}</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-muted hover:text-primary hover:bg-white/5 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Utility functions
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `${hours}h ${remainingMins}m`;
}

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatRelativeDate(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return 'Today ' + formatTime(isoString);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString();
}
