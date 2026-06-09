'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { AdminOrderList } from '@/types/admin';
import { GlassCard } from '@/components/magic';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/utils/date';

export function OrdersTable({ orders, onFilter }: { orders: AdminOrderList | null; onFilter: (status?: string) => Promise<void> }) {
  const [activeStatus, setActiveStatus] = useState<string>('all');
  const filters = ['all', 'pending', 'paid', 'cancelled', 'refunded'];

  return (
    <GlassCard className="p-5 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">订单管理</h2>
          <p className="text-sm text-muted-foreground">查看支付状态、金额和渠道分布。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {filters.map((status) => (
            <Button
              key={status}
              variant={activeStatus === status ? 'default' : 'outline'}
              size="sm"
              className="rounded-full"
              onClick={async () => {
                setActiveStatus(status);
                await onFilter(status === 'all' ? undefined : status);
              }}
            >
              {status}
            </Button>
          ))}
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-white/70 text-left text-muted-foreground">
              <th className="px-2 py-3">订单号</th>
              <th className="px-2 py-3">用户</th>
              <th className="px-2 py-3">类型</th>
              <th className="px-2 py-3">状态</th>
              <th className="px-2 py-3">渠道</th>
              <th className="px-2 py-3">金额</th>
              <th className="px-2 py-3">创建时间</th>
            </tr>
          </thead>
          <tbody>
            {orders?.orders.map((order) => (
              <tr key={order.id} className="border-b border-white/50">
                <td className="px-2 py-3 font-mono text-xs">
                  <Link href={`/admin/orders/${order.id}`} className="text-violet-700 hover:underline">
                    {order.orderNo}
                  </Link>
                </td>
                <td className="px-2 py-3">{order.userNickname || order.userId}</td>
                <td className="px-2 py-3">{order.type}</td>
                <td className="px-2 py-3">{order.status}</td>
                <td className="px-2 py-3">{order.paymentChannel || '-'}</td>
                <td className="px-2 py-3 font-semibold">¥{order.amount.toFixed(2)}</td>
                <td className="px-2 py-3 text-muted-foreground">{formatDate(order.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}
