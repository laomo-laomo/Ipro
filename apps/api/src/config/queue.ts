import Bull, { Queue, QueueOptions } from 'bull';

/**
 * Bull queue Redis configuration
 */
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;
const REDIS_DB = parseInt(process.env.REDIS_DB || '0', 10);

const redisConfig: QueueOptions['redis'] = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  db: REDIS_DB,
  ...(REDIS_PASSWORD ? { password: REDIS_PASSWORD } : {}),
  // Reconnect on failure
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 100, 3000);
    return delay;
  },
  // Don't fail hard if Redis is unavailable during boot
  maxRetriesPerRequest: 3,
  enableReadyCheck: false,
  lazyConnect: true,
};

const defaultQueueOpts: QueueOptions = {
  redis: redisConfig,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
};

/**
 * Job data types
 */
export interface IllustrationJobData {
  storyId: string;
  illustrationId: string;
  sceneIndex: number;
  characterId?: string;
  sourceImageUrl?: string;
  prompt: string;
  userId: string;
  quotaSource?: 'card' | 'points';
  deductedAmount?: number;
  deductedSceneCount?: number;
}

export interface VideoJobData {
  videoId: string;
  storyId: string;
  userId: string;
  audioType: 'tts' | 'mimo' | 'minimax' | 'cloned';
  voiceId?: string;
  voiceName?: string;
}

/**
 * Job progress event payloads
 */
export interface IllustrationProgressEvent {
  type: 'illustration:progress' | 'illustration:completed' | 'illustration:failed';
  storyId: string;
  illustrationId: string;
  sceneIndex: number;
  progress?: number;
  imageUrl?: string;
  error?: string;
}

export interface VideoProgressEvent {
  type: 'video:progress' | 'video:completed' | 'video:failed';
  videoId: string;
  storyId: string;
  progress?: number;
  videoUrl?: string;
  error?: string;
}

// Singleton queues - only created if Redis is available
let _illustrationQueue: Queue<IllustrationJobData> | null = null;
let _videoQueue: Queue<VideoJobData> | null = null;

/**
 * Check if Redis is available
 */
function isRedisAvailable(): boolean {
  return !!process.env.REDIS_HOST;
}

/**
 * Get illustration queue (lazy singleton)
 */
export function getIllustrationQueue(): Queue<IllustrationJobData> {
  if (!isRedisAvailable()) {
    throw new Error('Redis not configured - job queues not available');
  }
  if (!_illustrationQueue) {
    _illustrationQueue = new Bull<IllustrationJobData>('illustration', defaultQueueOpts);
  }
  return _illustrationQueue;
}

/**
 * Get video queue (lazy singleton)
 */
export function getVideoQueue(): Queue<VideoJobData> {
  if (!isRedisAvailable()) {
    throw new Error('Redis not configured - job queues not available');
  }
  if (!_videoQueue) {
    _videoQueue = new Bull<VideoJobData>('video', defaultQueueOpts);
  }
  return _videoQueue;
}

/**
 * Gracefully close all queues
 */
export async function closeQueues(): Promise<void> {
  const tasks: Promise<void>[] = [];
  if (_illustrationQueue) tasks.push(_illustrationQueue.close());
  if (_videoQueue) tasks.push(_videoQueue.close());
  await Promise.all(tasks);
  _illustrationQueue = null;
  _videoQueue = null;
}

export default {
  getIllustrationQueue,
  getVideoQueue,
  closeQueues,
};

