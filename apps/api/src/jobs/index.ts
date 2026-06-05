/**
 * Job Workers Initializer
 *
 * Starts all background workers when the application starts
 * Should be called during app initialization
 */

import { startIllustrationWorker } from './illustration.job.js';
import { startVideoWorker } from './video.job.js';
import { closeQueues } from '../config/queue.js';

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

  // Skip workers if Redis is not available
  if (!process.env.REDIS_HOST) {
    console.log('[Workers] Redis not configured, skipping job workers');
    isInitialized = true;
    return;
  }

  try {
    // Start illustration worker
    await startIllustrationWorker();
    console.log('[Workers] Illustration worker started');

    // Start video worker
    await startVideoWorker();
    console.log('[Workers] Video worker started');

    isInitialized = true;
    console.log('[Workers] All workers initialized successfully');
  } catch (error) {
    console.warn('[Workers] Failed to initialize workers (non-fatal):', error);
    // Don't throw - workers are optional
    isInitialized = true;
  }
}

/**
 * Gracefully shutdown all workers
 */
export async function shutdownWorkers(): Promise<void> {
  console.log('[Workers] Shutting down...');

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
