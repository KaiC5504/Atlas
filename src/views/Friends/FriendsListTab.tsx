import { useState } from 'react';
import {
  Users,
  UserPlus,
  Heart,
  Trash2,
  Copy,
  Check,
  Search,
  MoreVertical,
  X,
  Loader2,
  Edit2,
} from 'lucide-react';
import { useFriends } from '../../hooks/useFriends';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import type { FriendWithDetails, LocalUserData, RelationshipType } from '../../types/friends';
import {
  getPresenceStatusColor,
  getPresenceStatusText,
  formatLastSeen,
  POKE_EMOJIS,
} from '../../types/friends';

interface FriendsListTabProps {
  friends: FriendWithDetails[];
  localUser: LocalUserData | null;
  onRefresh: () => Promise<void>;
}

export function FriendsListTab({ friends, localUser, onRefresh }: FriendsListTabProps) {
  const { addFriendByCode, validateFriendCode, removeFriend, updateNickname, sendPoke, isConnected } = useFriends();

  const [showAddModal, setShowAddModal] = useState(false);
  const [addType, setAddType] = useState<RelationshipType>('friend');
  const [friendCode, setFriendCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingNickname, setEditingNickname] = useState<string | null>(null);
  const [nicknameValue, setNicknameValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [validatedUser, setValidatedUser] = useState<{ username: string; id: string } | null>(null);

  // Remove confirmation state
  const [friendToRemove, setFriendToRemove] = useState<{ id: string; name: string; isPartner: boolean } | null>(null);

  // Separate partner from friends
  const partner = friends.find((f) => f.friend.relationship_type === 'partner');
  const regularFriends = friends.filter((f) => f.friend.relationship_type === 'friend');

  // Filter by search
  const filteredFriends = regularFriends.filter(
    (f) =>
      f.user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.friend.nickname?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCopyCode = async () => {
    if (localUser?.friend_code) {
      await navigator.clipboard.writeText(localUser.friend_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Validate friend code when user finishes typing
  const handleValidateCode = async () => {
    const code = friendCode.trim().toUpperCase();
    if (!code || code.length < 6) {
      setValidatedUser(null);
      setValidationError(null);
      return;
    }

    setIsValidating(true);
    setValidationError(null);

    try {
      const result = await validateFriendCode(code);
      if (result.valid && result.user) {
        setValidatedUser({ username: result.user.username, id: result.user.id });
        setDisplayName(result.user.username);
        setValidationError(null);
      } else {
        setValidatedUser(null);
        setValidationError('Friend code not found');
      }
    } catch (err) {
      setValidatedUser(null);
      if (isConnected) {
        setValidationError('Could not validate code');
      }
    } finally {
      setIsValidating(false);
    }
  };

  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!friendCode.trim()) return;

    setIsSubmitting(true);
    setValidationError(null);

    try {
      const code = friendCode.trim().toUpperCase();

      // Always use server validation - no fake friend codes allowed
      await addFriendByCode(code, addType);

      setShowAddModal(false);
      setFriendCode('');
      setDisplayName('');
      setValidatedUser(null);
      await onRefresh();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setValidationError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemove = (friendId: string, friendName: string, isPartner: boolean) => {
    setFriendToRemove({ id: friendId, name: friendName, isPartner });
  };

  const confirmRemove = async () => {
    if (friendToRemove) {
      await removeFriend(friendToRemove.id);
      setFriendToRemove(null);
      await onRefresh();
    }
  };

  const handleUpdateNickname = async (friendId: string) => {
    await updateNickname(friendId, nicknameValue || null);
    setEditingNickname(null);
    setNicknameValue('');
    await onRefresh();
  };

  const handlePoke = async (userId: string, emoji: string) => {
    try {
      await sendPoke(userId, emoji);
    } catch (err) {
      console.error('Failed to send poke:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Your Friend Code */}
      <div className="glass-elevated rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-text-secondary mb-1">Your Friend Code</div>
            <div className="text-xl font-mono font-bold text-indigo-400">
              {localUser?.friend_code || 'Not generated'}
            </div>
          </div>
          <button
            onClick={handleCopyCode}
            className="btn btn-secondary flex items-center gap-2"
            disabled={!localUser?.friend_code}
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-green-400" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Copy
              </>
            )}
          </button>
        </div>
        <p className="text-xs text-text-tertiary mt-2">
          Share this code with others to let them add you as a friend
        </p>
      </div>

      {/* Partner Section */}
      {partner ? (
        <div className="glass-elevated rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-medium text-text-primary flex items-center gap-2">
              <Heart className="w-5 h-5 text-pink-400" />
              Partner
            </h3>
          </div>
          <FriendCard
            friend={partner}
            isPartner
            onRemove={(id, name, isPartner) => handleRemove(id, name, isPartner)}
            onUpdateNickname={(id) => {
              setEditingNickname(id);
              setNicknameValue(partner.friend.nickname || '');
            }}
            onPoke={handlePoke}
            editingNickname={editingNickname}
            nicknameValue={nicknameValue}
            onNicknameChange={setNicknameValue}
            onNicknameSubmit={handleUpdateNickname}
            onNicknameCancel={() => setEditingNickname(null)}
          />
        </div>
      ) : (
        <div className="glass-elevated rounded-xl p-6 text-center">
          <Heart className="w-12 h-12 text-pink-400/50 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-text-primary mb-2">No Partner Yet</h3>
          <p className="text-sm text-text-secondary mb-4">
            Add your special someone to unlock shared memories, messages, and calendar
          </p>
          <button
            onClick={() => {
              setAddType('partner');
              setShowAddModal(true);
            }}
            className="btn btn-primary"
          >
            <UserPlus className="w-4 h-4 mr-2" />
            Add Partner
          </button>
        </div>
      )}

      {/* Friends Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-text-primary flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-400" />
            Friends ({regularFriends.length})
          </h3>
          <button
            onClick={() => {
              setAddType('friend');
              setShowAddModal(true);
            }}
            className="btn btn-primary flex items-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            Add Friend
          </button>
        </div>

        {/* Search */}
        {regularFriends.length > 0 && (
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search friends..."
              className="input pl-10 w-full"
            />
          </div>
        )}

        {/* Friends List */}
        {filteredFriends.length > 0 ? (
          <div className="space-y-3">
            {filteredFriends.map((friend) => (
              <FriendCard
                key={friend.friend.id}
                friend={friend}
                onRemove={(id, name, isPartner) => handleRemove(id, name, isPartner)}
                onUpdateNickname={(id) => {
                  setEditingNickname(id);
                  setNicknameValue(friend.friend.nickname || '');
                }}
                onPoke={handlePoke}
                editingNickname={editingNickname}
                nicknameValue={nicknameValue}
                onNicknameChange={setNicknameValue}
                onNicknameSubmit={handleUpdateNickname}
                onNicknameCancel={() => setEditingNickname(null)}
              />
            ))}
          </div>
        ) : regularFriends.length === 0 ? (
          <div className="empty-state">
            <Users className="empty-state-icon" />
            <h3 className="empty-state-title">No friends yet</h3>
            <p className="empty-state-description">
              Share your friend code or add friends to see them here
            </p>
          </div>
        ) : (
          <div className="text-center py-8 text-text-tertiary">
            No friends matching &ldquo;{searchQuery}&rdquo;
          </div>
        )}
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="glass-elevated rounded-xl p-6 w-full max-w-md m-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-text-primary">
                Add {addType === 'partner' ? 'Partner' : 'Friend'}
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="btn btn-ghost p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddFriend}>
              {/* Server connection warning */}
              {!isConnected && (
                <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <p className="text-sm text-amber-400">
                    Not connected to server. Connect first to add friends.
                  </p>
                </div>
              )}

              {/* Friend Code */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Friend Code
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={friendCode}
                    onChange={(e) => {
                      setFriendCode(e.target.value);
                      setValidatedUser(null);
                      setValidationError(null);
                    }}
                    onBlur={handleValidateCode}
                    className={`input w-full font-mono uppercase ${
                      validationError ? 'border-red-500' : validatedUser ? 'border-green-500' : ''
                    }`}
                    placeholder="ATLAS-XXXXXX"
                    required
                    maxLength={32}
                  />
                  {isValidating && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-text-tertiary" />
                  )}
                  {validatedUser && !isValidating && (
                    <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-400" />
                  )}
                </div>
                {validationError && (
                  <p className="text-xs text-red-400 mt-1">{validationError}</p>
                )}
                {validatedUser && (
                  <p className="text-xs text-green-400 mt-1">
                    Found: {validatedUser.username}
                  </p>
                )}
                {!validationError && !validatedUser && (
                  <p className="text-xs text-text-tertiary mt-1">
                    Ask them to share their friend code from Settings
                  </p>
                )}
              </div>

              {/* Display Name (Optional) */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Display Name <span className="text-text-tertiary">(optional)</span>
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="input w-full"
                  placeholder={validatedUser ? validatedUser.username : 'Give them a nickname...'}
                  maxLength={32}
                />
              </div>

              {/* Type Toggle */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Relationship Type
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAddType('partner')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg transition-colors ${
                      addType === 'partner'
                        ? 'bg-pink-500/20 text-pink-400 border border-pink-500/30'
                        : 'bg-white/5 text-text-secondary hover:bg-white/10'
                    }`}
                    disabled={!!partner}
                  >
                    <Heart className="w-4 h-4" />
                    Partner
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddType('friend')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg transition-colors ${
                      addType === 'friend'
                        ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                        : 'bg-white/5 text-text-secondary hover:bg-white/10'
                    }`}
                  >
                    <Users className="w-4 h-4" />
                    Friend
                  </button>
                </div>
                {partner && addType === 'partner' && (
                  <p className="text-xs text-amber-400 mt-2">
                    You already have a partner. Remove them first to add a new one.
                  </p>
                )}
              </div>

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
                  disabled={isSubmitting || (addType === 'partner' && !!partner) || !isConnected}
                  className="btn btn-primary flex-1"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : !isConnected ? (
                    'Connect First'
                  ) : (
                    'Add'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Remove Confirmation Dialog */}
      <ConfirmDialog
        isOpen={friendToRemove !== null}
        title={friendToRemove?.isPartner ? 'Remove Partner' : 'Remove Friend'}
        message={
          friendToRemove?.isPartner
            ? `Are you sure you want to remove ${friendToRemove?.name} as your partner? This will remove access to shared memories, messages, and calendar.`
            : `Are you sure you want to remove ${friendToRemove?.name} from your friends list?`
        }
        confirmLabel="Remove"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={confirmRemove}
        onCancel={() => setFriendToRemove(null)}
      />
    </div>
  );
}

interface FriendCardProps {
  friend: FriendWithDetails;
  isPartner?: boolean;
  onRemove: (id: string, name: string, isPartner: boolean) => void;
  onUpdateNickname: (id: string) => void;
  onPoke: (userId: string, emoji: string) => void;
  editingNickname: string | null;
  nicknameValue: string;
  onNicknameChange: (value: string) => void;
  onNicknameSubmit: (id: string) => void;
  onNicknameCancel: () => void;
}

function FriendCard({
  friend,
  isPartner,
  onRemove,
  onUpdateNickname,
  onPoke,
  editingNickname,
  nicknameValue,
  onNicknameChange,
  onNicknameSubmit,
  onNicknameCancel,
}: FriendCardProps) {
  const [showActions, setShowActions] = useState(false);
  const [showPokes, setShowPokes] = useState(false);

  const presence = friend.presence;
  const isEditing = editingNickname === friend.friend.id;

  return (
    <div className="glass rounded-xl p-4">
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="relative">
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white ${
              isPartner
                ? 'bg-gradient-to-br from-pink-500 to-purple-500'
                : 'bg-gradient-to-br from-indigo-500 to-blue-500'
            }`}
          >
            {(friend.friend.nickname || friend.user.username)[0]}
          </div>
          <div
            className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-surface-elevated ${getPresenceStatusColor(
              presence?.status || 'offline'
            )}`}
          />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="flex items-center gap-2 mb-1">
              <input
                type="text"
                value={nicknameValue}
                onChange={(e) => onNicknameChange(e.target.value)}
                className="input py-1 px-2 text-sm"
                placeholder="Set nickname..."
                autoFocus
              />
              <button
                onClick={() => onNicknameSubmit(friend.friend.id)}
                className="btn btn-ghost p-1"
              >
                <Check className="w-4 h-4 text-green-400" />
              </button>
              <button onClick={onNicknameCancel} className="btn btn-ghost p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-text-primary truncate">
                {friend.friend.nickname || friend.user.username}
              </span>
              {friend.friend.nickname && (
                <span className="text-xs text-text-tertiary">@{friend.user.username}</span>
              )}
            </div>
          )}

          <div className="text-sm text-text-secondary">
            {getPresenceStatusText(presence?.status || 'offline')}
            {presence?.status === 'offline' && presence?.last_seen && (
              <span className="text-text-tertiary">
                {' '}
                • {formatLastSeen(presence.last_seen)}
              </span>
            )}
          </div>

          {presence?.mood_message && (
            <div className="text-sm text-text-tertiary italic mt-1 truncate">
              &ldquo;{presence.mood_message}&rdquo;
            </div>
          )}

          {presence?.status === 'in_game' && presence.current_game && (
            <div className="text-sm text-purple-400 mt-1">
              Playing {presence.current_game}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="relative">
          <button
            onClick={() => setShowActions(!showActions)}
            className="btn btn-ghost p-2"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {showActions && (
            <div className="absolute right-0 top-full mt-1 bg-surface-elevated border border-white/10 rounded-lg shadow-xl z-10 py-1 min-w-32">
              <button
                onClick={() => {
                  setShowPokes(!showPokes);
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-white/5"
              >
                Send Poke
              </button>
              <button
                onClick={() => {
                  onUpdateNickname(friend.friend.id);
                  setShowActions(false);
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-white/5 flex items-center gap-2"
              >
                <Edit2 className="w-3 h-3" />
                Set Nickname
              </button>
              <button
                onClick={() => {
                  onRemove(
                    friend.friend.id,
                    friend.friend.nickname || friend.user.username,
                    isPartner || false
                  );
                  setShowActions(false);
                }}
                className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2"
              >
                <Trash2 className="w-3 h-3" />
                Remove
              </button>
            </div>
          )}

          {showPokes && (
            <div className="absolute right-0 top-full mt-1 bg-surface-elevated border border-white/10 rounded-lg shadow-xl z-10 p-2">
              <div className="flex gap-1">
                {POKE_EMOJIS.slice(0, 5).map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => {
                      onPoke(friend.user.id, emoji);
                      setShowPokes(false);
                      setShowActions(false);
                    }}
                    className="w-8 h-8 rounded hover:bg-white/10 transition-colors"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
