import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../config/database.js';
import { getAllPrices, updatePrice } from '../../services/price.service.js';
import { adminMiddleware } from '../../middlewares/admin.middleware.js';


// Request schemas
const updatePriceSchema = z.object({
  key: z.string(),
  value: z.number().positive(),
});

/**
 * Admin routes - All endpoints require admin role
 */
export async function adminRoutes(app: FastifyInstance): Promise<void> {
  // Apply admin middleware to all routes in this plugin
  app.addHook('preHandler', adminMiddleware);

  /**
   * GET /api/admin/prices - Get price configuration
   */
  app.get('/prices', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const prices = await getAllPrices();

      return reply.send({
        success: true,
        data: prices,
      });
    } catch (error: any) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        message: error.message || 'Failed to get prices',
        code: 'GET_PRICES_ERROR',
      });
    }
  });

  /**
   * PUT /api/admin/prices - Update price configuration
   */
  app.put('/prices', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const body = updatePriceSchema.parse(request.body);

      await updatePrice(body.key, body.value, user.id);

      return reply.send({
        success: true,
        message: 'Price updated successfully',
        data: {
          key: body.key,
          value: body.value,
        },
      });
    } catch (error: any) {
      request.log.error(error);

      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          message: 'Validation error',
          code: 'VALIDATION_ERROR',
          errors: error.errors,
        });
      }

      return reply.status(500).send({
        success: false,
        message: error.message || 'Failed to update price',
        code: 'UPDATE_PRICE_ERROR',
      });
    }
  });

  /**
   * GET /api/admin/orders - Get all orders (admin only)
   */
  app.get('/orders', async (request: FastifyRequest<{ Querystring: { status?: string; limit?: number; offset?: number } }>, reply: FastifyReply) => {
    try {
      const { status, limit = 20, offset = 0 } = request.query;

      const where = status ? { status } : {};

      const [orders, total] = await Promise.all([
        prisma.order.findMany({
          where,
          include: {
            user: {
              select: {
                id: true,
                nickname: true,
                phone: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
        }),
        prisma.order.count({ where }),
      ]);

      return reply.send({
        success: true,
        data: {
          orders: orders.map((o) => ({
            id: o.id,
            orderNo: o.orderNo,
            userId: o.userId,
            userNickname: o.user.nickname,
            type: o.type,
            amount: o.amount,
            status: o.status,
            paymentChannel: o.paymentChannel,
            transactionId: o.transactionId,
            createdAt: o.createdAt,
          })),
          total,
          limit,
          offset,
        },
      });
    } catch (error: any) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        message: error.message || 'Failed to get orders',
        code: 'GET_ORDERS_ERROR',
      });
    }
  });

  /**
   * GET /api/admin/users - Get all users (admin only)
   */
  app.get('/users', async (request: FastifyRequest<{ Querystring: { limit?: number; offset?: number } }>, reply: FastifyReply) => {
    try {
      const { limit = 20, offset = 0 } = request.query;

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          include: {
            _count: {
              select: {
                voices: true,
                stories: true,
                orders: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
        }),
        prisma.user.count(),
      ]);

      return reply.send({
        success: true,
        data: {
          users: users.map((u) => ({
            id: u.id,
            nickname: u.nickname,
            phone: u.phone ? u.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : null,
            avatar: u.avatar,
            voicesCount: u._count.voices,
            storiesCount: u._count.stories,
            ordersCount: u._count.orders,
            createdAt: u.createdAt,
          })),
          total,
          limit,
          offset,
        },
      });
    } catch (error: any) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        message: error.message || 'Failed to get users',
        code: 'GET_USERS_ERROR',
      });
    }
  });

  /**
   * GET /api/admin/stats - Get system statistics (admin only)
   */
  app.get('/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const [
        totalUsers,
        totalOrders,
        totalRevenue,
        recentOrders,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.order.count(),
        prisma.order.aggregate({
          where: { status: 'paid' },
          _sum: { amount: true },
        }),
        prisma.order.findMany({
          where: { status: 'paid' },
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            user: {
              select: { nickname: true },
            },
          },
        }),
      ]);

      return reply.send({
        success: true,
        data: {
          totalUsers,
          totalOrders,
          totalRevenue: totalRevenue._sum.amount || 0,
          recentOrders: recentOrders.map((o) => ({
            id: o.id,
            orderNo: o.orderNo,
            userNickname: o.user.nickname,
            amount: o.amount,
            type: o.type,
            paymentChannel: o.paymentChannel,
            createdAt: o.createdAt,
          })),
        },
      });
    } catch (error: any) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        message: error.message || 'Failed to get stats',
        code: 'GET_STATS_ERROR',
      });
    }
  });
}

export default adminRoutes;