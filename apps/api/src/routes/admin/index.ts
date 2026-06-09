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

const createRedeemCodesSchema = z.object({
  rewardType: z.enum(['points', 'membership']),
  count: z.number().int().min(1).max(200),
  pointsAmount: z.number().int().positive().optional(),
  membershipTier: z.enum(['weekly', 'monthly', 'quarterly', 'yearly']).optional(),
  expiresAt: z.string().datetime().optional(),
  note: z.string().max(200).optional(),
}).superRefine((data, ctx) => {
  if (data.rewardType === 'points' && !data.pointsAmount) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'pointsAmount is required for points codes', path: ['pointsAmount'] });
  }
  if (data.rewardType === 'membership' && !data.membershipTier) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'membershipTier is required for membership codes', path: ['membershipTier'] });
  }
});

const listRedeemCodesSchema = z.object({
  status: z.enum(['active', 'used', 'expired', 'disabled']).optional(),
  rewardType: z.enum(['points', 'membership']).optional(),
  search: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

const grantPointsSchema = z.object({
  points: z.number().int().positive().max(100000),
});

const grantMembershipSchema = z.object({
  cardType: z.enum(['weekly', 'monthly', 'quarterly', 'yearly']),
  quota: z.number().int().positive().max(100000),
  days: z.number().int().positive().max(3650),
});

function randomRedeemCode(length = 12): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < length; i += 1) {
    result += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return result;
}

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
  app.get('/orders', async (request: FastifyRequest<{ Querystring: { status?: string; limit?: number | string; offset?: number | string } }>, reply: FastifyReply) => {
    try {
      const { status } = request.query;
      const limit = Number(request.query.limit ?? 20);
      const offset = Number(request.query.offset ?? 0);

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
   * GET /api/admin/orders/:id - Get one order detail
   */
  app.get('/orders/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const order = await prisma.order.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              nickname: true,
              phone: true,
              avatar: true,
              role: true,
              points: true,
            },
          },
        },
      });

      if (!order) {
        return reply.status(404).send({
          success: false,
          message: 'Order not found',
          code: 'NOT_FOUND',
        });
      }

      const paymentLogs = await prisma.paymentLog.findMany({
        where: { orderNo: order.orderNo },
        orderBy: { createdAt: 'desc' },
      });

      return reply.send({
        success: true,
        data: {
          id: order.id,
          orderNo: order.orderNo,
          type: order.type,
          amount: order.amount,
          status: order.status,
          paymentChannel: order.paymentChannel,
          transactionId: order.transactionId,
          metadata: order.metadata,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
          user: order.user,
          paymentLogs: paymentLogs.map((log) => ({
            id: log.id,
            channel: log.channel,
            event: log.event,
            status: log.status,
            errorMessage: log.errorMessage,
            createdAt: log.createdAt,
          })),
        },
      });
    } catch (error: any) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        message: error.message || 'Failed to get order detail',
        code: 'GET_ORDER_DETAIL_ERROR',
      });
    }
  });

  /**
   * GET /api/admin/users - Get all users (admin only)
   */
  app.get('/users', async (request: FastifyRequest<{ Querystring: { limit?: number | string; offset?: number | string } }>, reply: FastifyReply) => {
    try {
      const limit = Number(request.query.limit ?? 20);
      const offset = Number(request.query.offset ?? 0);

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
   * GET /api/admin/users/:id - Get one user detail
   */
  app.get('/users/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const user = await prisma.user.findUnique({
        where: { id },
        include: {
          memberships: {
            orderBy: { expiresAt: 'desc' },
          },
          orders: {
            orderBy: { createdAt: 'desc' },
            take: 20,
          },
          stories: {
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: {
              id: true,
              title: true,
              status: true,
              createdAt: true,
            },
          },
          voices: {
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: {
              id: true,
              name: true,
              status: true,
              createdAt: true,
            },
          },
          redeemCodes: {
            orderBy: { usedAt: 'desc' },
            take: 20,
            select: {
              id: true,
              code: true,
              rewardType: true,
              pointsAmount: true,
              membershipTier: true,
              status: true,
              usedAt: true,
            },
          },
        },
      });

      if (!user) {
        return reply.status(404).send({
          success: false,
          message: 'User not found',
          code: 'NOT_FOUND',
        });
      }

      return reply.send({
        success: true,
        data: {
          id: user.id,
          nickname: user.nickname,
          phone: user.phone,
          avatar: user.avatar,
          role: user.role,
          points: user.points,
          createdAt: user.createdAt,
          memberships: user.memberships,
          orders: user.orders,
          stories: user.stories,
          voices: user.voices,
          redeemCodes: user.redeemCodes,
        },
      });
    } catch (error: any) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        message: error.message || 'Failed to get user detail',
        code: 'GET_USER_DETAIL_ERROR',
      });
    }
  });

  /**
   * POST /api/admin/users/:id/grant-points - Manually add points
   */
  app.post('/users/:id/grant-points', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const body = grantPointsSchema.parse(request.body);

      const user = await prisma.user.update({
        where: { id },
        data: {
          points: {
            increment: body.points,
          },
        },
        select: { id: true, points: true },
      });

      return reply.send({
        success: true,
        data: user,
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
        message: error.message || 'Failed to grant points',
        code: 'GRANT_POINTS_ERROR',
      });
    }
  });

  /**
   * POST /api/admin/users/:id/grant-membership - Manually create membership
   */
  app.post('/users/:id/grant-membership', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const body = grantMembershipSchema.parse(request.body);

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + body.days);

      const membership = await prisma.membership.create({
        data: {
          userId: id,
          cardType: body.cardType,
          quota: body.quota,
          usedQuota: 0,
          expiresAt,
          status: 'active',
        },
      });

      return reply.send({
        success: true,
        data: membership,
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
        message: error.message || 'Failed to grant membership',
        code: 'GRANT_MEMBERSHIP_ERROR',
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

  /**
   * POST /api/admin/redeem-codes - Batch create redeem codes for points or memberships
   */
  app.post('/redeem-codes', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = createRedeemCodesSchema.parse(request.body);

      const codes: string[] = [];
      while (codes.length < body.count) {
        const candidate = randomRedeemCode();
        if (!codes.includes(candidate)) {
          codes.push(candidate);
        }
      }

      const created = await prisma.$transaction(async (tx) => {
        const rows = [] as Array<{ code: string }>;
        for (const code of codes) {
          const row = await tx.redeemCode.create({
            data: {
              code,
              rewardType: body.rewardType,
              pointsAmount: body.rewardType === 'points' ? body.pointsAmount : null,
              membershipTier: body.rewardType === 'membership' ? body.membershipTier : null,
              expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
              note: body.note,
            },
            select: { code: true },
          });
          rows.push(row);
        }
        return rows;
      });

      return reply.send({
        success: true,
        data: {
          rewardType: body.rewardType,
          count: created.length,
          codes: created.map((item) => item.code),
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
        message: error.message || 'Failed to create redeem codes',
        code: 'CREATE_REDEEM_CODES_ERROR',
      });
    }
  });

  /**
   * GET /api/admin/redeem-codes - List redeem codes with filters
   */
  app.get('/redeem-codes', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = listRedeemCodesSchema.parse(request.query || {});
      const where = {
        ...(query.status ? { status: query.status } : {}),
        ...(query.rewardType ? { rewardType: query.rewardType } : {}),
        ...(query.search ? { code: { contains: query.search.toUpperCase() } } : {}),
      };

      const [codes, total] = await Promise.all([
        prisma.redeemCode.findMany({
          where,
          include: {
            usedByUser: {
              select: {
                id: true,
                nickname: true,
                phone: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: query.limit,
          skip: query.offset,
        }),
        prisma.redeemCode.count({ where }),
      ]);

      return reply.send({
        success: true,
        data: {
          codes: codes.map((code) => ({
            id: code.id,
            code: code.code,
            rewardType: code.rewardType,
            pointsAmount: code.pointsAmount,
            membershipTier: code.membershipTier,
            expiresAt: code.expiresAt,
            usedAt: code.usedAt,
            status: code.status,
            note: code.note,
            createdAt: code.createdAt,
            usedByUser: code.usedByUser ? {
              id: code.usedByUser.id,
              nickname: code.usedByUser.nickname,
              phone: code.usedByUser.phone,
            } : null,
          })),
          total,
          limit: query.limit,
          offset: query.offset,
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
        message: error.message || 'Failed to get redeem codes',
        code: 'GET_REDEEM_CODES_ERROR',
      });
    }
  });

  /**
   * PATCH /api/admin/redeem-codes/:id/disable - Disable a redeem code
   */
  app.patch('/redeem-codes/:id/disable', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;

      const code = await prisma.redeemCode.findUnique({ where: { id } });
      if (!code) {
        return reply.status(404).send({
          success: false,
          message: 'Redeem code not found',
          code: 'NOT_FOUND',
        });
      }

      if (code.status === 'used') {
        return reply.status(400).send({
          success: false,
          message: 'Used redeem codes cannot be disabled',
          code: 'INVALID_STATE',
        });
      }

      await prisma.redeemCode.update({
        where: { id },
        data: { status: 'disabled' },
      });

      return reply.send({
        success: true,
        data: { id, status: 'disabled' },
      });
    } catch (error: any) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        message: error.message || 'Failed to disable redeem code',
        code: 'DISABLE_REDEEM_CODE_ERROR',
      });
    }
  });
}

export default adminRoutes;
