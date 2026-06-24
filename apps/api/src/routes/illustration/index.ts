/**
 * Illustration Routes
 *
 * API endpoints for illustration generation and management
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  createIllustrationRecords,
  getStoryIllustrations,
  getIllustrationStats,
  generateSceneIllustration,
  checkAllIllustrationsCompleted,
  markIllustrationProcessing,
  rescueStuckIllustrations,
} from '../../services/illustration.service.js';
import { illustrationQueue } from '../../services/queue.service.js';
import { getMaxScenesForUser, preDeductIllustrationQuota, refundIllustrationQuota, type IllustrationQuotaDeduction } from '../../services/membership.service.js';
import { prisma } from '../../config/database.js';
import { normalizeStoryboard } from '../../types/storyboard.js';

// Validation schemas
const illustrateSchema = z.object({
  sceneIndices: z.array(z.number()).optional().default([]), // Empty = all scenes
  force: z.boolean().optional().default(false),
  characterId: z.string().optional(),
});

const retryFailedSchema = z.object({
  sceneIndices: z.array(z.number()).optional().default([]), // Empty = retry all failed
  force: z.boolean().optional().default(false),
});

const StoryParams = z.object({
  id: z.string().min(1),
});

function isQueueUnavailable(error: unknown): boolean {
  return error instanceof Error && error.message.includes('Redis not configured');
}

/**
 * Illustration routes
 * Note: These are mounted under /api/stories prefix
 * So /illustrate becomes /api/stories/:id/illustrate
 * And /illustrations becomes /api/stories/:id/illustrations
 */
