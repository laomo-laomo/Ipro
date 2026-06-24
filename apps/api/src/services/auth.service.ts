/**
 * 认证服务 - 业务逻辑层
 */

import crypto from 'crypto';
import type { PrismaClient } from '@prisma/client';
import type { JwtPayload } from '../middlewares/auth.middleware.js';

/**
 * 微信登录响应
 */
export interface WechatLoginResult {
  token: string;
  user: {
    id: string;
    nickname: string | null;
    avatar: string | null;
    phone: string | null;
    role: 'user' | 'admin';
    hasMembership: boolean;
  };
}

/**
 * 手机号登录响应
 */
export interface PhoneLoginResult {
  token: string;
  user: {
    id: string;
    nickname: string | null;
    avatar: string | null;
    phone: string | null;
    role: 'user' | 'admin';
    hasMembership: boolean;
  };
}

/**
 * 微信 API 配置
 */
const WECHAT_API = {
  appId: process.env.WECHAT_APP_ID || '',
  appSecret: process.env.WECHAT_APP_SECRET || '',
  miniProgramSessionUrl: 'https://api.weixin.qq.com/sns/jscode2session',
  accessTokenUrl: 'https://api.weixin.qq.com/sns/oauth2/access_token',
  userInfoUrl: 'https://api.weixin.qq.com/sns/userinfo',
};

interface WechatProfile {
  openid: string;
  nickname?: string;
  avatar?: string;
  unionid?: string;
}

async function getWechatMiniProgramProfile(code: string): Promise<WechatProfile> {
  if (!WECHAT_API.appId || !WECHAT_API.appSecret) {
    throw new Error('微信登录未配置 AppID 或 AppSecret');
  }

  const url = `${WECHAT_API.miniProgramSessionUrl}?appid=${WECHAT_API.appId}&secret=${WECHAT_API.appSecret}&js_code=${code}&grant_type=authorization_code`;
  const response = await fetch(url, { method: 'GET' });
  const data = await response.json() as {
    errcode?: number;
    errmsg?: string;
    openid?: string;
    unionid?: string;
  };

  if (data.errcode) {
    throw new Error(`微信小程序登录失败: ${data.errmsg}`);
  }

  if (!data.openid) {
    throw new Error('无法获取小程序 OpenID');
  }

  return {
    openid: data.openid,
    unionid: data.unionid,
  };
}

/**
 * 获取微信网页授权用户信息
 */
async function getWechatOAuthProfile(code: string): Promise<WechatProfile> {
  if (!WECHAT_API.appId || !WECHAT_API.appSecret) {
    throw new Error('微信登录未配置 AppID 或 AppSecret');
  }

  const url = `${WECHAT_API.accessTokenUrl}?appid=${WECHAT_API.appId}&secret=${WECHAT_API.appSecret}&code=${code}&grant_type=authorization_code`;

  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  const data = await response.json() as {
    errcode?: number;
    errmsg?: string;
    openid?: string;
    access_token?: string;
    refresh_token?: string;
    scope?: string;
    unionid?: string;
  };

  if (data.errcode) {
    throw new Error(`微信登录失败: ${data.errmsg}`);
  }

  if (!data.openid) {
    throw new Error('无法获取 OpenID');
  }

  if (data.access_token) {
    try {
      const userInfoUrl = `${WECHAT_API.userInfoUrl}?access_token=${data.access_token}&openid=${data.openid}&lang=zh_CN`;
      const userInfoResponse = await fetch(userInfoUrl, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const userInfo = await userInfoResponse.json() as {
        errcode?: number;
        errmsg?: string;
        nickname?: string;
        headimgurl?: string;
      };

      if (!userInfo.errcode) {
        return {
          openid: data.openid,
          unionid: data.unionid,
          nickname: userInfo.nickname,
          avatar: userInfo.headimgurl,
        };
      }
    } catch {
      // If userinfo fetch fails, we still fall back to openid-only login.
    }
  }

  return { openid: data.openid, unionid: data.unionid };
}

async function getWechatProfile(code: string): Promise<WechatProfile> {
  const preferMiniProgram = process.env.WECHAT_LOGIN_TYPE !== 'oauth';

  if (preferMiniProgram) {
    try {
      return await getWechatMiniProgramProfile(code);
    } catch (miniProgramError) {
      if (process.env.WECHAT_LOGIN_TYPE === 'miniapp') {
        throw miniProgramError;
      }
      return getWechatOAuthProfile(code);
    }
  }

  return getWechatOAuthProfile(code);
}

/**
 * 生成 6 位加密安全验证码
 * 使用 crypto.randomBytes 生成密码学安全的随机数
 */
function generateCode(): string {
  // 生成 4 个安全随机字节，取模 900000 得到 0-899999 范围
  // 再加 100000 得到 100000-999999 的 6 位数字
  const randomBytes = crypto.randomBytes(4);
  const randomValue = randomBytes.readUInt32BE(0);
  const code = (randomValue % 900000) + 100000;
  return code.toString();
}

/**
 * 验证手机号格式
 */
export function isValidPhone(phone: string): boolean {
  return /^1[3-9]\d{9}$/.test(phone);
}

/**
 * 微信登录
 */
export async function wechatLogin(
  prisma: PrismaClient,
  signToken: (payload: JwtPayload) => string,
  code: string
): Promise<WechatLoginResult> {
  const isDev = process.env.NODE_ENV !== 'production';
  const isMockCode = code.startsWith('mock_wechat_code_') || code.startsWith('mock_scan_code_');

  const profile = isDev && isMockCode
    ? {
        openid: `dev_${code}`,
        nickname: '微信联调用户',
        avatar: null,
      }
    : await getWechatProfile(code);

  // 查找或创建用户
  let user = await prisma.user.findUnique({
    where: { openid: profile.openid },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        openid: profile.openid,
        nickname: profile.nickname || `微信用户${Date.now() % 10000}`,
        avatar: profile.avatar || null,
      },
    });
  } else if (profile.nickname || profile.avatar) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        nickname: profile.nickname || user.nickname,
        avatar: profile.avatar || user.avatar,
      },
    });
  }

  // 检查用户是否有会员
  const membership = await prisma.membership.findFirst({
    where: {
      userId: user.id,
      status: 'active',
      expiresAt: { gt: new Date() },
    },
  });

  // 生成 JWT Token
  const token = signToken({ id: user.id, role: user.role });

  return {
    token,
    user: {
      id: user.id,
      nickname: user.nickname,
      avatar: user.avatar,
      phone: user.phone,
      role: user.role as 'user' | 'admin',
      hasMembership: !!membership,
    },
  };
}

