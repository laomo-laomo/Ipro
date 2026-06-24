import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../config/database.js';
import { MEMBERSHIP_MAX_SCENES, type MembershipTier } from '../../config/membership.js';
import { createMembershipOrder } from '../../services/payment.service.js';
import { getQuotaStatus } from '../../services/membership.service.js';
import { redeemCode } from '../../services/redeem.service.js';
import { getAvailableMembershipPlans, getEnabledMembershipPlanById } from '../../services/membership-plan.service.js';


const purchaseSchema = z.object({
  cardType: z.string().min(1).max(64),
  channel: z.enum(['wechat', 'alipay', 'stripe']).optional().default('wechat'),
});

const redeemSchema = z.object({
  code: z.string().min(1).max(64),
});

/**
 * Membership routes
 */
export async function membershipRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/membership/status - Get user's membership status
   */
  app.get('/status', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user;

      // Return empty status if not authenticated
      if (!user) {
        return reply.send({
          success: true,
          data: {
            isActive: false,
            tier: null,
            expiresAt: null,
            remainingQuota: 0,
            totalQuota: 0,
            maxScenes: null,
            userPoints: 0,
          },
        });
      }

      const quotaStatus = await getQuotaStatus(user.id);

      return reply.send({
        success: true,
        data: {
          isActive: quotaStatus.hasMembership,
          tier: quotaStatus.cardType,
          ...quotaStatus,
        },
      });
    } catch (error: any) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        message: error.message || 'Failed to get membership status',
        code: 'GET_STATUS_ERROR',
      });
    }
  });

  /**
   * GET /api/membership/current - Get user's current quota status with warning
   */
  app.get('/current', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user;

      // Return empty status if not authenticated
      if (!user) {
        return reply.send({
          success: true,
          data: {
            hasMembership: false,
            totalQuota: 0,
            usedQuota: 0,
            remainingQuota: 0,
            expiresAt: null,
            cardType: null,
            isWarning: false,
            warningMessage: null,
            maxScenes: null,
          },
        });
      }

      const quotaStatus = await getQuotaStatus(user.id);

      return reply.send({
        success: true,
        data: quotaStatus,
      });
    } catch (error: any) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        message: error.message || 'Failed to get quota status',
        code: 'GET_QUOTA_ERROR',
      });
    }
  });

  /**
   * GET /api/membership/plans - Get available membership plans
   */
  app.get('/plans', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      return reply.send({
        success: true,
        data: await getAvailableMembershipPlans(),
      });
    } catch (error: any) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        message: error.message || 'Failed to get plans',
        code: 'GET_PLANS_ERROR',
      });
    }
  });

  /**
   * POST /api/membership/purchase - Purchase membership
   */
  app.post('/purchase', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const body = purchaseSchema.parse(request.body);
      const plan = await getEnabledMembershipPlanById(body.cardType);
      if (!plan) {
        return reply.status(400).send({
          success: false,
          message: '套餐不存在或已下架',
          code: 'PLAN_UNAVAILABLE',
        });
      }

      const result = await createMembershipOrder(
        user.id,
        body.cardType as MembershipTier,
        body.channel
      );

      return reply.send({
        success: true,
        data: {
          orderId: result.order.id,
          orderNo: result.order.orderNo,
          amount: result.order.amount,
          paymentUrl: result.paymentUrl,
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
        message: error.message || 'Failed to purchase membership',
        code: 'PURCHASE_ERROR',
      });
    }
  });

  /**
   * POST /api/membership/redeem - Redeem a code for points or membership
   */
  app.post('/redeem', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const body = redeemSchema.parse(request.body);

      const result = await redeemCode(user.id, body.code);

      return reply.send({
        success: true,
        data: result,
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

      return reply.status(400).send({
        success: false,
        message: error.message || '兑换失败',
        code: 'REDEEM_ERROR',
      });
    }
  });
}

export default membershipRoutes;

