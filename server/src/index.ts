import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'path';
import fs from 'fs';
import { initializeDatabase } from './database';
import { authRoutes } from './routes/auth';
import { presenceRoutes } from './routes/presence';
import { messagesRoutes } from './routes/messages';
import { pokesRoutes } from './routes/pokes';
import { memoriesRoutes } from './routes/memories';
import { calendarRoutes } from './routes/calendar';
import { syncRoutes } from './routes/sync';
import { gachaStatsRoutes } from './routes/gacha-stats';
import { avatarRoutes } from './routes/avatar';
import { authMiddleware } from './middleware/auth';

// Ensure avatars directory exists
const avatarsDir = path.join(__dirname, '..', 'data', 'avatars');
if (!fs.existsSync(avatarsDir)) {
  fs.mkdirSync(avatarsDir, { recursive: true });
}

const fastify = Fastify({
  logger: true,
});

// Register CORS
fastify.register(cors, {
  origin: true, // Allow all origins for the desktop app
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});

// Serve static files for avatars (no auth required)
fastify.register(fastifyStatic, {
  root: avatarsDir,
  prefix: '/avatars/',
  decorateReply: false,
});

// Health check endpoint (no auth required)
fastify.get('/health', async () => {
  return { status: 'ok', timestamp: Date.now() };
});

// Auth routes (no auth required)
fastify.register(authRoutes, { prefix: '/auth' });

// Protected routes
fastify.register(async (protectedRoutes) => {
  // Apply auth middleware to all routes in this context
  protectedRoutes.addHook('preHandler', authMiddleware);

  protectedRoutes.register(presenceRoutes, { prefix: '/presence' });
  protectedRoutes.register(messagesRoutes, { prefix: '/messages' });
  protectedRoutes.register(pokesRoutes, { prefix: '/pokes' });
  protectedRoutes.register(memoriesRoutes, { prefix: '/memories' });
  protectedRoutes.register(calendarRoutes, { prefix: '/calendar' });
  protectedRoutes.register(syncRoutes, { prefix: '/sync' });
  protectedRoutes.register(gachaStatsRoutes, { prefix: '/gacha-stats' });
  protectedRoutes.register(avatarRoutes);
});

// Start server
const start = async () => {
  try {
    // Initialize database
    initializeDatabase();

    // Start server
    const port = parseInt(process.env.PORT || '3000', 10);
    const host = process.env.HOST || '0.0.0.0';

    await fastify.listen({ port, host });
    console.log(`Server running on http://${host}:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down...');
  await fastify.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down...');
  await fastify.close();
  process.exit(0);
});
