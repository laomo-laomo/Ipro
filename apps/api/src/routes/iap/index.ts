/**
 * Apple IAP routes
 *
 * 合规改造 (2026-06-22 P1-3): iOS 端虚拟商品必须走 Apple IAP, 不能走微信支付。
 * 这两个接口对接前端 wx.requestVirtualPayment:
 *
 *   POST /api/orders/iap/sign
 *     入参: { cardType: 'monthly' }
 *     出参: { orderId, orderNo, amount, signData: { appid, offerId, productId, ... } }
 *     作用: 创建 pending 订单 + 生成 wx.requestVirtualPayment 需要的 signData
 *
 *   POST /api/orders/iap/verify
 *     入参: { orderId, receipt }
 *     出参: { success: true, transactionId, productId }
 *     作用: 验证 Apple receipt + 置订单为 paid + 开通会员
 *
 * 鉴权: 需要登录 (跟其他订单接口一致)
 *
 * 注意 (业务限制):
 *   - 仅支持 membership / voice_clone 类型订单的 IAP 流程
 *   - 积分充值 (points) 不能走 IAP, Apple 政策不允许
 *   - 共享密钥 (APPLE_IAP_SHARED_SECRET) 和 RSA 私钥 (IAP_SIGN_PRIVATE_KEY)
 *     需要在 .env 里配置, 由法人/产品在 App Store Connect 后台生成
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../config/database.js';
import {
  verifyAppleReceipt,
  buildVirtualPaymentSignData,
} from '../../services/apple-iap.service.js';
import {
  processMembershipPayment,
} from '../../services/payment.service.js';

const signSchema = z.object({
  cardType: z.enum(['trial', 'weekly', 'monthly', 'quarterly', 'yearly', 'times1', 'times10', 'times50', 'times100']),
  // 数量, consumable 商品需要, 默认 1
  quantity: z.number().int().min(1).max(99).optional().default(1),
});

const verifySchema = z.object({
  orderId: z.string().min(1),
  receipt: z.string().min(1),
  // 客户端可以传 sandbox 标志, 通常自动判断即可
  isSandbox: z.boolean().optional().default(false),
});

/**
 * cardType -> Apple SKU 映射
 *
 * 假设你在 App Store Connect 后台为每个套餐建了对应 SKU:
 *   trial       → com.iyinian.ipro.trial       ¥9.9
 *   weekly      → com.iyinian.ipro.weekly      ¥19.9
 *   monthly     → com.iyinian.ipro.monthly     ¥59
 *   quarterly   → com.iyinian.ipro.quarterly   ¥159
 *   yearly      → com.iyinian.ipro.yearly      ¥499
 *   times1      → com.iyinian.ipro.times1      ¥9.9
 *   times10     → com.iyinian.ipro.times10     ¥89
 *   times50     → com.iyinian.ipro.times50     ¥399
 *   times100    → com.iyinian.ipro.times100    ¥699
 *
 * 如果你的 SKU 命名跟这不一样, 改这个 map 即可。
 */
const CARD_TYPE_TO_APPLE_SKU: Record<string, string> = {
  trial: 'com.iyinian.ipro.trial',
  weekly: 'com.iyinian.ipro.weekly',
  monthly: 'com.iyinian.ipro.monthly',
  quarterly: 'com.iyinian.ipro.quarterly',
  yearly: 'com.iyinian.ipro.yearly',
  times1: 'com.iyinian.ipro.times1',
  times10: 'com.iyinian.ipro.times10',
  times50: 'com.iyinian.ipro.times50',
  times100: 'com.iyinian.ipro.times100',
};

const EXPECTED_BUNDLE_ID = process.env.IOS_APP_BUNDLE_ID || 'com.iyinian.ipro';

