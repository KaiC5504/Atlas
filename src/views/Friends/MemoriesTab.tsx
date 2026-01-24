import { useState } from 'react';
import {
  Image,
  Video,
  Mic,
  FileText,
  Clock,
  Award,
  Plus,
  Trash2,
  Loader2,
  X,
} from 'lucide-react';
import { useMemories } from '../../hooks/useMemories';
import type { Memory, MemoryType } from '../../types/friends';
import { formatCountdown, formatCountdownText } from '../../types/friends';

const MEMORY_TYPE_ICONS: Record<MemoryType, React.ReactNode> = {
  photo: <Image className="w-5 h-5" />,
  video: <Video className="w-5 h-5" />,
  voice: <Mic className="w-5 h-5" />,
  note: <FileText className="w-5 h-5" />,
  countdown: <Clock className="w-5 h-5" />,
  milestone: <Award className="w-5 h-5" />,
};

const MEMORY_TYPE_COLORS: Record<MemoryType, string> = {
  photo: 'text-blue-400 bg-blue-500/20',
  video: 'text-purple-400 bg-purple-500/20',
  voice: 'text-green-400 bg-green-500/20',
  note: 'text-yellow-400 bg-yellow-500/20',
  countdown: 'text-indigo-400 bg-indigo-500/20',
  milestone: 'text-pink-400 bg-pink-500/20',
};

export function MemoriesTab() {
  const {
    memories,
    countdowns,
    isLoading,
    error,
    createMemory,
    createCountdown,
    deleteMemory,
    notes,
    milestones,
  } = useMemories();

  const [showAddModal, setShowAddModal] = useState(false);
  const [addType, setAddType] = useState<MemoryType>('note');
  const [newTitle, setNewTitle] = useState('');
  const [newCaption, setNewCaption] = useState('');
  const [newDate, setNewDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    setIsSubmitting(true);
    try {
      if (addType === 'countdown') {
        const targetDate = new Date(newDate).getTime();
        await createCountdown(newTitle, targetDate);
      } else {
        await createMemory({
          memory_type: addType,
          content_text: newTitle,
          caption: newCaption || undefined,
          target_date: addType === 'milestone' && newDate ? new Date(newDate).getTime() : undefined,
        });
      }
      setShowAddModal(false);
      setNewTitle('');
      setNewCaption('');
      setNewDate('');
    } catch (err) {
      console.error('Failed to create memory:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (memoryId: string) => {
    if (window.confirm('Delete this memory?')) {
      await deleteMemory(memoryId);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-text-primary">Shared Memories</h2>
        <button
          onClick={() => setShowAddModal(true)}
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Memory
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
          {error}
        </div>
      )}

      {/* Countdowns Section */}
      {countdowns.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-text-secondary mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Countdowns
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {countdowns.map((countdown) => (
              <CountdownCard
                key={countdown.id}
                memory={countdown}
                onDelete={() => handleDelete(countdown.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Notes Section */}
      {notes.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-text-secondary mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Notes & Letters
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {notes.map((note) => (
              <MemoryCard
                key={note.id}
                memory={note}
                onDelete={() => handleDelete(note.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Milestones Section */}
      {milestones.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-text-secondary mb-3 flex items-center gap-2">
            <Award className="w-4 h-4" />
            Milestones
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {milestones.map((milestone) => (
              <MemoryCard
                key={milestone.id}
                memory={milestone}
                onDelete={() => handleDelete(milestone.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {memories.length === 0 && countdowns.length === 0 && (
        <div className="empty-state">
          <Image className="empty-state-icon" />
          <h3 className="empty-state-title">No memories yet</h3>
          <p className="empty-state-description">
            Start adding notes, countdowns, and milestones to remember your special moments
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="btn btn-primary mt-4"
          >
            Add Your First Memory
          </button>
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="glass-elevated rounded-xl p-6 w-full max-w-md m-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-text-primary">Add Memory</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="btn btn-ghost p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              {/* Type Selection */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Type
                </label>
                <div className="flex gap-2">
                  {(['note', 'countdown', 'milestone'] as MemoryType[]).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setAddType(type)}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg transition-colors ${
                        addType === type
                          ? MEMORY_TYPE_COLORS[type]
                          : 'bg-white/5 text-text-secondary hover:bg-white/10'
                      }`}
                    >
                      {MEMORY_TYPE_ICONS[type]}
                      <span className="text-sm capitalize">{type}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Title */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  {addType === 'countdown' ? 'Event Name' : 'Title'}
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="input w-full"
                  placeholder={
                    addType === 'countdown'
                      ? 'e.g., Our Anniversary'
                      : 'e.g., First 5-star pull together!'
                  }
                  required
                />
              </div>

              {/* Caption (for notes) */}
              {addType === 'note' && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    Caption (optional)
                  </label>
                  <textarea
                    value={newCaption}
                    onChange={(e) => setNewCaption(e.target.value)}
                    className="input w-full resize-none"
                    rows={3}
                    placeholder="Add more details..."
                  />
                </div>
              )}

              {/* Date (for countdowns and milestones) */}
              {(addType === 'countdown' || addType === 'milestone') && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    {addType === 'countdown' ? 'Target Date' : 'Date'}
                  </label>
                  <input
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="input w-full"
                    required={addType === 'countdown'}
                  />
                </div>
              )}

              {/* Submit */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn btn-primary flex-1"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'Add'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function CountdownCard({
  memory,
  onDelete,
}: {
  memory: Memory;
  onDelete: () => void;
}) {
  if (!memory.target_date) return null;

  const { days, hours, minutes, isPast } = formatCountdown(memory.target_date);

  return (
    <div className="glass-elevated rounded-xl p-4 relative group">
      <button
        onClick={onDelete}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-500/20 rounded"
      >
        <Trash2 className="w-4 h-4 text-red-400" />
      </button>

      <div className="text-sm text-text-secondary mb-2">{memory.content_text}</div>
      <div className={`text-2xl font-bold ${isPast ? 'text-text-tertiary' : 'text-indigo-400'}`}>
        {isPast ? 'Passed' : formatCountdownText(memory.target_date)}
      </div>
      {!isPast && (
        <div className="mt-2 flex gap-3 text-xs text-text-tertiary">
          <span>{days}d</span>
          <span>{hours}h</span>
          <span>{minutes}m</span>
        </div>
      )}
    </div>
  );
}

function MemoryCard({
  memory,
  onDelete,
}: {
  memory: Memory;
  onDelete: () => void;
}) {
  const Icon = MEMORY_TYPE_ICONS[memory.memory_type] || <FileText className="w-5 h-5" />;
  const colorClass = MEMORY_TYPE_COLORS[memory.memory_type] || 'text-text-secondary bg-white/10';

  return (
    <div className="glass-elevated rounded-xl p-4 relative group">
      <button
        onClick={onDelete}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-500/20 rounded"
      >
        <Trash2 className="w-4 h-4 text-red-400" />
      </button>

      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${colorClass}`}>{Icon}</div>
        <div className="flex-1 min-w-0">
          <div className="text-text-primary font-medium">{memory.content_text}</div>
          {memory.caption && (
            <div className="text-sm text-text-secondary mt-1">{memory.caption}</div>
          )}
          <div className="text-xs text-text-tertiary mt-2">
            {new Date(memory.created_at).toLocaleDateString()}
          </div>
        </div>
      </div>
    </div>
  );
}
