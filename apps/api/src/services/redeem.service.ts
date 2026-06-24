import { prisma } from '../config/database.js';
import { type MembershipTier } from '../config/membership.js';
import { getQuotaStatus, extendOrCreateMembership } from './membership.service.js';
import { getMembershipPlanById } from './membership-plan.service.js';

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

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
      const plan = redeemCodeRecord.membershipTier ? await getMembershipPlanById(redeemCodeRecord.membershipTier) : null;
      if (!plan) {
        throw new Error('兑换码配置错误：会员类型无效');
      }
      // 修复 (2026-06-18 Bug O): 使用公共函数 extendOrCreateMembership
      await extendOrCreateMembership(tx, userId, redeemCodeRecord.membershipTier as MembershipTier);
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
