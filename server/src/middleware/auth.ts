import { FastifyRequest, FastifyReply } from 'fastify';
import { db, DbUser } from '../database';

// Extend FastifyRequest to include user
declare module 'fastify' {
  interface FastifyRequest {
    user?: DbUser;
  }
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader) {
    return reply.status(401).send({ error: 'Missing authorization header' });
  }

  const [bearer, token] = authHeader.split(' ');

  if (bearer !== 'Bearer' || !token) {
    return reply.status(401).send({ error: 'Invalid authorization format' });
  }

  // Look up user by auth token
  const stmt = db.prepare('SELECT * FROM users WHERE auth_token = ?');
  const user = stmt.get(token) as DbUser | undefined;

  if (!user) {
    return reply.status(401).send({ error: 'Invalid auth token' });
  }

  // Attach user to request for use in route handlers
  request.user = user;
}

// Helper to get the authenticated user's partner
export function getPartner(userId: string): DbUser | null {
  // First check if user has a partner_id set
  const userStmt = db.prepare('SELECT partner_id FROM users WHERE id = ?');
  const user = userStmt.get(userId) as { partner_id: string | null } | undefined;

  if (!user?.partner_id) {
    return null;
  }

  const partnerStmt = db.prepare('SELECT * FROM users WHERE id = ?');
  return partnerStmt.get(user.partner_id) as DbUser | null;
}

// Helper to check if two users are partners
export function arePartners(userId1: string, userId2: string): boolean {
  const stmt = db.prepare(
    'SELECT id FROM users WHERE (id = ? AND partner_id = ?) OR (id = ? AND partner_id = ?)'
  );
  const result = stmt.get(userId1, userId2, userId2, userId1);
  return !!result;
}
