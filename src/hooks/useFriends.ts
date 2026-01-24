import { useState, useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type {
  LocalUserData,
  FriendWithDetails,
  RelationshipType,
  Poke,
  ConnectionState,
  SyncResult,
  ValidateResponse,
  ServerPresenceResponse,
} from '../types/friends';

export interface UseFriendsReturn {
  // State
  localUser: LocalUserData | null;
  friends: FriendWithDetails[];
  partner: FriendWithDetails | null;
  isLoading: boolean;
  isConnected: boolean;
  connectionState: ConnectionState;
  lastSyncTime: number | null;
  pendingActionsCount: number;
  error: string | null;

  // Actions
  loadLocalUser: () => Promise<void>;
  loadFriends: () => Promise<void>;
  setFriendCode: (code: string) => Promise<void>;
  setUsername: (username: string) => Promise<void>;
  addFriend: (userId: string, username: string, type: RelationshipType) => Promise<void>;
  addFriendByCode: (code: string, type: RelationshipType) => Promise<void>;
  validateFriendCode: (code: string) => Promise<ValidateResponse>;
  removeFriend: (friendId: string) => Promise<void>;
  updateNickname: (friendId: string, nickname: string | null) => Promise<void>;
  sendPoke: (userId: string, emoji: string) => Promise<void>;
  createDemoData: () => Promise<void>;
  clearAllData: () => Promise<void>;
  // Server connection
  connectToServer: () => Promise<void>;
  disconnectFromServer: () => Promise<void>;
  syncNow: () => Promise<SyncResult>;
}

export function useFriends(): UseFriendsReturn {
  const [localUser, setLocalUser] = useState<LocalUserData | null>(null);
  const [friends, setFriends] = useState<FriendWithDetails[]>([]);
  const [partner, setPartner] = useState<FriendWithDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true); // Start true to prevent premature setup check
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const [pendingActionsCount, setPendingActionsCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load local user data
  const loadLocalUser = useCallback(async () => {
    try {
      const user = await invoke<LocalUserData>('get_local_user');
      setLocalUser(user);
    } catch (e) {
      console.error('Failed to load local user:', e);
    }
  }, []);

  // Load friends list
  const loadFriends = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const friendsList = await invoke<FriendWithDetails[]>('get_friends_list');
      setFriends(friendsList);

      // Find partner
      const partnerData = friendsList.find(
        (f) => f.friend.relationship_type === 'partner'
      );
      setPartner(partnerData || null);

      // Check connection status
      const connected = await invoke<boolean>('is_friends_connected');
      setIsConnected(connected);

      // Get connection state
      const state = await invoke<string>('get_friends_connection_status');
      setConnectionState(state as ConnectionState);

      // Get pending actions count
      const pendingCount = await invoke<number>('get_offline_queue_count');
      setPendingActionsCount(pendingCount);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Set friend code
  const setFriendCode = useCallback(async (code: string): Promise<void> => {
    try {
      await invoke('set_friend_code', { code });
      await loadLocalUser();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      throw new Error(msg);
    }
  }, [loadLocalUser]);

  // Set username
  const setUsername = useCallback(async (username: string) => {
    try {
      await invoke('set_username', { username });
      await loadLocalUser();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      throw new Error(msg);
    }
  }, [loadLocalUser]);

  // Add friend locally (for offline/demo mode)
  const addFriend = useCallback(
    async (userId: string, username: string, relationshipType: RelationshipType) => {
      try {
        await invoke<FriendWithDetails>('add_friend_locally', {
          userId,
          username,
          relationshipType,
        });
        await loadFriends();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        throw new Error(msg);
      }
    },
    [loadFriends]
  );

  // Add friend by code (validates with server first)
  const addFriendByCode = useCallback(
    async (friendCode: string, relationshipType: RelationshipType) => {
      try {
        await invoke<FriendWithDetails>('add_friend_by_code', {
          friendCode,
          relationshipType,
        });
        await loadFriends();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        throw new Error(msg);
      }
    },
    [loadFriends]
  );

  // Validate friend code with server
  const validateFriendCode = useCallback(async (code: string): Promise<ValidateResponse> => {
    try {
      return await invoke<ValidateResponse>('validate_friend_code', { code });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(msg);
    }
  }, []);

  // Remove friend
  const removeFriend = useCallback(
    async (friendId: string) => {
      try {
        await invoke('remove_friend', { friendId });
        await loadFriends();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        throw new Error(msg);
      }
    },
    [loadFriends]
  );

  // Update friend nickname
  const updateNickname = useCallback(
    async (friendId: string, nickname: string | null) => {
      try {
        await invoke('update_friend_nickname', { friendId, nickname });
        await loadFriends();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        throw new Error(msg);
      }
    },
    [loadFriends]
  );

  // Send poke
  const sendPoke = useCallback(async (userId: string, emoji: string) => {
    try {
      await invoke<Poke>('send_poke', { userId, emoji });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      throw new Error(msg);
    }
  }, []);

  // Create demo data
  const createDemoData = useCallback(async () => {
    try {
      await invoke('create_demo_friends_data');
      await loadLocalUser();
      await loadFriends();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      throw new Error(msg);
    }
  }, [loadLocalUser, loadFriends]);

  // Clear all data
  const clearAllData = useCallback(async () => {
    try {
      await invoke('clear_friends_data');
      setLocalUser(null);
      setFriends([]);
      setPartner(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      throw new Error(msg);
    }
  }, []);

  // Connect to server
  const connectToServer = useCallback(async () => {
    setConnectionState('connecting');
    try {
      await invoke('connect_to_server');
      setConnectionState('connected');
      setIsConnected(true);
      setLastSyncTime(Date.now());

      // Set presence to online after connecting
      try {
        await invoke('update_presence', { request: { status: 'online' } });
      } catch (presenceErr) {
        console.warn('Failed to set online status:', presenceErr);
      }

      // Reload friends to get fresh data
      await loadFriends();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setConnectionState('error');
      setError(msg);
      throw new Error(msg);
    }
  }, [loadFriends]);

  // Disconnect from server
  const disconnectFromServer = useCallback(async () => {
    try {
      // Set presence to offline before disconnecting
      try {
        await invoke('update_presence', { request: { status: 'offline' } });
      } catch (presenceErr) {
        console.warn('Failed to set offline status:', presenceErr);
      }

      await invoke('disconnect_from_server');
      setConnectionState('disconnected');
      setIsConnected(false);
      // Stop polling
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      throw new Error(msg);
    }
  }, []);

  // Manual sync
  const syncNow = useCallback(async (): Promise<SyncResult> => {
    try {
      const result = await invoke<SyncResult>('sync_now');
      if (result.success) {
        setLastSyncTime(result.timestamp);
        // Reload friends list to update presence
        await loadFriends();
      }
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      return {
        success: false,
        timestamp: Date.now(),
        has_new_data: false,
        new_messages_count: 0,
        new_pokes_count: 0,
        error: msg,
      };
    }
  }, [loadFriends]);

  // Listen for poke events
  useEffect(() => {
    const unlisten = listen<Poke>('friends:poke_received', (event) => {
      // Handle incoming poke - could trigger a notification
      console.log('Received poke:', event.payload);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Initial load
  useEffect(() => {
    const initialize = async () => {
      setIsLoading(true);
      await loadLocalUser();
      await loadFriends();
      setIsLoading(false);
    };
    initialize();
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for server events
  useEffect(() => {
    const unlistenConnected = listen('friends:connected', () => {
      setConnectionState('connected');
      setIsConnected(true);
    });

    const unlistenPartnerPresence = listen<ServerPresenceResponse>('friends:partner_presence', (event) => {
      // Update partner presence in the friends list
      setFriends((prev) => {
        return prev.map((f) => {
          if (f.user.id === event.payload.user_id) {
            return {
              ...f,
              presence: {
                user_id: event.payload.user_id,
                status: event.payload.status as 'online' | 'away' | 'in_game' | 'offline',
                current_game: event.payload.current_game,
                game_start_time: null,
                mood_message: event.payload.mood_message,
                performance_stats: event.payload.performance_stats,
                last_updated: event.payload.last_updated,
                last_seen: event.payload.last_updated,
              },
            };
          }
          return f;
        });
      });
    });

    return () => {
      unlistenConnected.then((fn) => fn());
      unlistenPartnerPresence.then((fn) => fn());
    };
  }, []);

  return {
    localUser,
    friends,
    partner,
    isLoading,
    isConnected,
    connectionState,
    lastSyncTime,
    pendingActionsCount,
    error,
    loadLocalUser,
    loadFriends,
    setFriendCode,
    setUsername,
    addFriend,
    addFriendByCode,
    validateFriendCode,
    removeFriend,
    updateNickname,
    sendPoke,
    createDemoData,
    clearAllData,
    connectToServer,
    disconnectFromServer,
    syncNow,
  };
}