export async function iapRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /api/orders/iap/sign
   */
  app.post('/sign', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    try {
      const body = signSchema.parse(request.body);

      const productId = CARD_TYPE_TO_APPLE_SKU[body.cardType];
      if (!productId) {
        return reply.status(400).send({
          success: false,
          message: '不支持的套餐类型: ' + body.cardType,
          code: 'UNSUPPORTED_CARD_TYPE',
        });
      }

      // 查 plan 拿价格 (跟现有 createMembershipOrder 一致, 但不走 createMembershipOrder 因为那个走 wechat 通道)
      const plan = await prisma.membershipPlan.findUnique({
        where: { id: body.cardType },
      });
      if (!plan || plan.enabled === false) {
        return reply.status(404).send({
          success: false,
          message: '套餐不存在或已下架',
          code: 'PLAN_NOT_FOUND',
        });
      }

      // 创建 pending 订单, paymentChannel = 'apple_iap'
      const order = await prisma.order.create({
        data: {
          orderNo: 'IAP' + Date.now().toString() + Math.floor(Math.random() * 1000).toString().padStart(3, '0'),
          userId: user.id,
          type: 'membership',
          amount: plan.price,
          paymentChannel: 'apple_iap',
          status: 'pending',
          metadata: JSON.stringify({
            cardType: body.cardType,
            planName: plan.name,
            productId,
            bundleId: EXPECTED_BUNDLE_ID,
            platform: 'ios',
          }),
        },
      });

      // 生成 signData
      const signData = buildVirtualPaymentSignData({
        productId,
        quantity: body.quantity,
      });

      return reply.send({
        success: true,
        data: {
          orderId: order.id,
          orderNo: order.orderNo,
          amount: order.amount,
          productId,
          bundleId: EXPECTED_BUNDLE_ID,
          signData,
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
        message: error.message || 'Failed to create IAP order',
        code: 'IAP_SIGN_ERROR',
      });
    }
  });

  /**
   * POST /api/orders/iap/verify
   */
  app.post('/verify', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    try {
      const body = verifySchema.parse(request.body);

      const order = await prisma.order.findUnique({
        where: { id: body.orderId },
      });
      if (!order) {
        return reply.status(404).send({
          success: false,
          message: '订单不存在',
          code: 'ORDER_NOT_FOUND',
        });
      }
      if (order.userId !== user.id) {
        return reply.status(403).send({
          success: false,
          message: '无权操作此订单',
          code: 'FORBIDDEN',
        });
      }
      if (order.paymentChannel !== 'apple_iap') {
        return reply.status(400).send({
          success: false,
          message: '此订单不是 Apple IAP 订单',
          code: 'WRONG_CHANNEL',
        });
      }
      if (order.status === 'paid') {
        return reply.send({
          success: true,
          data: { orderId: order.id, alreadyPaid: true, transactionId: order.transactionId },
          message: '订单已支付',
        });
      }
      if (order.status !== 'pending') {
        return reply.status(400).send({
          success: false,
          message: '订单状态异常: ' + order.status,
          code: 'INVALID_ORDER_STATUS',
        });
      }

      // 解析 metadata 拿 productId
      const metadata = order.metadata ? JSON.parse(order.metadata) : {};
      const expectedProductId = metadata.productId;

      // 验证 Apple receipt
      const verifyResult = await verifyAppleReceipt(
        body.receipt,
        EXPECTED_BUNDLE_ID,
        expectedProductId,
        body.isSandbox,
      );

      if (!verifyResult.valid) {
        request.log.warn('[IAP] receipt verification failed', {
          orderId: order.id,
          reason: verifyResult.reason,
        });
        return reply.status(400).send({
          success: false,
          message: 'Apple receipt 验证失败: ' + (verifyResult.reason || '未知原因'),
          code: 'RECEIPT_INVALID',
          reason: verifyResult.reason,
        });
      }

      // 防重放: 同一 transactionId 不能再 verify 别的订单
      const existingTxn = await prisma.order.findFirst({
        where: {
          transactionId: verifyResult.transactionId,
          id: { not: order.id },
        },
      });
      if (existingTxn) {
        return reply.status(409).send({
          success: false,
          message: '此交易已被使用 (防重放)',
          code: 'DUPLICATE_TRANSACTION',
        });
      }

      // 开通会员 (复用现有 processMembershipPayment)
      try {
        await processMembershipPayment(order);
      } catch (e: any) {
        request.log.error('[IAP] processMembershipPayment failed', { orderId: order.id, error: e.message });
        // 标记订单 failed, 让用户走售后
        await prisma.order.update({
          where: { id: order.id },
          data: { status: 'failed' },
        }).catch(() => {});
        return reply.status(500).send({
          success: false,
          message: '会员开通失败: ' + e.message,
          code: 'MEMBERSHIP_GRANT_FAILED',
        });
      }

      // 标记订单 paid
      await prisma.order.update({
        where: { id: order.id },
        data: {
          status: 'paid',
          transactionId: verifyResult.transactionId,
        },
      });

      // 写支付日志
      await prisma.paymentLog.create({
        data: {
          orderNo: order.orderNo,
          channel: 'apple_iap',
          event: 'iap_payment_verified',
          payload: JSON.stringify({
            transactionId: verifyResult.transactionId,
            productId: verifyResult.productId,
            environment: verifyResult.raw?.environment || 'unknown',
          }),
          status: 'success',
        },
      });

      return reply.send({
        success: true,
        data: {
          orderId: order.id,
          transactionId: verifyResult.transactionId,
          productId: verifyResult.productId,
        },
        message: '支付成功',
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
        message: error.message || 'Failed to verify IAP receipt',
        code: 'IAP_VERIFY_ERROR',
      });
    }
  });
}

export default iapRoutes;