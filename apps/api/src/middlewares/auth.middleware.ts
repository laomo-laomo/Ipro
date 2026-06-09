/**
 * JWT 认证中间件
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../config/database.js';

/**
 * JWT Payload 类型
 */
export interface JwtPayload {
  id: string;
  role?: string;
  iat?: number;
  exp?: number;
}

// Dev mode test user phone
const DEV_PHONE = "13800138000";
const DEV_AUTO_LOGIN_ENABLED = process.env.DEV_AUTO_LOGIN === 'true';

export async function getOrCreateDevUser() {
  const user = await prisma.user.upsert({
    where: { phone: DEV_PHONE },
    update: {},
    create: {
      phone: DEV_PHONE,
      nickname: "测试用户",
      role: "user",
    },
  });
  return { id: user.id, role: user.role };
}

export async function resolveDevUser() {
  return getOrCreateDevUser();
}

export async function ensureDevMembership(userId: string) {
  const existing = await prisma.membership.findFirst({
    where: { userId, status: 'active' },
  });
  if (existing) return;

  await prisma.membership.create({
    data: {
      userId,
      cardType: 'dev',
      quota: 9999,
      usedQuota: 0,
      status: 'active',
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
  });
}

/**
 * 认证中间件
 * 验证 JWT Token 并将用户信息注入 request
 * 开发模式下若无有效 Token 则自动注入测试用户
 */
export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const authHeader = request.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const decoded = await request.jwtVerify<JwtPayload>();
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: { id: true, role: true },
      });
      if (user) {
        request.user = { id: user.id, role: user.role };
        return;
      }
    } catch {
      // token invalid, fall through to dev auto-login
    }
  }

  // Dev mode: auto-inject test user + give unlimited membership
  if (process.env.NODE_ENV !== 'production' && DEV_AUTO_LOGIN_ENABLED) {
    const devUser = await getOrCreateDevUser();
    await ensureDevMembership(devUser.id);
    console.log(`[auth] dev user injected: userId=${devUser.id}`);
    request.user = { id: devUser.id, role: devUser.role };
    return;
  }

  reply.status(401).send({
    success: false,
    code: 'UNAUTHORIZED',
    message: 'Token无效或已过期',
  });
}

/**
 * 可选的认证中间件（不强制要求登录）
 */
export async function optionalAuthMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const decoded = await request.jwtVerify<JwtPayload>();
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: { id: true, role: true },
      });
      if (user) {
        request.user = { id: user.id, role: user.role };
      } else {
        request.user = decoded;
      }
    }
  } catch {
    // 静默忽略
  }
}

/**
 * 生成 JWT Token
 */
export function signToken(fastify: FastifyInstance, payload: JwtPayload): string {
  return fastify.jwt.sign(payload);
}

/**
 * 验证 Token 并返回 Payload
 */
export async function verifyToken(
  fastify: FastifyInstance,
  token: string
): Promise<JwtPayload> {
  return fastify.jwt.verify<JwtPayload>(token);
}
