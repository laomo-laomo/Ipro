import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

export interface AuthUserPayload {
  id: string;
  openid?: string;
  phone?: string;
  nickname?: string;
  avatar?: string;
  role?: string;
  iat?: number;
  exp?: number;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AuthUserPayload;
    user: AuthUserPayload;
  }
}

// Extend Fastify types
declare module 'fastify' {
  interface FastifyInstance {
    prisma: import('@prisma/client').PrismaClient;
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

// Payment channel configuration
export const paymentConfig = {
  wechat: {
    appId: process.env.WECHAT_APP_ID || '',
    mchId: process.env.WECHAT_MCH_ID || '',
    apiKey: process.env.WECHAT_API_KEY || '',
    notifyUrl: process.env.WECHAT_NOTIFY_URL || 'http://localhost:3001/api/orders/callback/wechat',
  },
  alipay: {
    appId: process.env.ALIPAY_APP_ID || '',
    privateKey: process.env.ALIPAY_PRIVATE_KEY || '',
    alipayPublicKey: process.env.ALIPAY_PUBLIC_KEY || '',
    notifyUrl: process.env.ALIPAY_NOTIFY_URL || 'http://localhost:3001/api/orders/callback/alipay',
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  },
};

// Default price config
export const defaultPrices = {
  image: 0.2,
  video: 0.1, // 默认 0.1 元, 设置为 0 表示免费
  voiceClone: 19.9,
  clonedVoicePer1kChar: 0.2,
  timesCard: 9.9,
  times1Card: 9.9,
  times10Card: 89,
  times50Card: 399,
  times100Card: 699,
  weeklyCard: 19.9,
  monthlyCard: 59,
  quarterlyCard: 159,
  yearlyCard: 499,
};

// API endpoints
export const apiConfig = {
  port: parseInt(process.env.PORT || '3001', 10),
  host: process.env.HOST || '0.0.0.0',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  jwtSecret: process.env.JWT_SECRET || 'development-secret',
};

export type PaymentChannel = 'wechat' | 'alipay' | 'stripe';
export type OrderType = 'image' | 'story' | 'membership' | 'voice_clone' | 'video';
export type VoiceStatus = 'processing' | 'active' | 'expired';
export type OrderStatus = 'pending' | 'paid' | 'refunded' | 'cancelled';
