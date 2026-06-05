/**
 * SSE (Server-Sent Events) Routes for Illustration
 *
 * Provides real-time updates to frontend via Server-Sent Events
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  subscribeToStoryEvents,
  type IllustrationEvent,
} from '../services/illustration-emitter.js';

interface StoryParams {
  id: string;
}

/**
 * SSE endpoint for real-time illustration updates
 * GET /api/stories/:id/illustrations/events
 */
export async function illustrationEventsRoutes(app: FastifyInstance): Promise<void> {
  /**
   * SSE stream for illustration status updates
   */
  app.get<{
    Params: StoryParams;
  }>('/:id/illustrations/events', async (request: FastifyRequest<{ Params: StoryParams }>, reply: FastifyReply) => {
    const userId = (request as any).user?.id;
    if (!userId) {
      return reply.status(401).send({
        success: false,
        message: 'Unauthorized',
        code: 'UNAUTHORIZED',
      });
    }

    const { id: storyId } = request.params;

    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    });

    // Send initial ping
    reply.raw.write(`data: ${JSON.stringify({ name: 'connected', storyId })}\n\n`);

    // Subscribe to events for this story
    const unsubscribe = subscribeToStoryEvents(storyId, (event: IllustrationEvent) => {
      try {
        // Format: server.sseSend(userId, event.name, data)
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch (error) {
        // Client disconnected
        unsubscribe();
      }
    });

    // Heartbeat to keep connection alive
    const heartbeat = setInterval(() => {
      try {
        reply.raw.write(`: heartbeat\n\n`);
      } catch {
        clearInterval(heartbeat);
        unsubscribe();
      }
    }, 30000); // Every 30 seconds

    // Cleanup on client disconnect
    request.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
      console.log(`[SSE] Client disconnected from story ${storyId}`);
    });
  });
}

export default illustrationEventsRoutes;