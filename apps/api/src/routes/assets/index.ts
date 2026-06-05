/**
 * User Assets Routes - Aggregated asset listing
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

interface AssetItem {
  id: string;
  type: 'photo' | 'stylized' | 'voice' | 'illustration';
  name: string;
  thumbnailUrl: string | null;
  createdAt: string;
  meta: Record<string, any>;
}

export async function assetsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', async (request) => {
    try { await request.jwtVerify(); } catch {}
  });

  // GET /api/assets
  fastify.get('/', async (request: any, reply: FastifyReply) => {
    const userId = request.user?.id;
    if (!userId) return reply.status(401).send({ success: false, message: 'Unauthorized' });

    const assets: AssetItem[] = [];

    // Photos (unstylized characters)
    const photos = await fastify.prisma.character.findMany({
      where: { userId, status: 'pending' }, orderBy: { createdAt: 'desc' },
    });
    for (const p of photos) {
      if (p.originalPhotoUrl) assets.push({
        id: p.id, type: 'photo', name: 'Photo ' + p.id.slice(0,6),
        thumbnailUrl: p.originalPhotoUrl, createdAt: p.createdAt.toISOString(),
        meta: { characterId: p.id },
      });
    }

    // Stylized characters
    const stylized = await fastify.prisma.character.findMany({
      where: { userId, status: 'completed', stylizedPhotoUrl: { not: null } },
      orderBy: { updatedAt: 'desc' },
    });
    for (const s of stylized) {
      assets.push({
        id: s.id, type: 'stylized', name: 'Stylized ' + s.id.slice(0,6),
        thumbnailUrl: s.stylizedPhotoUrl, createdAt: s.updatedAt.toISOString(),
        meta: { characterId: s.id, originalPhotoUrl: s.originalPhotoUrl },
      });
    }

    // Voices
    const voices = await fastify.prisma.userVoice.findMany({
      where: { userId }, orderBy: { createdAt: 'desc' },
    });
    for (const v of voices) {
      assets.push({
        id: v.id, type: 'voice', name: v.name, thumbnailUrl: null,
        createdAt: v.createdAt.toISOString(),
        meta: { voiceId: v.id, status: v.status, audioUrl: v.audioUrl },
      });
    }

    // Story illustrations
    const stories = await fastify.prisma.story.findMany({
      where: { userId, status: { in: ['illustrated', 'completed'] } },
      include: { illustrations: { where: { status: 'completed' }, orderBy: { sceneIndex: 'asc' } } },
      orderBy: { updatedAt: 'desc' },
    });
    for (const story of stories) {
      for (const ill of story.illustrations) {
        assets.push({
          id: ill.id, type: 'illustration',
          name: story.title.slice(0,20) + ' - P' + (ill.sceneIndex+1),
          thumbnailUrl: ill.imageUrl, createdAt: story.updatedAt.toISOString(),
          meta: { storyId: story.id, sceneIndex: ill.sceneIndex, storyTitle: story.title },
        });
      }
    }

    return { success: true, data: assets };
  });
}

export default assetsRoutes;
