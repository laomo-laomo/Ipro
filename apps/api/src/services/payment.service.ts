import type { Order } from '@prisma/client';
import { prisma } from '../config/database.js';
import { getRedisClient, isRedisAvailable } from '../config/redis.js';
import crypto from 'crypto';
import { randomString } from '../utils/random.js';
import { getAllPrices } from './price.service.js';
import { getPlanPeriodDays, MEMBERSHIP_DEFAULT_QUOTAS, type MembershipTier } from '../config/membership.js';

// Constants for payment processing
const ORDER_TIMEOUT_MINUTES = 30;
const PAYMENT_LOCK_TTL_SECONDS = 60;
const ORDER_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

// Payment log levels
type PaymentLogLevel = 'info' | 'warn' | 'error';

/**
 * Log payment operations with structured data
 */
async function logPayment(
  orderNo: string,
  channel: 'wechat' | 'alipay' | 'stripe',
  event: string,
  requestData: any,
  status: 'success' | 'failed' | 'error',
  errorMessage?: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  try {
    await prisma.paymentLog.create({
      data: {
        orderNo,
        channel,
        event,
        requestData: JSON.stringify(requestData),
        status,
        errorMessage,
        ipAddress,
        userAgent,
      },
    });
  } catch (err) {
    // Fallback to console if DB logging fails
    console.error('[PaymentLog] Failed to write to DB:', err);
    console.log(`[PaymentLog] ${orderNo} | ${channel} | ${event} | ${status}`, requestData);
  }
}

/**
 * Log payment operation to console with timestamp
 */
function paymentLog(level: PaymentLogLevel, message: string, data?: any): void {
  const timestamp = new Date().toISOString();
  const logData = data ? ` | ${JSON.stringify(data)}` : '';
  console.log(`[${timestamp}] [Payment ${level.toUpperCase()}] ${message}${logData}`);
}

/**
 * Generate order number
 */
function generateOrderNo(): string {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const random = randomString(6);
  return `IP${dateStr}${random}`;
}

/**
 * Get order by ID
 */
export async function getOrderById(orderId: string, userId: string): Promise<Order | null> {
  return prisma.order.findFirst({
    where: { id: orderId, userId },
  });
}

/**
 * Get order by orderNo
 */
export async function getOrderByNo(orderNo: string): Promise<Order | null> {
  return prisma.order.findUnique({
    where: { orderNo },
  });
}

/**
 * Acquire lock for duplicate callback prevention using Redis
 * Returns true if lock acquired, false otherwise
 */
export async function acquirePaymentLock(orderNo: string): Promise<boolean> {
  if (!isRedisAvailable()) {
    // Fallback to database-based locking
    return await acquireDatabaseLock(orderNo);
  }

  const redis = getRedisClient()!;
  const lockKey = `payment:lock:${orderNo}`;

  try {
    // Use SET NX EX to atomically set lock with expiry
    const result = await redis.set(lockKey, '1', 'EX', PAYMENT_LOCK_TTL_SECONDS, 'NX');
    return result === 'OK';
  } catch (error) {
    paymentLog('error', 'Failed to acquire Redis lock', { orderNo, error });
    // Fallback to database lock
    return await acquireDatabaseLock(orderNo);
  }
}

/**
 * Release payment lock
 */
export async function releasePaymentLock(orderNo: string): Promise<void> {
  if (!isRedisAvailable()) {
    return;
  }

  const redis = getRedisClient()!;
  const lockKey = `payment:lock:${orderNo}`;

  try {
    await redis.del(lockKey);
  } catch (error) {
    paymentLog('error', 'Failed to release Redis lock', { orderNo, error });
  }
}

/**
 * Database-based lock fallback for environments without Redis
 * Uses a transaction to ensure atomicity
 */
