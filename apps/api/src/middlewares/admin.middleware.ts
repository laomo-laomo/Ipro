import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Admin role check middleware
 * Verifies the authenticated user has admin role.
 *
 * Every environment requires an explicit role==='admin' on the JWT-resolved user.
 */
export async function adminMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const user = (request as any).user;

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
