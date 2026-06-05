/**
 * Video Routes
 *
 * API endpoints for video generation and management
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  createVideoRecord,
  getVideoDetails,
  getStoryVideos,
} from '../../services/video.service.js';
import { videoQueue } from '../../services/queue.service.js';
import { processVideoJobInline } from '../../jobs/video.job.js';
import { EDGE_TTS_VOICES, DEFAULT_VOICE } from '../../services/tts.service.js';
import { MINIMAX_VOICES } from '../../services/minimax.service.js';
import { checkQuota } from '../../services/membership.service.js';
import { prisma } from '../../config/database.js';


// Validation schemas
const createVideoSchema = z.object({
  audioType: z.enum(['tts', 'mimo', 'minimax', 'cloned']).default('tts'),
  voiceId: z.string().optional(), // Required when audioType='cloned'
  voiceName: z.string().optional(),
  voice: z.string().optional(), // Edge TTS voice name
});

const StoryParams = z.object({
  id: z.string().min(1),
});

const VideoParams = z.object({
  id: z.string().min(1),
});

function isQueueUnavailable(error: unknown): boolean {
  return error instanceof Error && error.message.includes('Redis not configured');
}

/**
 * Video routes
 * Note: These are mounted under /api/stories prefix
 * So /video becomes /api/stories/:id/video
 */