/**
 * 发送手机验证码
 */
export async function sendPhoneCode(
  prisma: PrismaClient,
  phone: string
): Promise<{ message: string }> {
  // 验证手机号格式
  if (!isValidPhone(phone)) {
    throw new Error('手机号格式不正确');
  }

  // 生成 6 位验证码
  const code = generateCode();
  const expiresAt = new Date(Date.now() + 60 * 1000); // 60秒有效期

  // 删除该手机号之前的验证码
  await prisma.phoneCode.deleteMany({
    where: { phone },
  });

  // 存储新验证码
  await prisma.phoneCode.create({
    data: {
      phone,
      code,
      expiresAt,
    },
  });

  // 模拟发送（实际应该调用短信网关）
  console.log(`[SMS Mock] 发送给 ${phone} 的验证码: ${code}`);

  return {
    message: '验证码已发送',
  };
}

/**
 * 手机号登录
 */
export async function phoneLogin(
  prisma: PrismaClient,
  signToken: (payload: JwtPayload) => string,
  phone: string,
  code: string
): Promise<PhoneLoginResult> {
  // 测试账号 bypass: 13800138000 + 123456
  // 模拟器和真机都可以用这个登录, 统一拿到"测试用户"(与 dev 自动登录是同一个 phone)
  if (phone === '13800138000' && code === '123456') {
    let user = await prisma.user.findUnique({
      where: { phone },
    });
    if (!user) {
      user = await prisma.user.create({
        data: {
          phone,
          nickname: '测试用户',
        },
      });
    }
    // 给测试账号补一张 dev 无限卡 (与 auth.middleware.getOrCreateDevUser 行为一致),
    // 这样无论从哪里登录都能正常生成绘本。
    const { ensureDevMembership } = await import('../middlewares/auth.middleware.js');
    await ensureDevMembership(user.id);
    const token = signToken({ id: user.id, role: user.role });
    return {
      token,
      user: {
        id: user.id,
        nickname: user.nickname,
        avatar: user.avatar,
        phone: user.phone,
        role: user.role as 'user' | 'admin',
        hasMembership: true,
      },
    };
  }

  // 验证手机号格式
  if (!isValidPhone(phone)) {
    throw new Error('手机号格式不正确');
  }

  // 验证验证码
  const phoneCode = await prisma.phoneCode.findFirst({
    where: {
      phone,
      code,
      used: false,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!phoneCode) {
    throw new Error('验证码无效或已过期');
  }

  // 标记验证码已使用
  await prisma.phoneCode.update({
    where: { id: phoneCode.id },
    data: { used: true },
  });

  // 查找或创建用户
  let user = await prisma.user.findUnique({
    where: { phone },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        phone,
        nickname: `用户${Date.now() % 10000}`,
      },
    });
  }

  // 检查用户是否有会员
  const membership = await prisma.membership.findFirst({
    where: {
      userId: user.id,
      status: 'active',
      expiresAt: { gt: new Date() },
    },
  });

  // 生成 JWT Token
  const token = signToken({ id: user.id, role: user.role });

  return {
    token,
    user: {
      id: user.id,
      nickname: user.nickname,
      avatar: user.avatar,
      phone: user.phone,
      role: user.role as 'user' | 'admin',
      hasMembership: !!membership,
    },
  };
}

/**
 * 清理过期验证码（定时任务）
 */
export async function cleanupExpiredCodes(prisma: PrismaClient): Promise<number> {
  const result = await prisma.phoneCode.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        { createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } }, // 超过24小时
      ],
    },
  });

  return result.count;
}
