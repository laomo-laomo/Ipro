'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Images, LogOut, Sparkles, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthContext } from '@/providers/AuthProvider';
import { Button } from './button';

const NAV_ITEMS = [
  { href: '/', label: '首页', icon: Home },
  { href: '/create/upload', label: '创作', icon: Sparkles },
  { href: '/gallery', label: '作品', icon: Images },
  { href: '/membership', label: '我的', icon: UserRound },
];

export function NavBar() {
  const pathname = usePathname();
  const { user, isAuthenticated, logout } = useAuthContext();

  if (pathname.startsWith('/login') || pathname.startsWith('/register')) {
    return null;
  }

  return (
    <>
      <nav className="sticky top-0 z-50 border-b border-white/60 bg-[#fffaf2]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <span className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl shadow-magic">
              <Image src="/brand/ipro-book.svg" alt="IPro Logo" fill className="object-cover" sizes="44px" />
            </span>
            <div className="hidden sm:block">
              <p className="storybook-title text-xl text-gradient-magic">IPro</p>
              <p className="text-xs text-muted-foreground">打开属于你的童话书</p>
            </div>
          </Link>

          <div className="hidden items-center gap-2 md:flex">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'relative flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all duration-200',
                    isActive ? 'bg-white text-foreground shadow-paper' : 'text-muted-foreground hover:bg-white/70 hover:text-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                  {isActive && <span className="absolute inset-x-4 -bottom-1 h-0.5 rounded-full bg-gradient-to-r from-violet-500 to-amber-400" />}
                </Link>
              );
            })}
          </div>

          <div className="hidden items-center gap-2 md:flex">
            {isAuthenticated ? (
              <>
                <div className="rounded-full border border-white/70 bg-white/80 px-3 py-1.5 text-sm text-muted-foreground">
                  {user?.nickname || '童话创作者'}
                </div>
                <Button variant="ghost" size="sm" onClick={() => logout()}>
                  <LogOut className="h-4 w-4" />
                  退出
                </Button>
              </>
            ) : (
              <Link href="/login">
                <Button variant="magic" size="sm" className="rounded-full px-5">
                  登录
                </Button>
              </Link>
            )}
          </div>
        </div>
      </nav>

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/70 bg-[#fffaf2]/92 px-3 py-2 backdrop-blur-xl md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-4 gap-2">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-col items-center justify-center rounded-2xl px-2 py-2 text-[11px] font-medium transition-all duration-200',
                  isActive ? 'bg-gradient-to-b from-violet-100 to-amber-50 text-violet-700 shadow-sm' : 'text-muted-foreground hover:bg-white/70 hover:text-foreground'
                )}
              >
                <Icon className={cn('mb-1 h-4 w-4', isActive && 'text-violet-600')} />
                <span>{item.label}</span>
                <span className={cn('mt-1 h-0.5 w-8 rounded-full bg-gradient-to-r from-violet-500 to-amber-400 transition-opacity', isActive ? 'opacity-100' : 'opacity-0')} />
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}

