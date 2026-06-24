import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { generateAudiobook, getAudiobook } from '../../services/audiobook.service.js';

const StoryParams = z.object({
  id: z.string().min(1),
});

const AudiobookBody = z.object({
  audioType: z.enum(['tts', 'mimo', 'minimax', 'cloned']).default('tts'),
  voiceId: z.string().optional(),
  voiceName: z.string().optional(),
  voice: z.string().optional(),
  force: z.boolean().optional(),
});

export async function audiobookRoutes(app: FastifyInstance): Promise<void> {
  app.get<{
    Params: z.infer<typeof StoryParams>;
  }>('/:id/audiobook', async (request, reply) => {
    const userId = (request as any).user?.id;
    if (!userId) {
      return reply.status(401).send({
        success: false,
        message: 'Unauthorized',
        code: 'UNAUTHORIZED',
      });
    }

    try {
      const { id: storyId } = request.params;
      const data = await getAudiobook(storyId, userId);
      return reply.send({ success: true, data });
    } catch (error: any) {
      request.log.error(error);

      if (error.message === 'Story not found') {
        return reply.status(404).send({
          success: false,
          message: 'Story not found',
          code: 'NOT_FOUND',
        });
      }

      return reply.status(500).send({
        success: false,
        message: error.message || 'Failed to get audiobook',
        code: 'AUDIOBOOK_GET_ERROR',
      });
    }
  });

  app.post<{
    Params: z.infer<typeof StoryParams>;
    Body: z.infer<typeof AudiobookBody>;
  }>('/:id/audiobook', async (request, reply) => {
    const userId = (request as any).user?.id;
    if (!userId) {
      return reply.status(401).send({
        success: false,
        message: 'Unauthorized',
        code: 'UNAUTHORIZED',
      });
    }

    const parseResult = AudiobookBody.safeParse(request.body || {});
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        message: 'Invalid request body',
        code: 'VALIDATION_ERROR',
        errors: parseResult.error.errors,
      });
    }

    if (parseResult.data.audioType === 'cloned' && !parseResult.data.voiceId) {
      return reply.status(400).send({
        success: false,
        message: 'voiceId is required when audioType is cloned',
        code: 'VOICE_ID_REQUIRED',
      });
    }

    try {
      const { id: storyId } = request.params;
      const data = await generateAudiobook(storyId, userId, parseResult.data);
      return reply.send({ success: true, data });
    } catch (error: any) {
      request.log.error(error);

      if (error.message === 'Story not found') {
        return reply.status(404).send({
          success: false,
          message: 'Story not found',
          code: 'NOT_FOUND',
        });
      }

      if (error.message === 'Story has no scenes') {
        return reply.status(400).send({
          success: false,
          message: error.message,
          code: 'NO_SCENES',
        });
      }

      // 修复 (2026-06-24): BUSY 不算 server 错, 返 409 + 透传 AUDIOBOOK_BUSY code
      if ((error as any).code === 'AUDIOBOOK_BUSY') {
        return reply.status(409).send({
          success: false,
          message: error.message,
          code: 'AUDIOBOOK_BUSY',
        });
      }

      return reply.status(500).send({
        success: false,
        message: error.message || 'Failed to generate audiobook',
        code: 'AUDIOBOOK_GENERATE_ERROR',
      });
    }
  });
}

export default audiobookRoutes;