async function acquireDatabaseLock(orderNo: string): Promise<boolean> {
  const lockKey = `payment_lock_${orderNo}`;
  const lockExpiry = new Date(Date.now() + PAYMENT_LOCK_TTL_SECONDS * 1000);

  try {
    // Try to update an existing lock record or create a new one
    const result = await prisma.$transaction(async (tx) => {
      // Check for existing lock
      const existingLock = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM PaymentLog WHERE orderNo = ${orderNo} AND event = 'lock' AND createdAt > datetime('now', '-${PAYMENT_LOCK_TTL_SECONDS} seconds')
      `;

      if (existingLock.length > 0) {
        return false; // Lock already exists
      }

      // Create a lock record
      await tx.paymentLog.create({
        data: {
          orderNo,
          channel: 'internal',
          event: 'lock',
          requestData: JSON.stringify({ lockKey }),
          status: 'success',
        },
      });

      return true;
    });

    return result;
  } catch (error) {
    paymentLog('error', 'Failed to acquire database lock', { orderNo, error });
    return false;
  }
}

/**
 * Check and cancel expired orders (created more than ORDER_TIMEOUT_MINUTES ago and still pending)
 */
export async function cancelExpiredOrders(): Promise<number> {
  const cutoffTime = new Date(Date.now() - ORDER_TIMEOUT_MINUTES * 60 * 1000);

  try {
    // Find all pending orders older than cutoff time
    const expiredOrders = await prisma.order.findMany({
      where: {
        status: 'pending',
        createdAt: {
          lt: cutoffTime,
        },
      },
    });

    if (expiredOrders.length === 0) {
      return 0;
    }

    paymentLog('info', `Found ${expiredOrders.length} expired orders to cancel`, {
      orderNos: expiredOrders.map(o => o.orderNo)
    });

    // Update all expired orders to cancelled status
    const result = await prisma.order.updateMany({
      where: {
        id: {
          in: expiredOrders.map(o => o.id),
        },
        status: 'pending', // Double-check status hasn't changed
      },
      data: {
        status: 'cancelled',
      },
    });

    // Send notifications for cancelled orders
    for (const order of expiredOrders) {
      await createPaymentNotification(
        order.userId,
        'order_cancelled',
        '订单已取消',
        `您的订单 ${order.orderNo} 因超时未支付已被自动取消`,
        { orderId: order.id, orderNo: order.orderNo, amount: order.amount }
      );

      await logPayment(
        order.orderNo,
        order.paymentChannel as 'wechat' | 'alipay' | 'stripe' || 'internal',
        'auto_cancel',
        { createdAt: order.createdAt, reason: 'timeout' },
        'success'
      );
    }

    paymentLog('info', `Cancelled ${result.count} expired orders`);
    return result.count;
  } catch (error) {
    paymentLog('error', 'Failed to cancel expired orders', { error });
    return 0;
  }
}

/**
 * Create payment notification for user
 */
export async function createPaymentNotification(
  userId: string,
  type: string,
  title: string,
  content: string,
  data?: any
): Promise<void> {
  try {
    await prisma.paymentNotification.create({
      data: {
        userId,
        type,
        title,
        content,
        data: data ? JSON.stringify(data) : null,
      },
    });
    paymentLog('info', 'Created payment notification', { userId, type, title });
  } catch (error) {
    paymentLog('error', 'Failed to create notification', { userId, type, error });
    // Don't throw - notification failure shouldn't break payment flow
  }
}

/**
 * Create order for voice clone
 */
export async function createVoiceCloneOrder(
  userId: string,
  paymentChannel: 'wechat' | 'alipay' | 'stripe'
): Promise<{ order: Order; paymentUrl: string }> {
  const prices = await getAllPrices();
  const amount = prices.voiceClone;

  paymentLog('info', 'Creating voice clone order', { userId, paymentChannel, amount });

  const order = await prisma.order.create({
    data: {
      orderNo: generateOrderNo(),
      userId,
      type: 'voice_clone',
      amount,
      paymentChannel,
      status: 'pending',
    },
  });

  // Generate payment URL based on channel
  let paymentUrl = '';
  switch (paymentChannel) {
    case 'wechat':
      paymentUrl = await createWechatPayOrder(order);
      break;
    case 'alipay':
      paymentUrl = await createAlipayOrder(order);
      break;
    case 'stripe':
      paymentUrl = await createStripeOrder(order);
      break;
  }

  paymentLog('info', 'Voice clone order created', { orderNo: order.orderNo, paymentUrl: paymentUrl.substring(0, 50) });
  return { order, paymentUrl };
}

/**
 * Create order for membership
 */
export async function createMembershipOrder(
  userId: string,
  cardType: MembershipTier,
  paymentChannel: 'wechat' | 'alipay' | 'stripe'
): Promise<{ order: Order; paymentUrl: string }> {
  const prices = await getAllPrices();
  const priceKey = `${cardType}Card` as keyof typeof prices;
  const amount = (prices as any)[priceKey] || prices.monthlyCard;

  paymentLog('info', 'Creating membership order', { userId, cardType, paymentChannel, amount });

  const order = await prisma.order.create({
    data: {
      orderNo: generateOrderNo(),
      userId,
      type: 'membership',
      amount,
      paymentChannel,
      metadata: JSON.stringify({ cardType }),
    },
  });

  let paymentUrl = '';
  switch (paymentChannel) {
    case 'wechat':
      paymentUrl = await createWechatPayOrder(order);
      break;
    case 'alipay':
      paymentUrl = await createAlipayOrder(order);
      break;
    case 'stripe':
      paymentUrl = await createStripeOrder(order);
      break;
  }

  paymentLog('info', 'Membership order created', { orderNo: order.orderNo, paymentUrl: paymentUrl.substring(0, 50) });
  return { order, paymentUrl };
}

/**
 * Create WeChat Pay order
 */
async function createWechatPayOrder(order: Order): Promise<string> {
  const appId = process.env.WECHAT_APP_ID || '';
  const mchId = process.env.WECHAT_MCH_ID || '';
  const apiKey = process.env.WECHAT_API_KEY || '';

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonceStr = randomString(32);

  // Build sign string
  const signStr = `appid=${appId}&mch_id=${mchId}&nonce_str=${nonceStr}&body=IPRO声音克隆&out_trade_no=${order.orderNo}&total_fee=${Math.floor(order.amount * 100)}&trade_type=NATIVE&notify_url=${process.env.WECHAT_NOTIFY_URL || 'http://localhost:3001/api/orders/callback/wechat'}`;

  // Sign
  const sign = crypto
    .createHash('md5')
    .update(`${signStr}&key=${apiKey}`)
    .digest('hex')
    .toUpperCase();

  // Build XML request
  const xmlBody = `
<xml>
  <appid>${appId}</appid>
  <mch_id>${mchId}</mch_id>
  <nonce_str>${nonceStr}</nonce_str>
  <body>IPRO声音克隆</body>
  <out_trade_no>${order.orderNo}</out_trade_no>
  <total_fee>${Math.floor(order.amount * 100)}</total_fee>
  <trade_type>NATIVE</trade_type>
  <notify_url>${process.env.WECHAT_NOTIFY_URL || 'http://localhost:3001/api/orders/callback/wechat'}</notify_url>
  <sign>${sign}</sign>
</xml>`;

  paymentLog('info', 'Creating WeChat Pay order', { orderNo: order.orderNo, amount: order.amount });

  const response = await fetch('https://api.mch.weixin.qq.com/pay/unifiedorder', {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml' },
    body: xmlBody,
  });

  const xmlResponse = await response.text();

  // Parse code_url from XML response
  const codeUrlMatch = xmlResponse.match(/<code_url><!\[CDATA\[(.*?)\]\]><\/code_url>/);
  if (codeUrlMatch) {
    paymentLog('info', 'WeChat Pay order created successfully', { orderNo: order.orderNo });
    return codeUrlMatch[1];
  }

  paymentLog('error', 'WeChat Pay order creation failed', { orderNo: order.orderNo, xmlResponse });
  throw new Error('Failed to create WeChat Pay order');
}

/**
 * Create Alipay order
 */
async function createAlipayOrder(order: Order): Promise<string> {
  // For Alipay, we would typically use the Alipay SDK
  // This is a simplified implementation
  const appId = process.env.ALIPAY_APP_ID || '';
  const timestamp = new Date().toISOString();

  const bizContent = {
    out_trade_no: order.orderNo,
    product_code: 'FAST_INSTANT_TRADE_PAY',
    total_amount: order.amount,
    subject: 'IPRO声音克隆',
  };

  // In production, use Alipay SDK for proper signing
  // This returns a payment URL that the client will redirect to
  paymentLog('info', 'Creating Alipay order', { orderNo: order.orderNo, amount: order.amount });

  return `https://openapi.alipay.com/gateway.do?app_id=${appId}&biz_content=${encodeURIComponent(JSON.stringify(bizContent))}&timestamp=${encodeURIComponent(timestamp)}&method=alipay.trade.page.pay`;
}

/**
 * Create Stripe order
 */
async function createStripeOrder(order: Order): Promise<string> {
  const stripe = require('stripe');
  const stripeClient = new stripe(process.env.STRIPE_SECRET_KEY || '');

  paymentLog('info', 'Creating Stripe order', { orderNo: order.orderNo, amount: order.amount });

  const session = await stripeClient.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'cny',
          product_data: {
            name: 'IPRO声音克隆',
          },
          unit_amount: Math.floor(order.amount * 100),
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    success_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/success?orderNo=${order.orderNo}`,
    cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/cancel`,
    metadata: {
      orderId: order.id,
      orderNo: order.orderNo,
    },
  });

  paymentLog('info', 'Stripe order created', { orderNo: order.orderNo, sessionId: session.id });
  return session.url || '';
}

/**
 * Verify WeChat Pay callback signature
 */
export function verifyWechatPaySignature(data: Record<string, string>): boolean {
  const apiKey = process.env.WECHAT_API_KEY || '';
  const receivedSign = data.sign;

  if (!receivedSign) {
    paymentLog('warn', 'WeChat signature missing', { hasSign: !!receivedSign });
    return false;
  }

  // Build sign string (exclude sign field)
  const signStr = Object.keys(data)
    .filter(key => key !== 'sign')
    .sort()
    .map(key => `${key}=${data[key]}`)
    .join('&');

  // Calculate expected sign
  const expectedSign = crypto
    .createHash('md5')
    .update(`${signStr}&key=${apiKey}`)
    .digest('hex')
    .toUpperCase();

  const verified = receivedSign === expectedSign;
  if (!verified) {
    paymentLog('warn', 'WeChat signature verification failed', { receivedSign, expectedSign });
  }

  return verified;
}

/**
 * Verify Alipay callback signature (RSA2)
 * Note: Requires alipay-public-key from Alipay open platform
 */
export function verifyAlipaySignature(
  data: Record<string, string>,
  signType: string = 'RSA2'
): boolean {
  const alipayPublicKey = process.env.ALIPAY_PUBLIC_KEY || '';

  if (!alipayPublicKey) {
    console.warn('Alipay public key not configured, skipping verification');
    return true; // Allow in development
  }

  const sign = data.sign;
  const signData = data.sign_data;

  if (!sign) {
    paymentLog('warn', 'Alipay signature missing');
    return false;
  }

  try {
    const verify = crypto.createVerify('RSA-SHA256');
    verify.update(signData || JSON.stringify(data));

    const verified = verify.verify(alipayPublicKey, sign, 'base64');
    if (!verified) {
      paymentLog('warn', 'Alipay signature verification failed');
    }
    return verified;
  } catch (error) {
    paymentLog('error', 'Alipay signature verification error', { error });
    return false;
  }
}

/**
 * Process successful payment - common logic for all payment channels
 */
async function processSuccessfulPayment(
  order: Order,
  transactionId: string,
  channel: 'wechat' | 'alipay' | 'stripe',
  ipAddress?: string,
  userAgent?: string
): Promise<{ success: boolean; message: string }> {
  paymentLog('info', 'Processing successful payment', { orderNo: order.orderNo, transactionId, channel });

  // Update order to paid status
  await prisma.order.update({
    where: { id: order.id },
    data: {
      status: 'paid',
      transactionId,
    },
  });

  // Process based on order type
  if (order.type === 'membership') {
    await processMembershipPayment(order);
  } else if (order.type === 'voice_clone') {
    await processVoiceClonePayment(order);
  }

  // Send payment success notification
  const notificationTitle = order.type === 'membership' ? '会员开通成功' : '声音克隆购买成功';
  const notificationContent = order.type === 'membership'
    ? `恭喜！您已成功开通${getMembershipName(order)}，快去体验吧！`
    : '恭喜！您已成功购买声音克隆服务，请在声音管理中上传音频开始克隆。';

  await createPaymentNotification(
    order.userId,
    'payment_success',
    notificationTitle,
    notificationContent,
    {
      orderId: order.id,
      orderNo: order.orderNo,
      amount: order.amount,
      type: order.type,
      transactionId,
    }
  );

  await logPayment(
    order.orderNo,
    channel,
    'payment_success',
    { transactionId },
    'success',
    undefined,
    ipAddress,
    userAgent
  );

  paymentLog('info', 'Payment processed successfully', { orderNo: order.orderNo });
  return { success: true, message: channel === 'wechat' ? 'OK' : 'success' };
}

/**
 * Get membership name for notification
 */
function getMembershipName(order: Order): string {
  try {
    const metadata = order.metadata ? JSON.parse(order.metadata) : {};
    const cardType = metadata.cardType || 'monthly';
    const names: Record<string, string> = {
      times: '1次卡',
      times1: '1次卡',
      times10: '10次卡',
      times50: '50次卡',
      times100: '100次卡',
      weekly: '周卡',
      monthly: '月卡',
      quarterly: '季卡',
      yearly: '年卡',
    };
    return names[cardType] || '会员';
  } catch {
    return '会员';
  }
}

/**
 * Process membership payment - create or extend membership record.
 * If the user already has an active membership, extend its expiry and add
 * quota instead of creating a duplicate row (which would let users stack
 * multiple memberships via rapid-fire orders).
 */
async function processMembershipPayment(order: Order): Promise<void> {
  try {
    const metadata = order.metadata ? JSON.parse(order.metadata) : {};
    const cardType = (metadata.cardType || 'monthly') as MembershipTier;
    const periodDays = getPlanPeriodDays(cardType);
    const quota = MEMBERSHIP_DEFAULT_QUOTAS[cardType] || 0;

    // Look for an existing active membership (not yet expired)
    const existing = await prisma.membership.findFirst({
      where: {
        userId: order.userId,
        status: 'active',
        expiresAt: { gt: new Date() },
      },
      orderBy: { expiresAt: 'desc' },
    });

    if (existing) {
      // Extend: push expiry from the LATER of (now, current expiry) and add quota
      const baseDate = existing.expiresAt > new Date() ? existing.expiresAt : new Date();
      const newExpiry = new Date(baseDate);
      newExpiry.setDate(newExpiry.getDate() + periodDays);

      await prisma.membership.update({
        where: { id: existing.id },
        data: {
          cardType,
          quota: existing.quota + quota,
          expiresAt: newExpiry,
          status: 'active',
        },
      });

      paymentLog('info', 'Membership extended', {
        userId: order.userId,
        cardType,
        previousExpiry: existing.expiresAt,
        newExpiry,
        addedQuota: quota,
      });
    } else {
      // No active membership — create a new one
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + periodDays);

      await prisma.membership.create({
        data: {
          userId: order.userId,
          cardType,
          quota,
          usedQuota: 0,
          expiresAt,
          status: 'active',
        },
      });

      paymentLog('info', 'Membership created', { userId: order.userId, cardType, expiresAt });
    }
  } catch (error) {
    paymentLog('error', 'Failed to process membership payment', { orderNo: order.orderNo, error });
    throw error;
  }
}

