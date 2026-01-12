// Game Launcher View
// Main view for the Game Launcher module

import { useState } from 'react';
import {
  Library,
  Search,
  Plus,
  RefreshCw,
  Loader2,
  AlertCircle,
  Gamepad2,
  Clock,
  CheckCircle,
  ImageIcon,
} from 'lucide-react';
import { useGameLauncher } from '../hooks/useGameLauncher';
import { GameCard, GameDetailPanel, AddGameModal } from '../components/launcher';
import { DetectedGame, LibraryGame } from '../types';

export default function GameLauncher() {
  const {
    library,
    isLoading,
    isScanning,
    isRefreshingIcons,
    isTrackingPlaytime,
    error,
    loadLibrary,
    scanForGames,
    addDetectedGames,
    addManualGame,
    removeGame,
    launchGame,
    refreshIcons,
    startPlaytimeTracking,
    stopPlaytimeTracking,
  } = useGameLauncher();

  // Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showScanModal, setShowScanModal] = useState(false);
  const [selectedGame, setSelectedGame] = useState<LibraryGame | null>(null);
  const [detectedGames, setDetectedGames] = useState<DetectedGame[]>([]);
  const [selectedDetected, setSelectedDetected] = useState<Set<number>>(new Set());

  // Handle scan for games
  const handleScan = async () => {
    const games = await scanForGames();
    setDetectedGames(games);
    setSelectedDetected(new Set(games.map((_, i) => i)));
    setShowScanModal(true);
  };

  // Handle add selected detected games
  const handleAddDetected = async () => {
    const gamesToAdd = detectedGames.filter((_, i) => selectedDetected.has(i));
    if (gamesToAdd.length > 0) {
      await addDetectedGames(gamesToAdd);
    }
    setShowScanModal(false);
    setDetectedGames([]);
    setSelectedDetected(new Set());
  };

  // Toggle detected game selection
  const toggleDetectedSelection = (index: number) => {
    const newSelected = new Set(selectedDetected);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedDetected(newSelected);
  };

  // Handle remove game
  const handleRemoveGame = async (gameId: string) => {
    if (confirm('Remove this game from your library?')) {
      await removeGame(gameId);
      setSelectedGame(null);
    }
  };

  // Handle launch game
  const handleLaunchGame = async (gameId: string) => {
    await launchGame(gameId);
    setSelectedGame(null);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-cyan-500/20">
            <Library className="w-6 h-6 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-primary">Game Library</h1>
            <p className="text-sm text-muted">
              {library.games.length} game{library.games.length !== 1 ? 's' : ''} in library
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Playtime Tracking Toggle */}
          <button
            onClick={isTrackingPlaytime ? stopPlaytimeTracking : startPlaytimeTracking}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
              isTrackingPlaytime
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'bg-white/10 text-muted hover:bg-white/20'
            }`}
            title={isTrackingPlaytime ? 'Stop tracking playtime' : 'Start tracking playtime'}
          >
            <Clock className="w-4 h-4" />
            <span className="text-sm">
              {isTrackingPlaytime ? 'Tracking' : 'Track Time'}
            </span>
          </button>

          {/* Scan Button */}
          <button
            onClick={handleScan}
            disabled={isScanning}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-secondary transition-colors disabled:opacity-50"
          >
            {isScanning ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            <span>Scan</span>
          </button>

          {/* Add Game Button */}
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-white transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add Game</span>
          </button>

          {/* Refresh Icons Button */}
          <button
            onClick={refreshIcons}
            disabled={isRefreshingIcons || library.games.length === 0}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-secondary transition-colors disabled:opacity-50"
            title="Refresh HD icons"
          >
            {isRefreshingIcons ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ImageIcon className="w-4 h-4" />
            )}
          </button>

          {/* Refresh Button */}
          <button
            onClick={loadLibrary}
            disabled={isLoading}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-secondary transition-colors disabled:opacity-50"
            title="Refresh library"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mx-6 mt-4 p-4 rounded-lg bg-red-500/20 border border-red-500/30 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <span className="text-red-400">{error}</span>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {isLoading && library.games.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted">
            <Loader2 className="w-8 h-8 animate-spin mb-4" />
            <p>Loading library...</p>
          </div>
        ) : library.games.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted">
            <Gamepad2 className="w-16 h-16 mb-4 opacity-50" />
            <h2 className="text-lg font-semibold mb-2">No games in library</h2>
            <p className="text-sm mb-4">Scan for installed games or add them manually</p>
            <div className="flex gap-3">
              <button
                onClick={handleScan}
                disabled={isScanning}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
              >
                <Search className="w-4 h-4" />
                Scan for Games
              </button>
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-white transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Manually
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {library.games.map((game) => (
              <GameCard
                key={game.id}
                game={game}
                onLaunch={handleLaunchGame}
                onClick={setSelectedGame}
              />
            ))}
          </div>
        )}
      </div>

      {/* Game Detail Panel */}
      {selectedGame && (
        <GameDetailPanel
          game={selectedGame}
          onClose={() => setSelectedGame(null)}
          onLaunch={handleLaunchGame}
          onRemove={handleRemoveGame}
        />
      )}

      {/* Add Game Modal */}
      {showAddModal && (
        <AddGameModal
          onClose={() => setShowAddModal(false)}
          onAdd={addManualGame}
        />
      )}

      {/* Scan Results Modal */}
      {showScanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="glass rounded-2xl w-full max-w-2xl border border-white/20 shadow-2xl max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-cyan-500/20">
                  <Search className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-primary">Detected Games</h2>
                  <p className="text-sm text-muted">
                    {detectedGames.length} game{detectedGames.length !== 1 ? 's' : ''} found
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowScanModal(false)}
                className="p-2 rounded-lg hover:bg-white/10 text-muted hover:text-primary transition-colors"
              >
                <Plus className="w-5 h-5 rotate-45" />
              </button>
            </div>

            {/* Game List */}
            <div className="flex-1 overflow-auto p-4">
              {detectedGames.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted">
                  <Gamepad2 className="w-12 h-12 mb-4 opacity-50" />
                  <p>No new games detected</p>
                  <p className="text-sm">All installed games are already in your library</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {detectedGames.map((game, index) => (
                    <div
                      key={index}
                      onClick={() => toggleDetectedSelection(index)}
                      className={`flex items-center gap-4 p-4 rounded-lg cursor-pointer transition-colors ${
                        selectedDetected.has(index)
                          ? 'bg-cyan-500/20 border border-cyan-500/30'
                          : 'bg-white/5 border border-white/10 hover:bg-white/10'
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                          selectedDetected.has(index)
                            ? 'bg-cyan-500 border-cyan-500'
                            : 'border-white/30'
                        }`}
                      >
                        {selectedDetected.has(index) && (
                          <CheckCircle className="w-4 h-4 text-white" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-primary truncate">{game.name}</h3>
                        <p className="text-xs text-muted truncate">{game.install_path}</p>
                      </div>
                      <span className="px-2 py-1 rounded bg-white/10 text-xs text-muted">
                        {game.source === 'steam' ? 'Steam' : 'HoYoPlay'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            {detectedGames.length > 0 && (
              <div className="flex items-center justify-between p-6 border-t border-white/10">
                <button
                  onClick={() => {
                    if (selectedDetected.size === detectedGames.length) {
                      setSelectedDetected(new Set());
                    } else {
                      setSelectedDetected(new Set(detectedGames.map((_, i) => i)));
                    }
                  }}
                  className="text-sm text-muted hover:text-secondary transition-colors"
                >
                  {selectedDetected.size === detectedGames.length ? 'Deselect All' : 'Select All'}
                </button>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowScanModal(false)}
                    className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-secondary transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddDetected}
                    disabled={selectedDetected.size === 0}
                    className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:bg-cyan-500/50 disabled:cursor-not-allowed text-white transition-colors"
                  >
                    Add {selectedDetected.size} Game{selectedDetected.size !== 1 ? 's' : ''}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
