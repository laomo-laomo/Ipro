/**
 * Job Workers Initializer
 *
 * Starts all background workers when the application starts
 * Should be called during app initialization
 */

import { startIllustrationWorker } from './illustration.job.js';
import { startVideoWorker } from './video.job.js';
import { closeQueues } from '../config/queue.js';
// 修复 (2026-06-18 worker-recovery): 不依赖 Redis 的 in-process watchdog.
// 取代之前"server 重启 → in-flight fire-and-forget Promise 全部丢失"的根因.
// rescue 在每次启动 / 路由入口 / 60s 定时三处触发, 保证 zombie illustration
// 一定会被重置 + 重新入队。
import { rescueStuckIllustrations, startIllustrationWatchdog, stopIllustrationWatchdog } from '../services/illustration.service.js';

let isInitialized = false;

/**
 * Initialize and start all job workers
 */
export async function initializeWorkers(): Promise<void> {
  if (isInitialized) {
    console.log('[Workers] Already initialized');
    return;
  }

  console.log('[Workers] Initializing job workers...');

  // Redis-based workers (Bull queue) — optional. Skipped if REDIS_HOST is not set.
  if (!process.env.REDIS_HOST) {
    console.log('[Workers] Redis not configured, skipping Bull-queue workers');
  } else {
    try {
      await startIllustrationWorker();
      console.log('[Workers] Illustration worker (Bull) started');
      await startVideoWorker();
      console.log('[Workers] Video worker started');
    } catch (error) {
      console.warn('[Workers] Failed to initialize Bull workers (non-fatal):', error);
    }
  }

  // Always: rescue zombie illustrations left by previous server crashes,
  // then start the 60s watchdog that catches anything missed. This works
  // whether or not Redis is configured, so it covers the dev case (the
  // common one).
  try {
    const rescued = await rescueStuckIllustrations();
    if (rescued > 0) {
      console.log(`[Workers] Rescued ${rescued} zombie illustration(s) from previous run`);
    } else {
      console.log('[Workers] No zombie illustrations to rescue');
    }
    startIllustrationWatchdog();
  } catch (error) {
    console.error('[Workers] Failed to start illustration watchdog:', error);
  }

  isInitialized = true;
  console.log('[Workers] All workers initialized');
}

/**
 * Gracefully shutdown all workers
 */
export async function shutdownWorkers(): Promise<void> {
  console.log('[Workers] Shutting down...');

  stopIllustrationWatchdog();

  try {
    // Close all queues
    await closeQueues();
    console.log('[Workers] Queues closed');
  } catch (error) {
    console.error('[Workers] Error during shutdown:', error);
  }
}

/**
 * Check if workers are initialized
 */
export function isWorkersInitialized(): boolean {
  return isInitialized;
}

export default {
  initializeWorkers,
  shutdownWorkers,
  isWorkersInitialized,
};
