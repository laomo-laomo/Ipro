'use client';

import type { MembershipStatus as MembershipStatusType } from '@/types/membership';
import { Clock, Crown, Zap, BookOpen, Coins } from 'lucide-react';

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

  if (!status) {
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

  if (!status.isActive) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[28px] border border-dashed border-violet-200 bg-white/80 p-8 text-center shadow-sm">
        <div className="mb-4 rounded-full bg-violet-100 p-4 text-violet-700">
          <Crown className="h-8 w-8" />
        </div>
        <h3 className="mb-2 text-lg font-bold">会员已过期</h3>
        <p className="text-sm leading-7 text-muted-foreground">续费后可继续享受创作权益。</p>
        {status.userPoints > 0 && (
          <div className="mt-4 flex items-center gap-2 rounded-full bg-amber-100 px-4 py-2 text-sm text-amber-700">
            <Coins className="h-4 w-4" />
            积分：{status.userPoints}
          </div>
        )}
      </div>
    );
  }

  const expiresAt = status.expiresAt ? new Date(status.expiresAt) : null;
  const now = new Date();
  const daysRemaining = expiresAt ? Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))) : 0;

  // 2026-06-18 定版: 所有卡统一显示"会员",不区分周/月/季/年
  const tierLabels: Record<string, string> = {
    points: '积分用户',
    times: '会员',
    times1: '会员',
    times10: '会员',
    times50: '会员',
    times100: '会员',
    weekly: '会员',
    monthly: '会员',
    quarterly: '会员',
    yearly: '会员',
  };

  const isPoints = status.tier === 'points';
  const isTimesCard = status.tier?.startsWith('times');
  const isPeriodCard = ['weekly', 'monthly', 'quarterly', 'yearly'].includes(status.tier || '');

  return (
    <div className="rounded-[28px] border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-amber-50 p-6 shadow-paper">
      <div className="mb-6 flex items-center gap-4">
        <div className="rounded-2xl bg-gradient-to-br from-violet-600 to-amber-400 p-3 text-white shadow-magic">
          <Crown className="h-6 w-6" />
        </div>
        <div>
          <h3 className="text-lg font-bold">{tierLabels[status.tier || ''] || '会员'}</h3>
          <p className="text-sm text-muted-foreground">
            {isPoints ? '按页扣费，灵活使用' : isPeriodCard ? '每日畅享创作' : '按次创作，专属权益'}
          </p>
        </div>
      </div>

      {/* 积分制显示 */}
      {isPoints && (
        <div className="rounded-[22px] bg-white/85 p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Coins className="h-4 w-4" />
            <span className="text-xs">当前积分</span>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-3xl font-extrabold text-amber-600">{status.userPoints}</span>
            <span className="text-sm text-muted-foreground">积分</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">每页消耗10积分，约0.1元/页</p>
        </div>
      )}

      {/* 周期卡显示 */}
      {isPeriodCard && (
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
              <BookOpen className="h-4 w-4" />
              <span className="text-xs">今日创作</span>
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-3xl font-extrabold text-violet-700">{status.todayStoryCount}</span>
              <span className="text-sm text-muted-foreground">/ {status.dailyStoryLimit}</span>
            </div>
          </div>
        </div>
      )}

      {/* 次卡显示 */}
      {isTimesCard && (
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
      )}

      {/* 额度进度条（次卡） */}
      {isTimesCard && status.totalQuota > 0 && (
        <div className="mt-5">
          <div className="h-2 overflow-hidden rounded-full bg-violet-100">
            <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-amber-400 transition-all" style={{ width: `${(status.remainingQuota / status.totalQuota) * 100}%` }} />
          </div>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            已使用 {status.totalQuota - status.remainingQuota} 次，剩余 {status.remainingQuota} 次
          </p>
        </div>
      )}

      {/* 限额说明 */}
      {status.maxScenes && (
        <p className="mt-4 text-center text-xs text-muted-foreground">
          每个故事最多 {status.maxScenes} 页
        </p>
      )}
    </div>
  );
}
