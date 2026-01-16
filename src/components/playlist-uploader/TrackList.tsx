import { useState, useMemo } from 'react';
import { Search, CheckSquare, Square, Music } from 'lucide-react';
import { TrackItem } from './TrackItem';
import { CustomSelect } from '../ui';
import type { MusicIndex } from '../../types';

interface TrackListProps {
  index: MusicIndex;
  selectedTracks: string[];
  onSelectionChange: (trackIds: string[]) => void;
  playlistFilter?: string;
  playlists: string[];
  onPlaylistFilterChange: (playlist: string) => void;
}

export function TrackList({
  index,
  selectedTracks,
  onSelectionChange,
  playlistFilter = '',
  playlists,
  onPlaylistFilterChange,
}: TrackListProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Convert index to array of [trackId, track] pairs
  const tracks = useMemo(() => {
    return Object.entries(index);
  }, [index]);

  const filteredTracks = useMemo(() => {
    let result = tracks;

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        ([, track]) =>
          track.title.toLowerCase().includes(query) ||
          track.artist.toLowerCase().includes(query) ||
          track.titlePinyin.toLowerCase().includes(query) ||
          track.artistPinyin.toLowerCase().includes(query) ||
          track.searchTerms.some((term) => term.toLowerCase().includes(query))
      );
    }

    return result.sort(([, a], [, b]) => a.title.localeCompare(b.title));
  }, [tracks, searchQuery]);

  const handleToggle = (id: string) => {
    if (selectedTracks.includes(id)) {
      onSelectionChange(selectedTracks.filter((t) => t !== id));
    } else {
      onSelectionChange([...selectedTracks, id]);
    }
  };

  const handleSelectAll = () => {
    const allIds = filteredTracks.map(([trackId]) => trackId);
    onSelectionChange(allIds);
  };

  const handleDeselectAll = () => {
    onSelectionChange([]);
  };

  const allSelected = filteredTracks.length > 0 &&
    filteredTracks.every(([trackId]) => selectedTracks.includes(trackId));

  return (
    <div className="glass-subtle rounded-xl border border-white/10 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-white/10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Music className="w-5 h-5 text-purple-400" />
            <h3 className="text-lg font-semibold text-primary">Local Tracks</h3>
            <span className="px-2 py-0.5 rounded-full bg-white/10 text-xs text-muted">
              {tracks.length} total
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={allSelected ? handleDeselectAll : handleSelectAll}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-secondary text-sm transition-colors"
            >
              {allSelected ? (
                <>
                  <Square className="w-4 h-4" />
                  Deselect All
                </>
              ) : (
                <>
                  <CheckSquare className="w-4 h-4" />
                  Select All
                </>
              )}
            </button>
          </div>
        </div>

        {/* Search and filter */}
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by title, artist, or pinyin..."
              className="w-full pl-10 pr-4 py-2 rounded-lg bg-white/5 border border-white/10 text-primary placeholder:text-muted focus:outline-none focus:border-purple-500/50"
            />
          </div>

          <CustomSelect
            value={playlistFilter}
            onChange={onPlaylistFilterChange}
            className="w-48"
            placeholder="All Playlists"
            options={[
              { value: '', label: 'All Playlists' },
              ...playlists.map((name) => ({ value: name, label: name })),
            ]}
          />
        </div>

        {/* Selection count */}
        {selectedTracks.length > 0 && (
          <div className="mt-3 flex items-center gap-2 text-sm text-purple-400">
            <CheckSquare className="w-4 h-4" />
            {selectedTracks.length} track{selectedTracks.length !== 1 ? 's' : ''} selected
          </div>
        )}
      </div>

      {/* Track list */}
      <div className="max-h-96 overflow-y-auto p-4 space-y-2">
        {filteredTracks.length === 0 ? (
          <div className="text-center py-8 text-muted">
            {searchQuery ? 'No tracks match your search.' : 'No tracks in local index.'}
          </div>
        ) : (
          filteredTracks.map(([trackId, track]) => (
            <TrackItem
              key={trackId}
              trackId={trackId}
              track={track}
              selected={selectedTracks.includes(trackId)}
              onToggle={handleToggle}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default TrackList;