/**
 * Process voice clone payment - create UserVoice record with processing status
 */
async function processVoiceClonePayment(order: Order): Promise<void> {
  try {
    // Get metadata for voice name (default name based on order)
    const metadata = order.metadata ? JSON.parse(order.metadata) : {};
    const voiceName = metadata.voiceName || `我的声音 ${new Date().toLocaleDateString('zh-CN')}`;

    // Create UserVoice record with processing status
    // The actual voice cloning will be triggered later by the user uploading audio
    await prisma.userVoice.create({
      data: {
        userId: order.userId,
        name: voiceName,
        audioUrl: '', // Will be updated when user uploads audio
        modelUrl: null,
        status: 'pending', // Will transition to 'processing' when user uploads audio
      },
    });

    paymentLog('info', 'UserVoice record created for voice clone order', { userId: order.userId, orderNo: order.orderNo });
  } catch (error) {
    paymentLog('error', 'Failed to create UserVoice record', { orderNo: order.orderNo, error });
    throw error;
  }
}

/**
 * Handle WeChat Pay callback
 */
export async function handleWechatCallback(
  data: any,
  ipAddress?: string,
  userAgent?: string
): Promise<{ success: boolean; message: string }> {
  const orderNo = data.out_trade_no || 'unknown';

  paymentLog('info', 'WeChat callback received', { orderNo, data: { ...data, sign: '[REDACTED]' } });

  // Log incoming callback
  await logPayment(
    orderNo,
    'wechat',
    'callback_received',
    { ...data, sign: '[REDACTED]' },
    'success',
    undefined,
    ipAddress,
    userAgent
  );

  // Verify signature first
  if (!verifyWechatPaySignature(data)) {
    await logPayment(orderNo, 'wechat', 'callback', data, 'failed', 'Invalid signature', ipAddress, userAgent);
    return { success: false, message: 'Invalid signature' };
  }

  // Check response code
  if (data.return_code !== 'SUCCESS') {
    await logPayment(orderNo, 'wechat', 'callback', data, 'failed', data.return_msg, ipAddress, userAgent);
    return { success: false, message: `WeChat error: ${data.return_msg}` };
  }

  const { out_trade_no, transaction_id } = data;

  // Try to acquire lock to prevent duplicate processing
  const lockAcquired = await acquirePaymentLock(out_trade_no);
  if (!lockAcquired) {
    paymentLog('warn', 'Duplicate WeChat callback detected, skipping', { orderNo: out_trade_no });
    await logPayment(out_trade_no, 'wechat', 'callback', data, 'failed', 'Duplicate callback - lock not acquired', ipAddress, userAgent);
    return { success: true, message: 'Already processed' }; // Return success to prevent retries
  }

  try {
    const order = await prisma.order.findUnique({
      where: { orderNo: out_trade_no },
    });

    if (!order) {
      paymentLog('error', 'Order not found for WeChat callback', { orderNo: out_trade_no });
      await logPayment(out_trade_no, 'wechat', 'callback', data, 'error', 'Order not found', ipAddress, userAgent);
      return { success: false, message: 'Order not found' };
    }

    if (order.status !== 'pending') {
      paymentLog('warn', 'Order already processed', { orderNo: out_trade_no, status: order.status });
      await logPayment(out_trade_no, 'wechat', 'callback', data, 'success', 'Order already processed', ipAddress, userAgent);
      return { success: true, message: 'Already processed' };
    }

    // Process the payment
    const result = await processSuccessfulPayment(order, transaction_id, 'wechat', ipAddress, userAgent);

    return result;
  } finally {
    // Always release the lock
    await releasePaymentLock(out_trade_no);
  }
}

