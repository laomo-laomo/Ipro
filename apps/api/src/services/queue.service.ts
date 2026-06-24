/**
 * Queue Service
 *
 * Public API for queue operations used by routes
 * Abstracts away Bull queue implementation details
 */

import { IllustrationJobData, VideoJobData } from '../config/queue.js';
import { getIllustrationQueue, getVideoQueue } from '../config/queue.js';

/**
 * Illustration Queue Operations
 */
export const illustrationQueue = {
  /**
   * Add a single illustration job
   */
  async addJob(data: IllustrationJobData): Promise<string> {
    const queue = getIllustrationQueue();
    const job = await queue.add(data, {
      priority: data.sceneIndex,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    });
    return String(job.id);
  },

  /**
   * Add batch illustration jobs
   */
  async addBatchJobs(
    storyId: string,
    sceneIndices: number[],
    characterId?: string,
    userId?: string,
    quota?: Pick<IllustrationJobData, 'quotaSource' | 'deductedAmount' | 'deductedSceneCount'>
  ): Promise<string[]> {
    const queue = getIllustrationQueue();
    const jobs = sceneIndices.map(sceneIndex => ({
      name: `illustration-${storyId}-${sceneIndex}`,
      data: {
        storyId,
        illustrationId: '',
        sceneIndex,
        characterId,
        prompt: '',
        userId: userId || '',
        ...(quota || {}),
      } as IllustrationJobData,
      opts: {
        priority: sceneIndex,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      },
    }));

    const addedJobs = await queue.addBulk(jobs);
    return addedJobs.map(j => String(j.id));
  },

  /**
   * Get queue status
   */
  async getStatus() {
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
    };
  },

  /**
   * Pause queue
   */
  async pause(): Promise<void> {
    const queue = getIllustrationQueue();
    await queue.pause();
  },

  /**
   * Resume queue
   */
  async resume(): Promise<void> {
    const queue = getIllustrationQueue();
    await queue.resume();
  },

  /**
   * Clean old jobs
   */
  async clean(): Promise<void> {
    const queue = getIllustrationQueue();
    await queue.clean(3600000, 'completed'); // 1 hour
    await queue.clean(86400000, 'failed'); // 24 hours
  },
};

/**
 * Video Queue Operations
 */
export const videoQueue = {
  /**
   * Add a video job
   */
  async addJob(data: VideoJobData): Promise<string> {
    const queue = getVideoQueue();
    const job = await queue.add(data, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 10000,
      },
    });
    return String(job.id);
  },

  /**
   * Get job status
   */
  async getJobStatus(jobId: string | number) {
    const queue = getVideoQueue();
    const job = await queue.getJob(jobId);

    if (!job) return null;

    const state = await job.getState();
    return {
      jobId: job.id,
      state,
      progress: job.progress(),
      data: job.data,
      result: job.returnvalue,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
    };
  },

  /**
   * Get queue status
   */
  async getStatus() {
    const queue = getVideoQueue();
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
    };
  },

  /**
   * Pause queue
   */
  async pause(): Promise<void> {
    const queue = getVideoQueue();
    await queue.pause();
  },

  /**
   * Resume queue
   */
  async resume(): Promise<void> {
    const queue = getVideoQueue();
    await queue.resume();
  },

  /**
   * Retry failed job
   */
  async retryJob(jobId: string | number): Promise<void> {
    const queue = getVideoQueue();
    const job = await queue.getJob(jobId);
    if (job) {
      await job.retry();
    }
  },

  /**
   * Remove job
   */
  async removeJob(jobId: string | number): Promise<void> {
    const queue = getVideoQueue();
    const job = await queue.getJob(jobId);
    await job?.remove();
  },
};

export default {
  illustrationQueue,
  videoQueue,
};

