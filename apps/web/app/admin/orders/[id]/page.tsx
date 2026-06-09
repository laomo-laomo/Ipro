'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, ReceiptText } from 'lucide-react';
import { GlassCard } from '@/components/magic';
import { Button } from '@/components/ui/button';
import { getAdminOrderDetail } from '@/lib/api/admin';
import type { AdminOrderDetail } from '@/types/admin';
import { formatDate } from '@/lib/utils/date';

export default function AdminOrderDetailPage() {
  const params = useParams();
  const id = Array.isArray(params?.id) ? params?.id[0] : params?.id;
  const [order, setOrder] = useState<AdminOrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getAdminOrderDetail(id).then(setOrder).catch((err) => setError(err instanceof Error ? err.message : '加载订单详情失败'));
  }, [id]);

  if (error) {
    return <GlassCard className="p-6 text-sm text-destructive">{error}</GlassCard>;
  }

  if (!order) {
    return <GlassCard className="p-6 text-sm text-muted-foreground">订单详情加载中...</GlassCard>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="outline" className="rounded-full">
          <Link href="/admin/orders">
            <ArrowLeft className="h-4 w-4" />
            返回订单列表
          </Link>
        </Button>
      </div>

      <GlassCard className="p-5 md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-violet-700">订单详情</p>
            <h1 className="mt-2 text-2xl font-bold">{order.orderNo}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{order.type} · {order.status} · {order.paymentChannel || '未指定渠道'}</p>
          </div>
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-100 to-amber-50 text-violet-700">
            <ReceiptText className="h-5 w-5" />
          </span>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <GlassCard className="p-4">
            <p className="text-xs text-muted-foreground">金额</p>
            <p className="mt-2 text-2xl font-bold">¥{order.amount.toFixed(2)}</p>
          </GlassCard>
          <GlassCard className="p-4">
            <p className="text-xs text-muted-foreground">交易号</p>
            <p className="mt-2 break-all text-sm font-medium">{order.transactionId || '-'}</p>
          </GlassCard>
          <GlassCard className="p-4">
            <p className="text-xs text-muted-foreground">创建时间</p>
            <p className="mt-2 text-sm font-medium">{formatDate(order.createdAt)}</p>
          </GlassCard>
        </div>
      </GlassCard>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <GlassCard className="p-5 md:p-6">
          <h2 className="text-xl font-bold">关联用户</h2>
          <div className="mt-4 space-y-3 text-sm">
            <p><span className="text-muted-foreground">昵称：</span>{order.user.nickname || '未命名用户'}</p>
            <p><span className="text-muted-foreground">手机号：</span>{order.user.phone || '-'}</p>
            <p><span className="text-muted-foreground">角色：</span>{order.user.role}</p>
            <p><span className="text-muted-foreground">积分：</span>{order.user.points}</p>
            <Button asChild variant="outline" className="mt-3 rounded-full">
              <Link href={`/admin/users/${order.user.id}`}>查看用户详情</Link>
            </Button>
          </div>
        </GlassCard>

        <GlassCard className="p-5 md:p-6">
          <h2 className="text-xl font-bold">支付日志</h2>
          <div className="mt-4 space-y-3">
            {order.paymentLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground">当前订单还没有支付日志。</p>
            ) : order.paymentLogs.map((log) => (
              <div key={log.id} className="rounded-[18px] border border-white/70 bg-white/80 p-4 text-sm shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{log.event}</p>
                  <span className="text-xs text-muted-foreground">{log.channel} · {log.status}</span>
                </div>
                {log.errorMessage && <p className="mt-2 text-destructive">{log.errorMessage}</p>}
                <p className="mt-2 text-xs text-muted-foreground">{formatDate(log.createdAt)}</p>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