/**
 * Handle Alipay callback
 */
export async function handleAlipayCallback(
  data: any,
  ipAddress?: string,
  userAgent?: string
): Promise<{ success: boolean; message: string }> {
  const orderNo = data.out_trade_no || 'unknown';

  paymentLog('info', 'Alipay callback received', { orderNo, data: { ...data, sign: '[REDACTED]' } });

  // Log incoming callback
  await logPayment(
    orderNo,
    'alipay',
    'callback_received',
    { ...data, sign: '[REDACTED]' },
    'success',
    undefined,
    ipAddress,
    userAgent
  );

  // Verify signature
  if (!verifyAlipaySignature(data)) {
    await logPayment(orderNo, 'alipay', 'callback', data, 'failed', 'Invalid signature', ipAddress, userAgent);
    return { success: false, message: 'Invalid signature' };
  }

  // Check response status
  if (data.trade_status !== 'TRADE_SUCCESS' && data.trade_status !== 'TRADE_FINISHED') {
    await logPayment(orderNo, 'alipay', 'callback', data, 'failed', data.trade_status, ipAddress, userAgent);
    return { success: false, message: `Alipay error: ${data.trade_status}` };
  }

  const { out_trade_no, trade_no } = data;

  // Try to acquire lock to prevent duplicate processing
  const lockAcquired = await acquirePaymentLock(out_trade_no);
  if (!lockAcquired) {
    paymentLog('warn', 'Duplicate Alipay callback detected, skipping', { orderNo: out_trade_no });
    await logPayment(out_trade_no, 'alipay', 'callback', data, 'failed', 'Duplicate callback - lock not acquired', ipAddress, userAgent);
    return { success: true, message: 'Already processed' };
  }

  try {
    const order = await prisma.order.findUnique({
      where: { orderNo: out_trade_no },
    });

    if (!order) {
      paymentLog('error', 'Order not found for Alipay callback', { orderNo: out_trade_no });
      await logPayment(out_trade_no, 'alipay', 'callback', data, 'error', 'Order not found', ipAddress, userAgent);
      return { success: false, message: 'Order not found' };
    }

    if (order.status !== 'pending') {
      paymentLog('warn', 'Order already processed', { orderNo: out_trade_no, status: order.status });
      await logPayment(out_trade_no, 'alipay', 'callback', data, 'success', 'Order already processed', ipAddress, userAgent);
      return { success: true, message: 'Already processed' };
    }

    // Process the payment
    const result = await processSuccessfulPayment(order, trade_no, 'alipay', ipAddress, userAgent);

    return result;
  } finally {
    // Always release the lock
    await releasePaymentLock(out_trade_no);
  }
}

