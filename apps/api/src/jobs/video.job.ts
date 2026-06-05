/**
 * Video Job Worker
 *
 * Background worker that processes video rendering tasks
 * using Bull queue + Redis
 */

import { getVideoQueue, VideoJobData } from '../config/queue.js';
import {
  generateStoryAudio,
  renderVideo,
  markVideoProcessing,
  markVideoFailed,
  markVideoCompleted,
  updateVideoAudioUrl,
} from '../services/video.service.js';
import {
  emitAudioGenerating,
  emitAudioDone,
  emitRendering,
  emitVideoDone,
  emitVideoCompleted,
  emitVideoFailed,
} from '../services/video-event-emitter.js';

let isWorkerRunning = false;

/**
 * Run the full video pipeline for a single video record.
 * Reused by both the Bull worker (production) and the synchronous route
 * fallback (development when Redis is not configured).
 *
 * Phases:
 *   1. Mark processing + emit audio_generating (10%)
 *   2. Generate TTS / cloned audio (40%)
 *   3. Render MP4 with ffmpeg (90%)
 *   4. Persist URL + metadata + quota deduction (100%)
 */
export async function processVideoJobInline(
  data: VideoJobData,
  hooks: {
    onProgress?: (pct: number) => void | Promise<void>;
  } = {}
): Promise<{
  success: true;
  videoId: string;
  videoUrl: string;
  audioUrl: string;
  metadata?: { duration?: number; resolution?: string; fileSize?: number };
} | {
  success: false;
  error: string;
}> {
  const { videoId, storyId, audioType, voiceId, voiceName } = data;
  try {
    await markVideoProcessing(videoId);
    await hooks.onProgress?.(10);
    emitAudioGenerating(videoId);

    const audioResult = await generateStoryAudio(storyId, {
      audioType,
      voiceId,
      voiceName,
    });
    await updateVideoAudioUrl(videoId, audioResult.audioUrl);
    await hooks.onProgress?.(40);
    emitAudioDone(videoId, audioResult.audioUrl);

    await hooks.onProgress?.(50);
    emitRendering(videoId);

    const videoResult = await renderVideo(videoId, storyId);
    await hooks.onProgress?.(90);
    emitVideoDone(videoId, videoResult.videoUrl);

    await markVideoCompleted(videoId, videoResult.videoUrl, videoResult.metadata);
    await hooks.onProgress?.(100);
    emitVideoCompleted(videoId, {
      videoUrl: videoResult.videoUrl,
      duration: videoResult.metadata?.duration,
      resolution: videoResult.metadata?.resolution,
      fileSize: videoResult.metadata?.fileSize,
    });

    return {
      success: true,
      videoId,
      videoUrl: videoResult.videoUrl,
      audioUrl: audioResult.audioUrl,
      metadata: videoResult.metadata,
    };
  } catch (error: any) {
    const msg = error?.message ?? String(error);
    await markVideoFailed(videoId, msg).catch(() => {});
    emitVideoFailed(videoId, msg);
    return { success: false, error: msg };
  }
}

/**
 * Start the video job worker
 */
