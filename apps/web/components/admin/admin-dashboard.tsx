'use client';

import { DollarSign, ReceiptText, Sparkles, Users } from 'lucide-react';
import type { AdminStats } from '@/types/admin';
import { GlassCard } from '@/components/magic';
import { formatDate } from '@/lib/utils/date';

export function AdminDashboard({ stats }: { stats: AdminStats | null }) {
  if (!stats) {
    return <GlassCard className="p-6 text-sm text-muted-foreground">管理员统计加载中...</GlassCard>;
  }

  const cards = [
    { label: '用户总数', value: stats.totalUsers, icon: Users },
    { label: '订单总数', value: stats.totalOrders, icon: ReceiptText },
    { label: '累计营收', value: `¥${stats.totalRevenue.toFixed(2)}`, icon: DollarSign },
    { label: '最近成交', value: stats.recentOrders.length, icon: Sparkles },
  ];

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <GlassCard key={card.label} className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{card.label}</p>
                  <p className="mt-2 text-3xl font-bold">{card.value}</p>
                </div>
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-100 to-amber-50 text-violet-700">
                  <Icon className="h-5 w-5" />
                </span>
              </div>
            </GlassCard>
          );
        })}
      </section>

      <GlassCard className="p-5 md:p-6">
        <h2 className="text-xl font-bold">最近订单</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-white/70 text-left text-muted-foreground">
                <th className="px-2 py-3">订单号</th>
                <th className="px-2 py-3">用户</th>
                <th className="px-2 py-3">类型</th>
                <th className="px-2 py-3">渠道</th>
                <th className="px-2 py-3">金额</th>
                <th className="px-2 py-3">时间</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentOrders.map((order) => (
                <tr key={order.id} className="border-b border-white/50">
                  <td className="px-2 py-3 font-mono text-xs">{order.orderNo}</td>
                  <td className="px-2 py-3">{order.userNickname || '未命名用户'}</td>
                  <td className="px-2 py-3">{order.type}</td>
                  <td className="px-2 py-3">{order.paymentChannel || '-'}</td>
                  <td className="px-2 py-3 font-semibold">¥{order.amount.toFixed(2)}</td>
                  <td className="px-2 py-3 text-muted-foreground">{formatDate(order.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}
