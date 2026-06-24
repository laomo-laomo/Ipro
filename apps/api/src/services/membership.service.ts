/**
 * Membership Service
 *
 * Handles two membership types:
 * 1. 积分制 (Points): deduct points per scene, no daily limit
 * 2. 会员卡制 (Card):
 *    - 次卡: deduct story count, max 20 scenes/story
 *    - 周期卡: daily story limit (5/day), max 20 scenes/story
 */

import { prisma } from '../config/database.js';
import {
  MEMBERSHIP_MAX_SCENES,
  MEMBERSHIP_DAILY_STORY_LIMIT,
  MEMBERSHIP_DEFAULT_QUOTAS,
  getPlanPeriodDays,
  POINTS_PER_SCENE,
  type MembershipTier,
} from '../config/membership.js';
import { getMembershipPlanById } from './membership-plan.service.js';

/**
 * Quota warning threshold - when remaining quota <= this value, return warning
 */
export const QUOTA_WARNING_THRESHOLD = 2;

/**
 * 从数据库套餐配置获取每幕积分消耗, 找不到则回退硬编码默认值。
 * 管理员可在后台修改套餐的 pointsPerScene 字段来调整积分扣减比例。
 */
async function getPointsPerScene(): Promise<number> {
  try {
    const pointsPlan = await getMembershipPlanById('points' as MembershipTier);
    if (pointsPlan && typeof pointsPlan.pointsPerScene === 'number' && pointsPlan.pointsPerScene > 0) {
      return pointsPlan.pointsPerScene;
    }
  } catch {}
  return POINTS_PER_SCENE;
}

export type QuotaSource = 'card' | 'points';

export interface IllustrationQuotaDeduction {
  success: boolean;
  source: QuotaSource;
  deductedAmount: number;
  sceneCount: number;
  error?: string;
}

/**
 * Get user's active membership with quota information
 */
export async function getActiveMembership(userId: string) {
  const membership = await prisma.membership.findFirst({
    where: {
      userId,
      status: 'active',
      expiresAt: { gt: new Date() },
    },
    orderBy: { expiresAt: 'desc' },
  });

  return membership;
}

/**
 * Get today's story count for a user (for daily limit check)
 * 修复: 只统计活跃状态的故事, 排除 draft/failed/deleted
 */
async function getTodayStoryCount(userId: string): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const count = await prisma.story.count({
    where: {
      userId,
      createdAt: { gte: today },
      status: { in: ['processing', 'completed', 'illustrated', 'covering'] },
    },
  });

  return count;
}

/**
 * Check if user has sufficient quota via user.points (积分制).
 * Used as a fallback when no card is available / card quota exhausted.
 */
async function checkPointsQuota(userId: string, required: number): Promise<{
  hasQuota: boolean;
  remaining: number;
  error?: string;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { points: true },
  });
  const userPoints = user?.points || 0;
  const pointsPerScene = await getPointsPerScene();
  const pointsNeeded = required * pointsPerScene;

  if (userPoints < pointsNeeded) {
    return {
      hasQuota: false,
      remaining: userPoints,
      error: userPoints > 0
        ? `积分不足（当前 ${userPoints} 积分，本次需要 ${pointsNeeded} 积分），请购买会员套餐或兑换更多积分`
        : '会员已过期，请购买会员套餐或兑换积分',
    };
  }

  return {
    hasQuota: true,
    remaining: userPoints,
  };
}

/**
 * Check if user has sufficient quota
 * 2026-06-18 定版:
 *   - 永远只 1 张 active 卡 (续期叠加, 设计已定), 但代码支持多张遍历
 *     以便将来重新开放多卡时不需要重写逻辑
 *   - 周期卡 (quota=0): 真实检查 dailyStoryLimit (修复之前是死代码的 bug),
 *     限额达到时跳过该卡, 继续查下一张或积分
 *   - 次卡 (quota>0): 检查 usedQuota, 耗尽时跳过
 *   - 没卡可用 → user.points 积分兜底
 */
