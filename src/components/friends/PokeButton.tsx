import { useState, useRef, useEffect } from 'react';
import { Heart } from 'lucide-react';
import { POKE_EMOJIS } from '../../types/friends';

interface PokeButtonProps {
  onPoke: (emoji: string) => void;
  disabled?: boolean;
  variant?: 'icon' | 'button';
}

export function PokeButton({ onPoke, disabled = false, variant = 'button' }: PokeButtonProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [sentEmoji, setSentEmoji] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handlePoke = (emoji: string) => {
    onPoke(emoji);
    setSentEmoji(emoji);
    setShowPicker(false);
    setTimeout(() => setSentEmoji(null), 2000);
  };

  // Close picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowPicker(false);
      }
    };

    if (showPicker) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showPicker]);

  return (
    <div ref={containerRef} className="relative inline-block">
      {variant === 'icon' ? (
        <button
          onClick={() => setShowPicker(!showPicker)}
          disabled={disabled}
          className="p-2 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Send a poke"
        >
          <Heart className="w-5 h-5 text-pink-400" />
        </button>
      ) : (
        <button
          onClick={() => setShowPicker(!showPicker)}
          disabled={disabled}
          className="btn btn-secondary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Heart className="w-4 h-4 text-pink-400" />
          Poke
        </button>
      )}

      {/* Emoji Picker */}
      {showPicker && (
        <div className="absolute bottom-full left-0 mb-2 bg-surface-elevated border border-white/10 rounded-lg shadow-xl p-2 z-50">
          <div className="flex gap-1 flex-wrap max-w-48">
            {POKE_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => handlePoke(emoji)}
                className="w-9 h-9 rounded-lg text-lg hover:bg-white/10 transition-colors hover:scale-110"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Sent Confirmation */}
      {sentEmoji && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-pink-500/90 text-white text-sm px-2 py-1 rounded animate-fade-in whitespace-nowrap">
          Sent {sentEmoji}!
        </div>
      )}
    </div>
  );
}

interface QuickPokeBarProps {
  onPoke: (emoji: string) => void;
  disabled?: boolean;
}

export function QuickPokeBar({ onPoke, disabled = false }: QuickPokeBarProps) {
  const [sentEmoji, setSentEmoji] = useState<string | null>(null);

  const handlePoke = (emoji: string) => {
    if (disabled) return;
    onPoke(emoji);
    setSentEmoji(emoji);
    setTimeout(() => setSentEmoji(null), 2000);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-text-secondary">Quick poke:</span>
      <div className="flex gap-1">
        {POKE_EMOJIS.slice(0, 6).map((emoji) => (
          <button
            key={emoji}
            onClick={() => handlePoke(emoji)}
            disabled={disabled}
            className={`w-8 h-8 rounded-lg text-lg transition-all ${
              sentEmoji === emoji
                ? 'bg-pink-500/30 scale-110'
                : 'hover:bg-white/10 hover:scale-105'
            } disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100`}
          >
            {emoji}
          </button>
        ))}
      </div>
      {sentEmoji && (
        <span className="text-sm text-pink-400 animate-fade-in ml-2">Sent!</span>
      )}
    </div>
  );
}
