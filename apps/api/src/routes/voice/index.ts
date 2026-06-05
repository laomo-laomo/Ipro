import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../config/database.js';
import { uploadAudioSample, cloneVoiceViaMiniMax, getUserVoices, deleteVoice, validateAudioSample } from '../../services/voice.service.js';

/**
 * Voice routes
 */
export async function voiceRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /api/voices/upload - Upload audio sample
   */
  app.post('/upload', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const data = await request.file();

      if (!data) {
        return reply.status(400).send({
          success: false,
          message: 'Audio file is required',
          code: 'AUDIO_REQUIRED',
        });
      }

      const filename = data.filename;
      const buffer = await data.toBuffer();
      const name = (data.fields as any)?.name?.value || 'My Voice';

      // Validate audio before upload
      const validation = validateAudioSample(buffer, filename);
      if (!validation.valid) {
        return reply.status(400).send({
          success: false,
          message: validation.error,
          code: 'AUDIO_VALIDATION_FAILED',
        });
      }

      // Upload to OSS
      const { audioUrl } = await uploadAudioSample(user.id, name, buffer, filename);

      // Create voice record
      const voice = await prisma.userVoice.create({
        data: {
          userId: user.id,
          name,
          audioUrl,
          status: 'processing',
        },
      });

      return reply.send({
        success: true,
        data: {
          voiceId: voice.id,
          name: voice.name,
          audioUrl: voice.audioUrl,
          status: voice.status,
        },
      });
    } catch (error: any) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        message: error.message || 'Failed to upload audio',
        code: 'UPLOAD_ERROR',
      });
    }
  });

  /**
   * POST /api/voices/:id/clone - Clone voice
   */
  app.post('/:id/clone', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params;

      // Verify voice belongs to user
      const voice = await prisma.userVoice.findFirst({
        where: { id, userId: user.id },
      });

      if (!voice) {
        return reply.status(404).send({
          success: false,
          message: 'Voice not found',
          code: 'NOT_FOUND',
        });
      }

      // Start voice cloning
      const result = await cloneVoiceViaMiniMax(user.id, voice.audioUrl, voice.id);

      return reply.send({
        success: true,
        data: {
          voiceId: voice.id,
          status: result.status,
        },
      });
    } catch (error: any) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        message: error.message || 'Failed to clone voice',
        code: 'CLONE_ERROR',
      });
    }
  });

  /**
   * DELETE /api/voices/:id - Delete voice
   */
  app.delete('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params;

      await deleteVoice(id, user.id);

      return reply.send({
        success: true,
        message: 'Voice deleted successfully',
      });
    } catch (error: any) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        message: error.message || 'Failed to delete voice',
        code: 'DELETE_ERROR',
      });
    }
  });

  /**
   * GET /api/voices - Get user's voice list
   */
  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;

      const voices = await getUserVoices(user.id);

      return reply.send({
        success: true,
        data: voices.map((v) => ({
          id: v.id,
          name: v.name,
          audioUrl: v.audioUrl,
          modelUrl: v.modelUrl,
          status: v.status,
          progress: v.progress,
          expiresAt: v.expiresAt,
          createdAt: v.createdAt,
        })),
      });
    } catch (error: any) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        message: error.message || 'Failed to get voices',
        code: 'GET_ERROR',
      });
    }
  });

  /**
   * GET /api/voices/:id - Get voice details with progress
   */
  app.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params;

      const voice = await prisma.userVoice.findFirst({
        where: { id, userId: user.id },
      });

      if (!voice) {
        return reply.status(404).send({
          success: false,
          message: 'Voice not found',
          code: 'NOT_FOUND',
        });
      }

      return reply.send({
        success: true,
        data: {
          id: voice.id,
          name: voice.name,
          audioUrl: voice.audioUrl,
          modelUrl: voice.modelUrl,
          status: voice.status,
          progress: voice.progress,
          expiresAt: voice.expiresAt,
          createdAt: voice.createdAt,
        },
      });
    } catch (error: any) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        message: error.message || 'Failed to get voice',
        code: 'GET_ERROR',
      });
    }
  });
}

export default voiceRoutes;