export async function checkQuota(userId: string, required: number = 1): Promise<{
  hasQuota: boolean;
  remaining: number;
  error?: string;
  source: QuotaSource;
}> {
  console.log(`[checkQuota] userId=${userId} required=${required}`);

  // 1. 遍历所有 active 卡, 任一可用就用卡
  const memberships = await prisma.membership.findMany({
    where: { userId, status: 'active', expiresAt: { gt: new Date() } },
    orderBy: { expiresAt: 'desc' },
  });

  for (const membership of memberships) {
    const cardType = membership.cardType as MembershipTier;

    // Dev 卡永远 unlimited
    if ((cardType as string) === 'dev') {
      return { hasQuota: true, remaining: 9999, source: 'card' };
    }

    // 积分制卡 (cardType='points'): 走积分扣减 (卡的 quota 字段不用)
    if (cardType === 'points') {
      const pointsCheck = await checkPointsQuota(userId, required);
      return { ...pointsCheck, source: 'points' };
    }

    // 周期卡 (weekly/monthly/quarterly/yearly, quota=0):
    // 真实检查 dailyStoryLimit (这是修复的 bug, 之前是死代码)
    if (membership.quota === 0) {
      const dailyLimit = MEMBERSHIP_DAILY_STORY_LIMIT[cardType];
      if (dailyLimit) {
        const todayCount = await getTodayStoryCount(userId);
        if (todayCount >= dailyLimit) {
          // 今天额度用完了, 跳过这张卡, 查下一张 / 积分
          console.log(`[checkQuota] period card ${cardType} daily limit hit (${todayCount}/${dailyLimit}), skipping`);
          continue;
        }
        return {
          hasQuota: true,
          remaining: dailyLimit - todayCount,
          source: 'card',
        };
      }
      // 修复 (2026-06-18 Bug F): 周期卡但没设 dailyLimit 是配置错误,
      // 不应该静默返回 unlimited, 而是警告并跳过该卡
      console.warn(`[checkQuota] period card ${cardType} has no dailyLimit configured, skipping to prevent unlimited access`);
      continue;
    }

    // 次卡 (times*, quota>0): 检查剩余配额
    const remaining = Math.max(0, membership.quota - membership.usedQuota);
    if (remaining >= required) {
      return { hasQuota: true, remaining, source: 'card' };
    }
    // 次卡配额耗尽, 跳过这张卡, 继续查
    console.log(`[checkQuota] times card ${cardType} exhausted (${remaining}/${required}), skipping`);
  }

  // 2. 没卡可用 → 走积分兜底
  console.log(`[checkQuota] no card available, falling back to points userId=${userId}`);
  const pointsCheck = await checkPointsQuota(userId, required);
  return { ...pointsCheck, source: 'points' };
}

/**
 * Deduct quota from user's membership or points.
 * 2026-06-18 定版: 跟 checkQuota 用同样的"选卡"逻辑 (遍历 active memberships,
 * dev 卡直接过, 周期卡查 daily limit, 次卡查 usedQuota)。失败回退到 user.points。
 */
