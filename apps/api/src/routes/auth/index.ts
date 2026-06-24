/**
 * 认证路由
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { wechatLogin, sendPhoneCode, phoneLogin } from '../../services/auth.service.js';
import { getOrCreateDevUser, ensureDevMembership } from '../../middlewares/auth.middleware.js';
import { success, ok, error } from '../../utils/response.js';
import { prisma } from '../../config/database.js';
import { uploadFile } from '../../config/oss.js';

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
    if (process.env.NODE_ENV !== 'production' && process.env.DEV_AUTO_LOGIN === 'true') {
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
   * PUT /api/auth/profile
   * 更新用户资料（头像、昵称）
   */
  fastify.put('/profile', { preHandler: devAutoLogin }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.user?.id;
      if (!userId) {
        return reply.status(401).send(error('未登录', 'UNAUTHORIZED'));
      }

      const body = request.body as any;
      const updateData: any = {};

      if (body.nickname !== undefined) {
        updateData.nickname = body.nickname;
      }

      if (body.avatar !== undefined) {
        // If avatar is a base64 string, upload to OSS
        if (body.avatar.startsWith('data:image')) {
          const base64Data = body.avatar.split(',')[1];
          const buffer = Buffer.from(base64Data, 'base64');
          const key = `avatars/${userId}/${Date.now()}.jpg`;
          const { url } = await uploadFile(key, buffer, { contentType: 'image/jpeg' });
          updateData.avatar = url;
        } else {
          updateData.avatar = body.avatar;
        }
      }

      if (Object.keys(updateData).length === 0) {
        return reply.status(400).send(error('没有要更新的数据', 'NO_DATA'));
      }

      const user = await prisma.user.update({
        where: { id: userId },
        data: updateData,
        select: { id: true, nickname: true, avatar: true, phone: true, role: true },
      });

      return reply.send(success(user));
    } catch (err) {
      const message = err instanceof Error ? err.message : '更新失败';
      return reply.status(500).send(error(message, 'UPDATE_ERROR'));
    }
  });

  /**
   * POST /api/auth/bind-phone
   * 微信手机号快速验证 - 用 code 换手机号绑定到当前用户
   */
  fastify.post('/bind-phone', { preHandler: devAutoLogin }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.user?.id;
      if (!userId) return reply.status(401).send(error('未登录', 'UNAUTHORIZED'));

      const { code } = (request.body || {}) as { code?: string };
      if (!code) return reply.status(400).send(error('缺少 code', 'MISSING_CODE'));

      const appId = process.env.WECHAT_APP_ID || '';
      const appSecret = process.env.WECHAT_APP_SECRET || '';
      if (!appId || !appSecret) return reply.status(500).send(error('微信配置缺失', 'WECHAT_NOT_CONFIGURED'));

      const tokenRes = await fetch(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`);
      const tokenData = await tokenRes.json() as any;
      if (!tokenData.access_token) return reply.status(500).send(error('获取 access_token 失败', 'ACCESS_TOKEN_ERROR'));

      const phoneRes = await fetch(`https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${tokenData.access_token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const phoneData = await phoneRes.json() as any;

      if (phoneData.errcode) {
        return reply.status(400).send(error(phoneData.errmsg || '获取手机号失败', 'PHONE_DECRYPT_ERROR'));
      }

      const phone = phoneData.phone_info?.phoneNumber;
      if (!phone) return reply.status(400).send(error('未能获取手机号', 'NO_PHONE'));

      const existing = await prisma.user.findUnique({ where: { phone } });
      if (existing && existing.id !== userId) {
        return reply.status(409).send(error('该手机号已绑定其他账号', 'PHONE_ALREADY_BOUND'));
      }

      await prisma.user.update({ where: { id: userId }, data: { phone } });
      const user = await getCurrentUserData(fastify, request);
      return reply.send(success({ phone, user }));
    } catch (err) {
      const message = err instanceof Error ? err.message : '绑定手机号失败';
      return reply.status(500).send(error(message, 'BIND_PHONE_ERROR'));
    }
  });

  /**
   * POST /api/auth/avatar
   * 上传头像（multipart form data）
   */
  fastify.post('/avatar', { preHandler: devAutoLogin }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.user?.id;
      if (!userId) {
        return reply.status(401).send(error('未登录', 'UNAUTHORIZED'));
      }

      const data = await request.file();
      if (!data) {
        return reply.status(400).send(error('请选择图片', 'NO_FILE'));
      }

      const buffer = await data.toBuffer();
      const ext = data.filename?.split('.').pop() || 'jpg';
      const key = `avatars/${userId}/${Date.now()}.${ext}`;
      const { url } = await uploadFile(key, buffer, { contentType: data.mimetype || 'image/jpeg' });

      const user = await prisma.user.update({
        where: { id: userId },
        data: { avatar: url },
        select: { id: true, nickname: true, avatar: true },
      });

      return reply.send(success(user));
    } catch (err) {
      const message = err instanceof Error ? err.message : '上传失败';
      return reply.status(500).send(error(message, 'UPLOAD_ERROR'));
    }
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
