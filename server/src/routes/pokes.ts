import { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { db, DbPoke } from '../database';
import { getPartner } from '../middleware/auth';

interface SendPokeBody {
  emoji: string;
}

interface GetPokesQuery {
  since?: string;
  limit?: string;
}

const ALLOWED_EMOJIS = ['❤️', '😘', '🤗', '💕', '🥺', '💖', '✨', '🌟', '💫', '🎉', '👋', '😊', '🥰', '💗'];

export async function pokesRoutes(fastify: FastifyInstance): Promise<void> {
  // Get received pokes
  fastify.get<{ Querystring: GetPokesQuery }>('/', async (request, reply) => {
    const user = request.user!;

    const since = request.query.since ? parseInt(request.query.since, 10) : 0;
    const limit = request.query.limit ? parseInt(request.query.limit, 10) : 50;

    // Get pokes received by user since timestamp
    const stmt = db.prepare(`
      SELECT p.*, u.username as sender_username
      FROM pokes p
      JOIN users u ON p.sender_id = u.id
      WHERE p.receiver_id = ? AND p.created_at > ?
      ORDER BY p.created_at DESC
      LIMIT ?
    `);

    const pokes = stmt.all(user.id, since, limit) as (DbPoke & { sender_username: string })[];

    return {
      pokes,
      count: pokes.length,
    };
  });

  // Send a poke to partner
  fastify.post<{ Body: SendPokeBody }>('/', async (request, reply) => {
    const user = request.user!;
    const partner = getPartner(user.id);

    if (!partner) {
      return reply.status(404).send({ error: 'No partner found' });
    }

    const { emoji } = request.body;

    if (!emoji) {
      return reply.status(400).send({ error: 'Emoji is required' });
    }

    // Validate emoji (allow any emoji, but log if not in common list)
    // This is a permissive approach - we accept any string but warn on unusual ones
    if (emoji.length > 10) {
      return reply.status(400).send({ error: 'Invalid emoji' });
    }

    const pokeId = uuidv4();
    const now = Date.now();

    const stmt = db.prepare(`
      INSERT INTO pokes (id, sender_id, receiver_id, emoji, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(pokeId, user.id, partner.id, emoji, now);

    return {
      id: pokeId,
      sender_id: user.id,
      receiver_id: partner.id,
      emoji,
      created_at: now,
    };
  });

  // Get sent pokes (for confirmation/history)
  fastify.get<{ Querystring: GetPokesQuery }>('/sent', async (request) => {
    const user = request.user!;

    const since = request.query.since ? parseInt(request.query.since, 10) : 0;
    const limit = request.query.limit ? parseInt(request.query.limit, 10) : 50;

    const stmt = db.prepare(`
      SELECT p.*, u.username as receiver_username
      FROM pokes p
      JOIN users u ON p.receiver_id = u.id
      WHERE p.sender_id = ? AND p.created_at > ?
      ORDER BY p.created_at DESC
      LIMIT ?
    `);

    const pokes = stmt.all(user.id, since, limit) as (DbPoke & { receiver_username: string })[];

    return {
      pokes,
      count: pokes.length,
    };
  });
}
