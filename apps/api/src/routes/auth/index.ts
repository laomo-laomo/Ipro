/**
 * 认证路由
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { wechatLogin, sendPhoneCode, phoneLogin } from '../../services/auth.service.js';
import { getOrCreateDevUser, ensureDevMembership } from '../../middlewares/auth.middleware.js';
import { success, ok, error } from '../../utils/response.js';

async function getCurrentUserData(fastify: FastifyInstance, request: FastifyRequest) {
  // In dev mode, request.user is set by devAutoLogin preHandler (no JWT needed)
  if (process.env.NODE_ENV !== 'production' && request.user?.id) {
    const user = await fastify.prisma.user.findUnique({
      where: { id: request.user.id },
      select: {
        id: true,
        nickname: true,
        avatar: true,
        phone: true,
        role: true,
        memberships: {
          where: { status: 'active', expiresAt: { gt: new Date() } },
          take: 1,
        },
      },
    });
    if (!user) return null;
    return {
      id: user.id,
      nickname: user.nickname,
      avatar: user.avatar,
      phone: user.phone,
      role: user.role,
      hasMembership: user.memberships.length > 0,
    };
  }

  // Normal path: verify JWT token
  const payload = await request.jwtVerify<{ id: string }>();
  const user = await fastify.prisma.user.findUnique({
    where: { id: payload.id },
    select: {
      id: true,
      nickname: true,
      avatar: true,
      phone: true,
      role: true,
      memberships: {
        where: { status: 'active', expiresAt: { gt: new Date() } },
        take: 1,
      },
    },
  });
  if (!user) return null;
  return {
    id: user.id,
    nickname: user.nickname,
    avatar: user.avatar,
    phone: user.phone,
    role: user.role,
    hasMembership: user.memberships.length > 0,
  };
}

// Request body schemas
const wechatLoginSchema = z.object({
  code: z.string().min(1, 'code不能为空'),
});

const phoneCodeSchema = z.object({
  phone: z.string().regex(/^1[3-9]\d{9}$/, '手机号格式不正确'),
});

const phoneLoginSchema = z.object({
  phone: z.string().regex(/^1[3-9]\d{9}$/, '手机号格式不正确'),
  code: z.string().length(6, '验证码必须是6位'),
});

/**
 * 注册认证路由
 */
export async function authRoutes(fastify: FastifyInstance) {
  // Dev mode: auto-login for /me and /refresh endpoints
  // Dev mode: set request.user directly; getCurrentUserData handles it without JWT
  const devAutoLogin = async (request: FastifyRequest) => {
    if (process.env.NODE_ENV !== 'production') {
      const devUser = await getOrCreateDevUser();
      await ensureDevMembership(devUser.id);
      request.user = { id: devUser.id, role: devUser.role };
    }
  };

  /**
   * GET /api/auth/me
   * 获取当前用户
   */
  fastify.get('/me', { preHandler: devAutoLogin }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await getCurrentUserData(fastify, request);
      if (!user) {
        return reply.status(401).send(error('用户不存在', 'USER_NOT_FOUND'));
      }
      return reply.send(success(user));
    } catch {
      return reply.status(401).send(error('未登录或登录已过期', 'UNAUTHORIZED'));
    }
  });

  /**
   * POST /api/auth/refresh
   * 刷新 token
   */
  fastify.post('/refresh', { preHandler: devAutoLogin }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await getCurrentUserData(fastify, request);
      if (!user) {
        return reply.status(401).send(error('用户不存在', 'USER_NOT_FOUND'));
      }
      const token = fastify.jwt.sign({ id: user.id, role: user.role });
      return reply.send(success({ token, user }));
    } catch {
      return reply.status(401).send(error('未登录或登录已过期', 'UNAUTHORIZED'));
    }
  });

  /**
   * POST /api/auth/logout
   * 客户端删除 token 即可；服务端返回成功保持接口闭合。
   */
  fastify.post('/logout', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send(ok('已退出登录'));
  });

  /**
   * POST /api/auth/wechat-login
   * 微信一键登录
   */
  fastify.post('/wechat-login', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = wechatLoginSchema.parse(request.body);

    try {
      const result = await wechatLogin(
        fastify.prisma,
        (payload) => fastify.jwt.sign(payload),
        body.code
      );

      return reply.send(success(result));
    } catch (err) {
      const message = err instanceof Error ? err.message : '微信登录失败';
      return reply.status(400).send(error(message, 'WECHAT_LOGIN_ERROR'));
    }
  });

  /**
   * POST /api/auth/phone-code
   * 发送手机验证码
   */
  fastify.post('/phone-code', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = phoneCodeSchema.parse(request.body);

    try {
      await sendPhoneCode(fastify.prisma, body.phone);
      return reply.send(ok('验证码已发送'));
    } catch (err) {
      const message = err instanceof Error ? err.message : '发送验证码失败';
      return reply.status(400).send(error(message, 'PHONE_CODE_ERROR'));
    }
  });

  /**
   * POST /api/auth/phone-login
   * 手机号登录
   */
  fastify.post('/phone-login', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = phoneLoginSchema.parse(request.body);

    try {
      const result = await phoneLogin(
        fastify.prisma,
        (payload) => fastify.jwt.sign(payload),
        body.phone,
        body.code
      );

      return reply.send(success(result));
    } catch (err) {
      const message = err instanceof Error ? err.message : '登录失败';
      if (message.includes('验证码')) {
        return reply.status(400).send(error(message, 'INVALID_CODE'));
      }
      return reply.status(400).send(error(message, 'PHONE_LOGIN_ERROR'));
    }
  });
}
