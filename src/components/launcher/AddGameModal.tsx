import { useState } from 'react';
import { X, FolderOpen, Gamepad2 } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { AddGameRequest } from '../../types';

interface AddGameModalProps {
  onClose: () => void;
  onAdd: (request: AddGameRequest) => void;
}

export function AddGameModal({ onClose, onAdd }: AddGameModalProps) {
  const [name, setName] = useState('');
  const [executablePath, setExecutablePath] = useState('');
  const [iconPath, setIconPath] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleBrowseExecutable = async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: 'Executable', extensions: ['exe'] }],
    });
    if (selected && typeof selected === 'string') {
      setExecutablePath(selected);
      if (!name) {
        const fileName = selected.split(/[/\\]/).pop() || '';
        const gameName = fileName.replace('.exe', '').replace(/[-_]/g, ' ');
        setName(gameName);
      }
    }
  };

  const handleBrowseIcon = async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'ico'] }],
    });
    if (selected && typeof selected === 'string') {
      setIconPath(selected);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !executablePath.trim()) return;

    setIsSubmitting(true);
    try {
      await onAdd({
        name: name.trim(),
        executable_path: executablePath.trim(),
        icon_path: iconPath,
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="glass rounded-2xl w-full max-w-md border border-white/20 shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-500/20">
              <Gamepad2 className="w-5 h-5 text-cyan-400" />
            </div>
            <h2 className="text-lg font-semibold text-primary">Add Game</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 text-muted hover:text-primary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-secondary mb-2">
              Game Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter game name"
              className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-primary placeholder-muted focus:outline-none focus:border-cyan-500/50 transition-colors"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-secondary mb-2">
              Executable Path
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={executablePath}
                onChange={(e) => setExecutablePath(e.target.value)}
                placeholder="Select game executable"
                className="flex-1 px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-primary placeholder-muted focus:outline-none focus:border-cyan-500/50 transition-colors"
                required
              />
              <button
                type="button"
                onClick={handleBrowseExecutable}
                className="px-4 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-secondary transition-colors"
              >
                <FolderOpen className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-secondary mb-2">
              Icon (Optional)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={iconPath || ''}
                onChange={(e) => setIconPath(e.target.value || null)}
                placeholder="Select icon image"
                className="flex-1 px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-primary placeholder-muted focus:outline-none focus:border-cyan-500/50 transition-colors"
              />
              <button
                type="button"
                onClick={handleBrowseIcon}
                className="px-4 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-secondary transition-colors"
              >
                <FolderOpen className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-secondary font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim() || !executablePath.trim()}
              className="flex-1 px-4 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:bg-cyan-500/50 disabled:cursor-not-allowed text-white font-medium transition-colors"
            >
              {isSubmitting ? 'Adding...' : 'Add Game'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddGameModal;