export async function deductQuota(userId: string, amount: number = 1): Promise<{
  success: boolean;
  newUsedQuota: number;
  remaining: number;
  error?: string;
  source?: QuotaSource;
}> {
  // 先用 checkQuota 决定从哪扣
  const quotaCheck = await checkQuota(userId, amount);

  if (!quotaCheck.hasQuota) {
    return {
      success: false,
      newUsedQuota: 0,
      remaining: 0,
      error: quotaCheck.error,
    };
  }

  if (quotaCheck.source === 'points') {
    // 扣 user.points
    const pointsPerScene = await getPointsPerScene();
    const pointsToDeduct = amount * pointsPerScene;
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { points: true },
      });
      if ((user?.points || 0) < pointsToDeduct) {
        return {
          success: false,
          newUsedQuota: 0,
          remaining: user?.points || 0,
          error: quotaCheck.error || '积分不足',
          source: 'points',
        };
      }
      const updated = await tx.user.update({
        where: { id: userId },
        data: { points: { decrement: pointsToDeduct } },
        select: { points: true },
      });
      return {
        success: true,
        newUsedQuota: 0,
        remaining: updated.points,
        source: 'points',
      };
    });
  }

  // 扣卡: 用同样的"遍历 active 卡"逻辑, 找到 checkQuota 选中的那张
  // 注意: 必须在事务里执行 (race condition 防护)
  return prisma.$transaction(async (tx) => {
    const memberships = await tx.membership.findMany({
      where: { userId, status: 'active', expiresAt: { gt: new Date() } },
      orderBy: { expiresAt: 'desc' },
    });

    for (const membership of memberships) {
      const cardType = membership.cardType as MembershipTier;

      if ((cardType as string) === 'dev') {
        // dev 卡不扣 usedQuota
        return {
          success: true,
          newUsedQuota: 0,
          remaining: 9999,
          source: 'card',
        };
      }

      if (cardType === 'points') {
        // 积分卡走积分扣减, 已经在 checkQuota 阶段处理
        continue;
      }

      // 周期卡 (quota=0): 不扣 usedQuota, story 数靠 prisma.story.count() 实时查
      if (membership.quota === 0) {
        const dailyLimit = MEMBERSHIP_DAILY_STORY_LIMIT[cardType];
        if (dailyLimit) {
          const todayCount = await getTodayStoryCount(userId);
          if (todayCount >= dailyLimit) {
            // checkQuota 已经放过, 走到这里说明 race condition:
            // 调用方在 checkQuota 之后 deductQuota 之前又生成了 story
            // 此时应该回退到积分扣减, 但要先检查积分余额
            const pointsPerScene = await getPointsPerScene();
            const pointsToDeduct = amount * pointsPerScene;
            const user = await tx.user.findUnique({
              where: { id: userId },
              select: { points: true },
            });
            if ((user?.points || 0) < pointsToDeduct) {
              return {
                success: false,
                newUsedQuota: 0,
                remaining: 0,
                error: '周期卡每日额度已用完，积分也不足',
              };
            }
            const updated = await tx.user.update({
              where: { id: userId },
              data: { points: { decrement: pointsToDeduct } },
              select: { points: true },
            });
            return {
              success: true,
              newUsedQuota: 0,
              remaining: updated.points,
              source: 'points',
            };
          }
        }
        return {
          success: true,
          newUsedQuota: 0,
          remaining: 9999,
          source: 'card',
        };
      }

      // 次卡 (quota>0): 递增 usedQuota
      const remaining = membership.quota - membership.usedQuota;
      if (remaining >= amount) {
        const newUsedQuota = membership.usedQuota + amount;
        await tx.membership.update({
          where: { id: membership.id },
          data: { usedQuota: newUsedQuota },
        });
        return {
          success: true,
          newUsedQuota,
          remaining: membership.quota - newUsedQuota,
          source: 'card',
        };
      }
      // 次卡不够, 继续查下一张
    }

    // 走到这里说明 checkQuota 返回 source='card' 但事务里找不到可用卡
    // (race condition: checkQuota 之后 membership 失效了)
    // 安全起见返回失败
    return {
      success: false,
      newUsedQuota: 0,
      remaining: 0,
      error: '会员状态已变更, 请重试',
    };
  });
}

/**
 * Refund quota back to user's membership or points.
 * 用于插画生成失败时退还预扣的配额。
 *
 * 修复 (2026-06-18 Bug B): 配合 preDeductQuota 使用,
 * 当插画生成失败时退还预扣的配额。
 */
