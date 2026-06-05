import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Admin role check middleware
 * Verifies the authenticated user has admin role
 */
export async function adminMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const user = request.user;

  if (!user) {
    return reply.status(401).send({
      success: false,
      message: 'Unauthorized',
      code: 'UNAUTHORIZED',
    });
  }

  if (user.role !== 'admin') {
    return reply.status(403).send({
      success: false,
      message: 'Forbidden - Admin access required',
      code: 'FORBIDDEN',
    });
  }
}