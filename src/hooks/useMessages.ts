import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { Message } from '../types/friends';

export interface UseMessagesReturn {
  // State
  messages: Message[];
  unreadCount: number;
  isLoading: boolean;
  isSending: boolean;
  error: string | null;

  // Actions
  loadMessages: (limit?: number, offset?: number) => Promise<void>;
  sendMessage: (content: string) => Promise<Message>;
  markAsRead: (messageIds: string[]) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refreshUnreadCount: () => Promise<void>;
}

export function useMessages(): UseMessagesReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load messages
  const loadMessages = useCallback(async (limit = 50, offset = 0) => {
    setIsLoading(true);
    setError(null);
    try {
      const msgs = await invoke<Message[]>('get_messages', { limit, offset });
      setMessages(msgs);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Send a message
  const sendMessage = useCallback(
    async (content: string): Promise<Message> => {
      setIsSending(true);
      setError(null);
      try {
        const message = await invoke<Message>('send_message', { content });
        // Add to local messages immediately
        setMessages((prev) => [...prev, message]);
        return message;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        throw new Error(msg);
      } finally {
        setIsSending(false);
      }
    },
    []
  );

  // Mark messages as read
  const markAsRead = useCallback(
    async (messageIds: string[]) => {
      try {
        await invoke('mark_messages_read', { messageIds });
        // Update local state
        setMessages((prev) =>
          prev.map((m) =>
            messageIds.includes(m.id) ? { ...m, read_at: Date.now() } : m
          )
        );
        await refreshUnreadCount();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        throw new Error(msg);
      }
    },
    []
  );

  // Mark all messages as read
  const markAllAsRead = useCallback(async () => {
    const unreadIds = messages.filter((m) => !m.read_at).map((m) => m.id);
    if (unreadIds.length > 0) {
      await markAsRead(unreadIds);
    }
  }, [messages, markAsRead]);

  // Refresh unread count
  const refreshUnreadCount = useCallback(async () => {
    try {
      const count = await invoke<number>('get_unread_message_count');
      setUnreadCount(count);
    } catch (e) {
      console.error('Failed to get unread count:', e);
    }
  }, []);

  // Listen for new messages
  useEffect(() => {
    const unlisten = listen<Message>('friends:new_message', (event) => {
      setMessages((prev) => [...prev, event.payload]);
      setUnreadCount((prev) => prev + 1);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Initial load
  useEffect(() => {
    loadMessages();
    refreshUnreadCount();
  }, [loadMessages, refreshUnreadCount]);

  return {
    messages,
    unreadCount,
    isLoading,
    isSending,
    error,
    loadMessages,
    sendMessage,
    markAsRead,
    markAllAsRead,
    refreshUnreadCount,
  };
}
