'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BookOpen, FolderHeart, Home, Images, LogOut, Menu, Mic2, Sparkles, UserRound, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthContext } from '@/providers/AuthProvider';
import { Button } from './button';

const NAV_ITEMS = [
  { href: '/', label: '首页', icon: Home },
  { href: '/create/upload', label: '创作', icon: Sparkles },
  { href: '/gallery', label: '作品', icon: Images },
  { href: '/membership', label: '我的', icon: UserRound },
];

const MOBILE_NAV_ITEMS = [
  { href: '/', label: '首页', icon: Home },
  { href: '/create/upload', label: '创作', icon: Sparkles },
  { href: '/gallery', label: '作品', icon: Images },
  { href: '/assets', label: '素材', icon: FolderHeart },
  { href: '/membership', label: '我的', icon: UserRound },
];

const MORE_ITEMS = [
  { href: '/create/upload', label: '开始创作', caption: '照片、风格、故事、绘本', icon: Sparkles },
  { href: '/gallery', label: '我的作品', caption: '绘本、角色、视频', icon: BookOpen },
  { href: '/assets', label: '素材库', caption: '照片、插画、声音资产', icon: FolderHeart },
  { href: '/voices', label: '声音魔法屋', caption: '上传音频与声音克隆', icon: Mic2 },
  { href: '/membership', label: '会员权益', caption: '额度、套餐与当前状态', icon: UserRound },
];

export function NavBar() {
  const pathname = usePathname();
  const { user, isAuthenticated, logout } = useAuthContext();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const currentPath = pathname ?? '';
  const hideMobileBottomNav = currentPath.startsWith('/create/');

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [currentPath]);

  if (currentPath.startsWith('/login') || currentPath.startsWith('/register')) {
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

          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/70 bg-white/80 text-violet-700 shadow-sm transition hover:bg-white md:hidden"
            aria-label="打开移动端菜单"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="hidden items-center gap-2 md:flex">
            {NAV_ITEMS.map((item) => {
              const isActive = currentPath === item.href || (item.href !== '/' && currentPath.startsWith(item.href));
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

      {!hideMobileBottomNav && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/70 bg-[#fffaf2]/94 px-2 pb-[calc(env(safe-area-inset-bottom)+0.45rem)] pt-2 shadow-[0_-16px_40px_-28px_rgba(76,29,149,0.55)] backdrop-blur-xl md:hidden">
          <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
            {MOBILE_NAV_ITEMS.map((item) => {
              const isActive = currentPath === item.href || (item.href !== '/' && currentPath.startsWith(item.href));
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex min-w-0 flex-col items-center justify-center rounded-[18px] px-1.5 py-2 text-[10.5px] font-medium transition-all duration-200',
                    isActive ? 'bg-gradient-to-b from-violet-100 to-amber-50 text-violet-700 shadow-sm' : 'text-muted-foreground hover:bg-white/70 hover:text-foreground'
                  )}
                >
                  <Icon className={cn('mb-1 h-4 w-4', isActive && 'text-violet-600')} />
                  <span className="w-full truncate text-center">{item.label}</span>
                  <span className={cn('mt-1 h-0.5 w-6 rounded-full bg-gradient-to-r from-violet-500 to-amber-400 transition-opacity', isActive ? 'opacity-100' : 'opacity-0')} />
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[60] md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-magic-ink/42 backdrop-blur-[2px]"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="关闭移动端菜单"
          />
          <div className="absolute inset-x-3 top-3 overflow-hidden rounded-[28px] border border-white/65 bg-[#fffaf2]/96 p-4 shadow-[0_24px_70px_-24px_rgba(30,27,46,0.45)] backdrop-blur-2xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl shadow-magic">
                  <Image src="/brand/ipro-book.svg" alt="IPro Logo" fill className="object-cover" sizes="44px" />
                </span>
                <div className="min-w-0">
                  <p className="storybook-title truncate text-xl text-gradient-magic">IPro</p>
                  <p className="truncate text-xs text-muted-foreground">{isAuthenticated ? user?.nickname || '童话创作者' : '打开属于你的童话书'}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/85 text-muted-foreground shadow-sm"
                aria-label="关闭移动端菜单"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-2">
              {MORE_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = currentPath === item.href || (item.href !== '/' && currentPath.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 rounded-[22px] border px-3 py-3 transition',
                      isActive ? 'border-violet-200 bg-violet-50 text-violet-800' : 'border-white/70 bg-white/70 text-foreground hover:bg-white'
                    )}
                  >
                    <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl', isActive ? 'bg-violet-600 text-white' : 'bg-gradient-to-br from-violet-100 to-amber-50 text-violet-700')}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{item.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">{item.caption}</span>
                    </span>
                  </Link>
                );
              })}
            </div>

            <div className="mt-4 border-t border-white/70 pt-4">
              {isAuthenticated ? (
                <Button variant="outline" className="h-11 w-full rounded-full bg-white/75" onClick={() => logout()}>
                  <LogOut className="h-4 w-4" />
                  退出登录
                </Button>
              ) : (
                <Link href="/login">
                  <Button variant="magic" className="h-11 w-full rounded-full">
                    登录
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

