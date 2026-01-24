import { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { db, DbCalendarEvent } from '../database';
import { getPartner } from '../middleware/auth';

interface CreateEventBody {
  title: string;
  description?: string;
  datetime: number;
  timezone: string;
  reminder_minutes?: number;
  is_recurring?: boolean;
  recurrence_pattern?: string;
}

interface UpdateEventBody {
  title?: string;
  description?: string;
  datetime?: number;
  timezone?: string;
  reminder_minutes?: number;
  is_recurring?: boolean;
  recurrence_pattern?: string;
}

interface GetEventsQuery {
  since?: string;
  limit?: string;
  upcoming?: string;
}

export async function calendarRoutes(fastify: FastifyInstance): Promise<void> {
  // Get calendar events
  fastify.get<{ Querystring: GetEventsQuery }>('/', async (request, reply) => {
    const user = request.user!;
    const partner = getPartner(user.id);

    if (!partner) {
      return reply.status(404).send({ error: 'No partner found' });
    }

    const since = request.query.since ? parseInt(request.query.since, 10) : 0;
    const limit = request.query.limit ? parseInt(request.query.limit, 10) : 100;
    const upcoming = request.query.upcoming === 'true';

    let query: string;
    let params: (string | number)[];

    if (upcoming) {
      // Get upcoming events (next 30 days)
      const now = Date.now();
      const thirtyDays = 30 * 24 * 60 * 60 * 1000;
      query = `
        SELECT * FROM calendar_events
        WHERE ((user_id = ? AND partner_id = ?) OR (user_id = ? AND partner_id = ?))
          AND datetime >= ? AND datetime <= ?
        ORDER BY datetime ASC
        LIMIT ?
      `;
      params = [user.id, partner.id, partner.id, user.id, now, now + thirtyDays, limit];
    } else {
      // Get events updated since timestamp
      query = `
        SELECT * FROM calendar_events
        WHERE ((user_id = ? AND partner_id = ?) OR (user_id = ? AND partner_id = ?))
          AND updated_at > ?
        ORDER BY datetime ASC
        LIMIT ?
      `;
      params = [user.id, partner.id, partner.id, user.id, since, limit];
    }

    const stmt = db.prepare(query);
    const events = stmt.all(...params) as DbCalendarEvent[];

    // Convert is_recurring from int to boolean
    const formattedEvents = events.map(e => ({
      ...e,
      is_recurring: !!e.is_recurring,
    }));

    return {
      events: formattedEvents,
      count: formattedEvents.length,
    };
  });

  // Create a calendar event
  fastify.post<{ Body: CreateEventBody }>('/', async (request, reply) => {
    const user = request.user!;
    const partner = getPartner(user.id);

    if (!partner) {
      return reply.status(404).send({ error: 'No partner found' });
    }

    const { title, description, datetime, timezone, reminder_minutes, is_recurring, recurrence_pattern } = request.body;

    if (!title || title.trim().length === 0) {
      return reply.status(400).send({ error: 'Title is required' });
    }

    if (!datetime || datetime < 0) {
      return reply.status(400).send({ error: 'Valid datetime is required' });
    }

    if (!timezone) {
      return reply.status(400).send({ error: 'Timezone is required' });
    }

    const eventId = uuidv4();
    const now = Date.now();

    const stmt = db.prepare(`
      INSERT INTO calendar_events (id, user_id, partner_id, title, description, datetime, timezone,
        reminder_minutes, is_recurring, recurrence_pattern, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      eventId,
      user.id,
      partner.id,
      title.trim(),
      description || null,
      datetime,
      timezone,
      reminder_minutes || null,
      is_recurring ? 1 : 0,
      recurrence_pattern || null,
      now,
      now
    );

    return {
      id: eventId,
      user_id: user.id,
      partner_id: partner.id,
      title: title.trim(),
      description: description || null,
      datetime,
      timezone,
      reminder_minutes: reminder_minutes || null,
      is_recurring: !!is_recurring,
      recurrence_pattern: recurrence_pattern || null,
      created_at: now,
      updated_at: now,
    };
  });

  // Update a calendar event
  fastify.put<{ Params: { id: string }; Body: UpdateEventBody }>('/:id', async (request, reply) => {
    const user = request.user!;
    const partner = getPartner(user.id);
    const { id } = request.params;

    if (!partner) {
      return reply.status(404).send({ error: 'No partner found' });
    }

    // Check if event exists and belongs to user or partner
    const checkStmt = db.prepare('SELECT * FROM calendar_events WHERE id = ?');
    const existing = checkStmt.get(id) as DbCalendarEvent | undefined;

    if (!existing) {
      return reply.status(404).send({ error: 'Event not found' });
    }

    // Allow both partners to update shared events
    if (existing.user_id !== user.id && existing.user_id !== partner.id) {
      return reply.status(403).send({ error: 'Cannot update this event' });
    }

    const { title, description, datetime, timezone, reminder_minutes, is_recurring, recurrence_pattern } = request.body;
    const now = Date.now();

    const stmt = db.prepare(`
      UPDATE calendar_events SET
        title = COALESCE(?, title),
        description = ?,
        datetime = COALESCE(?, datetime),
        timezone = COALESCE(?, timezone),
        reminder_minutes = ?,
        is_recurring = COALESCE(?, is_recurring),
        recurrence_pattern = ?,
        updated_at = ?
      WHERE id = ?
    `);
    stmt.run(
      title?.trim(),
      description !== undefined ? description : existing.description,
      datetime,
      timezone,
      reminder_minutes !== undefined ? reminder_minutes : existing.reminder_minutes,
      is_recurring !== undefined ? (is_recurring ? 1 : 0) : null,
      recurrence_pattern !== undefined ? recurrence_pattern : existing.recurrence_pattern,
      now,
      id
    );

    // Fetch updated event
    const updatedStmt = db.prepare('SELECT * FROM calendar_events WHERE id = ?');
    const updated = updatedStmt.get(id) as DbCalendarEvent;

    return {
      ...updated,
      is_recurring: !!updated.is_recurring,
    };
  });

  // Delete a calendar event
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const user = request.user!;
    const partner = getPartner(user.id);
    const { id } = request.params;

    if (!partner) {
      return reply.status(404).send({ error: 'No partner found' });
    }

    // Check if event exists
    const checkStmt = db.prepare('SELECT user_id FROM calendar_events WHERE id = ?');
    const event = checkStmt.get(id) as { user_id: string } | undefined;

    if (!event) {
      return reply.status(404).send({ error: 'Event not found' });
    }

    // Allow both partners to delete shared events
    if (event.user_id !== user.id && event.user_id !== partner.id) {
      return reply.status(403).send({ error: 'Cannot delete this event' });
    }

    const deleteStmt = db.prepare('DELETE FROM calendar_events WHERE id = ?');
    deleteStmt.run(id);

    return { success: true };
  });
}
