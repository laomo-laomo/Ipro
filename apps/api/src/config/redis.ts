import Redis from 'ioredis';

// Redis client for payment service operations
let redisClient: Redis | null = null;
let redisAvailable = false;

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;

/**
 * Initialize Redis client
 */
export function initRedisClient(): Redis | null {
  if (redisClient) return redisClient;

  try {
    redisClient = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      password: REDIS_PASSWORD || undefined,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 100, 3000);
        return delay;
      },
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    redisClient.on('connect', () => {
      redisAvailable = true;
      console.log('[Redis] Payment service connected');
    });

    redisClient.on('error', (err) => {
      redisAvailable = false;
      console.warn('[Redis] Payment service error:', err.message);
    });

    redisClient.on('close', () => {
      redisAvailable = false;
    });

    // Try to connect
    redisClient.connect().catch(() => {
      console.warn('[Redis] Not available for payment service');
    });

    return redisClient;
  } catch (error) {
    console.warn('[Redis] Failed to initialize:', error);
    return null;
  }
}

/**
 * Check if Redis is available
 */
export function isRedisAvailable(): boolean {
  return redisAvailable && redisClient !== null;
}

/**
 * Get Redis client (may be null)
 */
export function getRedisClient(): Redis | null {
  return redisClient;
}

/**
 * Close Redis connection
 */
export async function closeRedisClient(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    redisAvailable = false;
  }
}

// Auto-initialize on import
initRedisClient();

export default {
  initRedisClient,
  isRedisAvailable,
  getRedisClient,
  closeRedisClient,
};