export async function refundQuota(userId: string, amount: number = 1, source: QuotaSource = 'points'): Promise<{
  success: boolean;
  error?: string;
}> {
  if (amount <= 0) return { success: true };

  if (source === 'points') {
    const pointsPerScene = await getPointsPerScene();
    const pointsToRefund = amount * pointsPerScene;
    await prisma.user.update({
      where: { id: userId },
      data: { points: { increment: pointsToRefund } },
    });
    return { success: true };
  }

  // 退还次卡配额
  const membership = await prisma.membership.findFirst({
    where: { userId, status: 'active', expiresAt: { gt: new Date() } },
    orderBy: { expiresAt: 'desc' },
  });

  if (!membership || membership.quota === 0) {
    return { success: false, error: '无法退还: 未找到可用会员卡' };
  }

  await prisma.membership.update({
    where: { id: membership.id },
    data: { usedQuota: Math.max(0, membership.usedQuota - amount) },
  });

  return { success: true };
}

/**
 * Pre-deduct quota for illustration generation.
 * 预扣配额, 生成完成后根据实际成功数量调整。
 *
 * 修复 (2026-06-18 Bug B): 使用预扣模式替代检查+逐个扣减,
 * 防止 check 和 deduct 之间的竞态条件。
 */
export async function preDeductQuota(userId: string, amount: number = 1): Promise<{
  success: boolean;
  source: QuotaSource;
  error?: string;
}> {
  const quotaCheck = await checkQuota(userId, amount);
  if (!quotaCheck.hasQuota) {
    return { success: false, source: 'points', error: quotaCheck.error };
  }

  const deductResult = await deductQuota(userId, amount);
  if (!deductResult.success) {
    return { success: false, source: quotaCheck.source, error: deductResult.error };
  }

  return { success: true, source: quotaCheck.source };
}

export async function preDeductIllustrationQuota(userId: string, sceneCount: number): Promise<IllustrationQuotaDeduction> {
  const normalizedSceneCount = Math.max(0, sceneCount);
  if (normalizedSceneCount === 0) {
    return { success: true, source: 'card', deductedAmount: 0, sceneCount: 0 };
  }

  const quotaResult = await checkQuota(userId, 1);
  if (!quotaResult.hasQuota) {
    return {
      success: false,
      source: quotaResult.source,
      deductedAmount: 0,
      sceneCount: normalizedSceneCount,
      error: quotaResult.error || '配额不足',
    };
  }

  const deductedAmount = quotaResult.source === 'points' ? normalizedSceneCount : 1;
  const deductResult = await deductQuota(userId, deductedAmount);
  if (!deductResult.success) {
    return {
      success: false,
      source: quotaResult.source,
      deductedAmount: 0,
      sceneCount: normalizedSceneCount,
      error: deductResult.error || '配额不足',
    };
  }

  return {
    success: true,
    source: deductResult.source || quotaResult.source,
    deductedAmount,
    sceneCount: normalizedSceneCount,
  };
}

export async function refundIllustrationQuota(
  userId: string,
  deduction: Pick<IllustrationQuotaDeduction, 'source' | 'deductedAmount' | 'sceneCount'>,
  failedSceneCount: number
): Promise<{ success: boolean; refundedAmount: number; error?: string }> {
  const failures = Math.max(0, failedSceneCount);
  if (failures === 0 || deduction.deductedAmount <= 0) {
    return { success: true, refundedAmount: 0 };
  }

  const refundAmount = deduction.source === 'points'
    ? Math.min(failures, deduction.deductedAmount)
    : (failures >= deduction.sceneCount ? deduction.deductedAmount : 0);

  if (refundAmount <= 0) {
    return { success: true, refundedAmount: 0 };
  }

  const result = await refundQuota(userId, refundAmount, deduction.source);
  return { ...result, refundedAmount: result.success ? refundAmount : 0 };
}
/**
 * Get user's current quota status with optional warning
 * 2026-06-18: 跟 checkQuota 一致, 遍历所有 active 卡, 计算整体可用的额度信息
 */
