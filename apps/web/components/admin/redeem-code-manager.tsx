'use client';

import { useState } from 'react';
import { Ban, Copy, Download, TicketPercent } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/magic';
import type { AdminRedeemCodeCreateResult, AdminRedeemCodeFilters, AdminRedeemCodeList } from '@/types/admin';
import { formatDate } from '@/lib/utils/date';

function formatBatchTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const pad = (num: number) => String(num).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('') + '-' + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}

function sanitizeFileName(value: string) {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'redeem-codes';
}

function csvCell(value: string | number | null | undefined) {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(result: AdminRedeemCodeCreateResult) {
  const timestamp = formatBatchTimestamp(result.batchTimestamp);
  const baseName = sanitizeFileName(`${result.note || '兑换码'}-${timestamp}`);
  const reward = result.rewardType === 'points'
    ? `${result.pointsAmount || 0} 积分`
    : `${result.membershipTier ? membershipTierLabels[result.membershipTier] : '-'} 会员`;
  const rows = [
    ['兑换码', '类型', '奖励', '状态', '过期时间', '备注', '批次时间'],
    ...result.codes.map((code) => [
      code,
      rewardTypeLabels[result.rewardType] || result.rewardType,
      reward,
      '未使用',
      result.expiresAt || '',
      result.note || '',
      result.batchTimestamp,
    ]),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${baseName}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const statusLabels: Record<string, string> = {
  active: '未使用',
  used: '已使用',
  expired: '已过期',
  disabled: '已作废',
};

const rewardTypeLabels: Record<string, string> = {
  membership: '会员卡',
  points: '积分',
};

const membershipTierLabels: Record<string, string> = {
  times: '1次卡',
  times1: '1次卡',
  times10: '10次卡',
  times50: '50次卡',
  times100: '100次卡',
  weekly: '周卡',
  monthly: '月卡',
  quarterly: '季卡',
  yearly: '年卡',
};

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
    membershipTier?: 'times1' | 'times10' | 'times50' | 'times100' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
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
  const [membershipTier, setMembershipTier] = useState<'times1' | 'times10' | 'times50' | 'times100' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'>('times1');
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
      const normalizedExpiresAt = expiresAt ? new Date(expiresAt).toISOString() : undefined;
      await onCreate({
        rewardType,
        count: Number(count),
        pointsAmount: rewardType === 'points' ? Number(pointsAmount) : undefined,
        membershipTier: rewardType === 'membership' ? membershipTier : undefined,
        expiresAt: normalizedExpiresAt,
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
            <p className="text-sm text-muted-foreground">支持积分码、1/10/50/100 次卡，以及周卡、月卡、季卡、年卡。</p>
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
              <select value={membershipTier} onChange={(e) => setMembershipTier(e.target.value as 'times1' | 'times10' | 'times50' | 'times100' | 'weekly' | 'monthly' | 'quarterly' | 'yearly')} className="h-11 w-full rounded-full border border-input bg-white/85 px-4 text-sm">
                <optgroup label="次卡">
                  <option value="times1">1次卡</option>
                  <option value="times10">10次卡</option>
                  <option value="times50">50次卡</option>
                  <option value="times100">100次卡</option>
                </optgroup>
                <optgroup label="时长卡">
                <option value="weekly">周卡</option>
                <option value="monthly">月卡</option>
                <option value="quarterly">季卡</option>
                <option value="yearly">年卡</option>
                </optgroup>
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-bold">最新生成结果</h3>
              <p className="text-sm text-muted-foreground">
                共生成 {lastCreatedCodes.count} 个兑换码 · 批次 {formatBatchTimestamp(lastCreatedCodes.batchTimestamp)}
              </p>
              {lastCreatedCodes.note && (
                <p className="mt-1 text-xs text-muted-foreground">备注：{lastCreatedCodes.note}</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="rounded-full" onClick={() => navigator.clipboard.writeText(lastCreatedCodes.codes.join('\n'))}>
                <Copy className="h-4 w-4" />
                复制全部
              </Button>
              <Button variant="outline" className="rounded-full" onClick={() => downloadCsv(lastCreatedCodes)}>
                <Download className="h-4 w-4" />
                导出表格
              </Button>
            </div>
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
            <option value="active">未使用</option>
            <option value="used">已使用</option>
            <option value="expired">已过期</option>
            <option value="disabled">已作废</option>
          </select>
          <select value={rewardTypeFilter || ''} onChange={(e) => setRewardTypeFilter((e.target.value || undefined) as AdminRedeemCodeFilters['rewardType'])} className="h-11 rounded-full border border-input bg-white/85 px-4 text-sm">
            <option value="">全部类型</option>
            <option value="membership">会员卡</option>
            <option value="points">积分</option>
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
                  <td className="px-2 py-3">{rewardTypeLabels[item.rewardType] || item.rewardType}</td>
                  <td className="px-2 py-3">{item.rewardType === 'points' ? `${item.pointsAmount || 0} 积分` : `${item.membershipTier ? membershipTierLabels[item.membershipTier] : '-'} 会员`}</td>
                  <td className="px-2 py-3">{statusLabels[item.status] || item.status}</td>
                  <td className="px-2 py-3">{item.usedByUser?.nickname || item.usedByUser?.phone || '-'}</td>
                  <td className="px-2 py-3 text-muted-foreground">{formatDate(item.createdAt)}</td>
                  <td className="px-2 py-3">
                    {item.status === 'active' ? (
                      <Button variant="outline" size="sm" className="rounded-full" onClick={async () => {
                        try {
                          await onDisable(item.id);
                        } catch {
                          // Error is handled by useAdmin hook
                        }
                      }}>
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
