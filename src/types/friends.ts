// Friends feature types

export type RelationshipType = 'partner' | 'friend';

export type PresenceStatus = 'online' | 'away' | 'in_game' | 'offline';

export type MemoryType = 'photo' | 'video' | 'voice' | 'note' | 'countdown' | 'milestone';

export type FriendRequestStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';

// User profile
export interface User {
  id: string;
  friend_code: string;
  username: string;
  avatar_url: string | null;
  partner_id: string | null;
  created_at: number;
}

// Local user data (stored on client)
export interface LocalUserData {
  id: string | null;
  friend_code: string | null;
  username: string | null;
  server_url: string;
  auth_token: string | null;
}

// Friend relationship
export interface Friend {
  id: string;
  user_id: string;
  friend_user_id: string;
  relationship_type: RelationshipType;
  nickname: string | null;
  created_at: number;
}

// Friend with user details (for display)
export interface FriendWithDetails {
  friend: Friend;
  user: User;
  presence: Presence | null;
}

// Performance snapshot for sharing
export interface PerformanceSnapshot {
  cpu_usage: number;
  gpu_usage: number;
  fps: number | null;
  memory_usage: number;
}

// User presence (real-time status)
export interface Presence {
  user_id: string;
  status: PresenceStatus;
  current_game: string | null;
  game_start_time: number | null;
  mood_message: string | null;
  performance_stats: PerformanceSnapshot | null;
  last_updated: number;
  last_seen: number;
}

// Shared memory (photos, videos, notes)
export interface Memory {
  id: string;
  user_id: string;
  partner_id: string;
  memory_type: MemoryType;
  content_url: string | null;
  content_text: string | null;
  caption: string | null;
  target_date: number | null;
  created_at: number;
}

// Simple message between partners
export interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: number;
  read_at: number | null;
}

// Calendar event
export interface CalendarEvent {
  id: string;
  user_id: string;
  partner_id: string;
  title: string;
  description: string | null;
  datetime: number;
  timezone: string;
  reminder_minutes: number | null;
  is_recurring: boolean;
  recurrence_pattern: string | null;
  created_at: number;
}

// Poke/reaction notification
export interface Poke {
  id: string;
  sender_id: string;
  receiver_id: string;
  emoji: string;
  created_at: number;
}

// Gacha pull notification for sharing
export interface GachaPullNotification {
  user_id: string;
  game: string;
  item_name: string;
  rarity: number;
  pity: number;
  timestamp: number;
}

// Shared gacha stats for comparison
export interface SharedGachaStats {
  game: string;
  total_pulls: number;
  five_star_count: number;
  four_star_count: number;
  average_pity: number;
  current_pity: number;
  luck_score: number;
}

// Wishlist item
export interface WishlistItem {
  id: string;
  user_id: string;
  game: string;
  item_name: string;
  item_type: string;
  priority: number;
  created_at: number;
}

// Friend request
export interface FriendRequest {
  id: string;
  from_user_id: string;
  to_user_id: string;
  relationship_type: RelationshipType;
  status: FriendRequestStatus;
  created_at: number;
}

// Update presence request
export interface UpdatePresenceRequest {
  status?: PresenceStatus;
  current_game?: string;
  mood_message?: string;
  performance_stats?: PerformanceSnapshot;
}

// Create memory request
export interface CreateMemoryRequest {
  memory_type: MemoryType;
  content_text?: string;
  caption?: string;
  target_date?: number;
}

// Create calendar event request
export interface CreateCalendarEventRequest {
  title: string;
  description?: string;
  datetime: number;
  timezone: string;
  reminder_minutes?: number;
  is_recurring: boolean;
  recurrence_pattern?: string;
}

