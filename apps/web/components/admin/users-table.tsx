'use client';

import Link from 'next/link';
import type { AdminUserList } from '@/types/admin';
import { GlassCard } from '@/components/magic';
import { formatDate } from '@/lib/utils/date';

export function UsersTable({ users }: { users: AdminUserList | null }) {
  return (
    <GlassCard className="p-5 md:p-6">
      <h2 className="text-xl font-bold">用户管理</h2>
      <p className="mt-1 text-sm text-muted-foreground">查看用户体量和使用活跃度概况。</p>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-white/70 text-left text-muted-foreground">
              <th className="px-2 py-3">昵称</th>
              <th className="px-2 py-3">手机号</th>
              <th className="px-2 py-3">声音数</th>
              <th className="px-2 py-3">故事数</th>
              <th className="px-2 py-3">订单数</th>
              <th className="px-2 py-3">注册时间</th>
            </tr>
          </thead>
          <tbody>
            {users?.users.map((user) => (
              <tr key={user.id} className="border-b border-white/50">
                <td className="px-2 py-3">
                  <Link href={`/admin/users/${user.id}`} className="text-violet-700 hover:underline">
                    {user.nickname || '未命名用户'}
                  </Link>
                </td>
                <td className="px-2 py-3">{user.phone || '-'}</td>
                <td className="px-2 py-3">{user.voicesCount}</td>
                <td className="px-2 py-3">{user.storiesCount}</td>
                <td className="px-2 py-3">{user.ordersCount}</td>
                <td className="px-2 py-3 text-muted-foreground">{formatDate(user.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}