export async function illustrationRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /api/stories/:id/illustrate - Generate illustrations (batch)
   */
  app.post<{
    Params: z.infer<typeof StoryParams>;
    Body: z.infer<typeof illustrateSchema>;
  }>('/:id/illustrate', async (request, reply) => {
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
    const parseResult = illustrateSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        message: 'Invalid request body',
        code: 'VALIDATION_ERROR',
        errors: parseResult.error.errors,
      });
    }

    const { sceneIndices, force, characterId } = parseResult.data;

    request.log.info(`[Illustrate] Request: storyId=${storyId} characterId=${characterId} sceneIndices=${JSON.stringify(sceneIndices)} force=${force}`);

    try {
      // Verify story exists and belongs to user
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

      // Calculate how many illustrations will be created
      const storyboard = normalizeStoryboard(story.scenes, story.title);
      const targetSceneIndices = sceneIndices.length > 0
        ? sceneIndices
        : storyboard.scenes.map((scene) => scene.index);
      let existingActiveOrCompleted: Array<{ sceneIndex: number; status: string }> = [];
      if (!force) {
        existingActiveOrCompleted = await prisma.illustration.findMany({
          where: {
            storyId,
            sceneIndex: { in: targetSceneIndices },
            status: { in: ['pending', 'processing', 'completed'] },
          },
          select: { sceneIndex: true, status: true },
        });

        if (existingActiveOrCompleted.length >= targetSceneIndices.length && sceneIndices.length === 0) {
          const processingCount = existingActiveOrCompleted.filter((item) => item.status === 'pending' || item.status === 'processing').length;
          const completedCount = existingActiveOrCompleted.filter((item) => item.status === 'completed').length;

          return reply.send({
            success: true,
            data: {
              storyId,
              totalScenes: targetSceneIndices.length,
              queuedCount: 0,
              reusedExisting: true,
              completedCount,
              processingCount,
            },
          });
        }
      }

      // Create/update illustration records
      const activeOrCompletedSceneIndices = new Set(existingActiveOrCompleted.map((item) => item.sceneIndex));
      const sceneIndicesToGenerate = force
        ? targetSceneIndices
        : targetSceneIndices.filter((index) => !activeOrCompletedSceneIndices.has(index));

      // 修复 (2026-06-18): 先检查 maxScenes, 再预扣配额
      // 避免先扣费再校验导致白扣
      const maxScenes = await getMaxScenesForUser(userId);
      if (maxScenes !== null && targetSceneIndices.length > maxScenes) {
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[Illustrate] Dev mode: bypassing maxScenes check (${targetSceneIndices.length} > ${maxScenes})`);
        } else {
          return reply.status(403).send({
            success: false,
            message: `每个故事最多 ${maxScenes} 页，当前请求 ${targetSceneIndices.length} 页`,
            code: 'MAX_SCENES_EXCEEDED',
          });
        }
      }

      // 次卡/周期卡按故事扣 1 次, 积分按页扣。
      let quotaDeduction: IllustrationQuotaDeduction | null = null;
      if (process.env.NODE_ENV !== 'production') {
        console.log('[Illustrate] Dev mode: bypassing quota check');
      } else {
        const preDeductResult = await preDeductIllustrationQuota(userId, sceneIndicesToGenerate.length);
        console.log('[Illustrate] preDeduct:', JSON.stringify(preDeductResult));
        if (!preDeductResult.success) {
          return reply.status(403).send({
            success: false,
            message: preDeductResult.error || '配额不足',
            code: 'QUOTA_EXCEEDED',
          });
        }
        quotaDeduction = preDeductResult;
      }

      const { count, totalScenes } = await createIllustrationRecords(storyId, sceneIndicesToGenerate, { force });

      if (count === 0) {
        return reply.send({
          success: true,
          data: { storyId, totalScenes, queuedCount: 0, reusedExisting: true },
        });
      }

      // Get all illustration records to queue
      const illustrations = await prisma.illustration.findMany({
        where: { storyId, sceneIndex: { in: sceneIndicesToGenerate } },
        orderBy: { sceneIndex: 'asc' },
      });

      // Try queue first; fall back to synchronous generation if Redis unavailable
      let jobIds: string[] = [];
      try {
        jobIds = await illustrationQueue.addBatchJobs(
          storyId,
          illustrations.map(i => i.sceneIndex),
          characterId,
          userId,
          quotaDeduction ? {
            quotaSource: quotaDeduction.source,
            deductedAmount: quotaDeduction.deductedAmount,
            deductedSceneCount: quotaDeduction.sceneCount,
          } : undefined
        );
        const queueStatus = await illustrationQueue.getStatus();
        const queuePosition = queueStatus.waiting + queueStatus.active;
        const estimatedTime = `${Math.round(queuePosition * 0.5 + 1)}分钟`;

        if (quotaDeduction) {
          request.log.info(
            { storyId, quotaSource: quotaDeduction.source, deductedAmount: quotaDeduction.deductedAmount, sceneCount: quotaDeduction.sceneCount },
            '[Illustrate] Queue path: pre-deducted illustration quota'
          );
        }

        return reply.send({
          success: true,
          data: { storyId, totalScenes, queuedCount: count, jobIds, queuePosition, estimatedTime },
        });
      } catch (queueError: any) {
        // Redis not available - generate synchronously
        request.log.warn('[Illustrate] Queue unavailable, generating illustrations in background');

          // Mark all as processing.
          // Use markIllustrationProcessing (not raw prisma.update) so the row
          // also gets workerStartedAt = now() — this lets the rescue watchdog
          // distinguish "this server is actively generating" from "the worker
          // died before the row got a chance to complete".
          // Also: clear any zombie rows from a previous server crash before
          // we start a new batch, so we don't double-charge.
          await rescueStuckIllustrations().catch(() => {});
          await Promise.all(illustrations.map(ill => markIllustrationProcessing(ill.id)));

          // Fire and forget - generate every scene regardless of pool size.
          // Use a small concurrency cap (2) to keep apiz.ai from rate-limiting us,
          // but DO NOT cap the worker count below the number of pending scenes —
          // the previous `Array.from({ length: Math.min(CONCURRENCY, N) }, worker)`
          // pattern could under-provision workers and leave tail scenes stuck in
          // 'processing' forever when the cursor advanced past them mid-flight.
          // To make coverage unambiguous we run each scene through a single
          // bounded-concurrency map. Per-scene errors are caught so a single
          // bad scene never poisons the batch.
          const CONCURRENCY = 2;
          request.log.info(
            { storyId, count: illustrations.length, concurrency: CONCURRENCY, characterId },
            '[Illustrate] workers started'
          );

          const generateOne = async (ill: typeof illustrations[number]): Promise<boolean> => {
            try {
              request.log.info(`[Illustrate] Generating scene ${ill.sceneIndex} with characterId=${characterId}`);
              await generateSceneIllustration(storyId, ill.sceneIndex, characterId);
              request.log.info(`[Illustrate] Scene ${ill.sceneIndex} completed`);
              return true;
            } catch (genError: any) {
              const message = genError instanceof Error ? genError.message : String(genError);
              request.log.error(`[Illustrate] Scene ${ill.sceneIndex} failed: ${message}`);
              await prisma.illustration.update({
                where: { id: ill.id },
                data: { status: 'failed', errorMessage: message },
              }).catch(() => {});
              return false;
            }
          };

          const generateAll = async () => {
            try {
              // 修复 (2026-06-18 Bug B): 追踪成功和失败的数量, 用于退款
              let successCount = 0;
              let failCount = 0;

              // Bounded-concurrency map: at most CONCURRENCY scenes in flight at any
              // moment, but every scene in `illustrations` is guaranteed a slot.
              let cursor = 0;
              const activeWorkers: Promise<void>[] = [];

              const launchNext = (): Promise<void> | null => {
                if (cursor >= illustrations.length) return null;
                const ill = illustrations[cursor++];
                const p = generateOne(ill)
                  .then((ok) => { if (ok) successCount++; else failCount++; })
                  .finally(() => {
                    const idx = activeWorkers.indexOf(p);
                    if (idx >= 0) activeWorkers.splice(idx, 1);
                  });
                activeWorkers.push(p);
                return p;
              };

              // Prime the pool.
              for (let i = 0; i < Math.min(CONCURRENCY, illustrations.length); i++) {
                launchNext();
              }

              // Drain: every time a worker finishes, launch the next pending scene.
              while (activeWorkers.length > 0) {
                await Promise.race(activeWorkers);
                while (activeWorkers.length < CONCURRENCY) {
                  if (launchNext() === null) break;
                }
              }

              if (failCount > 0 && quotaDeduction) {
                const refundResult = await refundIllustrationQuota(userId, quotaDeduction, failCount).catch((err) => {
                  request.log.error(`[Illustrate] Failed to refund quota: ${err.message}`);
                  return null;
                });
                if (refundResult && refundResult.refundedAmount > 0) {
                  request.log.info(
                    { storyId, failCount, refundedAmount: refundResult.refundedAmount, source: quotaDeduction.source },
                    '[Illustrate] refunded quota for failed scenes'
                  );
                }
              }

              await checkAllIllustrationsCompleted(storyId).catch(() => {});
              request.log.info(
                { storyId, processed: illustrations.length, successCount, failCount, concurrency: CONCURRENCY },
                '[Illustrate] all workers done'
              );
            } catch (err: any) {
              const message = err instanceof Error ? err.message : String(err);
              request.log.error(`[Illustrate] Background error: ${message}`);
            }
          };

          // Truly fire-and-forget — do NOT await here, otherwise the HTTP response
          // blocks on every illustration and the API times out.
          void generateAll();

          return reply.send({
            success: true,
            data: { storyId, totalScenes, queuedCount: count, mode: 'background' },
          });
        }
    } catch (error: any) {
      request.log.error(error);

      if (isQueueUnavailable(error)) {
        return reply.status(503).send({
          success: false,
          message: 'Redis not configured - illustration queue is unavailable',
          code: 'QUEUE_UNAVAILABLE',
        });
      }

      return reply.status(500).send({
        success: false,
        message: error.message || 'Failed to start illustration generation',
        code: 'ILLUSTRATION_ERROR',
      });
    }
  });

  /**
   * GET /api/stories/:id/illustrations - Get illustration list
   */
  app.get<{
    Params: z.infer<typeof StoryParams>;
  }>('/:id/illustrations', async (request, reply) => {
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
      const result = await getStoryIllustrations(storyId, userId);

      return reply.send({
        success: true,
        data: result.illustrations,
        meta: {
          storyId,
          title: result.title,
          status: result.status,
          totalCost: result.totalCost,
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
        message: error.message || 'Failed to get illustrations',
        code: 'GET_ERROR',
      });
    }
  });

  /**
   * GET /api/stories/:id/illustrations/stats - Get illustration progress/stats
   */
  app.get<{
    Params: z.infer<typeof StoryParams>;
  }>('/:id/illustrations/stats', async (request, reply) => {
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

      const stats = await getIllustrationStats(storyId);

      return reply.send({
        success: true,
        data: stats,
      });
    } catch (error: any) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        message: error.message || 'Failed to get stats',
        code: 'STATS_ERROR',
      });
    }
  });

  /**
   * GET /api/stories/:id/illustrations/queue - Get queue status for this story
   */
  app.get<{
    Params: z.infer<typeof StoryParams>;
  }>('/:id/illustrations/queue', async (request, reply) => {
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

      const queueStatus = await illustrationQueue.getStatus();

      return reply.send({
        success: true,
        data: {
          queue: queueStatus,
          estimatedWait: queueStatus.waiting > 0
            ? `${Math.round(queueStatus.waiting * 0.5)}分钟`
            : '0分钟',
        },
      });
    } catch (error: any) {
      request.log.error(error);

      if (isQueueUnavailable(error)) {
        return reply.status(503).send({
          success: false,
          message: 'Redis not configured - illustration queue is unavailable',
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
   * POST /api/stories/:id/illustrations/:sceneIndex/retry - Retry single illustration
   */
  app.post<{
    Params: { id: string; sceneIndex: string };
  }>('/:id/illustrations/:sceneIndex/retry', async (request, reply) => {
    const userId = (request as any).user?.id;
    if (!userId) {
      return reply.status(401).send({ success: false, message: 'Unauthorized', code: 'UNAUTHORIZED' });
    }
    const { id: storyId, sceneIndex: sceneIndexStr } = request.params;
    const sceneIndex = parseInt(sceneIndexStr, 10);
    if (isNaN(sceneIndex)) {
      return reply.status(400).send({ success: false, message: 'Invalid sceneIndex', code: 'VALIDATION_ERROR' });
    }

    // Verify story belongs to user
    const story = await prisma.story.findFirst({ where: { id: storyId, userId } });
    if (!story) {
      return reply.status(404).send({ success: false, message: 'Story not found', code: 'NOT_FOUND' });
    }

    // Get the illustration record
    const illustration = await prisma.illustration.findFirst({
      where: { storyId, sceneIndex },
    });

    if (!illustration) {
      return reply.status(404).send({ success: false, message: 'Illustration not found', code: 'NOT_FOUND' });
    }

    // Only block retry if the scene has already been generated successfully — we
    // WANT to allow retry on stuck-in-processing (e.g. job died mid-flight, Redis
    // went away, etc.) and on failed rows. The previous "must be failed" gate
    // was too strict and left a class of "image says failed in UI but row still
    // processing" recoveries un-blockable.
    if (illustration.status === 'completed') {
      return reply.status(400).send({
        success: false,
        message: 'Illustration is already completed; pass force=true to regenerate.',
        code: 'ALREADY_COMPLETED',
      });
    }

    // Guard against concurrent retries on the same scene. If another retry is
    // already in flight (status='processing' with retryCount>0), reject this one
    // to avoid duplicate AI calls that waste quota and may overwrite results.
    if (illustration.status === 'processing' && illustration.retryCount > 0) {
      return reply.status(409).send({
        success: false,
        message: 'Illustration is already being retried. Please wait.',
        code: 'ALREADY_RETRYING',
      });
    }

    // Reset to pending then generate immediately
    await prisma.illustration.update({
      where: { id: illustration.id },
      data: { status: 'pending', errorMessage: null, failureCategory: null, retryCount: 0 },
    });

    try {
      const characterId = story.characterId || undefined;
      const result = await generateSceneIllustration(storyId, sceneIndex, characterId);
      await prisma.illustration.update({
        where: { id: illustration.id },
        data: { status: 'completed', imageUrl: result.imageUrl },
      });
      // Re-check whether all illustrations are now complete (promotes story status).
      await checkAllIllustrationsCompleted(storyId).catch(() => {});
      return { success: true, data: { sceneIndex, status: 'completed', imageUrl: result.imageUrl } };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Generation failed';
      await prisma.illustration.update({
        where: { id: illustration.id },
        data: { status: 'failed', errorMessage: message },
      });
      return reply.status(500).send({ success: false, message, code: 'GENERATION_ERROR' });
    }
  });

  /**
   * POST /api/stories/:id/illustrations/retry-failed - Retry failed illustrations
   */
  app.post<{
    Params: z.infer<typeof StoryParams>;
    Body: z.infer<typeof retryFailedSchema>;
  }>('/:id/illustrations/retry-failed', async (request, reply) => {
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
    const parseResult = retryFailedSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        message: 'Invalid request body',
        code: 'VALIDATION_ERROR',
        errors: parseResult.error.errors,
      });
    }

    const { sceneIndices, force } = parseResult.data;

    try {
      // Verify story exists and belongs to user
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

      // Get failed illustrations
      const whereClause: { storyId: string; status: 'failed'; sceneIndex?: { in: number[] } } = {
        storyId,
        status: 'failed' as const,
      };

      // If specific scene indices provided, filter by them
      if (sceneIndices.length > 0) {
        whereClause.sceneIndex = { in: sceneIndices };
      }

      const failedIllustrations = await prisma.illustration.findMany({
        where: whereClause,
        orderBy: { sceneIndex: 'asc' },
      });

      if (failedIllustrations.length === 0) {
        return reply.status(404).send({
          success: false,
          message: 'No failed illustrations found to retry',
          code: 'NOT_FOUND',
        });
      }

      // Reset failed illustrations to pending.
      // Also rescue any zombie processing rows from previous server crashes
      // before we start, so they don't compete with our retry batch.
      await rescueStuckIllustrations().catch(() => {});
      await Promise.all(
        failedIllustrations.map(ill =>
          prisma.illustration.update({
            where: { id: ill.id },
            data: {
              status: 'pending',
              errorMessage: null,
              failureCategory: null,
              workerStartedAt: null,
            },
          })
        )
      );

      // Mark story as processing if not already
      if (story.status !== 'processing') {
        await prisma.story.update({
          where: { id: storyId },
          data: { status: 'processing' },
        });
      }

      // Generate illustrations synchronously
      const CONCURRENCY = 2; // Lower concurrency for retries
      let cursor = 0;
      const results: { sceneIndex: number; success: boolean; error?: string }[] = [];

      const worker = async () => {
        while (cursor < failedIllustrations.length) {
          const ill = failedIllustrations[cursor++];
          try {
            const result = await generateSceneIllustration(storyId, ill.sceneIndex);
            results.push({ sceneIndex: ill.sceneIndex, success: true });
            app.log.info(`[Retry] Scene ${ill.sceneIndex} completed`);
          } catch (genError: any) {
            const message = genError instanceof Error ? genError.message : String(genError);
            results.push({ sceneIndex: ill.sceneIndex, success: false, error: message });
            app.log.error(`[Retry] Scene ${ill.sceneIndex} failed: ${message}`);
          }
        }
      };

      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, failedIllustrations.length) }, worker)
      );

      // Check completion status
      await checkAllIllustrationsCompleted(storyId);

      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;

      return reply.send({
        success: true,
        data: {
          storyId,
          total: failedIllustrations.length,
          succeeded: successCount,
          failed: failCount,
          results,
        },
      });
    } catch (error: any) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        message: error.message || 'Failed to retry illustrations',
        code: 'RETRY_ERROR',
      });
    }
  });
}

export default illustrationRoutes;



