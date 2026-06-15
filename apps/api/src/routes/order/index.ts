import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  getOrderById,
  createVoiceCloneOrder,
  createMembershipOrder,
  handleWechatCallback,
  handleAlipayCallback,
  handleStripeWebhook,
  verifyWechatPaySignature,
  verifyAlipaySignature,
  getUserNotifications,
  markNotificationAsRead,
  getUnreadNotificationCount,
  cancelExpiredOrders,
} from '../../services/payment.service.js';
import { cloneVoiceViaMiniMax } from '../../services/voice.service.js';
import { prisma } from '../../config/database.js';


// Request schemas
const createOrderSchema = z.object({
  type: z.enum(['membership', 'voice_clone', 'video', 'image', 'story']),
  channel: z.enum(['wechat', 'alipay', 'stripe']).optional().default('wechat'),
  metadata: z.object({
    cardType: z.enum(['times', 'times1', 'times10', 'times50', 'times100', 'weekly', 'monthly', 'quarterly', 'yearly']).optional(),
  }).optional(),
});

const cloneVoiceSchema = z.object({
  orderId: z.string(),
});

/**
 * Order routes
 */
export async function orderRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /api/orders/create - Create order
   */
  app.post('/create', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const body = createOrderSchema.parse(request.body);

      let result: any;

      switch (body.type) {
        case 'voice_clone':
          result = await createVoiceCloneOrder(user.id, body.channel || 'wechat');
          break;

        case 'membership':
          if (!body.metadata?.cardType) {
            return reply.status(400).send({
              success: false,
              message: 'cardType is required for membership orders',
              code: 'MISSING_CARD_TYPE',
            });
          }
          result = await createMembershipOrder(user.id, body.metadata.cardType, body.channel || 'wechat');
          break;

        default:
          return reply.status(400).send({
            success: false,
            message: 'Invalid order type',
            code: 'INVALID_ORDER_TYPE',
          });
      }

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
        message: error.message || 'Failed to create order',
        code: 'CREATE_ERROR',
      });
    }
  });

  /**
   * GET /api/orders/:id - Get order status
   */
  app.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params;

      const order = await getOrderById(id, user.id);

      if (!order) {
        return reply.status(404).send({
          success: false,
          message: 'Order not found',
          code: 'NOT_FOUND',
        });
      }

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
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
        },
      });
    } catch (error: any) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        message: error.message || 'Failed to get order',
        code: 'GET_ERROR',
      });
    }
  });

  /**
   * POST /api/orders/:id/clone - Confirm voice clone after payment
   */
  app.post('/:id/clone', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params;

      // Verify order is paid
      const order = await prisma.order.findFirst({
        where: { id, userId: user.id, status: 'paid', type: 'voice_clone' },
      });

      if (!order) {
        return reply.status(404).send({
          success: false,
          message: 'Order not found or not paid',
          code: 'ORDER_NOT_FOUND',
        });
      }

      // Get the voice that needs cloning
      const voice = await prisma.userVoice.findFirst({
        where: { userId: user.id, status: 'processing' },
        orderBy: { createdAt: 'desc' },
      });

      if (!voice) {
        return reply.status(404).send({
          success: false,
          message: 'No processing voice found',
          code: 'NO_VOICE',
        });
      }

      // Start voice cloning
      const result = await cloneVoiceViaMiniMax(user.id, voice.audioUrl, voice.id);

      return reply.send({
        success: true,
        data: {
          voiceId: voice.id,
          status: result.status,
        },
      });
    } catch (error: any) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        message: error.message || 'Failed to clone voice',
        code: 'CLONE_ERROR',
      });
    }
  });

  /**
   * POST /api/orders/callback/:channel - Payment callback (public endpoint with signature verification)
   */
  app.post('/callback/:channel', async (request: FastifyRequest<{ Params: { channel: string } }>, reply: FastifyReply) => {
    try {
      const { channel } = request.params;
      // Extract client info for logging
      const ipAddress = request.ip || request.headers['x-forwarded-for'] as string || 'unknown';
      const userAgent = request.headers['user-agent'] || 'unknown';

      switch (channel) {
        case 'wechat': {
          // WeChat Pay sends XML
          const contentType = request.headers['content-type'] || '';
          let data: Record<string, string>;

          if (contentType.includes('xml')) {
            const body = await request.body;
            data = parseXml(body as string);
          } else {
            data = request.body as Record<string, string>;
          }

          // Verify signature before processing
          if (!verifyWechatPaySignature(data)) {
            request.log.warn('WeChat callback signature verification failed');
            return reply.status(400).send({ code: 'INVALID_SIGNATURE', message: 'Invalid signature' });
          }

          const result = await handleWechatCallback(data, ipAddress, userAgent);
          if (!result.success) {
            return reply.status(400).send({ code: 'HANDLER_ERROR', message: result.message });
          }
          return reply.send({ success: true, message: result.message });
        }

        case 'alipay': {
          const alipayData = request.body as Record<string, string>;

          // Verify signature before processing
          if (!verifyAlipaySignature(alipayData)) {
            request.log.warn('Alipay callback signature verification failed');
            return reply.status(400).send({ code: 'INVALID_SIGNATURE', message: 'Invalid signature' });
          }

          const result = await handleAlipayCallback(alipayData, ipAddress, userAgent);
          if (!result.success) {
            return reply.status(400).send({ code: 'HANDLER_ERROR', message: result.message });
          }
          // Alipay requires specific response format
          return reply.type('text/plain').send('success');
        }

        case 'stripe': {
          const sig = request.headers['stripe-signature'] as string;
          const rawBody = JSON.stringify(request.body);

          const success = await handleStripeWebhook(rawBody, sig, ipAddress, userAgent);
          if (!success) {
            return reply.status(400).send({ code: 'WEBHOOK_ERROR', message: 'Webhook processing failed' });
          }
          return reply.send({ success: true, message: 'Received' });
        }

        default:
          return reply.status(400).send({
            success: false,
            message: 'Invalid payment channel',
            code: 'INVALID_CHANNEL',
          });
      }
    } catch (error: any) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        message: error.message || 'Failed to process callback',
        code: 'CALLBACK_ERROR',
      });
    }
  });

  /**
   * GET /api/orders/notifications - Get user's payment notifications
   */
  app.get('/notifications', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const query = request.query as { limit?: string };
      const limit = parseInt(query.limit || '20') || 20;

      const notifications = await getUserNotifications(user.id, limit);

      return reply.send({
        success: true,
        data: notifications,
      });
    } catch (error: any) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        message: error.message || 'Failed to get notifications',
        code: 'GET_ERROR',
      });
    }
  });

  /**
   * GET /api/orders/notifications/unread-count - Get unread notification count
   */
  app.get('/notifications/unread-count', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;

      const count = await getUnreadNotificationCount(user.id);

      return reply.send({
        success: true,
        data: { count },
      });
    } catch (error: any) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        message: error.message || 'Failed to get unread count',
        code: 'GET_ERROR',
      });
    }
  });

  /**
   * PATCH /api/orders/notifications/:id/read - Mark notification as read
   */
  app.patch('/notifications/:id/read', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params;

      await markNotificationAsRead(id, user.id);

      return reply.send({
        success: true,
      });
    } catch (error: any) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        message: error.message || 'Failed to mark notification as read',
        code: 'UPDATE_ERROR',
      });
    }
  });

  /**
   * POST /api/orders/check-expired - Manually trigger expired order check (admin only)
   */
  app.post('/check-expired', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const cancelled = await cancelExpiredOrders();

      return reply.send({
        success: true,
        data: { cancelledCount: cancelled },
      });
    } catch (error: any) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        message: error.message || 'Failed to check expired orders',
        code: 'CHECK_ERROR',
      });
    }
  });
}

/**
 * Parse XML body (WeChat Pay format)
 */
function parseXml(xml: string): Record<string, string> {
  const result: Record<string, string> = {};
  const tagRegex = /<(\w+)><!\[CDATA\[([^\]]*)\]\]><\/\1>|<(\w+)>([^<]*)<\/\3>/g;
  let match;

  while ((match = tagRegex.exec(xml)) !== null) {
    const key = match[1] || match[3];
    const value = match[2] || match[4];
    result[key] = value;
  }

  return result;
}

export default orderRoutes;
