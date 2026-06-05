/**
 * Illustration Event Emitter
 *
 * Emits real-time events for illustration status updates via SSE
 * Frontend can subscribe to these events for live progress updates
 */

import { EventEmitter } from 'events';

export type IllustrationEventName =
  | 'scene:completed'
  | 'scene:failed'
  | 'scene:processing'
  | 'story:completed'
  | 'story:failed';

export interface IllustrationEvent {
  name: IllustrationEventName;
  storyId: string;
  illustrationId?: string;
  sceneIndex?: number;
  data?: {
    imageUrl?: string;
    cost?: number;
    errorMessage?: string;
    failureCategory?: string;
    progress?: number;
    totalCost?: number;
    illustrationCount?: number;
    failedCount?: number;
  };
}

// Global event emitter for illustration events
export const illustrationEmitter = new EventEmitter();
illustrationEmitter.setMaxListeners(100);

/**
 * Emit a scene completed event
 */
export function emitSceneCompleted(
  storyId: string,
  illustrationId: string,
  sceneIndex: number,
  data: {
    imageUrl: string;
    cost: number;
  }
): void {
  const event: IllustrationEvent = {
    name: 'scene:completed',
    storyId,
    illustrationId,
    sceneIndex,
    data,
  };

  // Emit to specific story channel
  illustrationEmitter.emit(`story:${storyId}`, event);
}

/**
 * Emit a scene failed event
 */
export function emitSceneFailed(
  storyId: string,
  illustrationId: string,
  sceneIndex: number,
  data: {
    errorMessage: string;
    failureCategory?: string;
  }
): void {
  const event: IllustrationEvent = {
    name: 'scene:failed',
    storyId,
    illustrationId,
    sceneIndex,
    data,
  };

  // Emit to specific story channel
  illustrationEmitter.emit(`story:${storyId}`, event);
}

/**
 * Emit a scene processing event
 */
export function emitSceneProcessing(
  storyId: string,
  illustrationId: string,
  sceneIndex: number
): void {
  const event: IllustrationEvent = {
    name: 'scene:processing',
    storyId,
    illustrationId,
    sceneIndex,
  };

  // Emit to specific story channel
  illustrationEmitter.emit(`story:${storyId}`, event);
}

/**
 * Emit story all completed event
 */
export function emitStoryCompleted(
  storyId: string,
  data: {
    totalCost: number;
    illustrationCount: number;
  }
): void {
  const event: IllustrationEvent = {
    name: 'story:completed',
    storyId,
    data,
  };

  illustrationEmitter.emit(`story:${storyId}`, event);
}

/**
 * Emit story failed event (when all retries exhausted)
 */
export function emitStoryFailed(
  storyId: string,
  data: {
    failedCount: number;
  }
): void {
  const event: IllustrationEvent = {
    name: 'story:failed',
    storyId,
    data,
  };

  illustrationEmitter.emit(`story:${storyId}`, event);
}

/**
 * Subscribe to events for a specific story
 */
export function subscribeToStoryEvents(
  storyId: string,
  callback: (event: IllustrationEvent) => void
): () => void {
  const handler = (event: IllustrationEvent) => callback(event);
  illustrationEmitter.on(`story:${storyId}`, handler);

  // Return unsubscribe function
  return () => {
    illustrationEmitter.off(`story:${storyId}`, handler);
  };
}

export default {
  illustrationEmitter,
  emitSceneCompleted,
  emitSceneFailed,
  emitSceneProcessing,
  emitStoryCompleted,
  emitStoryFailed,
  subscribeToStoryEvents,
};