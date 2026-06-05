/**
 * Membership Service
 *
 * Handles membership quota management:
 * - Quota check before task creation
 * - Quota deduction after task completion
 * - Membership status queries
 */

import { prisma } from '../config/database.js';

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
 * Check if user has sufficient quota
 * Returns { hasQuota: boolean; remaining: number; error?: string }
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

  // Dev card type has unlimited quota
  if (membership.cardType === 'dev') {
    return {
      hasQuota: true,
      remaining: 9999,
    };
  }

  const remaining = Math.max(0, membership.quota - membership.usedQuota);

  if (remaining < required) {
    return {
      hasQuota: false,
      remaining,
      error: `您的配额已用完（${membership.usedQuota}/${membership.quota}），请购买会员套餐继续使用`,
    };
  }

  return {
    hasQuota: true,
    remaining,
  };
}

/**
 * Deduct quota from user's membership
 * Uses transaction to ensure atomicity
 * Returns { success: boolean; newUsedQuota: number; remaining: number }
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

    const newUsedQuota = membership.usedQuota + amount;
    const remaining = Math.max(0, membership.quota - newUsedQuota);

    // Update usedQuota
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
  isWarning: boolean;
  warningMessage: string | null;
}> {
  const membership = await getActiveMembership(userId);

  if (!membership) {
    return {
      hasMembership: false,
      totalQuota: 0,
      usedQuota: 0,
      remainingQuota: 0,
      expiresAt: null,
      cardType: null,
      isWarning: false,
      warningMessage: null,
    };
  }

  const remainingQuota = Math.max(0, membership.quota - membership.usedQuota);
  const isWarning = remainingQuota <= QUOTA_WARNING_THRESHOLD && remainingQuota > 0;

  return {
    hasMembership: true,
    totalQuota: membership.quota,
    usedQuota: membership.usedQuota,
    remainingQuota,
    expiresAt: membership.expiresAt.toISOString(),
    cardType: membership.cardType,
    isWarning,
    warningMessage: isWarning
      ? `您的配额即将用完（剩余 ${remainingQuota} 次），建议续费以继续使用`
      : null,
  };
}

export default {
  getActiveMembership,
  checkQuota,
  deductQuota,
  getQuotaStatus,
  QUOTA_WARNING_THRESHOLD,
};