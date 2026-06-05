/**
 * Illustration Job Worker
 *
 * Background worker that processes illustration generation tasks
 * using Bull queue + Redis
 */

import { getIllustrationQueue, IllustrationJobData } from '../config/queue.js';
import {
  generateSceneIllustration,
  checkAllIllustrationsCompleted,
  markIllustrationFailed,
  markIllustrationProcessing,
  getIllustrationStats,
} from '../services/illustration.service.js';

let isWorkerRunning = false;

/**
 * Start the illustration job worker
 */
export async function startIllustrationWorker(): Promise<void> {
  // Skip if Redis is not configured
  if (!process.env.REDIS_HOST) {
    console.log('[Illustration Worker] Redis not configured, skipping');
    return;
  }

  if (isWorkerRunning) {
    console.log('[Illustration Worker] Already running');
    return;
  }

  const queue = getIllustrationQueue();

  // Process jobs concurrently (max 2 at a time)
  queue.process(2, async (job) => {
    const { storyId, illustrationId, sceneIndex, characterId, userId } = job.data as IllustrationJobData;

    console.log(`[Illustration Worker] Processing job ${job.id}: story=${storyId}, scene=${sceneIndex}`);

    try {
      // Update status to processing
      await markIllustrationProcessing(illustrationId);

      // Report progress: started
      await job.progress(10);

      // Generate illustration
      const result = await generateSceneIllustration(storyId, sceneIndex, characterId);

      // Report progress: completed
      await job.progress(100);

      console.log(`[Illustration Worker] Completed job ${job.id}: ${result.imageUrl}`);

      // Check if all illustrations are done
      const allDone = await checkAllIllustrationsCompleted(storyId);

      if (allDone) {
        console.log(`[Illustration Worker] All illustrations completed for story ${storyId}`);
      }

      return {
        success: true,
        illustrationId,
        imageUrl: result.imageUrl,
        cost: result.cost,
        allCompleted: allDone,
      };
    } catch (error: any) {
      console.error(`[Illustration Worker] Job ${job.id} failed:`, error);

      // Mark as failed
      await markIllustrationFailed(illustrationId, error.message);

      // Re-throw to trigger Bull retry
      throw error;
    }
  });

  // Event handlers
  queue.on('completed', (job, result) => {
    console.log(`[Illustration Worker] Job ${job.id} completed:`, result);
  });

  queue.on('failed', (job, error) => {
    console.error(`[Illustration Worker] Job ${job.id} failed after ${job.attemptsMade} attempts:`, error.message);
  });

  queue.on('stalled', (job) => {
    console.warn(`[Illustration Worker] Job ${job.id} stalled`);
  });

  queue.on('error', (error) => {
    console.error('[Illustration Worker] Queue error:', error);
  });

  queue.on('waiting', (jobId) => {
    console.log(`[Illustration Worker] Job ${jobId} is waiting`);
  });

  queue.on('active', (job) => {
    console.log(`[Illustration Worker] Job ${job.id} is now active`);
  });

  queue.on('progress', (job, progress) => {
    console.log(`[Illustration Worker] Job ${job.id} progress: ${progress}%`);
  });

  isWorkerRunning = true;
  console.log('[Illustration Worker] Started and listening for jobs');
}

/**
 * Add illustration job to queue
 */
export async function addIllustrationJob(data: IllustrationJobData): Promise<string> {
  const queue = getIllustrationQueue();

  const job = await queue.add(data, {
    // Priority: lower number = higher priority
    priority: data.sceneIndex,
    // Job options
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
  });

  console.log(`[Illustration Worker] Added job ${job.id} for scene ${data.sceneIndex}`);

  return String(job.id);
}

/**
 * Add batch illustration jobs for a story
 */
export async function addBatchIllustrationJobs(
  storyId: string,
  sceneIndices: number[],
  characterId?: string,
  userId?: string
): Promise<string[]> {
  const jobs = sceneIndices.map(sceneIndex => ({
    storyId,
    illustrationId: '', // Will be updated by service
    sceneIndex,
    characterId,
    prompt: '',
    userId: userId || '',
  }));

  const queue = getIllustrationQueue();

  const addedJobs = await queue.addBulk(
    jobs.map(data => ({
      name: `illustration-${storyId}-${data.sceneIndex}`,
      data,
      opts: {
        priority: data.sceneIndex,
        attempts: 3,
        backoff: {
          type: 'exponential' as const,
          delay: 5000,
        },
      },
    }))
  );

  console.log(`[Illustration Worker] Added ${addedJobs.length} jobs for story ${storyId}`);

  return addedJobs.map(j => String(j.id));
}

/**
 * Get queue status
 */
export async function getQueueStatus() {
  const queue = getIllustrationQueue();

  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    isPaused: await queue.isPaused(),
    isRunning: isWorkerRunning,
  };
}

/**
 * Pause queue
 */
export async function pauseQueue(): Promise<void> {
  const queue = getIllustrationQueue();
  await queue.pause();
  console.log('[Illustration Worker] Queue paused');
}

/**
 * Resume queue
 */
export async function resumeQueue(): Promise<void> {
  const queue = getIllustrationQueue();
  await queue.resume();
  console.log('[Illustration Worker] Queue resumed');
}

/**
 * Clean old jobs
 */
export async function cleanOldJobs(): Promise<void> {
  const queue = getIllustrationQueue();

  // Clean completed jobs older than 1 hour
  await queue.clean(3600000, 'completed');

  // Clean failed jobs older than 24 hours
  await queue.clean(86400000, 'failed');

  console.log('[Illustration Worker] Old jobs cleaned');
}

/**
 * Stop the worker
 */
export async function stopWorker(): Promise<void> {
  if (!isWorkerRunning) {
    return;
  }

  const queue = getIllustrationQueue();
  await queue.close();

  isWorkerRunning = false;
  console.log('[Illustration Worker] Stopped');
}

export default {
  startIllustrationWorker,
  addIllustrationJob,
  addBatchIllustrationJobs,
  getQueueStatus,
  pauseQueue,
  resumeQueue,
  cleanOldJobs,
  stopWorker,
};
