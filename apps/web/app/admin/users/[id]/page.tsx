'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, UserRound } from 'lucide-react';
import { GlassCard } from '@/components/magic';
import { Button } from '@/components/ui/button';
import { getAdminMembershipPlans, getAdminUserDetail, grantAdminUserMembership, grantAdminUserPoints } from '@/lib/api/admin';
import type { AdminMembershipPlan, AdminUserDetail } from '@/types/admin';
import { formatDate } from '@/lib/utils/date';
import { Input } from '@/components/ui/input';

export default function AdminUserDetailPage() {
  const params = useParams();
  const id = Array.isArray(params?.id) ? params?.id[0] : params?.id;
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [membershipPlans, setMembershipPlans] = useState<AdminMembershipPlan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pointsToGrant, setPointsToGrant] = useState('100');
  const [membershipType, setMembershipType] = useState('monthly');
  const [membershipQuota, setMembershipQuota] = useState('100');
  const [membershipDays, setMembershipDays] = useState('30');
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadUser = useCallback(async () => {
    if (!id) return;
    try {
      const result = await getAdminUserDetail(id);
      setUser(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载用户详情失败');
    }
  }, [id]);

  useEffect(() => {
    void loadUser();
  }, [loadUser]);

  useEffect(() => {
    getAdminMembershipPlans().then((plans) => {
      const enabled = plans.filter((plan) => plan.enabled && plan.type === 'card');
      setMembershipPlans(enabled);
      setMembershipType((current) => {
        if (enabled.length === 0 || enabled.some((plan) => plan.id === current)) return current;
        const first = enabled[0];
        setMembershipQuota(first.dailyStoryLimit ? '0' : String(Number(String(first.id).match(/\d+/)?.[0] || 0)));
        setMembershipDays(String(first.periodDays));
        return first.id;
      });
    }).catch(() => {});
  }, []);

  const handleMembershipTypeChange = (value: string) => {
    setMembershipType(value);
    const plan = membershipPlans.find((item) => item.id === value);
    if (!plan) return;
    setMembershipQuota(plan.dailyStoryLimit ? '0' : String(Number(String(plan.id).match(/\d+/)?.[0] || 0)));
    setMembershipDays(String(plan.periodDays));
  };

  if (error) {
    return <GlassCard className="p-6 text-sm text-destructive">{error}</GlassCard>;
  }

  if (!user) {
    return <GlassCard className="p-6 text-sm text-muted-foreground">用户详情加载中...</GlassCard>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="outline" className="rounded-full">
          <Link href="/admin/users">
            <ArrowLeft className="h-4 w-4" />
            返回用户列表
          </Link>
        </Button>
      </div>

      <GlassCard className="p-5 md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-violet-700">用户详情</p>
            <h1 className="mt-2 text-2xl font-bold">{user.nickname || '未命名用户'}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{user.phone || '未绑定手机号'} · {user.role} · 积分 {user.points}</p>
          </div>
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-100 to-amber-50 text-violet-700">
            <UserRound className="h-5 w-5" />
          </span>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <GlassCard className="p-4">
            <p className="text-xs text-muted-foreground">会员记录</p>
            <p className="mt-2 text-2xl font-bold">{user.memberships.length}</p>
          </GlassCard>
          <GlassCard className="p-4">
            <p className="text-xs text-muted-foreground">订单数</p>
            <p className="mt-2 text-2xl font-bold">{user.orders.length}</p>
          </GlassCard>
          <GlassCard className="p-4">
            <p className="text-xs text-muted-foreground">故事数</p>
            <p className="mt-2 text-2xl font-bold">{user.stories.length}</p>
          </GlassCard>
          <GlassCard className="p-4">
            <p className="text-xs text-muted-foreground">声音数</p>
            <p className="mt-2 text-2xl font-bold">{user.voices.length}</p>
          </GlassCard>
        </div>
      </GlassCard>

      <div className="grid gap-6 xl:grid-cols-2">
        <GlassCard className="p-5 md:p-6">
          <h2 className="text-xl font-bold">管理员操作</h2>
          <div className="mt-4 space-y-5">
            <div className="rounded-[18px] border border-white/70 bg-white/80 p-4">
              <p className="font-semibold">手动加积分</p>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                <Input value={pointsToGrant} onChange={(e) => setPointsToGrant(e.target.value)} className="h-11 rounded-full bg-white/85 px-4" />
                <Button
                  className="rounded-full"
                  onClick={async () => {
                    if (!id) return;
                    await grantAdminUserPoints(id, Number(pointsToGrant));
                    setActionMessage(`已为用户增加 ${pointsToGrant} 积分`);
                    await loadUser();
                  }}
                >
                  发放积分
                </Button>
              </div>
            </div>

            <div className="rounded-[18px] border border-white/70 bg-white/80 p-4">
              <p className="font-semibold">手动开会员</p>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <select value={membershipType} onChange={(e) => handleMembershipTypeChange(e.target.value)} className="h-11 rounded-full border border-input bg-white/85 px-4 text-sm">
                  {membershipPlans.map((plan) => (
                    <option key={plan.id} value={plan.id}>{plan.name}</option>
                  ))}
                </select>
                <Input value={membershipQuota} onChange={(e) => setMembershipQuota(e.target.value)} placeholder="额度" className="h-11 rounded-full bg-white/85 px-4" />
                <Input value={membershipDays} onChange={(e) => setMembershipDays(e.target.value)} placeholder="有效天数" className="h-11 rounded-full bg-white/85 px-4" />
              </div>
              <Button
                className="mt-3 rounded-full"
                onClick={async () => {
                  if (!id) return;
                  await grantAdminUserMembership(id, {
                    cardType: membershipType,
                    quota: Number(membershipQuota),
                    days: Number(membershipDays),
                  });
                  setActionMessage(`已为用户开通 ${membershipType}，额度 ${membershipQuota}，有效期 ${membershipDays} 天`);
                  await loadUser();
                }}
              >
                开通会员
              </Button>
            </div>

            {actionMessage && <p className="text-sm text-emerald-700">{actionMessage}</p>}
          </div>
        </GlassCard>

        <GlassCard className="p-5 md:p-6">
          <h2 className="text-xl font-bold">会员记录</h2>
          <div className="mt-4 space-y-3">
            {user.memberships.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无会员记录。</p>
            ) : user.memberships.map((membership) => (
              <div key={membership.id} className="rounded-[18px] border border-white/70 bg-white/80 p-4 text-sm shadow-sm">
                <p className="font-semibold">{membership.cardType}</p>
                <p className="mt-2 text-muted-foreground">额度 {membership.usedQuota}/{membership.quota}</p>
                <p className="mt-1 text-muted-foreground">状态 {membership.status} · 到期 {formatDate(membership.expiresAt)}</p>
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard className="p-5 md:p-6">
          <h2 className="text-xl font-bold">最近兑换码</h2>
          <div className="mt-4 space-y-3">
            {user.redeemCodes.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无兑换记录。</p>
            ) : user.redeemCodes.map((code) => (
              <div key={code.id} className="rounded-[18px] border border-white/70 bg-white/80 p-4 text-sm shadow-sm">
                <p className="font-mono font-semibold">{code.code}</p>
                <p className="mt-2 text-muted-foreground">{code.rewardType === 'points' ? `${code.pointsAmount || 0} 积分` : `${code.membershipTier || '-'} 会员`}</p>
                <p className="mt-1 text-muted-foreground">状态 {code.status} {code.usedAt ? `· 使用于 ${formatDate(code.usedAt)}` : ''}</p>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <GlassCard className="p-5 md:p-6">
          <h2 className="text-xl font-bold">最近订单</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-white/70 text-left text-muted-foreground">
                  <th className="px-2 py-3">订单号</th>
                  <th className="px-2 py-3">状态</th>
                  <th className="px-2 py-3">金额</th>
                  <th className="px-2 py-3">时间</th>
                </tr>
              </thead>
              <tbody>
                {user.orders.map((order) => (
                  <tr key={order.id} className="border-b border-white/50">
                    <td className="px-2 py-3 font-mono text-xs">{order.orderNo}</td>
                    <td className="px-2 py-3">{order.status}</td>
                    <td className="px-2 py-3">¥{order.amount.toFixed(2)}</td>
                    <td className="px-2 py-3 text-muted-foreground">{formatDate(order.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>

        <GlassCard className="p-5 md:p-6">
          <h2 className="text-xl font-bold">最近作品与声音</h2>
          <div className="mt-4 space-y-4 text-sm">
            <div>
              <p className="font-semibold">故事</p>
              <div className="mt-2 space-y-2">
                {user.stories.map((story) => (
                  <div key={story.id} className="rounded-[16px] border border-white/70 bg-white/80 px-4 py-3">
                    <p className="font-medium">{story.title}</p>
                    <p className="mt-1 text-muted-foreground">{story.status} · {formatDate(story.createdAt)}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="font-semibold">声音</p>
              <div className="mt-2 space-y-2">
                {user.voices.map((voice) => (
                  <div key={voice.id} className="rounded-[16px] border border-white/70 bg-white/80 px-4 py-3">
                    <p className="font-medium">{voice.name}</p>
                    <p className="mt-1 text-muted-foreground">{voice.status} · {formatDate(voice.createdAt)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