export async function getQuotaStatus(userId: string): Promise<{
  hasMembership: boolean;
  totalQuota: number;
  usedQuota: number;
  remainingQuota: number;
  expiresAt: string | null;
  cardType: string | null;
  maxScenes: number | null;
  dailyStoryLimit: number | null;
  todayStoryCount: number;
  userPoints: number;
  isWarning: boolean;
  warningMessage: string | null;
  /** True when user has no card but has redeemable points */
  hasUsablePoints: boolean;
}> {
  const memberships = await prisma.membership.findMany({
    where: { userId, status: 'active', expiresAt: { gt: new Date() } },
    orderBy: { expiresAt: 'desc' },
  });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { points: true },
  });
  const userPoints = user?.points || 0;

  if (memberships.length === 0) {
    return {
      hasMembership: userPoints > 0,
      totalQuota: 0,
      usedQuota: 0,
      remainingQuota: userPoints,
      expiresAt: null,
      cardType: userPoints > 0 ? 'points' : null,
      maxScenes: userPoints > 0 ? (MEMBERSHIP_MAX_SCENES.points ?? null) : null,
      dailyStoryLimit: null,
      todayStoryCount: 0,
      userPoints,
      isWarning: false,
      warningMessage: null,
      hasUsablePoints: userPoints > 0,
    };
  }

  // 找一张"最有代表性"的卡用于展示 (优先 dev > 周期卡 > 次卡 > 积分)
  // 不展示全部卡 (设计要求统一显示"会员"), 只展示一张
  const primary = memberships.find((m) => m.cardType === 'dev')
    ?? memberships.find((m) => m.quota === 0)
    ?? memberships.find((m) => m.cardType !== 'points')
    ?? memberships[0];

  const cardType = primary.cardType as MembershipTier;
  const maxScenes = MEMBERSHIP_MAX_SCENES[cardType] ?? null;
  const dailyStoryLimit = MEMBERSHIP_DAILY_STORY_LIMIT[cardType] ?? null;
  const todayStoryCount = dailyStoryLimit ? await getTodayStoryCount(userId) : 0;

  // 周期卡: quota 永远 0, 显示"今日已用 X/5"
  // 次卡: 显示配额剩余
  let totalQuota: number;
  let usedQuota: number;
  let remainingQuota: number;
  let isWarning = false;
  if (primary.quota === 0) {
    // 周期卡 (或积分/dev 卡) — quota 不可扣, 显示今日进度
    totalQuota = dailyStoryLimit || 9999;
    usedQuota = todayStoryCount;
    remainingQuota = dailyStoryLimit ? Math.max(0, dailyStoryLimit - todayStoryCount) : 9999;
    isWarning = !!dailyStoryLimit && remainingQuota > 0 && remainingQuota <= QUOTA_WARNING_THRESHOLD;
  } else {
    // 次卡
    totalQuota = primary.quota;
    usedQuota = primary.usedQuota;
    remainingQuota = Math.max(0, primary.quota - primary.usedQuota);
    isWarning = remainingQuota > 0 && remainingQuota <= QUOTA_WARNING_THRESHOLD;
  }

  return {
    hasMembership: true,
    totalQuota,
    usedQuota,
    remainingQuota,
    expiresAt: primary.expiresAt.toISOString(),
    cardType: primary.cardType,
    maxScenes,
    dailyStoryLimit,
    todayStoryCount,
    userPoints,
    isWarning,
    warningMessage: isWarning
      ? `您的${cardType === 'weekly' ? '今日' : '配额'}即将用完（剩余 ${remainingQuota}${cardType === 'weekly' || cardType === 'monthly' || cardType === 'quarterly' || cardType === 'yearly' ? '个故事' : '次'}），建议续费以继续使用`
      : null,
    hasUsablePoints: userPoints > 0,
  };
}

/**
 * Get the max scenes allowed for the user's current membership.
 * Returns null if unlimited.
 */
export async function getMaxScenesForUser(userId: string): Promise<number | null> {
  const membership = await getActiveMembership(userId);
  if (!membership) return null;
  return MEMBERSHIP_MAX_SCENES[membership.cardType as MembershipTier] ?? null;
}

/**
 * Get daily story limit for the user's current membership.
 * Returns null if unlimited.
 */
