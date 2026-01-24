import { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { db, DbMessage } from '../database';
import { getPartner } from '../middleware/auth';

interface SendMessageBody {
  content: string;
}

interface GetMessagesQuery {
  since?: string;
  limit?: string;
}

interface MarkReadBody {
  message_ids: string[];
}

export async function messagesRoutes(fastify: FastifyInstance): Promise<void> {
  // Get messages (sent and received)
  fastify.get<{ Querystring: GetMessagesQuery }>('/', async (request, reply) => {
    const user = request.user!;
    const partner = getPartner(user.id);

    if (!partner) {
      return reply.status(404).send({ error: 'No partner found' });
    }

    const since = request.query.since ? parseInt(request.query.since, 10) : 0;
    const limit = request.query.limit ? parseInt(request.query.limit, 10) : 100;

    // Get messages between user and partner since timestamp
    const stmt = db.prepare(`
      SELECT * FROM messages
      WHERE ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
        AND created_at > ?
      ORDER BY created_at ASC
      LIMIT ?
    `);

    const messages = stmt.all(user.id, partner.id, partner.id, user.id, since, limit) as DbMessage[];

    return {
      messages,
      count: messages.length,
    };
  });

  // Send a message to partner
  fastify.post<{ Body: SendMessageBody }>('/', async (request, reply) => {
    const user = request.user!;
    const partner = getPartner(user.id);

    if (!partner) {
      return reply.status(404).send({ error: 'No partner found' });
    }

    const { content } = request.body;

    if (!content || content.trim().length === 0) {
      return reply.status(400).send({ error: 'Message content is required' });
    }

    if (content.length > 2000) {
      return reply.status(400).send({ error: 'Message too long (max 2000 characters)' });
    }

    const messageId = uuidv4();
    const now = Date.now();

    const stmt = db.prepare(`
      INSERT INTO messages (id, sender_id, receiver_id, content, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(messageId, user.id, partner.id, content.trim(), now);

    return {
      id: messageId,
      sender_id: user.id,
      receiver_id: partner.id,
      content: content.trim(),
      created_at: now,
      read_at: null,
    };
  });

  // Mark messages as read
  fastify.post<{ Body: MarkReadBody }>('/read', async (request, reply) => {
    const user = request.user!;
    const { message_ids } = request.body;

    if (!message_ids || !Array.isArray(message_ids) || message_ids.length === 0) {
      return reply.status(400).send({ error: 'message_ids array is required' });
    }

    const now = Date.now();
    const placeholders = message_ids.map(() => '?').join(',');

    // Only mark messages as read if the user is the receiver
    const stmt = db.prepare(`
      UPDATE messages
      SET read_at = ?
      WHERE id IN (${placeholders}) AND receiver_id = ? AND read_at IS NULL
    `);
    const result = stmt.run(now, ...message_ids, user.id);

    return {
      success: true,
      updated_count: result.changes,
    };
  });

  // Get unread message count
  fastify.get('/unread-count', async (request) => {
    const user = request.user!;

    const stmt = db.prepare(`
      SELECT COUNT(*) as count FROM messages
      WHERE receiver_id = ? AND read_at IS NULL
    `);
    const result = stmt.get(user.id) as { count: number };

    return { count: result.count };
  });
}
