import Database, { Database as DatabaseType } from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Ensure data directory exists
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'atlas.db');
export const db: DatabaseType = new Database(dbPath);

// Enable WAL mode for better concurrent access
db.pragma('journal_mode = WAL');

// Initialize database schema
export function initializeDatabase(): void {
  db.exec(`
    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      friend_code TEXT UNIQUE NOT NULL,
      username TEXT NOT NULL,
      auth_token TEXT UNIQUE NOT NULL,
      partner_id TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (partner_id) REFERENCES users(id)
    );

    -- Presence table (one row per user)
    CREATE TABLE IF NOT EXISTS presence (
      user_id TEXT PRIMARY KEY,
      status TEXT DEFAULT 'offline',
      current_game TEXT,
      mood_message TEXT,
      performance_cpu REAL,
      performance_gpu REAL,
      performance_fps REAL,
      performance_memory REAL,
      last_updated INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- Messages table
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      sender_id TEXT NOT NULL,
      receiver_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      read_at INTEGER,
      FOREIGN KEY (sender_id) REFERENCES users(id),
      FOREIGN KEY (receiver_id) REFERENCES users(id)
    );

    -- Pokes table
    CREATE TABLE IF NOT EXISTS pokes (
      id TEXT PRIMARY KEY,
      sender_id TEXT NOT NULL,
      receiver_id TEXT NOT NULL,
      emoji TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (sender_id) REFERENCES users(id)
    );

    -- Memories table
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      partner_id TEXT NOT NULL,
      memory_type TEXT NOT NULL,
      content_text TEXT,
      caption TEXT,
      target_date INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- Calendar events table
    CREATE TABLE IF NOT EXISTS calendar_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      partner_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      datetime INTEGER NOT NULL,
      timezone TEXT NOT NULL,
      reminder_minutes INTEGER,
      is_recurring INTEGER DEFAULT 0,
      recurrence_pattern TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- Gacha stats table (one row per user per game)
    CREATE TABLE IF NOT EXISTS gacha_stats (
      user_id TEXT NOT NULL,
      game TEXT NOT NULL,
      total_pulls INTEGER DEFAULT 0,
      five_star_count INTEGER DEFAULT 0,
      four_star_count INTEGER DEFAULT 0,
      average_pity REAL DEFAULT 0,
      current_pity INTEGER DEFAULT 0,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, game),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- Create indexes for common queries
    CREATE INDEX IF NOT EXISTS idx_users_friend_code ON users(friend_code);
    CREATE INDEX IF NOT EXISTS idx_users_auth_token ON users(auth_token);
    CREATE INDEX IF NOT EXISTS idx_gacha_stats_user ON gacha_stats(user_id);
    CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_pokes_receiver ON pokes(receiver_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_memories_partner ON memories(partner_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_calendar_partner ON calendar_events(partner_id, created_at);
  `);

  console.log('Database initialized successfully');
}

// Type definitions for database queries
export interface DbUser {
  id: string;
  friend_code: string;
  username: string;
  auth_token: string;
  partner_id: string | null;
  created_at: number;
}

export interface DbPresence {
  user_id: string;
  status: string;
  current_game: string | null;
  mood_message: string | null;
  performance_cpu: number | null;
  performance_gpu: number | null;
  performance_fps: number | null;
  performance_memory: number | null;
  last_updated: number;
}

export interface DbMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: number;
  read_at: number | null;
}

export interface DbPoke {
  id: string;
  sender_id: string;
  receiver_id: string;
  emoji: string;
  created_at: number;
}

export interface DbMemory {
  id: string;
  user_id: string;
  partner_id: string;
  memory_type: string;
  content_text: string | null;
  caption: string | null;
  target_date: number | null;
  created_at: number;
}

export interface DbCalendarEvent {
  id: string;
  user_id: string;
  partner_id: string;
  title: string;
  description: string | null;
  datetime: number;
  timezone: string;
  reminder_minutes: number | null;
  is_recurring: number;
  recurrence_pattern: string | null;
  created_at: number;
  updated_at: number;
}

export interface DbGachaStats {
  user_id: string;
  game: string;
  total_pulls: number;
  five_star_count: number;
  four_star_count: number;
  average_pity: number;
  current_pity: number;
  updated_at: number;
}
