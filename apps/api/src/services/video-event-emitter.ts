/**
 * Video Event Emitter
 *
 * Emits real-time events for video status updates via SSE
 * Frontend can subscribe to these events for live progress updates
 */

import { EventEmitter } from 'events';

export type VideoEventName =
  | 'video:audio_generating'
  | 'video:audio_done'
  | 'video:rendering'
  | 'video:video_done'
  | 'video:completed'
  | 'video:failed';

export interface VideoEvent {
  name: VideoEventName;
  videoId: string;
  storyId?: string;
  data?: {
    videoUrl?: string;
    audioUrl?: string;
    duration?: number;        // Video duration in seconds
    resolution?: string;       // e.g., "1920x1080"
    fileSize?: number;         // File size in bytes
    errorMessage?: string;
    progress?: number;         // 0-100
  };
}

// Global event emitter for video events
export const videoEmitter = new EventEmitter();
videoEmitter.setMaxListeners(100);

/**
 * Emit video event
 */
export function emitVideoEvent(
  videoId: string,
  name: VideoEventName,
  data?: VideoEvent['data']
): void {
  const event: VideoEvent = {
    name,
    videoId,
    data,
  };

  // Emit to specific video channel
  videoEmitter.emit(`video:${videoId}`, event);

  // Also emit to story channel for convenience
  if (data?.videoUrl) {
    // storyId can be extracted from video record if needed
  }
}

/**
 * Helper: emit audio_generating (10%)
 */
export function emitAudioGenerating(videoId: string): void {
  emitVideoEvent(videoId, 'video:audio_generating', { progress: 10 });
}

/**
 * Helper: emit audio_done (40%)
 */
export function emitAudioDone(videoId: string, audioUrl: string): void {
  emitVideoEvent(videoId, 'video:audio_done', {
    audioUrl,
    progress: 40,
  });
}

/**
 * Helper: emit rendering (50%)
 */
export function emitRendering(videoId: string): void {
  emitVideoEvent(videoId, 'video:rendering', { progress: 50 });
}

/**
 * Helper: emit video_done (90%)
 */
export function emitVideoDone(videoId: string, videoUrl: string): void {
  emitVideoEvent(videoId, 'video:video_done', {
    videoUrl,
    progress: 90,
  });
}

/**
 * Helper: emit completed (100%)
 */
export function emitVideoCompleted(
  videoId: string,
  data: {
    videoUrl: string;
    duration?: number;
    resolution?: string;
    fileSize?: number;
  }
): void {
  emitVideoEvent(videoId, 'video:completed', {
    ...data,
    progress: 100,
  });
}

/**
 * Helper: emit failed
 */
export function emitVideoFailed(videoId: string, errorMessage: string): void {
  emitVideoEvent(videoId, 'video:failed', { errorMessage });
}

/**
 * Subscribe to events for a specific video
 */
export function subscribeToVideoEvents(
  videoId: string,
  callback: (event: VideoEvent) => void
): () => void {
  const handler = (event: VideoEvent) => callback(event);
  videoEmitter.on(`video:${videoId}`, handler);

  // Return unsubscribe function
  return () => {
    videoEmitter.off(`video:${videoId}`, handler);
  };
}

export default {
  videoEmitter,
  emitVideoEvent,
  emitAudioGenerating,
  emitAudioDone,
  emitRendering,
  emitVideoDone,
  emitVideoCompleted,
  emitVideoFailed,
  subscribeToVideoEvents,
};