/**
 * Handle Stripe webhook
 */
export async function handleStripeWebhook(
  payload: string,
  signature: string,
  ipAddress?: string,
  userAgent?: string
): Promise<boolean> {
  const stripe = require('stripe');
  const stripeClient = new stripe(process.env.STRIPE_SECRET_KEY || '');

  paymentLog('info', 'Stripe webhook received', { payloadLength: payload.length });

  let event;
  try {
    event = stripeClient.webhooks.constructEvent(
      payload,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET || ''
    );
  } catch (err: any) {
    paymentLog('error', 'Stripe webhook signature verification failed', { error: err.message });
    return false;
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const orderNo = session.metadata?.orderNo || 'unknown';

    paymentLog('info', 'Stripe checkout completed', { orderNo, sessionId: session.id });

    if (orderNo === 'unknown') {
      paymentLog('warn', 'Stripe webhook missing orderNo in metadata', { sessionId: session.id });
      return true;
    }

    // Try to acquire lock
    const lockAcquired = await acquirePaymentLock(orderNo);
    if (!lockAcquired) {
      paymentLog('warn', 'Duplicate Stripe webhook detected, skipping', { orderNo });
      return true;
    }

    try {
      const order = await prisma.order.findUnique({
        where: { orderNo },
      });

      if (!order) {
        paymentLog('error', 'Order not found for Stripe webhook', { orderNo });
        await logPayment(orderNo, 'stripe', 'webhook', { sessionId: session.id }, 'error', 'Order not found', ipAddress, userAgent);
        return true;
      }

      if (order.status !== 'pending') {
        paymentLog('warn', 'Order already processed', { orderNo, status: order.status });
        return true;
      }

      // Process the payment
      await processSuccessfulPayment(
        order,
        session.payment_intent as string,
        'stripe',
        ipAddress,
        userAgent
      );

      return true;
    } finally {
      await releasePaymentLock(orderNo);
    }
  }

  return true;
}

