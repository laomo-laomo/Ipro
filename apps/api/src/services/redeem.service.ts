import { prisma } from '../config/database.js';
import { MEMBERSHIP_DEFAULT_QUOTAS, getPlanPeriodDays, type MembershipTier } from '../config/membership.js';
import { getQuotaStatus } from './membership.service.js';

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const MEMBERSHIP_TIERS = new Set<MembershipTier>([
  'times',
  'times1',
  'times10',
  'times50',
  'times100',
  'weekly',
  'monthly',
  'quarterly',
  'yearly',
]);

function isMembershipTier(value: string | null | undefined): value is MembershipTier {
  return Boolean(value && MEMBERSHIP_TIERS.has(value as MembershipTier));
}

function addDays(base: Date, days: number): Date {
  const result = new Date(base);
  result.setDate(result.getDate() + days);
  return result;
}

async function redeemMembership(tx: TxClient, userId: string, tier: MembershipTier) {
  const now = new Date();
  const activeMembership = await tx.membership.findFirst({
    where: {
      userId,
      status: 'active',
      expiresAt: { gt: now },
    },
    orderBy: { expiresAt: 'desc' },
  });

  const quotaToAdd = MEMBERSHIP_DEFAULT_QUOTAS[tier] || 0;
  const extensionDays = getPlanPeriodDays(tier);

  if (activeMembership) {
    const baseDate = activeMembership.expiresAt > now ? activeMembership.expiresAt : now;
    const nextExpiry = addDays(baseDate, extensionDays);

    await tx.membership.update({
      where: { id: activeMembership.id },
      data: {
        cardType: tier,
        quota: activeMembership.quota + quotaToAdd,
        expiresAt: nextExpiry > activeMembership.expiresAt ? nextExpiry : activeMembership.expiresAt,
        status: 'active',
      },
    });
  } else {
    await tx.membership.create({
      data: {
        userId,
        cardType: tier,
        quota: quotaToAdd,
        usedQuota: 0,
        expiresAt: addDays(now, extensionDays),
        status: 'active',
      },
    });
  }
}

async function redeemPoints(tx: TxClient, userId: string, pointsAmount: number) {
  await tx.user.update({
    where: { id: userId },
    data: {
      points: {
        increment: pointsAmount,
      },
    },
  });
}

export async function redeemCode(userId: string, rawCode: string) {
  const code = rawCode.trim().toUpperCase();
  if (!code) {
    throw new Error('兑换码不能为空');
  }

  return prisma.$transaction(async (tx) => {
    const redeemCodeRecord = await tx.redeemCode.findUnique({
      where: { code },
    });

    if (!redeemCodeRecord) {
      throw new Error('兑换码不存在');
    }

    if (redeemCodeRecord.status === 'disabled') {
      throw new Error('兑换码已失效');
    }

    if (redeemCodeRecord.status === 'used' || redeemCodeRecord.usedAt || redeemCodeRecord.usedByUserId) {
      throw new Error('兑换码已被使用');
    }

    if (redeemCodeRecord.expiresAt && redeemCodeRecord.expiresAt <= new Date()) {
      await tx.redeemCode.update({
        where: { id: redeemCodeRecord.id },
        data: { status: 'expired' },
      });
      throw new Error('兑换码已过期');
    }

    if (redeemCodeRecord.rewardType === 'membership') {
      if (!isMembershipTier(redeemCodeRecord.membershipTier)) {
        throw new Error('兑换码配置错误：会员类型无效');
      }
      await redeemMembership(tx, userId, redeemCodeRecord.membershipTier);
    } else if (redeemCodeRecord.rewardType === 'points') {
      const pointsAmount = redeemCodeRecord.pointsAmount || 0;
      if (pointsAmount <= 0) {
        throw new Error('兑换码配置错误：积分数量无效');
      }
      await redeemPoints(tx, userId, pointsAmount);
    } else {
      throw new Error('暂不支持的兑换码类型');
    }

    await tx.redeemCode.update({
      where: { id: redeemCodeRecord.id },
      data: {
        usedByUserId: userId,
        usedAt: new Date(),
        status: 'used',
      },
    });

    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { points: true },
    });

    return {
      rewardType: redeemCodeRecord.rewardType,
      membershipTier: redeemCodeRecord.membershipTier,
      pointsAmount: redeemCodeRecord.pointsAmount,
      userPoints: user?.points || 0,
    };
  }, {
    timeout: 15000,
    maxWait: 5000,
  }).then(async (result) => {
    const quotaStatus = await getQuotaStatus(userId);
    return {
      ...result,
      membership: quotaStatus,
    };
  });
}