export async function videoRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /api/stories/:id/video - Generate video
   */
  app.post<{
    Params: z.infer<typeof StoryParams>;
    Body: z.infer<typeof createVideoSchema>;
  }>('/:id/video', async (request, reply) => {
    const userId = (request as any).user?.id;
    if (!userId) {
      return reply.status(401).send({
        success: false,
        message: 'Unauthorized',
        code: 'UNAUTHORIZED',
      });
    }

    const { id: storyId } = request.params;

    // Validate request body
    const parseResult = createVideoSchema.safeParse(request.body || {});
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        message: 'Invalid request body',
        code: 'VALIDATION_ERROR',
        errors: parseResult.error.errors,
      });
    }

    const { audioType, voiceId, voiceName, voice } = parseResult.data;

    // Validate voiceId for cloned audio
    if (audioType === 'cloned' && !voiceId) {
      return reply.status(400).send({
        success: false,
        message: 'voiceId is required when audioType is cloned',
        code: 'VOICE_ID_REQUIRED',
      });
    }

    try {
      // Check quota before creating video
      const quotaCheck = await checkQuota(userId, 1);
      if (!quotaCheck.hasQuota) {
        return reply.status(403).send({
          success: false,
          message: quotaCheck.error || '配额不足',
          code: 'QUOTA_EXCEEDED',
        });
      }

      // Create video record
      const { videoId, status, charCount } = await createVideoRecord(storyId, userId, {
        audioType,
        voiceId,
        voiceName,
        voice,
      });

      const jobData = {
        videoId,
        storyId,
        userId,
        audioType,
        voiceId,
        voiceName,
      };

      // Calculate estimated cost
      const estimatedCost = audioType === 'cloned' ? charCount * 0.0002 + 0.1 : 0.1;

      // Production path: enqueue via Bull (Redis-backed).
      // Development fallback: when Redis is not configured the route runs the
      // pipeline inline and returns the final video URL in the same response,
      // so 微信小程序 / App can poll once and have a ready-to-play video.
      let jobId: string | null = null;
      let inlineResult: {
        videoUrl: string;
        audioUrl: string;
        duration?: number;
        resolution?: string;
        fileSize?: number;
      } | null = null;

      try {
        jobId = await videoQueue.addJob(jobData);
      } catch (queueErr: any) {
        if (!isQueueUnavailable(queueErr)) {
          throw queueErr;
        }
        // No Redis — run the pipeline synchronously inside this request.
        // For an 8-幕绘本 (TTS + ffmpeg) the wall clock is ~30-60s, which is
        // acceptable in dev. The route still returns 200 with the finished
        // video so clients (App / 微信小程序) get a single response.
        request.log.warn(
          { videoId, storyId },
          '[Video] Redis unavailable, running pipeline inline',
        );
        const result = await processVideoJobInline(jobData);
        if (!result.success) {
          return reply.status(500).send({
            success: false,
            message: result.error,
            code: 'VIDEO_ERROR',
          });
        }
        inlineResult = {
          videoUrl: result.videoUrl,
          audioUrl: result.audioUrl,
          duration: result.metadata?.duration,
          resolution: result.metadata?.resolution,
          fileSize: result.metadata?.fileSize,
        };
      }

      if (inlineResult) {
        return reply.send({
          success: true,
          data: {
            videoId,
            jobId,
            status: 'completed',
            charCount,
            estimatedCost,
            videoUrl: inlineResult.videoUrl,
            audioUrl: inlineResult.audioUrl,
            duration: inlineResult.duration,
            resolution: inlineResult.resolution,
            fileSize: inlineResult.fileSize,
          },
        });
      }

      return reply.send({
        success: true,
        data: {
          videoId,
          jobId,
          status,
          charCount,
          estimatedCost,
        },
      });
    } catch (error: any) {
      request.log.error(error);

      if (isQueueUnavailable(error)) {
        return reply.status(503).send({
          success: false,
          message: 'Redis not configured - video queue is unavailable',
          code: 'QUEUE_UNAVAILABLE',
        });
      }

      if (error.message === 'Story not found') {
        return reply.status(404).send({
          success: false,
          message: 'Story not found',
          code: 'NOT_FOUND',
        });
      }

      if (error.message.includes('no illustrations')) {
        return reply.status(400).send({
          success: false,
          message: error.message,
          code: 'NO_ILLUSTRATIONS',
        });
      }

      return reply.status(500).send({
        success: false,
        message: error.message || 'Failed to start video generation',
        code: 'VIDEO_ERROR',
      });
    }
  });

  /**
   * GET /api/stories/:id/video - Get video details
   */
  app.get<{
    Params: z.infer<typeof StoryParams>;
  }>('/:id/video', async (request, reply) => {
    const userId = (request as any).user?.id;
    if (!userId) {
      return reply.status(401).send({
        success: false,
        message: 'Unauthorized',
        code: 'UNAUTHORIZED',
      });
    }

    const { id: storyId } = request.params;

    try {
      const result = await getVideoDetails(storyId, userId);

      return reply.send({
        success: true,
        data: result.video,
        meta: {
          storyId,
        },
      });
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
        message: error.message || 'Failed to get video',
        code: 'GET_ERROR',
      });
    }
  });

  /**
   * GET /api/stories/:id/videos - Get all videos for a story
   */
  app.get<{
    Params: z.infer<typeof StoryParams>;
  }>('/:id/videos', async (request, reply) => {
    const userId = (request as any).user?.id;
    if (!userId) {
      return reply.status(401).send({
        success: false,
        message: 'Unauthorized',
        code: 'UNAUTHORIZED',
      });
    }

    const { id: storyId } = request.params;

    try {
      const result = await getStoryVideos(storyId, userId);

      return reply.send({
        success: true,
        data: result.videos,
        meta: {
          storyId,
          count: result.videos.length,
        },
      });
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
        message: error.message || 'Failed to get videos',
        code: 'GET_ERROR',
      });
    }
  });

  /**
   * GET /api/stories/:id/video/status/:jobId - Get video job status
   */
  app.get<{
    Params: z.infer<typeof StoryParams> & { jobId: string };
  }>('/:id/video/status/:jobId', async (request, reply) => {
    const userId = (request as any).user?.id;
    if (!userId) {
      return reply.status(401).send({
        success: false,
        message: 'Unauthorized',
        code: 'UNAUTHORIZED',
      });
    }

    const { id: storyId, jobId } = request.params;

    try {
      // Verify story ownership
      const story = await prisma.story.findFirst({
        where: { id: storyId, userId },
      });

      if (!story) {
        return reply.status(404).send({
          success: false,
          message: 'Story not found',
          code: 'NOT_FOUND',
        });
      }

      const jobStatus = await videoQueue.getJobStatus(jobId);

      if (!jobStatus) {
        return reply.status(404).send({
          success: false,
          message: 'Job not found',
          code: 'JOB_NOT_FOUND',
        });
      }

      return reply.send({
        success: true,
        data: {
          jobId: jobStatus.jobId,
          state: jobStatus.state,
          progress: jobStatus.progress,
          attemptsMade: jobStatus.attemptsMade,
          failedReason: jobStatus.failedReason,
        },
      });
    } catch (error: any) {
      request.log.error(error);

      if (isQueueUnavailable(error)) {
        return reply.status(503).send({
          success: false,
          message: 'Redis not configured - video queue is unavailable',
          code: 'QUEUE_UNAVAILABLE',
        });
      }

      return reply.status(500).send({
        success: false,
        message: error.message || 'Failed to get job status',
        code: 'STATUS_ERROR',
      });
    }
  });

  /**
   * GET /api/stories/:id/video/queue - Get video queue status
   */
  app.get<{
    Params: z.infer<typeof StoryParams>;
  }>('/:id/video/queue', async (request, reply) => {
    const userId = (request as any).user?.id;
    if (!userId) {
      return reply.status(401).send({
        success: false,
        message: 'Unauthorized',
        code: 'UNAUTHORIZED',
      });
    }

    const { id: storyId } = request.params;

    try {
      // Verify story ownership
      const story = await prisma.story.findFirst({
        where: { id: storyId, userId },
      });

      if (!story) {
        return reply.status(404).send({
          success: false,
          message: 'Story not found',
          code: 'NOT_FOUND',
        });
      }

      const queueStatus = await videoQueue.getStatus();

      return reply.send({
        success: true,
        data: {
          queue: queueStatus,
          estimatedWait: queueStatus.waiting > 0
            ? `${Math.round(queueStatus.waiting * 2)}分钟` // ~2min per video
            : '0分钟',
        },
      });
    } catch (error: any) {
      request.log.error(error);

      if (isQueueUnavailable(error)) {
        return reply.status(503).send({
          success: false,
          message: 'Redis not configured - video queue is unavailable',
          code: 'QUEUE_UNAVAILABLE',
        });
      }

      return reply.status(500).send({
        success: false,
        message: error.message || 'Failed to get queue status',
        code: 'QUEUE_ERROR',
      });
    }
  });

  /**
   * GET /api/voices/available - Get available TTS voices
   */
  app.get('/voices/available', async (request, reply) => {
    return reply.send({
      success: true,
      data: {
        edge: EDGE_TTS_VOICES.map(v => ({
          voice: v.voice,
          name: v.name,
          gender: v.gender,
          language: v.language,
        })),
        minimax: MINIMAX_VOICES.map(v => ({
          voiceId: v.voice_id,
          name: v.description,
          language: v.language,
        })),
        default: DEFAULT_VOICE,
      },
    });
  });
}

export default videoRoutes;
