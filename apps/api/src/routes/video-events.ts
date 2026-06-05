/**
 * Video SSE (Server-Sent Events) Routes
 *
 * Real-time video progress updates via SSE
 * Frontend can subscribe to these events for live progress updates
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { subscribeToVideoEvents } from '../services/video-event-emitter.js';

const VideoParamsSchema = {
  type: 'object',
  properties: {
    videoId: { type: 'string' },
  },
  required: ['videoId'],
};

/**
 * SSE endpoint for video progress updates
 */
export async function videoEventsRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/videos/events/:videoId - SSE stream for video status updates
   */
  app.get<{
    Params: { videoId: string };
  }>('/events/:videoId', async (request: FastifyRequest<{ Params: { videoId: string } }>, reply: FastifyReply) => {
    const { videoId } = request.params;

    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    });

    // Send initial heartbeat
    reply.raw.write(`data: ${JSON.stringify({ type: 'connected', videoId })}\n\n`);

    // Subscribe to video events
    const unsubscribe = subscribeToVideoEvents(videoId, (event) => {
      try {
        const data = `data: ${JSON.stringify({
          type: event.name,
          videoId: event.videoId,
          ...event.data,
        })}\n\n`;
        reply.raw.write(data);
      } catch (err) {
        console.error('[SSE] Error sending video event:', err);
      }
    });

    // Handle client disconnect
    request.raw.on('close', () => {
      unsubscribe();
      console.log(`[SSE] Client disconnected from video ${videoId}`);
    });

    // Send heartbeat every 30 seconds to keep connection alive
    const heartbeatInterval = setInterval(() => {
      try {
        reply.raw.write(`: heartbeat\n\n`);
      } catch {
        clearInterval(heartbeatInterval);
      }
    }, 30000);

    // Clean up on close
    request.raw.on('close', () => {
      clearInterval(heartbeatInterval);
    });

    // Return after headers sent (long-lived connection)
    return reply;
  });
}

export default videoEventsRoutes;