export async function getDailyStoryLimit(userId: string): Promise<number | null> {
  const membership = await getActiveMembership(userId);
  if (!membership) return null;
  return MEMBERSHIP_DAILY_STORY_LIMIT[membership.cardType as MembershipTier] ?? null;
}

/**
 * Check if user can create more stories today
 */
export async function checkDailyStoryLimit(userId: string): Promise<{
  allowed: boolean;
  todayCount: number;
  limit: number | null;
  error?: string;
}> {
  const limit = await getDailyStoryLimit(userId);
  if (!limit) {
    return { allowed: true, todayCount: 0, limit: null };
  }

  const todayCount = await getTodayStoryCount(userId);
  if (todayCount >= limit) {
    return {
      allowed: false,
      todayCount,
      limit,
      error: `今日创作已达上限（${todayCount}/${limit}），请明天再试`,
    };
  }

  return { allowed: true, todayCount, limit };
}

/**
 * 公共函数: 创建或续期会员
 * 修复 (2026-06-18 Bug O): 抽取公共函数, 统一 payment.service.ts 和 redeem.service.ts 的逻辑
 */
type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export async function extendOrCreateMembership(
  tx: TxClient,
  userId: string,
  tier: MembershipTier
): Promise<{ action: 'created' | 'extended'; membershipId: string }> {
  const now = new Date();
  const plan = await getMembershipPlanById(tier);
  if (plan?.type === 'points') {
    const pointsToAdd = Math.round((plan.pointsPerYuan || 100) * plan.price);
    await tx.user.update({
      where: { id: userId },
      data: { points: { increment: pointsToAdd } },
    });
    return { action: 'extended', membershipId: userId };
  }
  const quotaToAdd = plan?.dailyStoryLimit ? 0 : (MEMBERSHIP_DEFAULT_QUOTAS[tier] || Number(String(tier).match(/\d+/)?.[0] || 0));
  const extensionDays = plan?.periodDays || getPlanPeriodDays(tier);

  const activeMembership = await tx.membership.findFirst({
    where: {
      userId,
      status: 'active',
      expiresAt: { gt: now },
    },
    orderBy: { expiresAt: 'desc' },
  });

  if (activeMembership) {
    const baseDate = activeMembership.expiresAt > now ? activeMembership.expiresAt : now;
    const nextExpiry = new Date(baseDate);
    nextExpiry.setDate(nextExpiry.getDate() + extensionDays);

    const tierRank: Partial<Record<MembershipTier, number>> = {
      points: 0,
      times: 1,
      times1: 1,
      times10: 2,
      times50: 3,
      times100: 4,
      weekly: 5,
      monthly: 6,
      quarterly: 7,
      yearly: 8,
    };
    const currentRank = tierRank[activeMembership.cardType as MembershipTier] || 0;
    const nextRank = tierRank[tier] || 0;
    const newCardType = nextRank >= currentRank ? tier : activeMembership.cardType;

    await tx.membership.update({
      where: { id: activeMembership.id },
      data: {
        cardType: newCardType,
        quota: activeMembership.quota + quotaToAdd,
        expiresAt: nextExpiry > activeMembership.expiresAt ? nextExpiry : activeMembership.expiresAt,
        status: 'active',
      },
    });

    return { action: 'extended', membershipId: activeMembership.id };
  } else {
    // 新建: 仅当用户从未有过 active 卡
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + extensionDays);

    const newMembership = await tx.membership.create({
      data: {
        userId,
        cardType: tier,
        quota: quotaToAdd,
        usedQuota: 0,
        expiresAt,
        status: 'active',
      },
    });

    return { action: 'created', membershipId: newMembership.id };
  }
}

export default {
  getActiveMembership,
  checkQuota,
  deductQuota,
  preDeductQuota,
  refundQuota,
  preDeductIllustrationQuota,
  refundIllustrationQuota,
  getQuotaStatus,
  getMaxScenesForUser,
  getDailyStoryLimit,
  checkDailyStoryLimit,
  extendOrCreateMembership,
  QUOTA_WARNING_THRESHOLD,
};


