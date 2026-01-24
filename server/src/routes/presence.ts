import { FastifyInstance } from 'fastify';
import { db, DbPresence } from '../database';
import { getPartner } from '../middleware/auth';

interface UpdatePresenceBody {
  status?: string;
  current_game?: string | null;
  mood_message?: string | null;
  performance_cpu?: number | null;
  performance_gpu?: number | null;
  performance_fps?: number | null;
  performance_memory?: number | null;
}

export async function presenceRoutes(fastify: FastifyInstance): Promise<void> {
  // Update own presence
  fastify.post<{ Body: UpdatePresenceBody }>('/', async (request, reply) => {
    const user = request.user!;
    const {
      status,
      current_game,
      mood_message,
      performance_cpu,
      performance_gpu,
      performance_fps,
      performance_memory,
    } = request.body;

    const now = Date.now();

    // Check if presence record exists
    const existingStmt = db.prepare('SELECT user_id FROM presence WHERE user_id = ?');
    const existing = existingStmt.get(user.id);

    if (existing) {
      // Update existing presence
      const updateStmt = db.prepare(`
        UPDATE presence SET
          status = COALESCE(?, status),
          current_game = ?,
          mood_message = ?,
          performance_cpu = ?,
          performance_gpu = ?,
          performance_fps = ?,
          performance_memory = ?,
          last_updated = ?
        WHERE user_id = ?
      `);
      updateStmt.run(
        status,
        current_game,
        mood_message,
        performance_cpu,
        performance_gpu,
        performance_fps,
        performance_memory,
        now,
        user.id
      );
    } else {
      // Create new presence record
      const insertStmt = db.prepare(`
        INSERT INTO presence (user_id, status, current_game, mood_message,
          performance_cpu, performance_gpu, performance_fps, performance_memory, last_updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      insertStmt.run(
        user.id,
        status || 'online',
        current_game,
        mood_message,
        performance_cpu,
        performance_gpu,
        performance_fps,
        performance_memory,
        now
      );
    }

    return { success: true, updated_at: now };
  });

  // Get partner's presence
  fastify.get('/partner', async (request, reply) => {
    const user = request.user!;
    const partner = getPartner(user.id);

    if (!partner) {
      return reply.status(404).send({ error: 'No partner found' });
    }

    const stmt = db.prepare('SELECT * FROM presence WHERE user_id = ?');
    const presence = stmt.get(partner.id) as DbPresence | undefined;

    if (!presence) {
      // Return default offline presence
      return {
        user_id: partner.id,
        username: partner.username,
        status: 'offline',
        current_game: null,
        mood_message: null,
        performance_stats: null,
        last_updated: partner.created_at,
      };
    }

    return {
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
  });

  // Get own presence
  fastify.get('/me', async (request) => {
    const user = request.user!;

    const stmt = db.prepare('SELECT * FROM presence WHERE user_id = ?');
    const presence = stmt.get(user.id) as DbPresence | undefined;

    if (!presence) {
      return {
        user_id: user.id,
        status: 'offline',
        current_game: null,
        mood_message: null,
        performance_stats: null,
        last_updated: user.created_at,
      };
    }

    return {
      user_id: presence.user_id,
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
  });
}
