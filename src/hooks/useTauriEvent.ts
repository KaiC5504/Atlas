// Hook for listening to Tauri events from the Rust backend
import { useEffect, useRef } from 'react';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

/**
 * Custom hook to listen for Tauri events from the Rust backend.
 * Automatically sets up the listener on mount and cleans up on unmount.
 *
 * @param eventName - The name of the Tauri event to listen for
 * @param callback - Function to call when the event is received
 */
export function useTauriEvent<T>(
  eventName: string,
  callback: (payload: T) => void
): void {
  // Use ref to keep callback stable across re-renders
  const callbackRef = useRef(callback);

  // Update ref when callback changes
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    // Set up the listener
    const setupListener = async () => {
      unlisten = await listen<T>(eventName, (event) => {
        callbackRef.current(event.payload);
      });
    };

    setupListener();

    // Cleanup on unmount
    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [eventName]);
}

/**
 * Hook to listen for multiple Tauri events at once.
 *
 * @param events - Array of [eventName, callback] pairs
 */
export function useTauriEvents<T>(
  events: Array<[string, (payload: T) => void]>
): void {
  useEffect(() => {
    const unlistenFns: UnlistenFn[] = [];

    // Set up all listeners
    const setupListeners = async () => {
      for (const [eventName, callback] of events) {
        const unlisten = await listen<T>(eventName, (event) => {
          callback(event.payload);
        });
        unlistenFns.push(unlisten);
      }
    };

    setupListeners();

    // Cleanup all listeners on unmount
    return () => {
      unlistenFns.forEach((unlisten) => unlisten());
    };
  }, [events]);
}
