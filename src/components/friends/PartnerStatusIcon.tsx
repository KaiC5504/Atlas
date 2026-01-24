import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, Gamepad2, MessageCircle } from 'lucide-react';
import { useFriends } from '../../hooks/useFriends';
import { usePartnerPresence } from '../../hooks/usePartnerPresence';
import {
  getPresenceStatusColor,
  getPresenceStatusText,
  formatGameDuration,
  POKE_EMOJIS,
} from '../../types/friends';

interface PartnerStatusIconProps {
  collapsed?: boolean;
}

export function PartnerStatusIcon({ collapsed = false }: PartnerStatusIconProps) {
  const navigate = useNavigate();
  const { partner, sendPoke } = useFriends();
  const { partnerPresence } = usePartnerPresence();
  const [showDropdown, setShowDropdown] = useState(false);
  const [pokeSent, setPokeSent] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showDropdown]);

  const handlePoke = async (emoji: string) => {
    if (!partner) return;
    try {
      await sendPoke(partner.user.id, emoji);
      setPokeSent(emoji);
      setTimeout(() => setPokeSent(null), 2000);
    } catch (err) {
      console.error('Failed to send poke:', err);
    }
  };

  // If no partner, show add button
  if (!partner) {
    return (
      <button
        onClick={() => navigate('/friends')}
        className={`flex items-center gap-2 p-2 rounded-lg hover:bg-white/5 transition-colors ${
          collapsed ? 'justify-center' : ''
        }`}
        title="Add Partner"
      >
        <div className="w-8 h-8 rounded-full bg-pink-500/20 flex items-center justify-center">
          <Heart className="w-4 h-4 text-pink-400" />
        </div>
        {!collapsed && (
          <span className="text-sm text-text-secondary">Add Partner</span>
        )}
      </button>
    );
  }

  const presence = partnerPresence || partner.presence;
  const displayName = partner.friend.nickname || partner.user.username;

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className={`flex items-center gap-2 p-2 rounded-lg hover:bg-white/5 transition-colors w-full ${
          collapsed ? 'justify-center' : ''
        }`}
        title={collapsed ? `${displayName} - ${getPresenceStatusText(presence?.status || 'offline')}` : undefined}
      >
        {/* Avatar with status ring */}
        <div className="relative">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white bg-gradient-to-br from-pink-500 to-purple-500 ring-2 ${
              presence?.status === 'online'
                ? 'ring-green-500'
                : presence?.status === 'in_game'
                ? 'ring-purple-500'
                : 'ring-gray-600'
            }`}
          >
            {displayName[0]}
          </div>
          {presence?.status === 'in_game' && (
            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-purple-500 rounded-full flex items-center justify-center">
              <Gamepad2 className="w-2.5 h-2.5 text-white" />
            </div>
          )}
        </div>

        {!collapsed && (
          <div className="flex-1 min-w-0 text-left">
            <div className="text-sm font-medium text-text-primary truncate">
              {displayName}
            </div>
            <div className="text-xs text-text-tertiary truncate">
              {presence?.status === 'in_game' && presence.current_game
                ? presence.current_game
                : getPresenceStatusText(presence?.status || 'offline')}
            </div>
          </div>
        )}
      </button>

      {/* Dropdown */}
      {showDropdown && (
        <div
          className="absolute bottom-full left-0 mb-2 w-64 bg-surface-elevated border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden"
        >
          {/* Partner Info */}
          <div className="p-4 border-b border-white/10">
            <div className="flex items-center gap-3 mb-3">
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white bg-gradient-to-br from-pink-500 to-purple-500 ring-2 ${getPresenceStatusColor(
                  presence?.status || 'offline'
                ).replace('bg-', 'ring-')}`}
              >
                {displayName[0]}
              </div>
              <div>
                <div className="font-medium text-text-primary">{displayName}</div>
                <div className="text-xs text-text-secondary">
                  {getPresenceStatusText(presence?.status || 'offline')}
                </div>
              </div>
            </div>

            {/* Current Activity */}
            {presence?.status === 'in_game' && presence.current_game && (
              <div className="flex items-center gap-2 text-sm text-purple-400 mb-2">
                <Gamepad2 className="w-4 h-4" />
                <span>{presence.current_game}</span>
                {presence.game_start_time && (
                  <span className="text-text-tertiary">
                    • {formatGameDuration(presence.game_start_time)}
                  </span>
                )}
              </div>
            )}

            {/* Mood Message */}
            {presence?.mood_message && (
              <div className="text-sm text-text-secondary italic">
                &ldquo;{presence.mood_message}&rdquo;
              </div>
            )}
          </div>

          {/* Quick Poke */}
          <div className="p-3 border-b border-white/10">
            <div className="text-xs text-text-tertiary mb-2">Quick poke</div>
            <div className="flex gap-1">
              {POKE_EMOJIS.slice(0, 6).map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => handlePoke(emoji)}
                  className={`w-8 h-8 rounded-lg text-lg transition-all ${
                    pokeSent === emoji
                      ? 'bg-pink-500/30 scale-110'
                      : 'hover:bg-white/10 hover:scale-105'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
            {pokeSent && (
              <div className="text-xs text-pink-400 mt-1 animate-fade-in">
                Sent {pokeSent}!
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="p-2">
            <button
              onClick={() => {
                navigate('/friends');
                setShowDropdown(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors"
            >
              <Heart className="w-4 h-4" />
              View Profile
            </button>
            <button
              onClick={() => {
                navigate('/friends');
                setShowDropdown(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              Messages
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