/**
 * Update order status
 */
export async function updateOrderStatus(
  orderId: string,
  status: 'paid' | 'refunded' | 'cancelled',
  transactionId?: string
): Promise<void> {
  paymentLog('info', 'Updating order status', { orderId, status, transactionId });

  await prisma.order.update({
    where: { id: orderId },
    data: {
      status,
      transactionId,
    },
  });
}

/**
 * Get user's payment notifications
 */
export async function getUserNotifications(userId: string, limit: number = 20): Promise<any[]> {
  return prisma.paymentNotification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

/**
 * Mark notification as read
 */
export async function markNotificationAsRead(notificationId: string, userId: string): Promise<void> {
  await prisma.paymentNotification.updateMany({
    where: { id: notificationId, userId },
    data: { isRead: true },
  });
}

/**
 * Get unread notification count
 */
export async function getUnreadNotificationCount(userId: string): Promise<number> {
  return prisma.paymentNotification.count({
    where: { userId, isRead: false },
  });
}

/**
 * Get payment logs for order (for debugging)
 */
export async function getPaymentLogs(orderNo: string): Promise<any[]> {
  return prisma.paymentLog.findMany({
    where: { orderNo },
    orderBy: { createdAt: 'desc' },
  });
}

// Start order cleanup interval (check for expired orders every hour)
let cleanupInterval: NodeJS.Timeout | null = null;

/**
 * Start the order cleanup scheduler
 */
export function startOrderCleanupScheduler(): void {
  if (cleanupInterval) {
    return; // Already running
  }

  cleanupInterval = setInterval(async () => {
    try {
      const cancelled = await cancelExpiredOrders();
      if (cancelled > 0) {
        paymentLog('info', `Order cleanup completed: ${cancelled} orders cancelled`);
      }
    } catch (error) {
      paymentLog('error', 'Order cleanup failed', { error });
    }
  }, ORDER_CLEANUP_INTERVAL_MS);

  paymentLog('info', 'Order cleanup scheduler started', { intervalMs: ORDER_CLEANUP_INTERVAL_MS });
}

/**
 * Stop the order cleanup scheduler
 */
export function stopOrderCleanupScheduler(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    paymentLog('info', 'Order cleanup scheduler stopped');
  }
}

export default {
  getOrderById,
  getOrderByNo,
  createVoiceCloneOrder,
  createMembershipOrder,
  verifyWechatPaySignature,
  verifyAlipaySignature,
  handleWechatCallback,
  handleAlipayCallback,
  handleStripeWebhook,
  updateOrderStatus,
  createPaymentNotification,
  getUserNotifications,
  markNotificationAsRead,
  getUnreadNotificationCount,
  getPaymentLogs,
  acquirePaymentLock,
  releasePaymentLock,
  cancelExpiredOrders,
  startOrderCleanupScheduler,
  stopOrderCleanupScheduler,
};
