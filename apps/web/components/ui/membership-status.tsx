'use client';

import type { MembershipStatus as MembershipStatusType } from '@/types/membership';
import { Clock, Crown, Zap } from 'lucide-react';

interface MembershipStatusProps {
  status: MembershipStatusType | null;
  isLoading?: boolean;
}

export function MembershipStatus({ status, isLoading = false }: MembershipStatusProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-[24px] border border-white/70 bg-white/80 p-6 shadow-sm">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="ml-2 text-muted-foreground">加载中...</span>
      </div>
    );
  }

  if (!status || !status.isActive) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[28px] border border-dashed border-violet-200 bg-white/80 p-8 text-center shadow-sm">
        <div className="mb-4 rounded-full bg-violet-100 p-4 text-violet-700">
          <Crown className="h-8 w-8" />
        </div>
        <h3 className="mb-2 text-lg font-bold">当前还是免费用户</h3>
        <p className="text-sm leading-7 text-muted-foreground">升级后可以更稳定地生成绘本、视频和更多创作次数。</p>
      </div>
    );
  }

  const expiresAt = status.expiresAt ? new Date(status.expiresAt) : null;
  const now = new Date();
  const daysRemaining = expiresAt ? Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))) : 0;

  const tierLabels: Record<string, string> = {
    weekly: '周卡会员',
    monthly: '月卡会员',
    quarterly: '季卡会员',
    yearly: '年卡会员',
  };

  return (
    <div className="rounded-[28px] border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-amber-50 p-6 shadow-paper">
      <div className="mb-6 flex items-center gap-4">
        <div className="rounded-2xl bg-gradient-to-br from-violet-600 to-amber-400 p-3 text-white shadow-magic">
          <Crown className="h-6 w-6" />
        </div>
        <div>
          <h3 className="text-lg font-bold">{tierLabels[status.tier || ''] || '会员'}</h3>
          <p className="text-sm text-muted-foreground">正在享受专属童话创作权益</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-[22px] bg-white/85 p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span className="text-xs">剩余天数</span>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-3xl font-extrabold text-violet-700">{daysRemaining}</span>
            <span className="text-sm text-muted-foreground">天</span>
          </div>
        </div>

        <div className="rounded-[22px] bg-white/85 p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Zap className="h-4 w-4" />
            <span className="text-xs">剩余额度</span>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-3xl font-extrabold text-violet-700">{status.remainingQuota}</span>
            <span className="text-sm text-muted-foreground">/ {status.totalQuota}</span>
          </div>
        </div>
      </div>

      <div className="mt-5">
        <div className="h-2 overflow-hidden rounded-full bg-violet-100">
          <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-amber-400 transition-all" style={{ width: `${status.totalQuota > 0 ? (status.remainingQuota / status.totalQuota) * 100 : 0}%` }} />
        </div>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          {status.totalQuota > 0 ? `已使用 ${status.totalQuota - status.remainingQuota} 次，剩余 ${status.remainingQuota} 次` : '额度用尽，请续费'}
        </p>
      </div>
    </div>
  );
}
