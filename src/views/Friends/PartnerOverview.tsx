import { useState } from 'react';
import {
  Heart,
  Gamepad2,
  Clock,
  MessageCircle,
  Zap,
  Cpu,
  MemoryStick,
  Monitor,
  UserPlus,
} from 'lucide-react';
import { useFriends } from '../../hooks/useFriends';
import { usePartnerPresence } from '../../hooks/usePartnerPresence';
import { useMemories } from '../../hooks/useMemories';
import { useMessages } from '../../hooks/useMessages';
import {
  FriendWithDetails,
  getPresenceStatusColor,
  getPresenceStatusText,
  formatLastSeen,
  formatGameDuration,
  formatCountdownText,
  POKE_EMOJIS,
} from '../../types/friends';

interface PartnerOverviewProps {
  partner: FriendWithDetails | null;
  friends: FriendWithDetails[];
  onAddPartner?: () => void;
}

export function PartnerOverview({ partner, friends, onAddPartner }: PartnerOverviewProps) {
  const { sendPoke } = useFriends();
  const { partnerPresence } = usePartnerPresence();
  const { countdowns } = useMemories();
  const { unreadCount } = useMessages();
  const [pokeSent, setPokeSent] = useState<string | null>(null);

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

  // Use partner presence from hook or friend data
  const presence = partnerPresence || partner?.presence;

  // Get next countdown
  const nextCountdown = countdowns
    .filter((c) => c.target_date && c.target_date > Date.now())
    .sort((a, b) => (a.target_date || 0) - (b.target_date || 0))[0];

  if (!partner) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-pink-500/20 flex items-center justify-center">
            <Heart className="w-10 h-10 text-pink-400" />
          </div>
          <h2 className="text-xl font-bold text-text-primary mb-2">No Partner Yet</h2>
          <p className="text-text-secondary mb-6">
            Add your special someone to unlock shared memories, messages, calendar, and more
          </p>
          <button
            onClick={onAddPartner}
            className="btn btn-primary inline-flex items-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            Add Partner
          </button>

          {/* Friends Summary */}
          {friends.length > 0 && (
            <div className="mt-8 pt-6 border-t border-white/10">
              <h3 className="text-sm font-medium text-text-primary mb-3">Your Friends</h3>
              <div className="flex flex-wrap gap-2 justify-center">
                {friends.slice(0, 5).map((friend) => (
                  <div
                    key={friend.friend.id}
                    className="glass rounded-lg px-3 py-2 text-sm"
                  >
                    <span className="text-text-primary">{friend.user.username}</span>
                    <span
                      className={`ml-2 inline-block w-2 h-2 rounded-full ${getPresenceStatusColor(
                        friend.presence?.status || 'offline'
                      )}`}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Partner Card */}
      <div className="lg:col-span-2">
        <div className="glass-elevated rounded-xl p-6">
          <div className="flex items-start gap-4">
            {/* Avatar */}
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center text-2xl font-bold text-white">
                {partner.friend.nickname?.[0] || partner.user.username[0]}
              </div>
              <div
                className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-surface-elevated ${getPresenceStatusColor(
                  presence?.status || 'offline'
                )}`}
              />
            </div>

            {/* Info */}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-xl font-bold text-text-primary">
                  {partner.friend.nickname || partner.user.username}
                </h2>
                <Heart className="w-5 h-5 text-pink-400" />
              </div>
              <div className="text-text-secondary text-sm mb-2">
                {getPresenceStatusText(presence?.status || 'offline')}
                {presence?.status === 'offline' && presence?.last_seen && (
                  <span className="text-text-tertiary">
                    {' '}
                    • Last seen {formatLastSeen(presence.last_seen)}
                  </span>
                )}
              </div>

              {/* Mood Message */}
              {presence?.mood_message && (
                <div className="text-sm text-text-secondary italic">
                  &ldquo;{presence.mood_message}&rdquo;
                </div>
              )}

              {/* In-Game Status */}
              {presence?.status === 'in_game' && presence.current_game && (
                <div className="mt-3 flex items-center gap-2 text-purple-400">
                  <Gamepad2 className="w-4 h-4" />
                  <span className="font-medium">{presence.current_game}</span>
                  {presence.game_start_time && (
                    <span className="text-text-tertiary text-sm">
                      • {formatGameDuration(presence.game_start_time)}
                    </span>
                  )}
                </div>
              )}

              {/* Performance Stats */}
              {presence?.performance_stats && presence.status === 'in_game' && (
                <div className="mt-3 flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1 text-text-tertiary">
                    <Cpu className="w-3 h-3" />
                    <span>{presence.performance_stats.cpu_usage.toFixed(0)}%</span>
                  </div>
                  <div className="flex items-center gap-1 text-text-tertiary">
                    <Monitor className="w-3 h-3" />
                    <span>{presence.performance_stats.gpu_usage.toFixed(0)}%</span>
                  </div>
                  <div className="flex items-center gap-1 text-text-tertiary">
                    <MemoryStick className="w-3 h-3" />
                    <span>{presence.performance_stats.memory_usage.toFixed(0)}%</span>
                  </div>
                  {presence.performance_stats.fps && (
                    <div className="flex items-center gap-1 text-green-400">
                      <Zap className="w-3 h-3" />
                      <span>{presence.performance_stats.fps.toFixed(0)} FPS</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Poke Section */}
          <div className="mt-6 pt-4 border-t border-white/10">
            <div className="text-sm text-text-secondary mb-3">Send a poke</div>
            <div className="flex items-center gap-2">
              {POKE_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => handlePoke(emoji)}
                  className={`w-10 h-10 rounded-lg text-xl transition-all ${
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
              <div className="mt-2 text-sm text-pink-400 animate-fade-in">
                Sent {pokeSent} to {partner.friend.nickname || partner.user.username}!
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="space-y-4">
        {/* Next Countdown */}
        {nextCountdown && (
          <div className="glass-elevated rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-indigo-400" />
              <span className="text-sm font-medium text-text-primary">
                {nextCountdown.content_text}
              </span>
            </div>
            <div className="text-2xl font-bold text-indigo-400">
              {formatCountdownText(nextCountdown.target_date!)}
            </div>
          </div>
        )}

        {/* Unread Messages */}
        <div className="glass-elevated rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-medium text-text-primary">Messages</span>
            </div>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded-full text-xs font-medium">
                {unreadCount} unread
              </span>
            )}
          </div>
        </div>

        {/* Together Since */}
        <div className="glass-elevated rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Heart className="w-4 h-4 text-pink-400" />
            <span className="text-sm font-medium text-text-primary">Together Since</span>
          </div>
          <div className="text-lg font-medium text-text-primary">
            {new Date(partner.friend.created_at).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="glass-elevated rounded-xl p-4">
          <div className="text-sm font-medium text-text-primary mb-3">Quick Actions</div>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn btn-secondary text-sm py-2">
              <MessageCircle className="w-4 h-4 mr-1" />
              Message
            </button>
            <button className="btn btn-secondary text-sm py-2">
              <Gamepad2 className="w-4 h-4 mr-1" />
              Gaming
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
