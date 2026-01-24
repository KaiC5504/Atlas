import { FastifyInstance } from 'fastify';
import { db, DbGachaStats } from '../database';
import { getPartner } from '../middleware/auth';

interface UpdateGachaStatsBody {
  game: string;
  total_pulls: number;
  five_star_count: number;
  four_star_count: number;
  average_pity: number;
  current_pity: number;
}

interface GachaStatsResponse {
  user_id: string;
  username: string;
  game: string;
  total_pulls: number;
  five_star_count: number;
  four_star_count: number;
  average_pity: number;
  current_pity: number;
  updated_at: number;
}

export async function gachaStatsRoutes(fastify: FastifyInstance): Promise<void> {
  // Update own gacha stats for a game
  fastify.post<{ Body: UpdateGachaStatsBody }>('/', async (request, reply) => {
    const user = request.user!;
    const { game, total_pulls, five_star_count, four_star_count, average_pity, current_pity } = request.body;

    if (!game) {
      return reply.status(400).send({ error: 'Game is required' });
    }

    const now = Date.now();

    // Upsert gacha stats
    const stmt = db.prepare(`
      INSERT INTO gacha_stats (user_id, game, total_pulls, five_star_count, four_star_count, average_pity, current_pity, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, game) DO UPDATE SET
        total_pulls = excluded.total_pulls,
        five_star_count = excluded.five_star_count,
        four_star_count = excluded.four_star_count,
        average_pity = excluded.average_pity,
        current_pity = excluded.current_pity,
        updated_at = excluded.updated_at
    `);

    stmt.run(user.id, game, total_pulls, five_star_count, four_star_count, average_pity, current_pity, now);

    return {
      success: true,
      game,
      updated_at: now,
    };
  });

  // Get own gacha stats
  fastify.get('/', async (request, reply) => {
    const user = request.user!;

    const stmt = db.prepare('SELECT * FROM gacha_stats WHERE user_id = ?');
    const stats = stmt.all(user.id) as DbGachaStats[];

    return {
      stats,
    };
  });

  // Get partner's gacha stats
  fastify.get('/partner', async (request, reply) => {
    const user = request.user!;
    const partner = getPartner(user.id);

    if (!partner) {
      return reply.status(404).send({ error: 'No partner linked' });
    }

    const stmt = db.prepare('SELECT * FROM gacha_stats WHERE user_id = ?');
    const stats = stmt.all(partner.id) as DbGachaStats[];

    // Add username to response
    const response: GachaStatsResponse[] = stats.map((s) => ({
      user_id: s.user_id,
      username: partner.username,
      game: s.game,
      total_pulls: s.total_pulls,
      five_star_count: s.five_star_count,
      four_star_count: s.four_star_count,
      average_pity: s.average_pity,
      current_pity: s.current_pity,
      updated_at: s.updated_at,
    }));

    return {
      partner_id: partner.id,
      partner_username: partner.username,
      stats: response,
    };
  });

  // Get partner's stats for a specific game
  fastify.get<{ Params: { game: string } }>('/partner/:game', async (request, reply) => {
    const user = request.user!;
    const partner = getPartner(user.id);
    const { game } = request.params;

    if (!partner) {
      return reply.status(404).send({ error: 'No partner linked' });
    }

    const stmt = db.prepare('SELECT * FROM gacha_stats WHERE user_id = ? AND game = ?');
    const stats = stmt.get(partner.id, game) as DbGachaStats | undefined;

    if (!stats) {
      return reply.status(404).send({ error: 'No stats found for this game' });
    }

    return {
      user_id: stats.user_id,
      username: partner.username,
      game: stats.game,
      total_pulls: stats.total_pulls,
      five_star_count: stats.five_star_count,
      four_star_count: stats.four_star_count,
      average_pity: stats.average_pity,
      current_pity: stats.current_pity,
      updated_at: stats.updated_at,
    };
  });
}
