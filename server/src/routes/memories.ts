import { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { db, DbMemory } from '../database';
import { getPartner } from '../middleware/auth';

interface CreateMemoryBody {
  memory_type: string;
  content_text?: string;
  caption?: string;
  target_date?: number;
}

interface GetMemoriesQuery {
  since?: string;
  limit?: string;
  type?: string;
}

const VALID_MEMORY_TYPES = ['photo', 'video', 'voice', 'note', 'countdown', 'milestone'];

export async function memoriesRoutes(fastify: FastifyInstance): Promise<void> {
  // Get memories
  fastify.get<{ Querystring: GetMemoriesQuery }>('/', async (request, reply) => {
    const user = request.user!;
    const partner = getPartner(user.id);

    if (!partner) {
      return reply.status(404).send({ error: 'No partner found' });
    }

    const since = request.query.since ? parseInt(request.query.since, 10) : 0;
    const limit = request.query.limit ? parseInt(request.query.limit, 10) : 100;
    const type = request.query.type;

    let query = `
      SELECT * FROM memories
      WHERE ((user_id = ? AND partner_id = ?) OR (user_id = ? AND partner_id = ?))
        AND created_at > ?
    `;
    const params: (string | number)[] = [user.id, partner.id, partner.id, user.id, since];

    if (type && VALID_MEMORY_TYPES.includes(type)) {
      query += ' AND memory_type = ?';
      params.push(type);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const stmt = db.prepare(query);
    const memories = stmt.all(...params) as DbMemory[];

    return {
      memories,
      count: memories.length,
    };
  });

  // Create a memory
  fastify.post<{ Body: CreateMemoryBody }>('/', async (request, reply) => {
    const user = request.user!;
    const partner = getPartner(user.id);

    if (!partner) {
      return reply.status(404).send({ error: 'No partner found' });
    }

    const { memory_type, content_text, caption, target_date } = request.body;

    if (!memory_type || !VALID_MEMORY_TYPES.includes(memory_type)) {
      return reply.status(400).send({
        error: `Invalid memory_type. Must be one of: ${VALID_MEMORY_TYPES.join(', ')}`,
      });
    }

    // Validate required fields based on type
    if (memory_type === 'countdown' && !target_date) {
      return reply.status(400).send({ error: 'target_date is required for countdown memories' });
    }

    if (['note', 'countdown', 'milestone'].includes(memory_type) && !content_text) {
      return reply.status(400).send({ error: 'content_text is required for this memory type' });
    }

    const memoryId = uuidv4();
    const now = Date.now();

    const stmt = db.prepare(`
      INSERT INTO memories (id, user_id, partner_id, memory_type, content_text, caption, target_date, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(memoryId, user.id, partner.id, memory_type, content_text || null, caption || null, target_date || null, now);

    return {
      id: memoryId,
      user_id: user.id,
      partner_id: partner.id,
      memory_type,
      content_text: content_text || null,
      caption: caption || null,
      target_date: target_date || null,
      created_at: now,
    };
  });

  // Delete a memory
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const user = request.user!;
    const { id } = request.params;

    // Only allow deleting own memories
    const checkStmt = db.prepare('SELECT user_id FROM memories WHERE id = ?');
    const memory = checkStmt.get(id) as { user_id: string } | undefined;

    if (!memory) {
      return reply.status(404).send({ error: 'Memory not found' });
    }

    if (memory.user_id !== user.id) {
      return reply.status(403).send({ error: 'Cannot delete memory created by partner' });
    }

    const deleteStmt = db.prepare('DELETE FROM memories WHERE id = ?');
    deleteStmt.run(id);

    return { success: true };
  });

  // Get countdowns specifically
  fastify.get('/countdowns', async (request, reply) => {
    const user = request.user!;
    const partner = getPartner(user.id);

    if (!partner) {
      return reply.status(404).send({ error: 'No partner found' });
    }

    const stmt = db.prepare(`
      SELECT * FROM memories
      WHERE ((user_id = ? AND partner_id = ?) OR (user_id = ? AND partner_id = ?))
        AND memory_type = 'countdown'
      ORDER BY target_date ASC
    `);

    const countdowns = stmt.all(user.id, partner.id, partner.id, user.id) as DbMemory[];

    return {
      countdowns,
      count: countdowns.length,
    };
  });
}
