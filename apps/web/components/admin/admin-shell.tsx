'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BarChart3, Crown, LogOut, Package, ReceiptText, TicketPercent, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthContext } from '@/providers/AuthProvider';
import { Button } from '@/components/ui/button';

const ADMIN_NAV = [
  { href: '/admin', label: '总览', icon: BarChart3 },
  { href: '/admin/redeem-codes', label: '兑换码', icon: TicketPercent },
  { href: '/admin/orders', label: '订单', icon: ReceiptText },
  { href: '/admin/users', label: '用户', icon: Users },
  { href: '/admin/prices', label: '价格', icon: Crown },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const auth = useAuthContext();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 登录页不需要认证检查，直接渲染
  const isLoginPage = pathname === '/admin/login';
  const isWechatLogin = pathname === '/admin/wechat-login';

  if (isLoginPage || isWechatLogin) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(253,224,71,0.22),_transparent_32%),linear-gradient(180deg,#fffaf2_0%,#f8f7ff_100%)] text-foreground">
        <main>{children}</main>
      </div>
    );
  }

  // 等待客户端挂载完成
  if (!mounted) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">正在加载管理员空间...</div>;
  }

  // 加载中
  if (auth.isLoading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">正在验证身份...</div>;
  }

  // 未登录：直接跳转登录页
  if (!auth.user) {
    const next = encodeURIComponent(pathname || '/admin');
    router.replace(`/admin/login?redirect=${next}`);
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">正在跳转登录...</div>;
  }

  // 已登录但非管理员：显示权限不足
  if (auth.user.role !== 'admin') {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-md rounded-[28px] border border-white/70 bg-white/90 p-8 text-center shadow-paper">
          <Package className="mx-auto h-12 w-12 text-violet-600" />
          <h1 className="mt-4 text-2xl font-bold">管理员权限不足</h1>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">当前账号没有管理员权限，请确认数据库中的用户 `role` 已设置为 `admin`。</p>
          <div className="mt-6 flex justify-center gap-3">
            <Button variant="outline" onClick={() => router.push('/')}>返回首页</Button>
            <Button onClick={() => auth.logout()}>退出登录</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(253,224,71,0.22),_transparent_32%),linear-gradient(180deg,#fffaf2_0%,#f8f7ff_100%)] text-foreground">
      <div className="mx-auto grid min-h-screen max-w-7xl gap-6 px-4 py-5 lg:grid-cols-[240px_1fr] lg:px-6 lg:py-6">
        <aside className="rounded-[30px] border border-white/70 bg-white/85 p-4 shadow-paper backdrop-blur-xl">
          <div className="flex items-center gap-3 border-b border-white/70 pb-4">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-amber-400 text-white shadow-magic">
              <Crown className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-medium text-violet-700">Admin Console</p>
              <p className="text-xs text-muted-foreground">{auth.user.nickname || '管理员'}</p>
            </div>
          </div>

          <nav className="mt-4 grid gap-2">
            {ADMIN_NAV.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-[18px] px-3 py-3 text-sm font-medium transition',
                    active ? 'bg-violet-600 text-white shadow-magic' : 'text-muted-foreground hover:bg-violet-50 hover:text-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <Button variant="outline" onClick={() => auth.logout()} className="mt-6 w-full rounded-full">
            <LogOut className="h-4 w-4" />
            退出登录
          </Button>
        </aside>

        <main className="space-y-6">{children}</main>
      </div>
    </div>
  );
}
