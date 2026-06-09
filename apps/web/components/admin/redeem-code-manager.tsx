'use client';

import { useState } from 'react';
import { Ban, Copy, TicketPercent } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/magic';
import type { AdminRedeemCodeCreateResult, AdminRedeemCodeFilters, AdminRedeemCodeList } from '@/types/admin';
import { formatDate } from '@/lib/utils/date';

export function RedeemCodeManager({
  onCreate,
  lastCreatedCodes,
  redeemCodes,
  onDisable,
  onSearch,
  filters,
}: {
  onCreate: (body: {
    rewardType: 'points' | 'membership';
    count: number;
    pointsAmount?: number;
    membershipTier?: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
    expiresAt?: string;
    note?: string;
  }) => Promise<AdminRedeemCodeCreateResult>;
  lastCreatedCodes: AdminRedeemCodeCreateResult | null;
  redeemCodes: AdminRedeemCodeList | null;
  onDisable: (id: string) => Promise<void>;
  onSearch: (filters: AdminRedeemCodeFilters) => Promise<void>;
  filters: AdminRedeemCodeFilters;
}) {
  const [rewardType, setRewardType] = useState<'points' | 'membership'>('membership');
  const [count, setCount] = useState('10');
  const [pointsAmount, setPointsAmount] = useState('100');
  const [membershipTier, setMembershipTier] = useState<'weekly' | 'monthly' | 'quarterly' | 'yearly'>('monthly');
  const [expiresAt, setExpiresAt] = useState('');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(filters.search || '');
  const [statusFilter, setStatusFilter] = useState<AdminRedeemCodeFilters['status']>(filters.status);
  const [rewardTypeFilter, setRewardTypeFilter] = useState<AdminRedeemCodeFilters['rewardType']>(filters.rewardType);

  const handleCreate = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await onCreate({
        rewardType,
        count: Number(count),
        pointsAmount: rewardType === 'points' ? Number(pointsAmount) : undefined,
        membershipTier: rewardType === 'membership' ? membershipTier : undefined,
        expiresAt: expiresAt || undefined,
        note: note || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建兑换码失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <GlassCard className="p-5 md:p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-100 to-amber-50 text-violet-700">
            <TicketPercent className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-xl font-bold">批量生成兑换码</h2>
            <p className="text-sm text-muted-foreground">支持积分码，以及月卡、季卡、年卡会员兑换码。</p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label className="space-y-2 text-sm">
            <span className="font-medium">奖励类型</span>
            <select value={rewardType} onChange={(e) => setRewardType(e.target.value as 'points' | 'membership')} className="h-11 w-full rounded-full border border-input bg-white/85 px-4 text-sm">
              <option value="membership">会员卡</option>
              <option value="points">积分</option>
            </select>
          </label>

          <label className="space-y-2 text-sm">
            <span className="font-medium">生成数量</span>
            <Input value={count} onChange={(e) => setCount(e.target.value)} className="h-11 rounded-full bg-white/85 px-4" />
          </label>

          {rewardType === 'points' ? (
            <label className="space-y-2 text-sm">
              <span className="font-medium">积分数量</span>
              <Input value={pointsAmount} onChange={(e) => setPointsAmount(e.target.value)} className="h-11 rounded-full bg-white/85 px-4" />
            </label>
          ) : (
            <label className="space-y-2 text-sm">
              <span className="font-medium">会员档位</span>
              <select value={membershipTier} onChange={(e) => setMembershipTier(e.target.value as 'weekly' | 'monthly' | 'quarterly' | 'yearly')} className="h-11 w-full rounded-full border border-input bg-white/85 px-4 text-sm">
                <option value="monthly">月卡</option>
                <option value="quarterly">季卡</option>
                <option value="yearly">年卡</option>
                <option value="weekly">周卡</option>
              </select>
            </label>
          )}

          <label className="space-y-2 text-sm">
            <span className="font-medium">过期时间（可选）</span>
            <Input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="h-11 rounded-full bg-white/85 px-4" />
          </label>

          <label className="space-y-2 text-sm md:col-span-2 xl:col-span-2">
            <span className="font-medium">备注（可选）</span>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="例如：618 活动、渠道测试、KOL投放" className="h-11 rounded-full bg-white/85 px-4" />
          </label>
        </div>

        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

        <Button onClick={handleCreate} disabled={isSubmitting} className="mt-6 rounded-full px-6">
          {isSubmitting ? '生成中...' : '生成兑换码'}
        </Button>
      </GlassCard>

      {lastCreatedCodes && (
        <GlassCard className="p-5 md:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold">最新生成结果</h3>
              <p className="text-sm text-muted-foreground">共生成 {lastCreatedCodes.count} 个兑换码</p>
            </div>
            <Button variant="outline" className="rounded-full" onClick={() => navigator.clipboard.writeText(lastCreatedCodes.codes.join('\n'))}>
              <Copy className="h-4 w-4" />
              复制全部
            </Button>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {lastCreatedCodes.codes.map((code) => (
              <div key={code} className="rounded-[18px] border border-white/70 bg-white/80 px-4 py-3 font-mono text-sm shadow-sm">
                {code}
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      <GlassCard className="p-5 md:p-6">
        <h3 className="text-lg font-bold">兑换码历史</h3>
        <p className="mt-1 text-sm text-muted-foreground">最近生成和已使用的兑换码会显示在这里，可直接作废未使用码。</p>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Input value={search} onChange={(e) => setSearch(e.target.value.toUpperCase())} placeholder="搜索兑换码" className="h-11 rounded-full bg-white/85 px-4" />
          <select value={statusFilter || ''} onChange={(e) => setStatusFilter((e.target.value || undefined) as AdminRedeemCodeFilters['status'])} className="h-11 rounded-full border border-input bg-white/85 px-4 text-sm">
            <option value="">全部状态</option>
            <option value="active">active</option>
            <option value="used">used</option>
            <option value="expired">expired</option>
            <option value="disabled">disabled</option>
          </select>
          <select value={rewardTypeFilter || ''} onChange={(e) => setRewardTypeFilter((e.target.value || undefined) as AdminRedeemCodeFilters['rewardType'])} className="h-11 rounded-full border border-input bg-white/85 px-4 text-sm">
            <option value="">全部类型</option>
            <option value="membership">membership</option>
            <option value="points">points</option>
          </select>
          <Button className="h-11 rounded-full" onClick={() => onSearch({ search, status: statusFilter, rewardType: rewardTypeFilter, offset: 0, limit: filters.limit || 50 })}>
            筛选
          </Button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-white/70 text-left text-muted-foreground">
                <th className="px-2 py-3">兑换码</th>
                <th className="px-2 py-3">类型</th>
                <th className="px-2 py-3">奖励</th>
                <th className="px-2 py-3">状态</th>
                <th className="px-2 py-3">使用者</th>
                <th className="px-2 py-3">创建时间</th>
                <th className="px-2 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {redeemCodes?.codes.map((item) => (
                <tr key={item.id} className="border-b border-white/50">
                  <td className="px-2 py-3 font-mono text-xs">{item.code}</td>
                  <td className="px-2 py-3">{item.rewardType}</td>
                  <td className="px-2 py-3">{item.rewardType === 'points' ? `${item.pointsAmount || 0} 积分` : `${item.membershipTier || '-'} 会员`}</td>
                  <td className="px-2 py-3">{item.status}</td>
                  <td className="px-2 py-3">{item.usedByUser?.nickname || item.usedByUser?.phone || '-'}</td>
                  <td className="px-2 py-3 text-muted-foreground">{formatDate(item.createdAt)}</td>
                  <td className="px-2 py-3">
                    {item.status === 'active' ? (
                      <Button variant="outline" size="sm" className="rounded-full" onClick={() => onDisable(item.id)}>
                        <Ban className="h-4 w-4" />
                        作废
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">不可操作</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {redeemCodes && redeemCodes.total > redeemCodes.limit && (
          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <span>共 {redeemCodes.total} 条，当前显示 {redeemCodes.offset + 1}-{Math.min(redeemCodes.offset + redeemCodes.limit, redeemCodes.total)}</span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                disabled={redeemCodes.offset === 0}
                onClick={() => onSearch({ ...filters, offset: Math.max(0, (filters.offset || 0) - (filters.limit || 50)) })}
              >
                上一页
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                disabled={(redeemCodes.offset + redeemCodes.limit) >= redeemCodes.total}
                onClick={() => onSearch({ ...filters, offset: (filters.offset || 0) + (filters.limit || 50) })}
              >
                下一页
              </Button>
            </div>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
