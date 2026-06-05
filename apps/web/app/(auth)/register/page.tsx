'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BookOpen, Sparkles } from 'lucide-react';
import { FloatingParticles, GlassCard } from '@/components/magic';
import { PhoneRegisterForm } from '@/components/auth/PhoneRegisterForm';

export default function RegisterPage() {
  const [error, setError] = useState<string | null>(null);

  const handleRegisterSuccess = () => {
    window.location.replace('/');
  };

  const handleError = (message: string) => {
    setError(message);
    setTimeout(() => setError(null), 3000);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-violet-700 via-fuchsia-500 to-amber-400 px-4 py-10">
      <FloatingParticles count={12} />
      <div className="relative z-10 w-full max-w-md space-y-8">
        <div className="text-center text-white">
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-[28px] bg-white/16 shadow-paper backdrop-blur-xl">
            <BookOpen className="h-10 w-10" />
          </div>
          <p className="storybook-title text-3xl">IPro</p>
          <h1 className="mt-3 text-3xl font-bold">开启你的童话创作之旅</h1>
          <p className="mt-2 text-sm text-white/80">注册后就能把孩子、家人和想象力一起装进一本专属绘本里。</p>
        </div>

        <GlassCard className="border-white/25 bg-white/18 p-8 text-white backdrop-blur-2xl">
          {error && (
            <div className="mb-4 rounded-2xl border border-white/20 bg-white/15 p-3 text-sm text-white">
              {error}
            </div>
          )}

          <PhoneRegisterForm onSuccess={handleRegisterSuccess} onError={handleError} />

          <div className="mt-6 text-center text-sm text-white/80">
            已有账号？
            <Link href="/login" className="ml-1 font-medium text-white underline-offset-4 hover:underline">
              立即登录
            </Link>
          </div>
        </GlassCard>

        <div className="flex items-center justify-center gap-2 text-xs text-white/75">
          <Sparkles className="h-3.5 w-3.5" />
          注册即解锁专属童话角色创建入口
        </div>

        <p className="text-center text-xs text-white/65">
          注册即表示同意
          <a href="#" className="mx-1 text-white hover:underline">服务条款</a>
          和
          <a href="#" className="mx-1 text-white hover:underline">隐私政策</a>
        </p>
      </div>
    </div>
  );
}
