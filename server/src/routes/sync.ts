import { FastifyInstance } from 'fastify';
import { db, DbMessage, DbPoke, DbMemory, DbCalendarEvent, DbPresence } from '../database';
import { getPartner } from '../middleware/auth';

interface SyncQuery {
  since?: string;
}

// Calendar event with boolean is_recurring (converted from SQLite integer)
type CalendarEventResponse = Omit<DbCalendarEvent, 'is_recurring'> & { is_recurring: boolean };

interface SyncResponse {
  timestamp: number;
  presence: {
    user_id: string;
    username: string;
    status: string;
    current_game: string | null;
    mood_message: string | null;
    performance_stats: {
      cpu_usage: number | null;
      gpu_usage: number | null;
      fps: number | null;
      memory_usage: number | null;
    } | null;
    last_updated: number;
  } | null;
  messages: DbMessage[];
  pokes: (DbPoke & { sender_username: string })[];
  memories: DbMemory[];
  calendar_events: CalendarEventResponse[];
  has_new_data: boolean;
}

export async function syncRoutes(fastify: FastifyInstance): Promise<void> {
  // Unified poll endpoint - returns all changes since timestamp
  fastify.get<{ Querystring: SyncQuery }>('/poll', async (request, reply) => {
    const user = request.user!;
    const partner = getPartner(user.id);
    const since = request.query.since ? parseInt(request.query.since, 10) : 0;
    const now = Date.now();

    const response: SyncResponse = {
      timestamp: now,
      presence: null,
      messages: [],
      pokes: [],
      memories: [],
      calendar_events: [],
      has_new_data: false,
    };

    // If no partner, return empty response
    if (!partner) {
      return response;
    }

    // Get partner's presence
    const presenceStmt = db.prepare('SELECT * FROM presence WHERE user_id = ?');
    const presence = presenceStmt.get(partner.id) as DbPresence | undefined;

    if (presence) {
      response.presence = {
        user_id: presence.user_id,
        username: partner.username,
        status: presence.status,
        current_game: presence.current_game,
        mood_message: presence.mood_message,
        performance_stats: presence.performance_cpu !== null ? {
          cpu_usage: presence.performance_cpu,
          gpu_usage: presence.performance_gpu,
          fps: presence.performance_fps,
          memory_usage: presence.performance_memory,
        } : null,
        last_updated: presence.last_updated,
      };

      if (presence.last_updated > since) {
        response.has_new_data = true;
      }
    }

    // Get new messages
    const messagesStmt = db.prepare(`
      SELECT * FROM messages
      WHERE ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
        AND created_at > ?
      ORDER BY created_at ASC
      LIMIT 100
    `);
    response.messages = messagesStmt.all(user.id, partner.id, partner.id, user.id, since) as DbMessage[];
    if (response.messages.length > 0) {
      response.has_new_data = true;
    }

    // Get new pokes (received only)
    const pokesStmt = db.prepare(`
      SELECT p.*, u.username as sender_username
      FROM pokes p
      JOIN users u ON p.sender_id = u.id
      WHERE p.receiver_id = ? AND p.created_at > ?
      ORDER BY p.created_at DESC
      LIMIT 20
    `);
    response.pokes = pokesStmt.all(user.id, since) as (DbPoke & { sender_username: string })[];
    if (response.pokes.length > 0) {
      response.has_new_data = true;
    }

    // Get new/updated memories
    const memoriesStmt = db.prepare(`
      SELECT * FROM memories
      WHERE ((user_id = ? AND partner_id = ?) OR (user_id = ? AND partner_id = ?))
        AND created_at > ?
      ORDER BY created_at DESC
      LIMIT 50
    `);
    response.memories = memoriesStmt.all(user.id, partner.id, partner.id, user.id, since) as DbMemory[];
    if (response.memories.length > 0) {
      response.has_new_data = true;
    }

    // Get new/updated calendar events
    const eventsStmt = db.prepare(`
      SELECT * FROM calendar_events
      WHERE ((user_id = ? AND partner_id = ?) OR (user_id = ? AND partner_id = ?))
        AND updated_at > ?
      ORDER BY datetime ASC
      LIMIT 50
    `);
    const events = eventsStmt.all(user.id, partner.id, partner.id, user.id, since) as DbCalendarEvent[];
    response.calendar_events = events.map((e): CalendarEventResponse => ({
      id: e.id,
      user_id: e.user_id,
      partner_id: e.partner_id,
      title: e.title,
      description: e.description,
      datetime: e.datetime,
      timezone: e.timezone,
      reminder_minutes: e.reminder_minutes,
      is_recurring: !!e.is_recurring,
      recurrence_pattern: e.recurrence_pattern,
      created_at: e.created_at,
      updated_at: e.updated_at,
    }));
    if (response.calendar_events.length > 0) {
      response.has_new_data = true;
    }

    return response;
  });

  // Get current sync state (for initial load)
  fastify.get('/state', async (request, reply) => {
    const user = request.user!;
    const partner = getPartner(user.id);
    const now = Date.now();

    if (!partner) {
      return {
        timestamp: now,
        has_partner: false,
        partner: null,
        presence: null,
        recent_messages: [],
        unread_count: 0,
        memories_count: 0,
        upcoming_events: [],
      };
    }

    // Get partner info
    const partnerInfo = {
      id: partner.id,
      friend_code: partner.friend_code,
      username: partner.username,
    };

    // Get partner's presence
    const presenceStmt = db.prepare('SELECT * FROM presence WHERE user_id = ?');
    const presence = presenceStmt.get(partner.id) as DbPresence | undefined;

    // Get recent messages (last 20)
    const messagesStmt = db.prepare(`
      SELECT * FROM messages
      WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
      ORDER BY created_at DESC
      LIMIT 20
    `);
    const recentMessages = messagesStmt.all(user.id, partner.id, partner.id, user.id) as DbMessage[];

    // Get unread count
    const unreadStmt = db.prepare(`
      SELECT COUNT(*) as count FROM messages
      WHERE receiver_id = ? AND read_at IS NULL
    `);
    const unreadResult = unreadStmt.get(user.id) as { count: number };

    // Get memories count
    const memoriesCountStmt = db.prepare(`
      SELECT COUNT(*) as count FROM memories
      WHERE (user_id = ? AND partner_id = ?) OR (user_id = ? AND partner_id = ?)
    `);
    const memoriesResult = memoriesCountStmt.get(user.id, partner.id, partner.id, user.id) as { count: number };

    // Get upcoming events (next 7 days)
    const weekLater = now + 7 * 24 * 60 * 60 * 1000;
    const eventsStmt = db.prepare(`
      SELECT * FROM calendar_events
      WHERE ((user_id = ? AND partner_id = ?) OR (user_id = ? AND partner_id = ?))
        AND datetime >= ? AND datetime <= ?
      ORDER BY datetime ASC
      LIMIT 10
    `);
    const upcomingEvents = eventsStmt.all(user.id, partner.id, partner.id, user.id, now, weekLater) as DbCalendarEvent[];

    return {
      timestamp: now,
      has_partner: true,
      partner: partnerInfo,
      presence: presence ? {
        user_id: presence.user_id,
        username: partner.username,
        status: presence.status,
        current_game: presence.current_game,
        mood_message: presence.mood_message,
        performance_stats: presence.performance_cpu !== null ? {
          cpu_usage: presence.performance_cpu,
          gpu_usage: presence.performance_gpu,
          fps: presence.performance_fps,
          memory_usage: presence.performance_memory,
        } : null,
        last_updated: presence.last_updated,
      } : null,
      recent_messages: recentMessages.reverse(), // Oldest first
      unread_count: unreadResult.count,
      memories_count: memoriesResult.count,
      upcoming_events: upcomingEvents.map((e): CalendarEventResponse => ({
        id: e.id,
        user_id: e.user_id,
        partner_id: e.partner_id,
        title: e.title,
        description: e.description,
        datetime: e.datetime,
        timezone: e.timezone,
        reminder_minutes: e.reminder_minutes,
        is_recurring: !!e.is_recurring,
        recurrence_pattern: e.recurrence_pattern,
        created_at: e.created_at,
        updated_at: e.updated_at,
      })),
    };
  });
}
