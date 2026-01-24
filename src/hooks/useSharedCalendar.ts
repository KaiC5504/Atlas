import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { CalendarEvent, CreateCalendarEventRequest } from '../types/friends';

export interface UseSharedCalendarReturn {
  // State
  events: CalendarEvent[];
  upcomingEvents: CalendarEvent[];
  isLoading: boolean;
  error: string | null;

  // Actions
  loadEvents: () => Promise<void>;
  createEvent: (request: CreateCalendarEventRequest) => Promise<CalendarEvent>;
  updateEvent: (event: CalendarEvent) => Promise<void>;
  deleteEvent: (eventId: string) => Promise<void>;

  // Computed
  todayEvents: CalendarEvent[];
  thisWeekEvents: CalendarEvent[];
}

export function useSharedCalendar(): UseSharedCalendarReturn {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Computed: events happening today
  const todayEvents = events.filter((event) => {
    const eventDate = new Date(event.datetime);
    const today = new Date();
    return (
      eventDate.getFullYear() === today.getFullYear() &&
      eventDate.getMonth() === today.getMonth() &&
      eventDate.getDate() === today.getDate()
    );
  });

  // Computed: events happening this week
  const thisWeekEvents = events.filter((event) => {
    const eventDate = new Date(event.datetime);
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return eventDate >= now && eventDate <= weekFromNow;
  });

  // Load all events
  const loadEvents = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [allEvents, upcoming] = await Promise.all([
        invoke<CalendarEvent[]>('get_calendar_events'),
        invoke<CalendarEvent[]>('get_upcoming_events'),
      ]);

      // Sort events by datetime
      allEvents.sort((a, b) => a.datetime - b.datetime);
      upcoming.sort((a, b) => a.datetime - b.datetime);

      setEvents(allEvents);
      setUpcomingEvents(upcoming);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Create a new event
  const createEvent = useCallback(
    async (request: CreateCalendarEventRequest): Promise<CalendarEvent> => {
      try {
        const event = await invoke<CalendarEvent>('create_calendar_event', { request });
        await loadEvents();
        return event;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        throw new Error(msg);
      }
    },
    [loadEvents]
  );

  // Update an event
  const updateEvent = useCallback(
    async (event: CalendarEvent) => {
      try {
        await invoke('update_calendar_event', { event });
        await loadEvents();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        throw new Error(msg);
      }
    },
    [loadEvents]
  );

  // Delete an event
  const deleteEvent = useCallback(
    async (eventId: string) => {
      try {
        await invoke('delete_calendar_event', { eventId });
        await loadEvents();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        throw new Error(msg);
      }
    },
    [loadEvents]
  );

  // Initial load
  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  return {
    events,
    upcomingEvents,
    isLoading,
    error,
    loadEvents,
    createEvent,
    updateEvent,
    deleteEvent,
    todayEvents,
    thisWeekEvents,
  };
}
