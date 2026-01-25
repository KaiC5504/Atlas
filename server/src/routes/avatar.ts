import { FastifyInstance } from 'fastify';
import { db, DbUser } from '../database';
import path from 'path';
import fs from 'fs';

// Ensure avatars directory exists
const dataDir = path.join(__dirname, '..', '..', 'data');
const avatarsDir = path.join(dataDir, 'avatars');
if (!fs.existsSync(avatarsDir)) {
  fs.mkdirSync(avatarsDir, { recursive: true });
}

interface UploadAvatarBody {
  image_data: string; // Base64 JPEG data (without data URL prefix)
}

interface AvatarResponse {
  success: boolean;
  avatar_url: string | null;
}

const MAX_AVATAR_SIZE = 500 * 1024; // 500KB

export async function avatarRoutes(fastify: FastifyInstance): Promise<void> {
  // Upload avatar
  fastify.post<{ Body: UploadAvatarBody }>('/avatar', async (request, reply) => {
    const user = request.user!;
    const { image_data } = request.body;

    if (!image_data) {
      return reply.status(400).send({ error: 'image_data is required' });
    }

    // Decode base64 to check size
    let imageBuffer: Buffer;
    try {
      imageBuffer = Buffer.from(image_data, 'base64');
    } catch {
      return reply.status(400).send({ error: 'Invalid base64 data' });
    }

    // Validate size
    if (imageBuffer.length > MAX_AVATAR_SIZE) {
      return reply.status(400).send({
        error: `Avatar too large. Maximum size is ${MAX_AVATAR_SIZE / 1024}KB`,
      });
    }

    // Validate JPEG format (check magic bytes)
    if (imageBuffer[0] !== 0xff || imageBuffer[1] !== 0xd8) {
      return reply.status(400).send({ error: 'Invalid image format. Only JPEG is supported.' });
    }

    // Delete old avatar if exists
    const oldUser = db.prepare('SELECT avatar_url FROM users WHERE id = ?').get(user.id) as DbUser | undefined;
    if (oldUser?.avatar_url) {
      const oldFilename = oldUser.avatar_url.replace('/avatars/', '');
      const oldPath = path.join(avatarsDir, oldFilename);
      if (fs.existsSync(oldPath)) {
        try {
          fs.unlinkSync(oldPath);
        } catch (err) {
          console.warn('Failed to delete old avatar:', err);
        }
      }
    }

    // Generate filename with timestamp
    const timestamp = Date.now();
    const filename = `${user.id}-${timestamp}.jpg`;
    const filePath = path.join(avatarsDir, filename);

    // Save file
    try {
      fs.writeFileSync(filePath, imageBuffer);
    } catch (err) {
      console.error('Failed to save avatar:', err);
      return reply.status(500).send({ error: 'Failed to save avatar' });
    }

    // Update database
    const avatarUrl = `/avatars/${filename}`;
    const updateStmt = db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?');
    updateStmt.run(avatarUrl, user.id);

    console.log(`Avatar uploaded for user ${user.id}: ${avatarUrl}`);

    return {
      success: true,
      avatar_url: avatarUrl,
    } as AvatarResponse;
  });

  // Delete avatar
  fastify.delete('/avatar', async (request, reply) => {
    const user = request.user!;

    // Get current avatar
    const currentUser = db.prepare('SELECT avatar_url FROM users WHERE id = ?').get(user.id) as DbUser | undefined;

    if (currentUser?.avatar_url) {
      // Delete file
      const filename = currentUser.avatar_url.replace('/avatars/', '');
      const filePath = path.join(avatarsDir, filename);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (err) {
          console.warn('Failed to delete avatar file:', err);
        }
      }
    }

    // Update database
    const updateStmt = db.prepare('UPDATE users SET avatar_url = NULL WHERE id = ?');
    updateStmt.run(user.id);

    console.log(`Avatar deleted for user ${user.id}`);

    return { success: true };
  });

  // Get current avatar URL
  fastify.get('/avatar', async (request) => {
    const user = request.user!;

    const currentUser = db.prepare('SELECT avatar_url FROM users WHERE id = ?').get(user.id) as DbUser | undefined;

    return {
      avatar_url: currentUser?.avatar_url || null,
    };
  });
}
