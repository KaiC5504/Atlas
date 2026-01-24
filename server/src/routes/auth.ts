import { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { db, DbUser } from '../database';

interface RegisterBody {
  friend_code: string;
  username: string;
}

interface ValidateParams {
  code: string;
}

interface LinkPartnerBody {
  partner_code: string;
}

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  // Register a new user or return existing user's token
  fastify.post<{ Body: RegisterBody }>('/register', async (request, reply) => {
    const { friend_code, username } = request.body;

    if (!friend_code || !username) {
      return reply.status(400).send({ error: 'friend_code and username are required' });
    }

    if (friend_code.length > 32 || username.length > 32) {
      return reply.status(400).send({ error: 'friend_code and username must be 32 characters or less' });
    }

    // Check if user already exists with this friend code
    const existingStmt = db.prepare('SELECT * FROM users WHERE friend_code = ?');
    const existing = existingStmt.get(friend_code) as DbUser | undefined;

    if (existing) {
      // User exists, update username if different and return token
      if (existing.username !== username) {
        const updateStmt = db.prepare('UPDATE users SET username = ? WHERE id = ?');
        updateStmt.run(username, existing.id);
      }

      return {
        id: existing.id,
        friend_code: existing.friend_code,
        username: username,
        auth_token: existing.auth_token,
        partner_id: existing.partner_id,
      };
    }

    // Create new user
    const userId = uuidv4();
    const authToken = uuidv4();
    const now = Date.now();

    const insertStmt = db.prepare(`
      INSERT INTO users (id, friend_code, username, auth_token, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    insertStmt.run(userId, friend_code, username, authToken, now);

    // Create initial presence record
    const presenceStmt = db.prepare(`
      INSERT INTO presence (user_id, status, last_updated)
      VALUES (?, 'offline', ?)
    `);
    presenceStmt.run(userId, now);

    return {
      id: userId,
      friend_code,
      username,
      auth_token: authToken,
      partner_id: null,
    };
  });

  // Validate a friend code exists
  fastify.get<{ Params: ValidateParams }>('/validate/:code', async (request, reply) => {
    const { code } = request.params;

    const stmt = db.prepare('SELECT id, friend_code, username FROM users WHERE friend_code = ?');
    const user = stmt.get(code) as Pick<DbUser, 'id' | 'friend_code' | 'username'> | undefined;

    if (!user) {
      return reply.status(404).send({ error: 'Friend code not found', valid: false });
    }

    return {
      valid: true,
      user: {
        id: user.id,
        friend_code: user.friend_code,
        username: user.username,
      },
    };
  });

  // Link partner by friend code (requires auth)
  fastify.post<{ Body: LinkPartnerBody }>('/link-partner', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      return reply.status(401).send({ error: 'Authorization required' });
    }

    const token = authHeader.replace('Bearer ', '');
    const userStmt = db.prepare('SELECT * FROM users WHERE auth_token = ?');
    const user = userStmt.get(token) as DbUser | undefined;

    if (!user) {
      return reply.status(401).send({ error: 'Invalid auth token' });
    }

    const { partner_code } = request.body;

    if (!partner_code) {
      return reply.status(400).send({ error: 'partner_code is required' });
    }

    // Find partner by code
    const partnerStmt = db.prepare('SELECT * FROM users WHERE friend_code = ?');
    const partner = partnerStmt.get(partner_code) as DbUser | undefined;

    if (!partner) {
      return reply.status(404).send({ error: 'Partner not found with that code' });
    }

    if (partner.id === user.id) {
      return reply.status(400).send({ error: 'Cannot add yourself as partner' });
    }

    // Link both users as partners (bidirectional)
    const updateUser = db.prepare('UPDATE users SET partner_id = ? WHERE id = ?');
    updateUser.run(partner.id, user.id);
    updateUser.run(user.id, partner.id);

    return {
      success: true,
      partner: {
        id: partner.id,
        friend_code: partner.friend_code,
        username: partner.username,
      },
    };
  });

  // Unlink partner (requires auth)
  fastify.post('/unlink-partner', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      return reply.status(401).send({ error: 'Authorization required' });
    }

    const token = authHeader.replace('Bearer ', '');
    const userStmt = db.prepare('SELECT * FROM users WHERE auth_token = ?');
    const user = userStmt.get(token) as DbUser | undefined;

    if (!user) {
      return reply.status(401).send({ error: 'Invalid auth token' });
    }

    if (!user.partner_id) {
      return reply.status(400).send({ error: 'No partner to unlink' });
    }

    // Unlink both users
    const updateStmt = db.prepare('UPDATE users SET partner_id = NULL WHERE id = ? OR id = ?');
    updateStmt.run(user.id, user.partner_id);

    return { success: true };
  });
}