// WebSocket message types
export type WebSocketMessage =
  | { type: 'PresenceUpdate'; payload: Presence }
  | { type: 'Poke'; payload: Poke }
  | { type: 'NewMessage'; payload: Message }
  | { type: 'GachaPull'; payload: GachaPullNotification }
  | { type: 'FriendRequest'; payload: FriendRequest }
  | { type: 'FriendRequestAccepted'; payload: Friend }
  | { type: 'MemoryAdded'; payload: Memory }
  | { type: 'CalendarEventAdded'; payload: CalendarEvent }
  | { type: 'Heartbeat' }
  | { type: 'Error'; payload: { message: string } };

// Helper functions

export function getPresenceStatusColor(status: PresenceStatus): string {
  switch (status) {
    case 'online':
      return 'bg-green-500';
    case 'away':
      return 'bg-yellow-500';
    case 'in_game':
      return 'bg-purple-500';
    case 'offline':
    default:
      return 'bg-gray-500';
  }
}

export function getPresenceStatusText(status: PresenceStatus): string {
  switch (status) {
    case 'online':
      return 'Online';
    case 'away':
      return 'Away';
    case 'in_game':
      return 'In Game';
    case 'offline':
    default:
      return 'Offline';
  }
}

export function formatLastSeen(timestamp: number): string {
  if (!timestamp) return 'Never';

  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  return new Date(timestamp).toLocaleDateString();
}

export function formatGameDuration(startTime: number | null): string {
  if (!startTime) return '';

  const now = Date.now();
  const diff = now - startTime;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours > 0) {
    return `${hours}h ${remainingMinutes}m`;
  }
  return `${minutes}m`;
}

export function formatCountdown(targetDate: number): { days: number; hours: number; minutes: number; isPast: boolean } {
  const now = Date.now();
  const diff = targetDate - now;
  const isPast = diff < 0;
  const absDiff = Math.abs(diff);

  const days = Math.floor(absDiff / (24 * 60 * 60 * 1000));
  const hours = Math.floor((absDiff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((absDiff % (60 * 60 * 1000)) / (60 * 1000));

  return { days, hours, minutes, isPast };
}

export function formatCountdownText(targetDate: number): string {
  const { days, hours, minutes, isPast } = formatCountdown(targetDate);

  if (isPast) {
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    return `${minutes}m ago`;
  }

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function getMemoryTypeIcon(type: MemoryType): string {
  switch (type) {
    case 'photo':
      return 'Image';
    case 'video':
      return 'Video';
    case 'voice':
      return 'Mic';
    case 'note':
      return 'FileText';
    case 'countdown':
      return 'Clock';
    case 'milestone':
      return 'Award';
    default:
      return 'File';
  }
}

// Common poke emojis
export const POKE_EMOJIS = ['❤️', '😘', '🤗', '💕', '🥺', '💖', '✨', '🌟', '💫', '🎉'];

// Default server URL
export const DEFAULT_SERVER_URL = 'https://atlas-api.kaic5504.com';

// Connection state
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

// Sync result from server
export interface FriendsSyncResult {
  success: boolean;
  timestamp: number;
  has_new_data: boolean;
  new_messages_count: number;
  new_pokes_count: number;
  error: string | null;
}

// Validation response
export interface ValidateResponse {
  valid: boolean;
  user: {
    id: string;
    friend_code: string;
    username: string;
  } | null;
}

// Server presence response
export interface ServerPresenceResponse {
  user_id: string;
  username: string;
  status: string;
  current_game: string | null;
  mood_message: string | null;
  performance_stats: PerformanceSnapshot | null;
  last_updated: number;
}

// Shared gacha stats payload (for uploading to server)
export interface SharedGachaStatsPayload {
  game: string;
  total_pulls: number;
  five_star_count: number;
  four_star_count: number;
  average_pity: number;
  current_pity: number;
}

// Partner gacha stats (from server)
export interface PartnerGachaStats {
  user_id: string;
  username: string;
  game: string;
  total_pulls: number;
  five_star_count: number;
  four_star_count: number;
  average_pity: number;
  current_pity: number;
  updated_at: number;
}

// Partner gacha stats response
export interface PartnerGachaStatsResponse {
  partner_id: string;
  partner_username: string;
  stats: PartnerGachaStats[];
}
