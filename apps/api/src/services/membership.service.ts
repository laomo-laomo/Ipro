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
  POINTS_PER_SCENE,
  type MembershipTier,
} from '../config/membership.js';

/**
 * Quota warning threshold - when remaining quota <= this value, return warning
 */
export const QUOTA_WARNING_THRESHOLD = 2;

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
 */
async function getTodayStoryCount(userId: string): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const count = await prisma.story.count({
    where: {
      userId,
      createdAt: { gte: today },
    },
  });

  return count;
}

/**
 * Check if user has sufficient quota
 * Handles both points-based and card-based systems
 */
export async function checkQuota(userId: string, required: number = 1): Promise<{
  hasQuota: boolean;
  remaining: number;
  error?: string;
}> {
  const membership = await getActiveMembership(userId);
  console.log(`[checkQuota] userId=${userId} membership=${JSON.stringify(membership)}`);

  if (!membership) {
    return {
      hasQuota: false,
      remaining: 0,
      error: '您还没有开通会员，请先购买会员套餐',
    };
  }

  const cardType = membership.cardType as MembershipTier;

  // Dev card type has unlimited quota
  if ((membership.cardType as string) === 'dev' || membership.quota === 0) {
    return {
      hasQuota: true,
      remaining: 9999,
    };
  }

  // Points-based system: check if user has enough points
  if (cardType === 'points') {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { points: true },
    });
    const pointsNeeded = required * POINTS_PER_SCENE;
    const userPoints = user?.points || 0;

    if (userPoints < pointsNeeded) {
      return {
        hasQuota: false,
        remaining: userPoints,
        error: `积分不足（当前 ${userPoints} 积分，需要 ${pointsNeeded} 积分），请充值积分`,
      };
    }

    return {
      hasQuota: true,
      remaining: userPoints,
    };
  }

  // Card-based system: check remaining quota
  const remaining = Math.max(0, membership.quota - membership.usedQuota);

  if (remaining < required) {
    return {
      hasQuota: false,
      remaining,
      error: `您的配额已用完（${membership.usedQuota}/${membership.quota}），请购买会员套餐继续使用`,
    };
  }

  // Period cards: check daily story limit
  const dailyLimit = MEMBERSHIP_DAILY_STORY_LIMIT[cardType];
  if (dailyLimit) {
    const todayCount = await getTodayStoryCount(userId);
    if (todayCount >= dailyLimit) {
      return {
        hasQuota: false,
        remaining,
        error: `今日创作已达上限（${todayCount}/${dailyLimit}），请明天再试`,
      };
    }
  }

  return {
    hasQuota: true,
    remaining,
  };
}

/**
 * Deduct quota from user's membership
 * For points-based: deducts points from user
 * For card-based: increments usedQuota
 */
export async function deductQuota(userId: string, amount: number = 1): Promise<{
  success: boolean;
  newUsedQuota: number;
  remaining: number;
  error?: string;
}> {
  return prisma.$transaction(async (tx) => {
    // Lock and fetch current membership
    const membership = await tx.membership.findFirst({
      where: {
        userId,
        status: 'active',
        expiresAt: { gt: new Date() },
      },
      orderBy: { expiresAt: 'desc' },
    });

    if (!membership) {
      return {
        success: false,
        newUsedQuota: 0,
        remaining: 0,
        error: '会员不存在或已过期',
      };
    }

    const cardType = membership.cardType as MembershipTier;

    // Dev card type has unlimited quota
    if ((membership.cardType as string) === 'dev' || membership.quota === 0) {
      return {
        success: true,
        newUsedQuota: membership.usedQuota,
        remaining: 9999,
      };
    }

    // Points-based system: deduct points
    if (cardType === 'points') {
      const pointsToDeduct = amount * POINTS_PER_SCENE;
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { points: true },
      });

      if (!user || user.points < pointsToDeduct) {
        return {
          success: false,
          newUsedQuota: membership.usedQuota,
          remaining: user?.points || 0,
          error: '积分不足',
        };
      }

      await tx.user.update({
        where: { id: userId },
        data: { points: { decrement: pointsToDeduct } },
      });

      return {
        success: true,
        newUsedQuota: membership.usedQuota,
        remaining: user.points - pointsToDeduct,
      };
    }

    // Card-based system: increment usedQuota
    const newUsedQuota = membership.usedQuota + amount;
    const remaining = Math.max(0, membership.quota - newUsedQuota);

    await tx.membership.update({
      where: { id: membership.id },
      data: { usedQuota: newUsedQuota },
    });

    return {
      success: true,
      newUsedQuota,
      remaining,
    };
  });
}

/**
 * Get user's current quota status with optional warning
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
}> {
  const membership = await getActiveMembership(userId);

  if (!membership) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { points: true },
    });
    return {
      hasMembership: false,
      totalQuota: 0,
      usedQuota: 0,
      remainingQuota: 0,
      expiresAt: null,
      cardType: null,
      maxScenes: null,
      dailyStoryLimit: null,
      todayStoryCount: 0,
      userPoints: user?.points || 0,
      isWarning: false,
      warningMessage: null,
    };
  }

  const cardType = membership.cardType as MembershipTier;
  const remainingQuota = membership.quota === 0 ? 9999 : Math.max(0, membership.quota - membership.usedQuota);
  const isWarning = membership.quota > 0 && remainingQuota <= QUOTA_WARNING_THRESHOLD && remainingQuota > 0;
  const maxScenes = MEMBERSHIP_MAX_SCENES[cardType] ?? null;
  const dailyStoryLimit = MEMBERSHIP_DAILY_STORY_LIMIT[cardType] ?? null;
  const todayStoryCount = dailyStoryLimit ? await getTodayStoryCount(userId) : 0;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { points: true },
  });

  return {
    hasMembership: true,
    totalQuota: membership.quota,
    usedQuota: membership.usedQuota,
    remainingQuota,
    expiresAt: membership.expiresAt.toISOString(),
    cardType: membership.cardType,
    maxScenes,
    dailyStoryLimit,
    todayStoryCount,
    userPoints: user?.points || 0,
    isWarning,
    warningMessage: isWarning
      ? `您的配额即将用完（剩余 ${remainingQuota} 次），建议续费以继续使用`
      : null,
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

export default {
  getActiveMembership,
  checkQuota,
  deductQuota,
  getQuotaStatus,
  getMaxScenesForUser,
  getDailyStoryLimit,
  checkDailyStoryLimit,
  QUOTA_WARNING_THRESHOLD,
};