export async function startVideoWorker(): Promise<void> {
  // Skip if Redis is not configured
  if (!process.env.REDIS_HOST) {
    console.log('[Video Worker] Redis not configured, skipping');
    return;
  }

  if (isWorkerRunning) {
    console.log('[Video Worker] Already running');
    return;
  }

  const queue = getVideoQueue();

  // Process jobs one at a time (video rendering is resource-intensive)
  queue.process(async (job) => {
    const data = job.data as VideoJobData;
    console.log(`[Video Worker] Processing job ${job.id}: story=${data.storyId}, videoId=${data.videoId}`);

    const result = await processVideoJobInline(data, {
      onProgress: (pct) => job.progress(pct),
    });

    if (!result.success) {
      // Re-throw to trigger Bull retry
      throw new Error(result.error);
    }
    console.log(`[Video Worker] Completed job ${job.id}: ${result.videoUrl}`);
    return result;
  });

  // Event handlers
  queue.on('completed', (job, result) => {
    console.log(`[Video Worker] Job ${job.id} completed:`, result);
  });

  queue.on('failed', (job, error) => {
    console.error(`[Video Worker] Job ${job.id} failed after ${job.attemptsMade} attempts:`, error.message);
  });

  queue.on('stalled', (job) => {
    console.warn(`[Video Worker] Job ${job.id} stalled`);
  });

  queue.on('error', (error) => {
    console.error('[Video Worker] Queue error:', error);
  });

  queue.on('waiting', (jobId) => {
    console.log(`[Video Worker] Job ${jobId} is waiting`);
  });

  queue.on('active', (job) => {
    console.log(`[Video Worker] Job ${job.id} is now active`);
  });

  queue.on('progress', (job, progress) => {
    console.log(`[Video Worker] Job ${job.id} progress: ${progress}%`);
  });

  isWorkerRunning = true;
  console.log('[Video Worker] Started and listening for jobs');
}

/**
 * Add video job to queue
 */
export async function addVideoJob(data: VideoJobData): Promise<string> {
  const queue = getVideoQueue();

  const job = await queue.add(data, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 10000, // Longer delay for video rendering
    },
  });

  console.log(`[Video Worker] Added job ${job.id} for story ${data.storyId}`);

  return String(job.id);
}

/**
 * Get video job status from queue
 */
export async function getVideoJobStatus(jobId: string | number) {
  const queue = getVideoQueue();

  const job = await queue.getJob(jobId);

  if (!job) {
    return null;
  }

  const state = await job.getState();
  const progress = job.progress();

  return {
    jobId: job.id,
    state,
    progress,
    data: job.data,
    result: job.returnvalue,
    failedReason: job.failedReason,
    attemptsMade: job.attemptsMade,
  };
}

/**
 * Get video queue status
 */
export async function getVideoQueueStatus() {
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
    isRunning: isWorkerRunning,
  };
}

/**
 * Pause video queue
 */
export async function pauseVideoQueue(): Promise<void> {
  const queue = getVideoQueue();
  await queue.pause();
  console.log('[Video Worker] Queue paused');
}

/**
 * Resume video queue
 */
export async function resumeVideoQueue(): Promise<void> {
  const queue = getVideoQueue();
  await queue.resume();
  console.log('[Video Worker] Queue resumed');
}

/**
 * Clean old video jobs
 */
export async function cleanOldVideoJobs(): Promise<void> {
  const queue = getVideoQueue();

  // Clean completed jobs older than 1 hour
  await queue.clean(3600000, 'completed');

  // Clean failed jobs older than 24 hours
  await queue.clean(86400000, 'failed');

  console.log('[Video Worker] Old jobs cleaned');
}

/**
 * Stop the video worker
 */
export async function stopVideoWorker(): Promise<void> {
  if (!isWorkerRunning) {
    return;
  }

  const queue = getVideoQueue();
  await queue.close();

  isWorkerRunning = false;
  console.log('[Video Worker] Stopped');
}

/**
 * Retry a failed job
 */
export async function retryFailedJob(jobId: string | number): Promise<void> {
  const queue = getVideoQueue();
  const job = await queue.getJob(jobId);

  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }

  await job.retry();
  console.log(`[Video Worker] Retrying job ${jobId}`);
}

/**
 * Remove a job from queue
 */
export async function removeJob(jobId: string | number): Promise<void> {
  const queue = getVideoQueue();
  const job = await queue.getJob(jobId);
  await job?.remove();
  console.log(`[Video Worker] Removed job ${jobId}`);
}

export default {
  startVideoWorker,
  addVideoJob,
  getVideoJobStatus,
  getVideoQueueStatus,
  pauseVideoQueue,
  resumeVideoQueue,
  cleanOldVideoJobs,
  stopVideoWorker,
  retryFailedJob,
  removeJob,
};